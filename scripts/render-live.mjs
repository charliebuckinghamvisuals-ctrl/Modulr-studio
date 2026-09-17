/**
 * Drive the REAL /api/render route on a local server, as the app would.
 *
 *   API_PORT=3055 node server.js          (in another terminal)
 *   node scripts/render-live.mjs <shaded.jpg|png|webp> [line.png] [spec.json] [out.jpg] [scenePreset] [timePreset]
 *
 * Mints a custom token for the master UID with firebase-admin and the
 * service-account file, exchanges it for an ID token at identitytoolkit
 * (web key read from services/firebase.ts), then POSTs. Prints the
 * verification and writes the image. Costs one real render.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [shadedPath, linePath, specPath, outPath, scenePreset = 'uk-residential', timePreset = 'afternoon'] = process.argv.slice(2);
if (!shadedPath) { console.error('usage: node scripts/render-live.mjs <shaded> [line] [spec.json] [out.jpg] [scenePreset] [timePreset]'); process.exit(1); }
const port = process.env.API_PORT || 3055;
const uid = process.env.TEST_UID || 'b4ARwo7cCQfS9iiu2L3bYl7DCqf1';

const sa = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-service-account.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const webKey = (fs.readFileSync(path.join(ROOT, 'services/firebase.ts'), 'utf8').match(/apiKey:\s*["']([^"']+)["']/) || [])[1];
if (!webKey) throw new Error('no web apiKey in services/firebase.ts');
const custom = await admin.auth().createCustomToken(uid);
const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
});
const { idToken, error } = await ex.json();
if (!idToken) throw new Error('token exchange failed: ' + JSON.stringify(error));

const b64 = (p) => (p ? fs.readFileSync(p).toString('base64') : null);
const body = {
    shaded: b64(shadedPath),
    line: linePath && linePath !== '-' ? b64(linePath) : null,
    spec: specPath && specPath !== '-' ? JSON.parse(fs.readFileSync(specPath, 'utf8')) : null,
    ratio: process.env.RATIO || (() => {
        // Nearest supported ratio from the shaded image, as the app does.
        const b = fs.readFileSync(shadedPath); let w = 16, h = 9;
        if (b[0] === 0x89 && b[1] === 0x50) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
        else { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + b.readUInt16BE(i + 2); } }
        const r = w / h; const sup = [['1:1', 1], ['4:5', .8], ['5:4', 1.25], ['3:4', .75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5], ['9:16', 9 / 16], ['16:9', 16 / 9]];
        return sup.sort((a, c) => Math.abs(a[1] - r) - Math.abs(c[1] - r))[0][0];
    })(),
    scenePreset, timePreset, sceneText: process.env.SCENE_TEXT || '',
};
// SURVEY=1: no spec, so ask the survey for the inventory first, as the app
// does for an upload, and render with those items.
if (process.env.SURVEY === '1') {
    const t = Date.now();
    const s = await fetch(`http://localhost:${port}/api/render/survey`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ image: body.shaded }) });
    const sj = await s.json();
    console.log('survey', s.status, ((Date.now() - t) / 1000).toFixed(0) + 's', (sj.items || []).length, 'items');
    (sj.items || []).forEach((it, i) => console.log(`  ${i + 1}. [${it.group}] ${it.label}: ${it.text}`));
    body.items = sj.items || [];
    fs.writeFileSync(path.join(path.dirname(path.resolve(shadedPath)), 'survey.json'), JSON.stringify(sj, null, 2));
}
console.log('POST /api/render', { shadedKB: Math.round(body.shaded.length / 1365), line: !!body.line, spec: !!body.spec, scenePreset, timePreset });
const t0 = Date.now();
const r = await fetch(`http://localhost:${port}/api/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body) });
const json = await r.json();
console.log('status', r.status, ((Date.now() - t0) / 1000).toFixed(0) + 's');
if (!r.ok) { console.error(json); process.exit(1); }
const out = outPath || path.join(path.dirname(path.resolve(shadedPath)), 'out_live.jpg');
fs.writeFileSync(out, Buffer.from(json.image, 'base64'));
if (json.line) fs.writeFileSync(out.replace(/\.jpg$/, '_line.jpg'), Buffer.from(json.line, 'base64'));
console.log('engine', json.engine);
console.log('inventory', json.items.length, 'items:', json.items.map(i => i.label).join(' | '));
console.log('verification', JSON.stringify({ checked: json.verification.checked, passed: json.verification.passed, failures: json.verification.failures, attempts: json.verification.attempts.map(a => a.pass + ':' + (a.passed ? 'pass' : a.failures.length + ' fails')) }, null, 1));
console.log('wrote', out);
process.exit(0);
