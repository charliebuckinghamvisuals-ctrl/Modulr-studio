/**
 * Weather Lab harness: a finished render (test-designs/<dir>/<render>.jpg)
 * plus its line drawing through render/weather.js, verified against the
 * source. Same modules as /api/applyWeather, no auth. ~10p a run.
 *
 *   node scripts/weather-ab.mjs <dir> <render.jpg> "<condition>" [season] [time] ["notes"]
 */
import fs from 'fs'; import path from 'path'; import dotenv from 'dotenv'; import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { buildWeatherPrompt, GENERIC_WEATHER_ITEMS } from '../render/weather.js';
import { inventoryFromItems, inventoryFromSpec } from '../render/inventory.js';
import { drawImage, FINISH_MODEL } from '../render/providers/gemini.js';
import { verifyRender } from '../render/verify.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const [dir, render, condition = 'Snowy Winter', season = 'winter', timeOfDay = '', notes = ''] = process.argv.slice(2);
const d = path.join(ROOT, 'test-designs', dir);
const src = fs.readFileSync(path.join(d, render)).toString('base64');
const linePng = fs.readFileSync(path.join(d, 'line.png')); const line = linePng.toString('base64');
const W = linePng.readUInt32BE(16), H = linePng.readUInt32BE(20);
const ratio = [['1:1',1],['3:4',3/4],['4:3',4/3],['9:16',9/16],['16:9',16/9],['2:3',2/3],['3:2',3/2],['4:5',4/5],['5:4',5/4],['21:9',21/9]].sort((a,b)=>Math.abs(a[1]-W/H)-Math.abs(b[1]-W/H))[0][0];
const specPath = path.join(d, 'spec.json');
const items = fs.existsSync(specPath) ? inventoryFromSpec(JSON.parse(fs.readFileSync(specPath, 'utf8'))) : inventoryFromItems(GENERIC_WEATHER_ITEMS);
const prompt = buildWeatherPrompt({ condition, season, timeOfDay, notes, hasLine: true });
const tag = condition.toLowerCase().replace(/[^a-z]+/g, '-');
fs.writeFileSync(path.join(d, `prompt_weather_${tag}.txt`), prompt);
const t0 = Date.now();
const img = await drawImage(ai, { model: FINISH_MODEL, images: [{ b64: line, mime: 'image/png' }, { b64: src, mime: 'image/jpeg' }], prompt, ratio, label: 'weather ' + tag });
if (!img) { console.log('NO IMAGE'); process.exit(1); }
fs.writeFileSync(path.join(d, `out_weather_${tag}.jpg`), Buffer.from(img, 'base64'));
const v = await verifyRender(ai, Type, { model: 'gemini-3.8-flash', referenceB64: src, referenceMime: 'image/jpeg', renderB64: img, items, kind: 'render' });
console.log(tag, Math.round((Date.now() - t0) / 1000) + 's', v.passed ? 'PASSED' : 'FAILED', v.failures.map(f => f.label + ': ' + f.problem).join(' | '));
