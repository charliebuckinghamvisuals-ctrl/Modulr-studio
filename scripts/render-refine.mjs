/**
 * Second-pass experiment: give the pro image model a finished flash-image
 * render (geometry already locked) and ask for a materials-only upgrade.
 * QA judges the result against the ORIGINAL configurator source, so any
 * geometry drift in pass 2 is caught.
 *
 *   node scripts/render-refine.mjs <dir> [runs]
 * <dir> holds source.jpg (configurator) and out_head-flash.jpg (pass 1).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const dir = process.argv[2];
const runs = parseInt(process.argv[3] || '2', 10);
const src = fs.readFileSync(path.join(dir, 'source.jpg')).toString('base64');
const pass1 = fs.readFileSync(path.join(dir, 'out_head-flash.jpg')).toString('base64');
const image = (b64) => ({ inlineData: { data: b64, mimeType: 'image/jpeg' } });

const REFINE = `
      YOU ARE A MATERIALS AND LIGHTING FINISHING PASS - NOT A DESIGNER.
      The input is an already-correct architectural render. Its geometry, camera,
      every edge, every opening, every proportion and the exact framing are FINAL
      and are not yours to touch. Treat the image as a locked 3D scene that has
      been rendered once at draft quality: your only job is to re-render its
      SURFACES at flagship offline quality - Blender Cycles / V-Ray with a
      professional CGI artist's material library.

      PIXEL-LEVEL GEOMETRY LOCK: every edge in the output sits exactly where it
      sits in the input. Same building length, height and depth; same door and
      window count, size and position; same roof line and fascia depth; same
      decking outline; same camera and crop. Do not move, add, remove, resize or
      restyle ANYTHING. If you are unsure whether something is geometry or
      material, leave it exactly as it is.

      UPGRADE ONLY THESE, KEEPING EACH ITEM'S COLOUR AND TYPE:
      - Cladding: real composite/timber board relief - visible grain, the shadow
        line in every board groove, subtle tonal variation board to board, correct
        roughness and soft sheen. Same colour family as the input, never shifted.
      - Fascia and frames: crisp powder-coated aluminium with a fine edge highlight
        and correct reflectance. Same colour as the input.
      - Solid door stays a SOLID panel door; glazed doors stay glazed.
      - Glass: real reflections of the garden and sky, slight refraction, dim
        interior visible through it.
      - Decking: individual boards with grain and joints, contact shadow where the
        building meets it.
      - Lighting: physically based sun and sky, ambient occlusion in every reveal,
        recess and under the fascia; soft contact shadows on the ground.
      - Surroundings: keep the same garden, fence, planting and sky; only their
        material realism may improve.

      FINAL OUTPUT: indistinguishable from a top-tier archviz still, immaculate
      new materials (no dirt, weathering or damage), and geometrically identical
      to the input at every pixel.`;

const run = async () => {
    const r = await ai.models.generateContent({
        model: 'gemini-3-pro-image',
        contents: { parts: [image(pass1), { text: REFINE }] },
        config: { outputMimeType: 'image/jpeg', imageConfig: { aspectRatio: '4:3', imageSize: '2K' }, temperature: 0.2 },
    });
    for (const part of r.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) { const d = part.inlineData.data; return Buffer.isBuffer(d) ? d.toString('base64') : (d instanceof Uint8Array ? Buffer.from(d).toString('base64') : d); }
    }
    return null;
};

const inspect = async (out) => {
    const r = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: { parts: [image(src), image(out), { text:
            'CLIENT SPECIFICATION: door 1 on the front wall is a SOLID unglazed panel door; door 2 on the front wall is glazed (3 leaves); 1 window on the left wall. ' +
            'Image 1 is a flat-shaded CAD source; image 2 is a render. Judge ONLY building geometry, camera, cladding colour family and door type. Report sameViewpoint, doorsMatch, windowsMatch, roofMatch, proportionsMatch (same length-to-height and same blank wall runs), claddingColourMatch, doorStyleMatch, and problem (one sentence, empty if none).' }] },
        config: { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties: {
            sameViewpoint: { type: Type.BOOLEAN }, doorsMatch: { type: Type.BOOLEAN }, windowsMatch: { type: Type.BOOLEAN }, roofMatch: { type: Type.BOOLEAN },
            proportionsMatch: { type: Type.BOOLEAN }, claddingColourMatch: { type: Type.BOOLEAN }, doorStyleMatch: { type: Type.BOOLEAN }, problem: { type: Type.STRING },
        }, required: ['sameViewpoint', 'doorsMatch', 'windowsMatch', 'roofMatch', 'proportionsMatch', 'claddingColourMatch', 'doorStyleMatch'] } },
    });
    return JSON.parse(r.text);
};

for (let i = 1; i <= runs; i++) {
    process.stdout.write(`refine ${i}: `);
    const t0 = Date.now();
    const out = await run();
    if (!out) { console.log('NO IMAGE'); continue; }
    fs.writeFileSync(path.join(dir, `out_refine${i}.jpg`), Buffer.from(out, 'base64'));
    const qa = await inspect(out);
    const fails = Object.entries(qa).filter(([k, v]) => k !== 'problem' && v === false).map(([k]) => k);
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s fails: ${fails.join(',') || 'none'} ${qa.problem || ''}`);
}
