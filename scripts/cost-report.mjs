/**
 * Cost report from the renderLog collection.
 *
 *   node scripts/cost-report.mjs
 *   node scripts/cost-report.mjs --since 2026-08-26T13:33:55Z
 *   node scripts/cost-report.mjs --since 2026-08-26T13:33:55Z --uid b4ARwo7cCQfS9iiu2L3bYl7DCqf1
 *
 * Answers the question every margin in the launch plan rests on: what does a
 * render actually cost? Prices each logged call from the rate card below and
 * totals it. Read-only.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rate card, pence per image, from the verified Google pricing in the Aug 2026
 * launch plan. VERIFY THESE AGAINST THE REAL BILL periodically - a model swap
 * in a large commit doubled the render cost once already and nothing noticed.
 */
const RATES_PENCE = {
    'gemini-3-pro-image':   { '1K': 10.6, '2K': 10.6, '4K': 19.0 },
    'gemini-3.1-flash-image': { '1K': 8.0, '2K': 8.0, '4K': 12.0 },
    // Video. These are per CLIP, not per image - the report multiplies by
    // nothing else, so the duration is baked in at ANIMATION_SECONDS (8s).
    //   Veo 3.1 Fast     $0.12/sec x 8s = $0.96 ~= 76p
    //   Veo 3.1 Standard $0.40/sec x 8s = $3.20 ~= 253p  (not in use)
    // Video resolution is unrelated to the 2K/4K image tiers.
    'veo-3.1-fast-generate-preview': { '1080p': 75.8, '720p': 50.5 },
    'veo-3.1-generate-preview': { '1080p': 252.8, '720p': 252.8 },
    // Retired 26 Aug 2026 in favour of Veo (720p only, looked soft). Kept so
    // historic log entries still price correctly: 10s at 5,792 tokens/second,
    // $17.50/1M output tokens ~= $1.01 a clip ~= 80p.
    'gemini-omni-flash-preview': { '720p': 79.8 },
};

/**
 * ESTIMATE, NOT VERIFIED: the per-inspection cost of a QA vision call on
 * gemini-3.5-flash-lite. Small but not free, and there can be up to three per
 * render. Replace with a measured figure once the bill can be broken down.
 */
const QA_CALL_PENCE_ESTIMATE = 0.3;

const argOf = (name) => {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : null;
};
const since = argOf('--since');
const onlyUid = argOf('--uid');

const sa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-service-account.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

let query = db.collection('renderLog').orderBy('ts', 'desc').limit(1000);
if (since) query = query.where('ts', '>=', new Date(since));
if (onlyUid) query = query.where('uid', '==', onlyUid);

const snap = await query.get();
const rows = [];
let totalPence = 0;
let estimatedPart = 0;

snap.forEach(d => {
    const v = d.data();
    const rate = RATES_PENCE[v.model]?.[v.imageSize];
    // Older entries predate the imageCalls field; one call is the safe read.
    const imageCalls = typeof v.imageCalls === 'number' ? v.imageCalls : (v.retried ? 2 : 1);
    const qaCalls = typeof v.qaCalls === 'number' ? v.qaCalls : 0;
    // A retried video attempt MAY also have billed - unknown, so it is
    // surfaced as a warning rather than silently added to the total.
    const retriedVideo = typeof v.videoAttempts === 'number' && v.videoAttempts > 1;

    const imageCost = rate != null ? rate * imageCalls : null;
    const qaCost = qaCalls * QA_CALL_PENCE_ESTIMATE;
    const cost = (imageCost ?? 0) + qaCost;

    totalPence += cost;
    estimatedPart += qaCost;

    rows.push({
        time: v.ts?.toDate?.()?.toISOString().replace('T', ' ').slice(0, 19) || '(pending)',
        endpoint: v.endpoint,
        size: v.imageSize,
        imageCalls,
        qaCalls,
        verified: v.verified === null || v.verified === undefined ? '-' : (v.verified ? 'pass' : 'FAIL'),
        pence: rate == null ? '?' : cost.toFixed(1),
        why: (v.failures || []).join(' | ').slice(0, 90),
        unpriced: rate == null ? v.model : null,
        retriedVideo,
    });
});

rows.reverse(); // oldest first, reads like a session

if (!rows.length) {
    console.log(since ? `No renders logged since ${since}.` : 'No renders logged.');
    process.exit(0);
}

console.log('');
console.log(since ? `Renders since ${since}` : 'Most recent renders');
if (onlyUid) console.log(`Filtered to uid ${onlyUid}`);
console.log('='.repeat(104));
console.log(
    'TIME (UTC)'.padEnd(20) + 'ENDPOINT'.padEnd(26) + 'SIZE'.padEnd(6) +
    'IMG'.padEnd(5) + 'QA'.padEnd(4) + 'CHECK'.padEnd(7) + 'PENCE'
);
console.log('-'.repeat(104));
for (const r of rows) {
    console.log(
        r.time.padEnd(20) + String(r.endpoint).padEnd(26) + String(r.size).padEnd(6) +
        String(r.imageCalls).padEnd(5) + String(r.qaCalls).padEnd(4) +
        String(r.verified).padEnd(7) + String(r.pence)
    );
    if (r.why) console.log('  ↳ rejected: ' + r.why);
    if (r.retriedVideo) console.log('  ↳ video needed more than one attempt - the failed attempt MAY also have billed');
    if (r.unpriced) console.log('  ↳ NO RATE for model ' + r.unpriced + ' - add it to RATES_PENCE');
}
console.log('-'.repeat(104));
console.log(`${rows.length} logged call(s).`);
console.log(`TOTAL: ${(totalPence / 100).toFixed(2)} GBP  (${totalPence.toFixed(1)}p)`);
console.log(`  of which ${estimatedPart.toFixed(1)}p is the UNVERIFIED QA-call estimate.`);
console.log('');
process.exit(0);
