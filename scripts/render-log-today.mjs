/** Today's renderLog entries, grouped by endpoint and model, with an estimated cost. */
import admin from 'firebase-admin'; import fs from 'fs';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'))) });
const db = admin.firestore();
const start = new Date(); start.setHours(0, 0, 0, 0);
const snap = await db.collection('renderLog').where('ts', '>=', start).get();
const rows = snap.docs.map(d => d.data());
const key = r => `${r.endpoint || r.kind || '?'} · ${r.model || '?'} · ${r.imageSize || ''}`;
const groups = {};
for (const r of rows) { const k = key(r); groups[k] = groups[k] || { n: 0, imageCalls: 0, qaCalls: 0 }; groups[k].n++; groups[k].imageCalls += Number(r.imageCalls || 1); groups[k].qaCalls += Number(r.qaCalls || 0); }
console.log('entries today:', rows.length, '(fields:', Object.keys(rows[0] || {}).join(', ') + ')');
for (const [k, v] of Object.entries(groups)) console.log(String(v.n).padStart(3), 'x', k, '| image calls', v.imageCalls, '| QA calls', v.qaCalls);
process.exit(0);
