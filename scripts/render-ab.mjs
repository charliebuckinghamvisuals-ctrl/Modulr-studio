/**
 * A/B harness for the configurator render path.
 *
 * Renders ONE source image through several prompt/model variants and runs
 * the same QA inspection on each, so a fidelity regression is diagnosed with
 * evidence instead of another prompt guess. Prompt pieces are sliced out of
 * server.js (at HEAD or at a git revision) exactly as prompt-tests.mjs does,
 * so what is tested is what ships.
 *
 *   node scripts/render-ab.mjs <dir> [variant,variant,...]
 *
 * <dir> must hold source.jpg, source.png and spec.json (see
 * temp-puppeteer/capture-design.js). Costs real API calls: ~$0.13 per
 * variant on the pro image model, plus a flash-lite QA call each.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/render-ab.mjs <dir> [variants]'); process.exit(1); }
const wanted = (process.argv[3] || 'head-full,head-noinv,head-nospec,head-flash,legacy,legacy-pro').split(',');

const srcJpg = fs.readFileSync(path.join(dir, 'source.jpg')).toString('base64');
const png = fs.readFileSync(path.join(dir, 'source.png'));
const W = png.readUInt32BE(16), H = png.readUInt32BE(20);
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));

// Same ratio pick as services/geminiService.ts.
const ratio = (() => {
    const r = W / H;
    const supported = [['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9]];
    return supported.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
})();

// ---------------------------------------------------------------- slicing
const sanitizeString = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const sourceAt = (rev) => rev === 'HEAD'
    ? fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
    : execSync(`git show ${rev}:server.js`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

const sliceFn = (src, head) => {
    const rx = new RegExp(head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\n        \\};');
    const m = src.match(rx); if (!m) throw new Error('cannot slice ' + head);
    return eval('(' + m[0].replace(/^const \w+ = /, '').replace(/;\s*$/, '') + ')');
};
const sliceTemplate = (src, startMarker, endLine) => {
    const a = src.indexOf(startMarker); if (a < 0) throw new Error('no ' + startMarker);
    const bodyStart = a + startMarker.length;
    const b = src.indexOf('\n' + endLine, bodyStart); if (b < 0) throw new Error('no end for ' + startMarker);
    return src.slice(bodyStart, b);
};

const buildFor = (rev) => {
    const src = sourceAt(rev).split('\r\n').join('\n');
    const buildConfigSpecBlock = sliceFn(src, 'const buildConfigSpecBlock = (spec) => {');
    const buildCgiMaterialInstruction = sliceFn(src, 'const buildCgiMaterialInstruction = (label, value) => {');
    const houseStyle = src.includes('const buildHouseStyle')
        ? new Function('cameraEffects', 'return `' + sliceTemplate(src, 'const buildHouseStyle = (cameraEffects) => `', '`;') + '`')(false)
        : '`' + sliceTemplate(src, 'const MODULR_HOUSE_STYLE = `', '`;') + '`';
    const tpl = sliceTemplate(src, 'const sketchUpPrompt = `', '    `;');
    const render = new Function(
        'materials', 'buildCgiMaterialInstruction', 'configSpecBlock', 'siteContextBlock', 'houseStyleBlock', 'MODULR_HOUSE_STYLE',
        'additionalPrompt', 'studioBackground', 'isBatchSequence',
        'return `' + tpl + '`'
    );
    return { buildConfigSpecBlock, buildCgiMaterialInstruction, houseStyle: houseStyle.startsWith('`') ? eval(houseStyle) : houseStyle, render };
};

// Strip the openings inventory from a HEAD spec block, keeping colour, fascia,
// frames, roof and board direction.
const stripInventory = (block) => block
    .split('\n')
    .filter(l => !/^\s*- (Door sets|Windows)\b/.test(l) && !/^\s*- (Door|Window) \d+:/.test(l) && !/^\s*- Skylights/.test(l))
    .join('\n')
    .replace(/\n\s*Do not invent any opening beyond this list[\s\S]*$/, '\n')
    .replace(/THE SOURCE IMAGE DECIDES[\s\S]*?simply stay out of frame\./, 'THE SOURCE IMAGE DECIDES every opening: render exactly the doors and windows it shows, where it shows them, and nothing else.');

// ---------------------------------------------------------------- variants
const VARIANTS = {
    'head-full':   { rev: 'HEAD',    model: 'gemini-3-pro-image',       spec: 'full' },
    'head-noinv':  { rev: 'HEAD',    model: 'gemini-3-pro-image',       spec: 'noinv' },
    'head-nospec': { rev: 'HEAD',    model: 'gemini-3-pro-image',       spec: 'none' },
    'head-flash':  { rev: 'HEAD',    model: 'gemini-3.1-flash-image',   spec: 'full' },
    'legacy':      { rev: '834888a', model: 'gemini-3.1-flash-image',   spec: 'full' },
    'legacy-pro':  { rev: '834888a', model: 'gemini-3-pro-image',       spec: 'full' },
};

const buildPrompt = (v) => {
    const b = buildFor(v.rev);
    let configSpecBlock = v.spec === 'none' ? '' : b.buildConfigSpecBlock(spec);
    if (v.spec === 'noinv') configSpecBlock = stripInventory(configSpecBlock);
    // Configurator renders skip material auto-detect: every field is 'none'.
    const materials = { walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' };
    if (v.rev === 'HEAD' && v.spec !== 'none') {
        // Mirror the spec-over-analyser overrides in the handler.
        if (typeof spec.cladding === 'string' && spec.cladding.trim()) {
            materials.walls = 'Cladding EXACTLY as listed per elevation in the CONFIGURED BUILDING SPECIFICATION - that colour family, rendered as real boards with grain, joints and shadow lines. Do NOT take the wall colour from the image analysis or from the flat fill in the source.';
        }
        if (Array.isArray(spec.doors) && spec.doors.some(d => d && d.style === 'solid')) {
            materials.doors = 'See the CONFIGURED BUILDING SPECIFICATION for each door set. A door listed there as SOLID is an opaque, unglazed panel door with no glass in it at all. ';
        }
    }
    return b.render(materials, b.buildCgiMaterialInstruction, configSpecBlock, '', b.houseStyle, b.houseStyle, '', '', false);
};

// ---------------------------------------------------------------- calls
const image = (b64, mime) => ({ inlineData: { data: b64, mimeType: mime } });

const runRender = async (model, prompt) => {
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [image(srcJpg, 'image/jpeg'), { text: prompt }] },
        config: { outputMimeType: 'image/jpeg', imageConfig: { aspectRatio: ratio, imageSize: '2K' }, temperature: 0.2 },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) { const d = part.inlineData.data; return Buffer.isBuffer(d) ? d.toString('base64') : (d instanceof Uint8Array ? Buffer.from(d).toString('base64') : d); }
    }
    return null;
};

const doors = spec.doors || [], windows = spec.windows || [];
const facts = `Across the whole building: ${doors.map((d, i) => `door ${i + 1} on the ${d.wall} wall is ${d.style === 'solid' ? 'a SOLID unglazed panel door' : 'glazed'}${d.leaves > 1 ? ` (${d.leaves} leaves)` : ''}`).join('; ')}; ${windows.length} window(s) (${windows.map(w => w.wall).join(', ')}). Only the elevations the source camera sees are in frame.`;

const inspect = async (renderB64) => {
    const resp = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: { parts: [image(srcJpg, 'image/jpeg'), image(renderB64, 'image/jpeg'), { text:
            'CLIENT SPECIFICATION - ground truth for door type and opening counts, because image 1 is a flat-shaded CAD view in which a solid door looks like dark glass: ' + facts + ' ' +
            'Image 1 is a source image of a single garden building; image 2 is a photorealistic render made from it. Lighting, weather, surroundings and surface texture are allowed to differ - judge the building geometry, the camera, the cladding colour family and whether each door is solid or glazed. Report: sameViewpoint; doorsMatch (same door sets, same walls, same positions); windowsMatch; roofMatch; proportionsMatch - true only if the building has the same length-to-height proportions and the blank wall runs between openings are the same relative length as the source; claddingColourMatch; doorStyleMatch (judged against the specification); problem - one short sentence naming the worst difference, empty if none.' }] },
        config: { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties: {
            sameViewpoint: { type: Type.BOOLEAN }, doorsMatch: { type: Type.BOOLEAN }, windowsMatch: { type: Type.BOOLEAN }, roofMatch: { type: Type.BOOLEAN },
            proportionsMatch: { type: Type.BOOLEAN }, claddingColourMatch: { type: Type.BOOLEAN }, doorStyleMatch: { type: Type.BOOLEAN }, problem: { type: Type.STRING },
        }, required: ['sameViewpoint', 'doorsMatch', 'windowsMatch', 'roofMatch', 'proportionsMatch', 'claddingColourMatch', 'doorStyleMatch'] } },
    });
    return JSON.parse(resp.text);
};

// ---------------------------------------------------------------- run
const summary = [];
for (const name of wanted) {
    const v = VARIANTS[name]; if (!v) { console.error('unknown variant', name); continue; }
    const prompt = buildPrompt(v);
    fs.writeFileSync(path.join(dir, `prompt_${name}.txt`), prompt);
    process.stdout.write(`${name.padEnd(12)} ${v.model.padEnd(24)} rendering... `);
    const t0 = Date.now();
    try {
        const out = await runRender(v.model, prompt);
        if (!out) { console.log('NO IMAGE'); summary.push({ name, error: 'no image' }); continue; }
        fs.writeFileSync(path.join(dir, `out_${name}.jpg`), Buffer.from(out, 'base64'));
        const qa = await inspect(out);
        const fails = Object.entries(qa).filter(([k, val]) => k !== 'problem' && val === false).map(([k]) => k);
        console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  fails: ${fails.length ? fails.join(',') : 'none'}  ${qa.problem || ''}`);
        summary.push({ name, model: v.model, fails, problem: qa.problem, qa });
    } catch (e) {
        console.log('ERROR', e.message || e);
        summary.push({ name, error: String(e.message || e) });
    }
}
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ ratio, size: [W, H], summary }, null, 2));
console.log('\nsource', W + 'x' + H, 'ratio', ratio);
console.table(summary.map(s => ({ variant: s.name, model: s.model, fails: (s.fails || []).join(',') || (s.error ? 'ERR' : 'none'), problem: (s.problem || s.error || '').slice(0, 90) })));
