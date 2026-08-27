/**
 * Give a beta tester a fresh allowance.
 *
 *   node scripts/grant-renders.mjs --email someone@example.com
 *   node scripts/grant-renders.mjs --email someone@example.com --keep-clock
 *   node scripts/grant-renders.mjs --email someone@example.com --dry
 *
 * A tester is stopped by TWO gates in checkTesterRender, and resetting only one
 * leaves them just as stuck:
 *
 *   1. testerRendersUsed >= TESTER_RENDERS (40)
 *   2. now >= testerStartedAt + TESTER_DAYS (7 days)
 *
 * So by default this clears the counter AND restarts the week. Pass
 * --keep-clock to hand back renders without extending the window - useful when
 * someone burned their forty in two days and the point is to see how they use
 * the rest of the original week.
 *
 * Every grant is appended to testerGrants on the user document, so a tester
 * quietly collecting a third and fourth top-up is visible rather than lost.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Kept in step with server.js by hand. If those constants move, move these.
const TESTER_RENDERS = 40;
const TESTER_DAYS = 7;

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const email = arg('email');
const uidArg = arg('uid');
const keepClock = flag('keep-clock');
const dry = flag('dry');

if (!email && !uidArg) {
    console.error('Usage: node scripts/grant-renders.mjs --email <address> [--keep-clock] [--dry]');
    process.exit(1);
}

const keyPath = path.join(__dirname, '..', 'firebase-service-account.json');
if (!fs.existsSync(keyPath) && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('No Firebase credentials found (firebase-service-account.json or FIREBASE_SERVICE_ACCOUNT).');
    process.exit(1);
}
admin.initializeApp({
    credential: admin.credential.cert(
        process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : JSON.parse(fs.readFileSync(keyPath, 'utf8'))
    ),
});

const db = admin.firestore();

const days = (ms) => Math.round((ms / 86400000) * 10) / 10;

const run = async () => {
    const user = uidArg
        ? await admin.auth().getUser(uidArg)
        : await admin.auth().getUserByEmail(email);

    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};

    const used = data.testerRendersUsed || 0;
    const startedAt = data.testerStartedAt || null;
    const expiresAt = startedAt ? startedAt + TESTER_DAYS * 86400000 : null;
    const now = Date.now();

    console.log(`\n  ${user.email}`);
    console.log(`  uid            ${user.uid}`);
    console.log(`  plan           ${data.plan || '(none)'}`);
    console.log(`  beta claim     ${user.customClaims?.beta === true ? 'yes' : 'no'}`);
    console.log(`  renders used   ${used} of ${TESTER_RENDERS}`);
    console.log(`  window         ${
        expiresAt === null ? 'not started'
        : now >= expiresAt ? `EXPIRED ${days(now - expiresAt)} days ago`
        : `${days(expiresAt - now)} days left`
    }`);
    const priorGrants = Array.isArray(data.testerGrants) ? data.testerGrants.length : 0;
    if (priorGrants) console.log(`  prior grants   ${priorGrants}`);

    if (dry) {
        console.log('\n  --dry: nothing written.\n');
        return;
    }

    const update = {
        testerRendersUsed: 0,
        testerGrants: admin.firestore.FieldValue.arrayUnion({
            at: now,
            previousUsed: used,
            renders: TESTER_RENDERS,
            clockReset: !keepClock,
        }),
    };
    if (!keepClock) {
        update.testerStartedAt = now;
        update.testerExpiresAt = now + TESTER_DAYS * 86400000;
    }

    await ref.set(update, { merge: true });

    console.log(`\n  GRANTED ${TESTER_RENDERS} renders.`);
    console.log(keepClock
        ? '  Window left as it was.'
        : `  Window restarted - ${TESTER_DAYS} days from now.`);
    console.log('  They may need to refresh the page to see the new balance.\n');
};

run()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('\n  Failed:', e.message || e, '\n');
        process.exit(1);
    });
