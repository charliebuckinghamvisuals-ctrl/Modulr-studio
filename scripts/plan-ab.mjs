/**
 * Floor Plan Studio harness: a plan capture (test-designs/<dir>/shaded.png,
 * line.png, spec.json - saved from the configurator's Floor Plan Studio
 * button) through render/plan.js in one or both modes, verified. Same
 * modules as /api/render/plan, no auth, no credits. Costs ~10p per plan.
 *
 *   node scripts/plan-ab.mjs <dir> [rendered,cad] [tag]
 */
import fs from 'fs'; import path from 'path'; import dotenv from 'dotenv'; import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { planInventoryFromSpec, buildPlanPrompt } from '../render/plan.js';
import { inventoryToText } from '../render/inventory.js';
import { drawImage, FINISH_MODEL } from '../render/providers/gemini.js';
import { verifyRender } from '../render/verify.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const dir = path.join(ROOT, 'test-designs', process.argv[2] || 'plan-test');
const modes = (process.argv[3] || 'rendered,cad').split(',');
const tag = process.argv[4] || '';
const shaded = fs.readFileSync(path.join(dir, 'shaded.png')).toString('base64');
const linePng = fs.readFileSync(path.join(dir, 'line.png')); const line = linePng.toString('base64');
const W = linePng.readUInt32BE(16), H = linePng.readUInt32BE(20);
const ratio = [['1:1',1],['3:4',3/4],['4:3',4/3],['9:16',9/16],['16:9',16/9],['2:3',2/3],['3:2',3/2],['4:5',4/5],['5:4',5/4],['21:9',21/9]].sort((a,b)=>Math.abs(a[1]-W/H)-Math.abs(b[1]-W/H))[0][0];
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));
console.log(`${W}x${H} -> ${ratio}`);
for (const mode of modes) {
  const t0 = Date.now();
  const items = planInventoryFromSpec(spec, mode);
  const inventoryText = inventoryToText(items);
  const prompt = buildPlanPrompt({ mode, inventoryText, hasLine: true });
  fs.writeFileSync(path.join(dir, `prompt_${mode}${tag}.txt`), prompt);
  const sniff = (b) => (Buffer.from(b.slice(0, 8), 'base64')[0] === 0x89 ? 'image/png' : 'image/jpeg');
  const img = await drawImage(ai, { model: FINISH_MODEL, images: [{ b64: line, mime: 'image/png' }, { b64: shaded, mime: sniff(shaded) }], prompt, ratio, label: `plan-${mode}` });
  if (!img) { console.log(mode, 'NO IMAGE'); continue; }
  fs.writeFileSync(path.join(dir, `out_${mode}${tag}.jpg`), Buffer.from(img, 'base64'));
  const v = await verifyRender(ai, Type, { model: 'gemini-3.8-flash', referenceB64: shaded, referenceMime: sniff(shaded), renderB64: img, items, kind: mode === 'cad' ? 'cad' : 'plan' });
  fs.writeFileSync(path.join(dir, `verdict_${mode}${tag}.json`), JSON.stringify(v, null, 2));
  console.log(mode, Math.round((Date.now() - t0) / 1000) + 's', v.passed ? 'PASSED' : 'FAILED', v.failures.map(f => f.label + ': ' + f.problem).join(' | '));
}
