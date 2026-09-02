/**
 * Let one account use Animation Studio without changing its plan.
 *
 *   node scripts/grant-animation.mjs --email someone@example.com
 *   node scripts/grant-animation.mjs --email someone@example.com --off
 *   node scripts/grant-animation.mjs --email someone@example.com --dry
 *
 * Animation is gated by plan, and only the paid plans carry it. Moving a
 * tester onto Business to let them try a clip would also lift their render
 * cap and record them as a customer. This sets `animationEnabled` on the user
 * document instead - honoured by /api/user/credits (so the button appears)
 * and by /api/animation/start (so it works). The monthly clip allowance still
 * applies to them, so the cost is bounded exactly as it is for everyone else.
 *
 * NOTE this does nothing for someone who cannot reach the app at all. They
 * still need to be a master, an allowlisted tester, or hold the beta claim -
 * the script prints which of those they have so you can tell.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const email = arg('email');
const off = flag('off');
const dry = flag('dry');

if (!email) {
    console.error('Usage: node scripts/grant-animation.mjs --email <address> [--off] [--dry]');
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

const run = async () => {
    const user = await admin.auth().getUserByEmail(email);
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};

    console.log(`\n  ${user.email}`);
    console.log(`  uid                ${user.uid}`);
    console.log(`  plan               ${data.plan || '(none)'}`);
    console.log(`  beta claim         ${user.customClaims?.beta === true ? 'yes' : 'no'}`);
    console.log(`  animationEnabled   ${data.animationEnabled === true ? 'yes' : 'no'}`);
    console.log(`  clips this month   ${data.animationsUsed || 0}`);

    if (dry) { console.log('\n  --dry: nothing written.\n'); return; }

    await ref.set({
        animationEnabled: !off,
        animationGrants: admin.firestore.FieldValue.arrayUnion({ at: Date.now(), enabled: !off }),
    }, { merge: true });

    console.log(`\n  Animation Studio ${off ? 'REVOKED' : 'GRANTED'}.`);
    console.log('  They may need to refresh the page for the button to appear.\n');
    if (!off && data.plan !== 'master' && data.plan !== 'tester' && user.customClaims?.beta !== true) {
        console.log('  WARNING: this account has no plan and no beta claim. Unless the email is in');
        console.log('  TESTER_EMAILS on the server, they cannot reach the app at all - the flag');
        console.log('  only unlocks Animation Studio for someone who can already get in.\n');
    }
};

run()
    .then(() => process.exit(0))
    .catch((e) => { console.error('\n  Failed:', e.message || e, '\n'); process.exit(1); });
