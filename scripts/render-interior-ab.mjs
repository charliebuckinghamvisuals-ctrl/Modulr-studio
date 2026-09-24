/**
 * Interior render harness (21 Sep 2026). The interior twin of
 * render-look-ab.mjs: same engine calls, the INTERIOR inventory, prompt and
 * verifier judging (render/interior.js, render/verify.js kind 'interior').
 *
 *   node scripts/render-interior-ab.mjs <tag> <test-design dir> [more dirs]
 *   FULL=1 node scripts/render-interior-ab.mjs <tag> <dir>   also runs the retry on a failure
 *   DRESS=1 ...                                             with "Dress the scene" on (24 Sep 2026)
 *
 * A test design dir holds shaded.jpg, line.png and spec.json as captured
 * from the configurator's walk mode (window.__modulrRenderPayload('interior')
 * in the built configurator exposes exactly what the button posts).
 * Writes prompt_<tag>.txt, out_<tag>.jpg and verdict_<tag>.json beside them.
 */
import fs from 'fs'; import path from 'path'; import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
const ROOT = 'C:/Users/Charlie Buckingham/Downloads/bxcksai---exterior-render-engine';
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const { inventoryToText } = await import('../render/inventory.js');
const { interiorInventoryFromSpec, buildInteriorRenderPrompt, buildInteriorMaterialsPassPrompt, dressedInventory, countPlacedDecor } = await import('../render/interior.js');
const { drawImage, FINISH_MODEL, GEOMETRY_MODEL } = await import('../render/providers/gemini.js');
const { verifyRender } = await import('../render/verify.js');
const FULL = process.env.FULL === '1';
const DRESS = process.env.DRESS === '1';
const KIND = DRESS ? 'interior-dressed' : 'interior';
const TIME = process.env.TIME || 'afternoon';
const tag = process.argv[2] || 'interior';
for (const d of process.argv.slice(3)) {
  const dir = path.join(ROOT, 'test-designs', d);
  const shaded = fs.readFileSync(path.join(dir, 'shaded.jpg')).toString('base64');
  const linePng = fs.readFileSync(path.join(dir, 'line.png')); const line = linePng.toString('base64');
  const W = linePng.readUInt32BE(16), H = linePng.readUInt32BE(20);
  const ratio = [['1:1',1],['3:4',3/4],['4:3',4/3],['9:16',9/16],['16:9',16/9],['2:3',2/3],['3:2',3/2],['4:5',4/5],['5:4',5/4],['21:9',21/9]].sort((a,b)=>Math.abs(a[1]-W/H)-Math.abs(b[1]-W/H))[0][0];
  console.log(d, W+'x'+H, '->', ratio);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));
  const baseItems = interiorInventoryFromSpec({ ...spec, view: 'interior' });
  const decorCount = DRESS ? countPlacedDecor(spec, baseItems) : 0;
  const items = DRESS ? dressedInventory(baseItems) : baseItems;
  const inventoryText = inventoryToText(items);
  const prompt = buildInteriorRenderPrompt({ inventoryText, hasLine: true, scenePreset: 'uk-residential', timePreset: TIME, dress: DRESS, decorCount });
  fs.writeFileSync(path.join(dir, `prompt_${tag}.txt`), prompt);
  console.log(d, items.length, 'items:', items.map(i => i.label).join(' | '));
  const t0 = Date.now();
  const img = await drawImage(ai, { model: FINISH_MODEL, images: [{ b64: line, mime: 'image/png' }, { b64: shaded, mime: 'image/jpeg' }], prompt, ratio, label: d + ' ' + tag });
  if (!img) { console.log(d, 'NO IMAGE'); continue; }
  fs.writeFileSync(path.join(dir, `out_${tag}.jpg`), Buffer.from(img, 'base64'));
  const v = await verifyRender(ai, Type, { model: 'gemini-3.8-flash', referenceB64: line, referenceMime: 'image/png', renderB64: img, items, kind: KIND, colourRefB64: shaded, colourRefMime: 'image/jpeg' });
  console.log(d, tag, 'pass1', Math.round((Date.now() - t0) / 1000) + 's', v.passed ? 'PASSED' : 'FAILED', v.failures.map(f => f.label + ': ' + f.problem).join(' | '));
  let out = { pass1: v };
  if (FULL && v.checked && !v.passed) {
    const promoted = 'PREVIOUS ATTEMPT REJECTED. These items were wrong and must be exactly as the drawing shows: ' + v.failures.map(f => `${f.label} (${f.problem})`).join('; ') + '.\n\n';
    const geometry = await drawImage(ai, { model: GEOMETRY_MODEL, images: [{ b64: line, mime: 'image/png' }, { b64: shaded, mime: 'image/jpeg' }], prompt: promoted + prompt, ratio, label: d + ' retry-geometry' });
    if (geometry) {
      fs.writeFileSync(path.join(dir, `out_${tag}_retry-geometry.jpg`), Buffer.from(geometry, 'base64'));
      const finished = await drawImage(ai, { model: FINISH_MODEL, images: [{ b64: geometry, mime: 'image/jpeg' }], prompt: buildInteriorMaterialsPassPrompt({ inventoryText, failures: v.failures }), ratio, label: d + ' retry-finish' });
      const candidate = finished || geometry;
      if (finished) fs.writeFileSync(path.join(dir, `out_${tag}_retry.jpg`), Buffer.from(finished, 'base64'));
      const v2 = await verifyRender(ai, Type, { model: 'gemini-3.8-flash', referenceB64: line, referenceMime: 'image/png', renderB64: candidate, items, kind: KIND, colourRefB64: shaded, colourRefMime: 'image/jpeg' });
      out.retry = v2;
      console.log(d, tag, 'retry', Math.round((Date.now() - t0) / 1000) + 's', v2.passed ? 'PASSED' : 'FAILED', v2.failures.map(f => f.label + ': ' + f.problem).join(' | '), '-> ships', (!v2.checked || v2.failures.length < v.failures.length) ? 'RETRY' : 'PASS1');
    }
  }
  fs.writeFileSync(path.join(dir, `verdict_${tag}.json`), JSON.stringify(out, null, 2));
}
