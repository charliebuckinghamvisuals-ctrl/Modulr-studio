/**
 * Three-engine comparison on ONE source image, the way the app would use each:
 *
 *   flash          gemini-3.1-flash-image, one pass, the live HEAD prompt
 *   pro            gemini-3-pro-image, one pass, the live HEAD prompt
 *   flash-pro      flash pass 1, then the pro materials pass (the 7 Sep setup)
 *   sunburst-high  GPT Image 2.5 Sunburst edit, hard rules + HEAD prompt, quality high
 *   sunburst-max   same, quality max
 *
 *   node scripts/render-3way.mjs <image.png|jpg> [variant,variant,...] [outDir]
 *
 * No spec: a plain screenshot, so the geometry lock comes from the image and
 * the prompt alone, exactly as a manual CGI-model upload does in the app.
 * Prompt pieces are sliced from server.js at HEAD so what is tested is what
 * ships. Writes out_<variant>.jpg, prompt_<variant>.txt, summary.json and a
 * compare.html contact sheet next to the source.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const srcPath = process.argv[2];
if (!srcPath) { console.error('usage: node scripts/render-3way.mjs <image> [variants] [outDir]'); process.exit(1); }
const wanted = (process.argv[3] || 'flash,pro,flash-pro,sunburst-high,sunburst-max').split(',');
const dir = process.argv[4] || path.dirname(path.resolve(srcPath));

const srcBuf = fs.readFileSync(srcPath);
const isPng = srcBuf[0] === 0x89 && srcBuf[1] === 0x50;
const isWebp = srcBuf.slice(0, 4).toString() === 'RIFF' && srcBuf.slice(8, 12).toString() === 'WEBP';
const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
const srcB64 = srcBuf.toString('base64');

// Dimensions: PNG from the header; WebP from the VP8X/VP8/VP8L chunk; JPEG from the first SOF marker.
const dims = (() => {
    if (isPng) return [srcBuf.readUInt32BE(16), srcBuf.readUInt32BE(20)];
    if (isWebp) {
        const chunk = srcBuf.slice(12, 16).toString();
        if (chunk === 'VP8X') return [1 + (srcBuf[24] | (srcBuf[25] << 8) | (srcBuf[26] << 16)), 1 + (srcBuf[27] | (srcBuf[28] << 8) | (srcBuf[29] << 16))];
        if (chunk === 'VP8 ') return [srcBuf.readUInt16LE(26) & 0x3fff, srcBuf.readUInt16LE(28) & 0x3fff];
        if (chunk === 'VP8L') { const bits = srcBuf.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]; }
        return [1920, 1080];
    }
    let i = 2;
    while (i < srcBuf.length) {
        if (srcBuf[i] !== 0xff) { i++; continue; }
        const marker = srcBuf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [srcBuf.readUInt16BE(i + 7), srcBuf.readUInt16BE(i + 5)];
        i += 2 + srcBuf.readUInt16BE(i + 2);
    }
    return [1920, 1080];
})();
const [W, H] = dims;
const ratio = (() => {
    const r = W / H;
    const supported = [['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9]];
    return supported.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
})();

// ---------------------------------------------------------------- slicing (as render-ab.mjs)
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').split('\r\n').join('\n');
const sliceFn = (head) => {
    const rx = new RegExp(head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\n        \\};');
    const m = src.match(rx); if (!m) throw new Error('cannot slice ' + head);
    return eval('(' + m[0].replace(/^const \w+ = /, '').replace(/;\s*$/, '') + ')');
};
const sliceTemplate = (startMarker, endLine) => {
    const a = src.indexOf(startMarker); if (a < 0) throw new Error('no ' + startMarker);
    const bodyStart = a + startMarker.length;
    const b = src.indexOf('\n' + endLine, bodyStart); if (b < 0) throw new Error('no end for ' + startMarker);
    return src.slice(bodyStart, b);
};
const buildCgiMaterialInstruction = sliceFn('const buildCgiMaterialInstruction = (label, value) => {');
const houseStyle = new Function('cameraEffects', 'return `' + sliceTemplate('const buildHouseStyle = (cameraEffects) => `', '`;') + '`')(false);
const tpl = sliceTemplate('const sketchUpPrompt = `', '    `;');
const renderTpl = new Function(
    'materials', 'buildCgiMaterialInstruction', 'configSpecBlock', 'siteContextBlock', 'houseStyleBlock',
    'additionalPrompt', 'studioBackground', 'isBatchSequence',
    'return `' + tpl + '`'
);
const materials = { walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' };
const PROMPT = renderTpl(materials, buildCgiMaterialInstruction, '', '', houseStyle, '', '', false);
const MATERIALS_PASS_PROMPT = sliceTemplate('const MATERIALS_PASS_PROMPT = `', '`;');
// The Sunburst hard-rules prefix, exactly as the handler builds it with no spec.
const HARD_RULES = [
    'HARD RULES - these override everything below.',
    'Edit the input image only: keep its exact camera, framing, crop, building geometry, roof form and every opening exactly where it is. Add nothing, remove nothing, move nothing.',
    'The input is a flat-shaded CAD view. A dark door panel in it is an OPAQUE SOLID door, not glass - render it as a plain flush panel with no glazing unless the specification below says that door is glazed.',
].join('\n') + '\n\n';

// ---------------------------------------------------------------- calls
const imagePart = (b64, m) => ({ inlineData: { data: b64, mimeType: m } });
const partToB64 = (d) => Buffer.isBuffer(d) ? d.toString('base64') : (d instanceof Uint8Array ? Buffer.from(d).toString('base64') : d);

const gemini = async (model, inputB64, inputMime, prompt) => {
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [imagePart(inputB64, inputMime), { text: prompt }] },
        config: { outputMimeType: 'image/jpeg', imageConfig: { aspectRatio: ratio, imageSize: '2K' }, temperature: 0.2 },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) if (part.inlineData) return partToB64(part.inlineData.data);
    return null;
};

const openAiSizeFor = (r, longEdge = 2048) => {
    const [rw, rh] = r.split(':').map(Number);
    let w = rw >= rh ? longEdge : Math.round(longEdge * rw / rh);
    let h = rw >= rh ? Math.round(longEdge * rh / rw) : longEdge;
    const snap = (v) => Math.max(256, Math.floor(v / 16) * 16);
    return `${snap(w)}x${snap(h)}`;
};
const sunburst = async (prompt, quality) => {
    const form = new FormData();
    form.append('model', 'gpt-image-2.5-sunburst');
    form.append('prompt', prompt);
    form.append('image', new Blob([srcBuf], { type: mime }), isPng ? 'input.png' : isWebp ? 'input.webp' : 'input.jpg');
    form.append('size', openAiSizeFor(ratio));
    form.append('quality', quality);
    form.append('output_format', 'jpeg');
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('openai ' + r.status + ' ' + JSON.stringify(json).slice(0, 300));
    return { b64: json?.data?.[0]?.b64_json || null, usage: json?.usage || null };
};

// Everything modelled is design, named explicitly, decking first - at the TOP
// of the prompt where the pro model actually reads it.
const DECK_RULES = [
    'HARD RULES - these override everything below.',
    'This is a render of a FINISHED 3D model. Keep the source camera, framing and crop exactly. Do not lower, raise, orbit, zoom or pull back the camera.',
    'Everything modelled in the source is part of the design and stays exactly where it is, at exactly the same size: the building, every door and window, the roof and fascia, the wall lights, the brick walls either side, and the TIMBER DECKING PLATFORM in the foreground. Keep the decking at its FULL extent, right to the edges of the frame exactly as the source shows. Do not shrink it, do not cut it back, and do not replace any part of it with lawn, gravel, planting, paving or a border.',
    'Add nothing that is not modelled: no steps, pots, planters, beds, furniture, paths or extra structures. The only things you may dress are the sky, the light, the distant planting beyond the walls, and the plain green ground where the source shows plain green ground.',
].join('\n') + '\n\n';

// A short contract prompt with none of the "replace / placeholder / dress the
// garden" language: rules, then look, and that is all.
const CONTRACT = DECK_RULES + [
    'TASK: render this exact scene photorealistically, like an offline render engine (Cycles / V-Ray) given a finished model. The geometry is final; you only light and shade it.',
    'LOOK: soft late-afternoon sun, clear sky, natural exposure, sharp throughout, no depth of field. Materials rendered as real: the vertical timber cladding in the SAME dark brown tone as the source with visible board joints and grain, the black fascia and flat roof, slim black-framed glazing with real reflections, the decking as real dark timber boards with joints, the brick walls as real brick. Newly built and clean, no weathering. The interior stays exactly as shown, lit warmly.',
    'OUTPUT: 2K, the same aspect ratio as the source.',
].join('\n');

// ---------------------------------------------------------------- line-drawing path
// A written inventory of this design, in the form the rebuilt engine will
// generate from the configurator spec (or from the analysis bar for uploads).
const INVENTORY = [
    'HARD RULES - these override everything below.',
    'Image 1 is an exact LINE DRAWING of a finished 3D model: every edge in it is real geometry and is the only geometry there is. Image 2 is the same view flat-shaded, for colour reference only. Keep image 1\'s camera, framing and crop exactly. Nothing is added, removed, moved or resized.',
    'INVENTORY - everything in the design, each item rendered exactly where the line drawing shows it:',
    '1. Building: single storey, flat roof with a deep black fascia and a slight overhang all round.',
    '2. Cladding: vertical timber boards in a dark brown tone (image 2 shows the colour), all elevations.',
    '3. Front elevation, left to right: one wide landscape window with a slim black frame and a black sill; one three-panel sliding door set with slim black frames, fully glazed.',
    '4. Exterior lights: four black up/down box wall lights on the front wall (one left of the window, one between window and doors, one right of the doors, one on the right-hand corner) and recessed downlights in the soffit. Same style, same places; only the finish is rendered.',
    '5. Decking: one level timber deck platform in the foreground, the full extent shown in the line drawing, running from the left edge of the frame to a corner at the lower right where it meets the lawn. Dark timber boards with visible joints and a clean fascia edge.',
    '6. Boundary: a brick wall on the left with three steps up beside it, and a brick wall on the right. Same height and position.',
    '7. Interior, seen through the glazing: a kitchen run with a sink, a wall cabinet, two white armchairs, a pale timber floor, an internal timber door.',
    'FORBIDDEN: no extra steps, pots, planters, beds, paths, paving, furniture, structures or openings. Do not shrink or cut back the deck. Do not change the cladding colour family.',
    'LOOK: photorealistic archviz, soft late-afternoon sun, clear sky, sharp throughout, materials rendered as real with grain, joints and reflections, newly built and clean. The plain green ground beyond the deck is lawn; the sky and any distant planting beyond the walls are yours.',
].join('\n');

const LINE_PROMPT = 'Convert this flat-shaded 3D view into a clean black-on-white architectural LINE DRAWING. Trace every edge exactly where it is: the building, roof and fascia, every window and door frame and panel division, the wall lights, the decking outline and its board lines, the brick walls and steps, and the interior visible through the glass. Same camera, same framing, same proportions, nothing added or removed. No shading, no colour, no hatching, no text.';

const geminiMulti = async (model, parts, prompt) => {
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [...parts, { text: prompt }] },
        config: { outputMimeType: 'image/jpeg', imageConfig: { aspectRatio: ratio, imageSize: '2K' }, temperature: 0.2 },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) if (part.inlineData) return partToB64(part.inlineData.data);
    return null;
};
const lineDrawing = async () => {
    const f = path.join(dir, 'line.jpg');
    if (fs.existsSync(f)) return fs.readFileSync(f).toString('base64');
    const b64 = await gemini('gemini-3.1-flash-image', srcB64, mime, LINE_PROMPT);
    if (b64) fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    return b64;
};

const VARIANTS = {
    'line':            async () => ({ b64: await lineDrawing(), prompt: LINE_PROMPT, model: 'flash-image line conversion' }),
    'line-flash-pro':  async () => {
        const line = await lineDrawing(); if (!line) return { b64: null };
        const parts = [imagePart(line, 'image/jpeg'), imagePart(srcB64, mime)];
        const p1 = await geminiMulti('gemini-3.1-flash-image', parts, INVENTORY);
        if (!p1) return { b64: null };
        fs.writeFileSync(path.join(dir, 'out_line-flash-pro_pass1.jpg'), Buffer.from(p1, 'base64'));
        const p2 = 'HARD RULES: this is a materials-and-lighting pass only. Keep every pixel of geometry, camera, framing, openings, deck extent, walls, steps and lights exactly as in the input. Nothing added, removed, moved or resized.\n\n' + INVENTORY.split('\n').slice(2).join('\n') + '\n\n' + MATERIALS_PASS_PROMPT;
        return { b64: await geminiMulti('gemini-3-pro-image', [imagePart(p1, 'image/jpeg')], p2), prompt: INVENTORY + '\n\n===== PASS 2 =====\n' + p2, model: 'line + colour ref + inventory -> flash -> pro' };
    },
    'line-pro':        async () => {
        const line = await lineDrawing(); if (!line) return { b64: null };
        return { b64: await geminiMulti('gemini-3-pro-image', [imagePart(line, 'image/jpeg'), imagePart(srcB64, mime)], INVENTORY), prompt: INVENTORY, model: 'line + colour ref + inventory -> pro, one pass' };
    },
    'pro-deckrule':       async () => ({ b64: await gemini('gemini-3-pro-image', srcB64, mime, DECK_RULES + PROMPT), prompt: DECK_RULES + PROMPT, model: 'gemini-3-pro-image + deck rules on top' }),
    'pro-contract':       async () => ({ b64: await gemini('gemini-3-pro-image', srcB64, mime, CONTRACT), prompt: CONTRACT, model: 'gemini-3-pro-image, short contract prompt' }),
    'flash-contract':     async () => ({ b64: await gemini('gemini-3.1-flash-image', srcB64, mime, CONTRACT), prompt: CONTRACT, model: 'gemini-3.1-flash-image, short contract prompt' }),
    'flash-pro-deckrule': async () => {
        const p1 = await gemini('gemini-3.1-flash-image', srcB64, mime, DECK_RULES + PROMPT);
        if (!p1) return { b64: null };
        fs.writeFileSync(path.join(dir, 'out_flash-pro-deckrule_pass1.jpg'), Buffer.from(p1, 'base64'));
        const p2 = DECK_RULES + MATERIALS_PASS_PROMPT;
        return { b64: await gemini('gemini-3-pro-image', p1, 'image/jpeg', p2), prompt: DECK_RULES + PROMPT + '\n\n===== PASS 2 =====\n' + p2, model: 'flash + deck rules -> pro materials pass + deck rules' };
    },
    'flash':         async () => ({ b64: await gemini('gemini-3.1-flash-image', srcB64, mime, PROMPT), prompt: PROMPT, model: 'gemini-3.1-flash-image' }),
    'pro':           async () => ({ b64: await gemini('gemini-3-pro-image', srcB64, mime, PROMPT), prompt: PROMPT, model: 'gemini-3-pro-image' }),
    'flash-pro':     async () => {
        const p1 = await gemini('gemini-3.1-flash-image', srcB64, mime, PROMPT);
        if (!p1) return { b64: null };
        fs.writeFileSync(path.join(dir, 'out_flash-pro_pass1.jpg'), Buffer.from(p1, 'base64'));
        return { b64: await gemini('gemini-3-pro-image', p1, 'image/jpeg', MATERIALS_PASS_PROMPT), prompt: PROMPT + '\n\n===== PASS 2 =====\n' + MATERIALS_PASS_PROMPT, model: 'flash-image -> pro-image materials pass' };
    },
    'sunburst-high': async () => ({ ...(await sunburst(HARD_RULES + PROMPT, 'high')), prompt: HARD_RULES + PROMPT, model: 'gpt-image-2.5-sunburst high' }),
    'sunburst-max':  async () => ({ ...(await sunburst(HARD_RULES + PROMPT, 'max')), prompt: HARD_RULES + PROMPT, model: 'gpt-image-2.5-sunburst max' }),
};

// ---------------------------------------------------------------- run
console.log('source', srcPath, W + 'x' + H, 'ratio', ratio, 'out', dir);
const summary = [];
await Promise.all(wanted.map(async (name) => {
    const run = VARIANTS[name]; if (!run) { console.error('unknown variant', name); return; }
    const t0 = Date.now();
    try {
        const out = await run();
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        if (out.prompt) fs.writeFileSync(path.join(dir, `prompt_${name}.txt`), out.prompt);
        if (!out.b64) { console.log(name.padEnd(14), 'NO IMAGE', secs + 's'); summary.push({ name, error: 'no image', secs }); return; }
        fs.writeFileSync(path.join(dir, `out_${name}.jpg`), Buffer.from(out.b64, 'base64'));
        console.log(name.padEnd(14), (out.model || '').padEnd(40), secs + 's', out.usage ? JSON.stringify(out.usage) : '');
        summary.push({ name, model: out.model, secs, usage: out.usage || null });
    } catch (e) {
        console.log(name.padEnd(14), 'ERROR', ((Date.now() - t0) / 1000).toFixed(0) + 's', e.message || e);
        summary.push({ name, error: String(e.message || e) });
    }
}));
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ source: path.basename(srcPath), size: [W, H], ratio, summary }, null, 2));

const cards = [{ name: 'SOURCE', file: path.basename(srcPath) }, ...summary.filter(s => !s.error).map(s => ({ name: `${s.name} (${s.model}, ${s.secs}s)`, file: `out_${s.name}.jpg` }))];
fs.writeFileSync(path.join(dir, 'compare.html'), `<!doctype html><meta charset="utf-8"><title>Render comparison</title>
<style>body{margin:0;background:#111;color:#eee;font:14px system-ui}h1{margin:16px;font-size:16px}.g{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 16px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:6px 2px;color:#bbb}</style>
<h1>${path.basename(dir)} - source ${W}x${H}</h1><div class="g">${cards.map(c => `<figure><img src="${c.file}"><figcaption>${c.name}</figcaption></figure>`).join('')}</div>`);
console.log('\nwrote', path.join(dir, 'compare.html'));
