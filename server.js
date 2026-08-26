import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import helmet from 'helmet';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db;
try {
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("SUCCESS: Loaded Firebase credentials from Environment Variable");
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        console.log("SUCCESS: Loaded Firebase credentials from Environment Variable");
    } else if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        console.log("SUCCESS: Loaded Firebase credentials from local file");
    } else {
        console.warn("WARNING: Firebase credentials not found in env or local file. Authentication will fail.");
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("SUCCESS: Firebase Admin & Firestore Initialized");
    }
} catch (error) {
    console.error("FATAL: Failed to initialize Firebase Admin:", error);
}

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) {
    console.warn("WARNING: STRIPE_SECRET_KEY missing. Billing features will be simulated or limited.");
}

// Credits Deduction Constants
const CREDIT_COSTS = {
    LOW_RES: 5,        // 1K / Free Trial
    STANDARD_RES: 30,  // 1080p
    UHD_4K: 60,        // 4K UHD
    BATCH_MULTIPLIER: 5, // Typically 5 images in a batch
    ANALYSIS: 2        // Basic visual analysis
};

/**
 * Authoritative price catalogue.
 *
 * What a customer receives is decided HERE, on the server, keyed on the Stripe
 * price ID. It is never read from the request body. Previously the client sent
 * its own `planName` and `creditsAmount`, which were copied verbatim into the
 * Stripe metadata that the webhook then honoured — so anyone could check out
 * with the cheapest real price while claiming 999,999 credits and the business
 * plan, and the webhook would grant it.
 *
 * Adding a plan means adding a row here. An unknown price ID is rejected.
 */
const PRICE_CATALOG = {
    // Business — monthly. Unlimited renders, so no credits are awarded; access
    // is granted by plan (see UNLIMITED_PLANS) rather than metered by balance.
    'price_1TM28kHtB5liiqHxBZvK7pjm': { plan: 'business',        credits: 0, mode: 'subscription' },
    // Business — yearly
    'price_1TM2OGHtB5liiqHx2RQXMxO3': { plan: 'business',        credits: 0, mode: 'subscription' },
    // Managed service add-on (no credits — service is delivered manually)
    'price_1TMS40HtB5liiqHxq6XkJGK4': { plan: 'managed_service', credits: 0, mode: 'subscription' },
};

/**
 * Modulr house style.
 *
 * The look every render should land on, shared by both the photo/line-drawing
 * path and the 3D-model path so output is consistent whichever tool produced
 * the source. Previously each prompt described quality in its own words, which
 * is why results drifted in feel between tools.
 *
 * The defining characteristic is subject isolation: the building is the hero,
 * rendered sharp, with the garden and neighbouring context present but falling
 * away. That is what separates an architectural photograph from a wide shot of
 * a garden that happens to contain a building.
 */
/**
 * House style, parameterised by the Camera Effects toggle.
 *
 * Default (false) is a pure archviz presentation: DEEP focus, everything sharp,
 * no photographic affectations - the way an offline renderer outputs a frame
 * before anyone adds camera post. The toggle opts back INTO the DSLR look
 * (depth of field, background bokeh, foreground softening) for users who want
 * a photographic feel. Blur must never be the default it silently was.
 */
const buildHouseStyle = (cameraEffects) => `
      HOUSE STYLE - APPLY TO EVERY RENDER:

      CAMERA & FOCUS:
      - Full-frame DSLR, 35-50mm lens, eye level, natural three-quarter viewpoint.
${cameraEffects ? `      - CAMERA EFFECTS ON: shallow-to-moderate depth of field. The BUILDING IS THE
        SUBJECT and must be tack sharp from corner to corner.
      - The background - fences, neighbouring rooflines, distant planting - falls
        gently out of focus. Soft, natural bokeh. Never blur the building itself.
      - Foreground grass immediately nearest the camera may soften slightly. Keep
        the frame clear of clutter; nothing should compete with the building.` : `      - DEEP FOCUS - NO CAMERA EFFECTS: the ENTIRE frame is tack sharp, front to
        back - building, garden, fences and background alike. NO depth of field,
        NO background blur, NO bokeh, NO foreground softening, NO motion blur.
        Render as an offline archviz engine outputs a frame: everything in focus.
      - Keep the frame clear of clutter; nothing should compete with the building.`}

      LIGHTING:
      - Soft, bright, overcast daylight. Diffuse and even, no harsh direct sun,
        no blown highlights, no heavy black shadows.
      - Gentle ambient occlusion under the eaves, soffits and decking edge.
      - Subtle, believable contact shadow where the structure meets the ground.

      COMPOSITION & CONTEXT:
      - A realistic UK domestic rear garden: mown lawn, timber fence panels with
        concrete posts, mature planting, neighbouring rooftops in the distance.
      - The building occupies the majority of the frame with comfortable breathing
        space. Not a wide landscape shot.
      - Horizon level, verticals true, no wide-angle distortion or converging walls.

      FINISH:
      - Neutral, true-to-life colour grade. Materials read at their real colour.
      - No oversaturation, no HDR halos, no heavy vignette, no lens flare.
      - Crisp micro-texture: timber grain, board joints, glass reflections, grass blades.
      - Presentation condition: every material newly installed, clean and true. No
        moss, staining, weathering or garden clutter - this is a marketing visual.
      - ZERO AI ARTIFACTS: no warped or wavy lines that should be straight, no
        melted or merged elements, no duplicated fence posts or cladding boards,
        no smudged painterly patches, no impossible reflections, no inconsistent
        shadow directions. Glazing bars perfectly straight and evenly spaced;
        cladding boards parallel with even gaps.
`;

/**
 * Plans with unmetered rendering.
 *
 * These bypass credit deduction entirely — the plan itself is the entitlement.
 * Keeping this as a plan-level rule (rather than an "unlimited" flag threaded
 * through Stripe metadata) means an existing subscriber is upgraded the moment
 * this deploys, with no webhook replay or data migration needed.
 */
const UNLIMITED_PLANS = new Set(['business', 'master']);

/**
 * Plans that include the Projects directory.
 *
 * Projects is on every PAID plan, Standard included. It stores client names,
 * addresses, quote values and uploaded files, all of which sit on our Firestore
 * and Storage bill for as long as the account exists — so it is still not
 * something a free or trial account gets.
 *
 * Standard was moved in here deliberately. Holding it back made Standard a tier
 * where nothing the customer produced was ever saved, which gave them no reason
 * to stay past the month they stopped needing a render; the storage costs
 * pennies and the retention is worth far more than the upsell it was protecting.
 * Business is still distinguished by unlimited rendering, 4K, the configurator
 * and Animation Studio.
 *
 * `master` is here because the owner must never be locked out of their own
 * application, and `tester` because the point of tester access is to evaluate
 * the product; a tester who cannot open Projects cannot report on it.
 */
const PROJECT_PLANS = new Set(['standard', 'business', 'master', 'tester', 'beta']);

/**
 * Plans that may generate animations.
 *
 * Deliberately excludes 'tester' and 'beta' where PROJECT_PLANS includes both.
 * Projects cost pennies of storage; a single animation costs roughly a pound of
 * real money, and tester/beta access is handed out to people we have not billed.
 *
 * This is the ONLY difference between a beta account and a paid one. Beta users
 * get every other tool, which is the point - we want them stress-testing the
 * product, just not the one feature that bills us a pound per click.
 */
const ANIMATION_PLANS = new Set(['business', 'master']);

/**
 * Animations per calendar month, per account.
 *
 * This number is a BUDGET, not a product decision. Measured: the model returns
 * 10 seconds of 720p, billed at 5,792 tokens per second at $17.50/1M output
 * tokens - about $1.01 a clip. Fifteen of those is roughly £12 a month, which
 * is the ceiling agreed against a £189.99 subscription.
 *
 * Business is otherwise an unlimited plan, so if you raise this you are raising
 * the worst-case bill for every subscriber simultaneously. Multiply before
 * changing it.
 */
const ANIMATION_MONTHLY_LIMIT = 15;

/** Calendar-month key, e.g. "2026-08". Comparing this to the stored key is what
 *  resets the allowance - cheaper and more reliable than a scheduled job. */
const currentPeriod = () => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Claim one animation from this month's allowance.
 *
 * Transactional for the same reason deductCredits is: read-then-write leaves a
 * window where N concurrent requests all see 14 used, all pass, and all
 * generate - which at a pound a clip is a real bill, not a rounding error.
 */
const claimAnimation = async (uid) => {
    if (!db) return { allowed: true, remaining: ANIMATION_MONTHLY_LIMIT };

    const userRef = db.collection('users').doc(uid);
    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : {};
            const period = currentPeriod();

            // A stored period from a previous month means the allowance has
            // rolled over, so the count starts again rather than carrying.
            const used = data.animationPeriod === period ? (data.animationsUsed || 0) : 0;

            if (used >= ANIMATION_MONTHLY_LIMIT) {
                return {
                    allowed: false,
                    status: 402,
                    error: `You have used all ${ANIMATION_MONTHLY_LIMIT} animations for this month. Your allowance resets on the 1st.`,
                };
            }

            transaction.set(userRef, {
                animationPeriod: period,
                animationsUsed: used + 1,
            }, { merge: true });

            return { allowed: true, remaining: ANIMATION_MONTHLY_LIMIT - (used + 1) };
        });
    } catch (e) {
        console.error('[ANIMATION] Quota check failed for uid:', uid, '|', e.message || e);
        // Fail closed. A database blip must not become free unmetered video.
        return { allowed: false, status: 503, error: 'Animation service temporarily unavailable. Please try again shortly.' };
    }
};

/** Hand back an animation that was claimed but never generated, so a failure at
 *  Google's end does not cost the user one of their fifteen. */
const releaseAnimation = async (uid) => {
    if (!db) return;
    try {
        const userRef = db.collection('users').doc(uid);
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : {};
            if (data.animationPeriod !== currentPeriod()) return;
            const used = data.animationsUsed || 0;
            if (used > 0) transaction.set(userRef, { animationsUsed: used - 1 }, { merge: true });
        });
    } catch (e) {
        console.error('[ANIMATION] Refund failed for uid:', uid, '|', e.message || e);
    }
};

/**
 * Camera and atmosphere presets.
 *
 * Held server-side so the wording cannot be edited from the browser, and phrased
 * ENTIRELY as positive instructions: this model does not support negative
 * prompts, so "not a full zoom" has to become "ending only slightly nearer than
 * it began" or it simply will not be honoured.
 */
const ANIMATION_PRESETS = {
    push_in: 'The camera drifts almost imperceptibly closer over the full duration, ending only slightly nearer than it began. The movement is one continuous, slow, steady glide, as if on a motorised slider.',
    pan: 'The camera glides slowly and evenly sideways across the scene in one continuous motion, as if on a motorised slider. The pace is identical from the first frame to the last.',
    orbit: 'The camera arcs very slowly around the building in one smooth continuous move, travelling only a short distance so the same face of the building stays in view throughout.',
    still: 'The camera is locked off on a tripod and does not move. Only the scene itself has life in it.',
};

const ANIMATION_MODIFIERS = {
    motion_blur: 'Subtle natural motion blur consistent with a real cinema camera at a 180 degree shutter angle.',
    breeze: 'The existing leaves, grass and planting sway gently in a light breeze, every plant staying rooted in its own place.',
    golden_hour: 'Warm low golden-hour sunlight with long soft shadows.',
    people: 'A person walks slowly through the scene in the distance, small in frame and out of focus.',
};

/** Scene lock, stated twice on purpose.
 *
 *  The clip generator was observed redesigning the scene mid-clip (new
 *  planting, altered building) even with a single fidelity sentence present.
 *  Two measures against that: the lock is much more explicit about WHAT is
 *  fixed (building, garden, every object's position, sky, lighting), and it is
 *  repeated AFTER the user's free-text — the model weights the end of a prompt
 *  heavily, so user wording can otherwise drown out an opening-only lock.
 *  Phrased entirely positively: this model does not honour "do not" wording. */
const ANIMATION_SCENE_LOCK_OPENING =
    'This is documentary footage of an existing, finished scene, captured exactly as it stands. ' +
    'Every frame of the clip shows the same building with the same geometry, proportions, cladding, doors, windows and colours as the source image, ' +
    'and the same garden with every plant, tree, path, fence and object in exactly the same place, under the same sky and the same lighting.';
const ANIMATION_SCENE_LOCK_CLOSING =
    'From the first frame to the last, the scene itself stays identical to the source image; ' +
    'the camera move and the gentle natural motion described above are the only things that change. ' +
    'Pausing on any single frame shows the source image scene, unchanged, viewed from wherever the camera is at that moment.';

/** Assemble the final prompt. Order matters: subject, then scene lock, then
 *  camera, then atmosphere, then the user's text, then the scene lock again so
 *  it is the last instruction the model reads. */
const buildAnimationPrompt = (preset, modifiers, extra) => {
    const parts = [
        'Cinematic architectural film of this garden room, filmed on a full-frame cinema camera.',
        ANIMATION_SCENE_LOCK_OPENING,
        ANIMATION_PRESETS[preset] || ANIMATION_PRESETS.push_in,
    ];
    for (const m of modifiers) {
        if (ANIMATION_MODIFIERS[m]) parts.push(ANIMATION_MODIFIERS[m]);
    }
    if (extra) parts.push(extra);
    parts.push(ANIMATION_SCENE_LOCK_CLOSING);
    return parts.join(' ');
};

// Try Before You Buy Trial Constants
const RENDERS_PER_DAY = 5;    // Max renders during trial
const TRIAL_HOURS = 24;       // Trial window in hours (1 day)
const TRIAL_DAYS = 1;         // Legacy compat — 1 day

/**
 * Master account allowlist, keyed on Firebase UID rather than the email claim.
 *
 * Email is the wrong key for an authorisation decision: it is not guaranteed
 * unique across providers and the master address is public in this repo. UIDs
 * are issued by Firebase and cannot be chosen by the user.
 *
 * Override in production with MASTER_UIDS="uid1,uid2". The literal below is the
 * current owner account and exists so a missing env var can never lock the
 * owner out of their own application. A UID is an identifier, not a credential.
 */
const MASTER_UIDS = (process.env.MASTER_UIDS || 'b4ARwo7cCQfS9iiu2L3bYl7DCqf1')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/** True only for allowlisted master UIDs. */
const isMasterUser = (user) => !!user && MASTER_UIDS.includes(user.uid);

/**
 * Tester allowlist, by email.
 *
 * Testers sign themselves up, so there is no UID to allowlist in advance -
 * email is the only identifier we have before they exist. That is acceptable
 * here where it would not be for MASTER_UIDS, because a tester's privileges are
 * strictly bounded (a fixed number of renders, for a fixed number of days) and
 * Firebase will not let a second account claim an email that is already taken.
 *
 * Set TESTER_EMAILS="a@b.com,c@d.com" in the environment.
 */
const TESTER_EMAILS = (process.env.TESTER_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

const isTesterUser = (user) =>
    !!user && !!user.email && TESTER_EMAILS.includes(user.email.toLowerCase().trim());

// Tester allowance. 40 renders is roughly £5 of 4K image generation at current
// Gemini rates, which is the budget agreed per tester.
const TESTER_RENDERS = 40;

/** Standard plan: renders per calendar month. Matches the pricing page. */
const STANDARD_RENDERS_PER_MONTH = 100;
const TESTER_DAYS = 7;

/**
 * Helper to check and deduct credits from a user's account
 * @param {object} user - Firebase User Object
 * @param {number} amount - Number of credits to deduct
 * @returns {Promise<{success: boolean, balance: number, error?: string}>}
 */
const deductCredits = async (user, amount) => {
    if (!db) return { success: true, balance: 9999 }; // Dev mode safety (no Firebase locally)

    // Master Account Override — unlimited renders
    if (isMasterUser(user)) {
        return { success: true, balance: 999999 };
    }

    const uid = user.uid;
    const userRef = db.collection('users').doc(uid);

    try {
        // The balance check and the decrement MUST happen inside one transaction.
        // Reading, checking, then writing leaves a window in which N concurrent
        // requests all observe the same balance, all pass the check, and all
        // decrement — letting a user spend credits they do not have.
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            // If user doc doesn't exist yet, create it with no credits and block
            if (!userDoc.exists) {
                transaction.set(userRef, { credits: 0, plan: 'free', createdAt: admin.firestore.FieldValue.serverTimestamp() });
                return { success: false, balance: 0, error: "Free accounts are currently suspended. Please upgrade to a paid plan." };
            }

            const data = userDoc.data();
            const plan = data.plan || 'free';
            const currentCredits = typeof data.credits === 'number' ? data.credits : 0;

            if (plan === 'free') {
                return { success: false, balance: currentCredits, error: "Free accounts are currently suspended. Please upgrade to a paid plan." };
            }

            // Feature gate: 4K requires Business plan
            if (amount === CREDIT_COSTS.UHD_4K && plan !== 'business' && plan !== 'master') {
                return { success: false, balance: currentCredits, error: "4K Ultra HD requires the Business Plan" };
            }

            if (currentCredits < amount) {
                return { success: false, balance: currentCredits, error: "Insufficient credits" };
            }

            transaction.update(userRef, { credits: admin.firestore.FieldValue.increment(-amount) });
            return { success: true, balance: currentCredits - amount };
        });

    } catch (e) {
        console.error("[CREDITS] Deduction failed for uid:", uid, "| Error:", e.message || e);
        // Fail CLOSED. Granting the render on a database error turns any Firestore
        // outage — or anything an attacker can do to induce one — into unmetered
        // billable AI usage on our own API key.
        return { success: false, balance: 0, status: 503, error: "Credit system temporarily unavailable. Please try again shortly." };
    }
};


/**
 * Check and record a free trial render.
 * Trial: 5 renders/day for 3 days. No credits involved.
 */
const checkTrialRender = async (user) => {
    if (!db) return { allowed: true };
    if (isMasterUser(user)) return { allowed: true };

    const userRef = db.collection('users').doc(user.uid);

    try {
        // Same reasoning as deductCredits: the read of trialRendersUsed and the
        // write of trialRendersUsed + 1 must be one atomic unit, or parallel
        // requests all read the same count and blow straight past the cap.
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const now = Date.now();

            if (!userDoc.exists) {
                const trialExpiresAt = new Date(now + TRIAL_HOURS * 3600000).toISOString();
                transaction.set(userRef, {
                    plan: 'free',
                    trialStartTimestamp: now,
                    trialExpiresAt: trialExpiresAt,
                    trialRendersUsed: 1,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return { allowed: true, rendersLeft: RENDERS_PER_DAY - 1 };
            }

            const data = userDoc.data();
            const trialStart = data.trialStartTimestamp || now;
            const msElapsed = now - trialStart;

            if (msElapsed >= TRIAL_HOURS * 3600000) {
                return { allowed: false, error: 'Your 24-hour trial has ended. Upgrade to the Business Plan to continue rendering.' };
            }

            const rendersUsed = data.trialRendersUsed || 0;

            if (rendersUsed >= RENDERS_PER_DAY) {
                return { allowed: false, error: 'Trial limit reached (5 renders). Upgrade to Business for unlimited access.' };
            }

            transaction.update(userRef, { trialRendersUsed: rendersUsed + 1 });
            return { allowed: true, rendersLeft: RENDERS_PER_DAY - (rendersUsed + 1) };
        });

    } catch (e) {
        console.error('[TRIAL] Check failed:', e.message || e);
        // Fail CLOSED — see deductCredits. A database error must never become
        // free unmetered AI usage.
        return { allowed: false, status: 503, error: 'Render service temporarily unavailable. Please try again shortly.' };
    }
};

const app = express();
app.set('trust proxy', 1); // Enable proxy trust for Render load balancers

/**
 * Unified render access gate — call this at the top of EVERY render endpoint.
 *
 * Free / trial users  → checkTrialRender (5 renders/day for 3 days, no credits consumed)
 * Paid users          → deductCredits (standard credit system)
 *
 * Returns:
 *   { allowed: false, status: 402, body: {...} }  → endpoint should return this immediately
 *   { allowed: true, rendersLeft?: number }       → endpoint may proceed
 */
/**
 * Tester allowance: a fixed number of renders within a fixed window.
 *
 * Same transactional, fail-closed shape as checkTrialRender - the read of the
 * counter and the write of counter + 1 must be atomic or parallel requests all
 * observe the same value and blow past the cap.
 */
const checkTesterRender = async (user) => {
    if (!db) return { allowed: true };

    const userRef = db.collection('users').doc(user.uid);
    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const now = Date.now();
            const data = snap.exists ? snap.data() : null;

            // The clock starts on first use, not on account creation, so a
            // tester who signs up early does not lose days before starting.
            const startedAt = data?.testerStartedAt || now;
            const expiresAt = startedAt + TESTER_DAYS * 86400000;
            const used = data?.testerRendersUsed || 0;

            if (now >= expiresAt) {
                return { allowed: false, status: 402, error: `Your ${TESTER_DAYS}-day tester access has ended.` };
            }
            if (used >= TESTER_RENDERS) {
                return { allowed: false, status: 402, error: `Tester limit reached (${TESTER_RENDERS} renders).` };
            }

            transaction.set(userRef, {
                plan: 'tester',
                testerStartedAt: startedAt,
                testerExpiresAt: expiresAt,
                testerRendersUsed: used + 1,
            }, { merge: true });

            return { allowed: true, rendersLeft: TESTER_RENDERS - (used + 1) };
        });
    } catch (e) {
        console.error('[TESTER] Check failed:', e.message || e);
        return { allowed: false, status: 503, error: 'Render service temporarily unavailable. Please try again shortly.' };
    }
};

/**
 * Standard plan allowance: N renders per CALENDAR month.
 *
 * Same transactional, fail-closed shape as the tester counter. Keyed on the
 * month string so the counter resets itself - no cron, no cleanup job; a new
 * month simply reads as zero used.
 */
const checkStandardRender = async (user) => {
    if (!db) return { allowed: true };
    const userRef = db.collection('users').doc(user.uid);
    const monthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : null;
            const used = (data?.standardMonth === monthKey ? data?.standardRendersUsed : 0) || 0;
            if (used >= STANDARD_RENDERS_PER_MONTH) {
                return { allowed: false, status: 402, error: `You've used all ${STANDARD_RENDERS_PER_MONTH} renders this month. Your allowance resets on the 1st, or upgrade to Business for unlimited renders.` };
            }
            transaction.set(userRef, {
                standardMonth: monthKey,
                standardRendersUsed: used + 1,
            }, { merge: true });
            return { allowed: true, rendersLeft: STANDARD_RENDERS_PER_MONTH - (used + 1) };
        });
    } catch (e) {
        console.error('[STANDARD] Check failed:', e.message || e);
        return { allowed: false, status: 503, error: 'Render service temporarily unavailable. Please try again shortly.' };
    }
};

const enforceRenderAccess = async (req, creditCost) => {
    // Master account — always allowed. Keyed on UID allowlist, never on the
    // email claim, and never on a Firestore field the user's document controls.
    if (isMasterUser(req.user)) {
        return { allowed: true };
    }

    // Testers are metered by render count and an expiry date, not by credits.
    // Cheap ANALYSIS calls ride free for testers: every upload triggers an
    // automatic analysis, so metering them burned the 40-render allowance
    // roughly twice as fast as the tester was told it would last.
    // Beta members are metered exactly like testers - a fixed render count over
    // a fixed window - so they share checkTesterRender rather than duplicating
    // the transactional counter logic.
    if (isTesterUser(req.user) || req.user?.beta === true) {
        if (creditCost === CREDIT_COSTS.ANALYSIS) {
            return { allowed: true };
        }
        const testerCheck = await checkTesterRender(req.user);
        if (!testerCheck.allowed) {
            return { allowed: false, status: testerCheck.status || 402, body: { error: testerCheck.error } };
        }
        return { allowed: true, rendersLeft: testerCheck.rendersLeft };
    }

    // Read plan from Firestore. A read failure must NOT silently degrade to the
    // free/trial path — that path used to fail open, so a DB blip granted
    // everyone unlimited renders. Refuse instead.
    let userPlan = 'free';
    if (db) {
        try {
            const uDoc = await db.collection('users').doc(req.user.uid).get();
            userPlan = uDoc.exists ? (uDoc.data().plan || 'free') : 'free';
        } catch (e) {
            console.error('[ACCESS] Plan lookup failed for uid:', req.user.uid, '|', e.message || e);
            return {
                allowed: false,
                status: 503,
                body: { error: 'Render service temporarily unavailable. Please try again shortly.' }
            };
        }
    }

    // Unlimited plans render without metering.
    if (UNLIMITED_PLANS.has(userPlan)) {
        return { allowed: true, unlimited: true, plan: userPlan };
    }

    /**
     * Standard: monthly render counter, and the caller must clamp resolution -
     * isHighQuality arrives from the client and cannot be trusted to respect
     * the plan's 1080p ceiling. Analysis calls ride free, same reasoning as
     * testers: every upload triggers one automatically.
     */
    if (userPlan === 'standard') {
        if (creditCost === CREDIT_COSTS.ANALYSIS) {
            return { allowed: true, plan: 'standard' };
        }
        const check = await checkStandardRender(req.user);
        if (!check.allowed) {
            return { allowed: false, status: check.status || 402, body: { error: check.error } };
        }
        return { allowed: true, rendersLeft: check.rendersLeft, plan: 'standard' };
    }

    if (userPlan === 'free') {
        // Trial path — no credits deducted, daily count enforced
        const trialCheck = await checkTrialRender(req.user);
        if (!trialCheck.allowed) {
            return {
                allowed: false,
                status: trialCheck.status || 402,
                body: { error: trialCheck.error, upgradeRequired: !trialCheck.status }
            };
        }
        return { allowed: true, rendersLeft: trialCheck.rendersLeft };
    }

    // Paid path — deduct credits
    const creditCheck = await deductCredits(req.user, creditCost);
    if (!creditCheck.success) {
        return {
            allowed: false,
            status: creditCheck.status || 402,
            body: { error: creditCheck.error, balance: creditCheck.balance }
        };
    }
    return { allowed: true, creditBalance: creditCheck.balance };
};

// API_PORT lets local dev pin the API to 3005 (where vite.config proxies /api)
// even when a tool injects PORT for the front end. Production is unaffected:
// hosts set PORT and leave API_PORT unset.
const port = process.env.API_PORT || process.env.PORT || 3005;

console.log("--- SERVER STARTUP DEBUG ---");
console.log("CWD:", process.cwd());
console.log("DIRNAME:", __dirname);
console.log("PORT ENV:", process.env.PORT);
console.log("PORT SELECT:", port);
console.log("API KEY STATUS:", (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) ? "EXISTS (SAFE)" : "MISSING");

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    console.log("SUCCESS: 'dist' folder found at:", distPath);
} else {
    console.warn("WARNING: 'dist' folder NOT found at:", distPath);
    console.log("LISTING ROOT DIR:", fs.readdirSync(__dirname));
}
console.log("----------------------------");

// Rate Limiters
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // 600, not 100: this is an SPA that polls (animation status is a GET every
    // 3s — up to ~100 requests for one slow clip) and several people can share
    // one office IP. At 100 a single demo session tripped the limiter, and the
    // client used to interpret the resulting 429 as "locked out". Abuse control
    // for the expensive endpoints is the per-UID userAiLimiter, not this.
    max: 600,
    message: { error: "Too many requests from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { ip: false, xForwardedForHeader: false } // suppress proxy warning — trust proxy is set above
});

const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: { error: "IP-based render limit reached. Please wait a minute." },
    validate: { ip: false, xForwardedForHeader: false }
});

// Per-User AI Limiter — rate-limited per Firebase UID, not just IP
const userAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    // 12, not 5: a 5-image batch render is 5 sequential calls 3s apart, usually
    // preceded by an analysis call on this same limiter — the old cap of 5
    // aborted the batch midway with "individual render limit". Credits are the
    // real spend control; this only has to stop runaway loops.
    max: 12,
    // Authenticated requests key on the Firebase UID. The IP fallback must go
    // through ipKeyGenerator, which normalises IPv6 to its /64 prefix — a raw
    // req.ip lets an IPv6 client hop addresses within its own allocation and
    // get a fresh limit bucket on every request.
    keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip) || 'unknown',
    message: { error: "You have reached your individual render limit. Please wait a minute." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { ip: false, xForwardedForHeader: false }
});

/**
 * Sanitize a user-supplied string.
 * - Rejects non-strings (returns '')
 * - Trims whitespace
 * - Caps length to prevent prompt-injection via enormous payloads
 */
const sanitizeString = (value, maxLength = 2000) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

/**
 * Sanitize a user-supplied boolean.
 * Accepts real booleans or the string literals 'true'/'false'.
 * Defaults to false for anything else.
 */
const sanitizeBool = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return false;
};

// Security Headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS Configuration (Strict Origins)
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.VITE_APP_URL, // E.g., https://modulr.studio
    'https://bxcksai-exterior-render-engine.onrender.com', // Old Fallback Render URL
    'https://modulr-studio.onrender.com', // New Render URL
    'https://modulrstudio.co.uk',
    'https://www.modulrstudio.co.uk'
].filter(Boolean);

// CORS applies to the API only. Applying it to every route is actively harmful:
// browsers do not send an Origin header on top-level navigation, so rejecting
// origin-less requests globally would reject ordinary page loads and the host's
// health checks, taking the whole site down.
//
// Origin-less requests are therefore allowed. CORS is a browser-enforced control
// and cannot stop a scripted client regardless; the Firebase token check in
// verifyFirebaseToken is the actual gate on these endpoints.
app.use('/api', cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            const err = new Error('Not allowed by CORS');
            err.status = 403;
            callback(err);
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe Webhook MUST come before express.json() because it needs raw body for signature verification
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
        console.warn("Stripe Webhook received but Stripe is not fully configured.");
        return res.status(200).json({ received: true, info: "Stripe not configured" });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout.session.completed (Initial purchase) AND invoice.paid (Renewals)
    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
        const object = event.data.object;
        
        // For checkout.session.completed, we get uid from metadata
        // For invoice.paid, we might need to look up uid by customerId if metadata isn't on the invoice
        let uid = object.metadata?.firebase_uid;
        let creditsToAward = parseInt(object.metadata?.credits || "0");
        // NOTE: no 'free' default. Defaulting to 'free' meant that if metadata
        // ever went missing on a renewal we would DOWNGRADE a paying customer
        // at the exact moment their payment succeeded. Unknown plan => leave the
        // stored plan untouched.
        let plan = object.metadata?.plan || null;
        let customerId = object.customer;

        // If it's an invoice, we need to extract line item metadata or look up the subscription
        if (event.type === 'invoice.paid' && !uid) {
            try {
                // Subscription typically has the metadata
                const subscription = await stripe.subscriptions.retrieve(object.subscription);
                uid = subscription.metadata?.firebase_uid;
                creditsToAward = parseInt(subscription.metadata?.credits || "0");
                plan = subscription.metadata?.plan || null;
            } catch (err) {
                console.error("[STRIPE] Error retrieving subscription for invoice:", err.message);
            }
        }

        if (!uid) {
            console.error('[STRIPE] PAYMENT WITHOUT firebase_uid — manual reconciliation needed. event:', event.id, 'customer:', customerId);
        }

        // Process whenever we know who paid. Previously this also required
        // creditsToAward > 0, so a zero-credit plan (e.g. the managed service
        // add-on) recorded nothing at all — no plan, no stripeCustomerId, which
        // also left the billing portal unusable for those customers.
        if (uid) {
            try {
                // IDEMPOTENCY CHECK: Ensure we haven't processed this exact event before
                const eventRef = db.collection('stripe_events').doc(event.id);
                
                await db.runTransaction(async (transaction) => {
                    const eventDoc = await transaction.get(eventRef);
                    if (eventDoc.exists) {
                        console.warn(`[STRIPE] WARNING: Duplicate webhook event detected: ${event.id}. Skipping.`);
                        return; // Exit transaction
                    }
                    
                    // Mark event as processed
                    transaction.set(eventRef, {
                        type: event.type,
                        uid: uid,
                        creditsAwarded: creditsToAward,
                        processedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Award credits
                    const userRef = db.collection('users').doc(uid);
                    const update = {
                        stripeCustomerId: customerId,
                        lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
                        subscriptionStatus: 'active'
                    };
                    if (creditsToAward > 0) {
                        update.credits = admin.firestore.FieldValue.increment(creditsToAward);
                    }
                    if (plan) {
                        update.plan = plan;
                        // Grant Projects here rather than waiting for the next
                        // credits fetch, so the directory is usable the moment
                        // checkout returns.
                        update.projectsEnabled = PROJECT_PLANS.has(plan);
                    }
                    transaction.set(userRef, update, { merge: true });
                });
                
                console.log(`[STRIPE] ${event.type} processed: Awarded ${creditsToAward} credits to ${uid}`);
            } catch (error) {
                console.error("[STRIPE] Error updating user credits in Firestore:", error);
            }
        }
    }

    /**
     * Subscription ended, or payment permanently failed → revoke access.
     *
     * Without this, nothing in the application ever downgrades a plan: a
     * customer could subscribe once, cancel or let their card lapse, and retain
     * Business access and their credit balance indefinitely.
     */
    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
        const object = event.data.object;
        let uid = object.metadata?.firebase_uid;
        const customerId = object.customer;

        // invoice.payment_failed carries the invoice, not the subscription, so
        // the uid usually has to come from the subscription it belongs to.
        if (!uid && object.subscription) {
            try {
                const subscription = await stripe.subscriptions.retrieve(object.subscription);
                uid = subscription.metadata?.firebase_uid;
            } catch (err) {
                console.error('[STRIPE] Could not retrieve subscription for revocation:', err.message);
            }
        }

        // Last resort: find the user by the Stripe customer ID we stored on purchase.
        if (!uid && customerId && db) {
            try {
                const match = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
                if (!match.empty) uid = match.docs[0].id;
            } catch (err) {
                console.error('[STRIPE] Customer lookup failed:', err.message);
            }
        }

        if (!uid) {
            console.error('[STRIPE] Could not resolve a user to revoke for event:', event.id, '| customer:', customerId);
        } else if (db) {
            try {
                await db.collection('users').doc(uid).set({
                    plan: 'free',
                    // No new projects once the subscription lapses. Existing ones
                    // stay readable and deletable - the data is theirs, and
                    // holding it hostage is not what revocation is for.
                    projectsEnabled: false,
                    subscriptionStatus: event.type === 'customer.subscription.deleted' ? 'cancelled' : 'past_due',
                    accessRevokedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log(`[STRIPE] ${event.type}: revoked paid access for ${uid}`);
            } catch (error) {
                console.error('[STRIPE] Failed to revoke access for', uid, error);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.json({ limit: '20mb' })); // Reduced from 100mb for DoS protection (Images compress to ~1MB max client-side)

// Scope the IP limiter to the API only. Applied globally it also counted every
// static asset and page refresh against the 100-request budget, so anyone behind
// shared NAT — an office, a campus, a mobile carrier — would be served JSON
// errors where HTML and JavaScript should be, and the site would look broken.
app.use('/api', globalLimiter);

// Error handler for JSON parsing or payload limits.
// Registered here so it catches body-parser failures; a second, final handler is
// registered after the routes to catch errors thrown inside route handlers.
app.use((err, req, res, next) => {
    if (err) {
        console.error("Express middleware error:", err.message);
        const status = err.status || err.statusCode || 500;
        // Do not echo internal error text to clients on a 5xx.
        return res.status(status).json({
            error: status >= 500 ? "Internal Server Error" : (err.message || "Bad Request")
        });
    }
    next();
});

// Middleware to verify Firebase JWT
const verifyFirebaseToken = async (req, res, next) => {
    // Development-only auth bypass. This is deliberately driven by the
    // environment rather than a hardcoded constant: a constant sitting in the
    // source is one stray keystroke away from disabling authentication for the
    // entire API in production. It cannot switch on unless BOTH an explicit
    // opt-in flag is set AND we are demonstrably not in production.
    if (process.env.ALLOW_MOCK_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
        console.warn('[AUTH] MOCK AUTH ACTIVE — all requests run as the master test user.');
        req.user = { uid: MASTER_UIDS[0], email: 'dev@localhost', email_verified: true };
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error("Firebase auth error:", error);
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
};

/**
 * Pre-launch lock: restrict API operations to the master account.
 *
 * Keyed on the Firebase UID allowlist, not the email claim. The email claim is
 * user-facing data — the master address is published in this repository, is not
 * verified on the current owner account, and is not guaranteed unique across
 * auth providers. The UID is assigned by Firebase and cannot be chosen.
 */
const enforceMasterLock = (req, res, next) => {
    // Testers and beta members are let through the pre-launch lock. Their usage
    // is still bounded by enforceRenderAccess, which caps renders and expires.
    //
    // The beta flag is a Firebase CUSTOM CLAIM, so it travels inside the signed
    // ID token. Reading it costs nothing; a Firestore lookup here would add a
    // read to every single API call.
    if (isMasterUser(req.user) || isTesterUser(req.user)) {
        return next();
    }

    if (req.user?.beta === true) {
        /**
         * A beta seat must have a real address behind it.
         *
         * Firebase creates an account for any WELL-FORMED string, so
         * "someone@madeup.com" signs up perfectly happily. Requiring the
         * address to have actually received mail is the only check that
         * distinguishes a real inbox from a plausible-looking one.
         *
         * Deliberately scoped to beta accounts. Master and tester accounts are
         * allowlisted by hand, so demanding verification there would lock out
         * the existing client tester to prove something we already know.
         */
        if (req.user.email_verified !== true) {
            return res.status(403).json({
                error: 'Please confirm your email address to finish joining the beta.',
                emailUnverified: true,
            });
        }
        return next();
    }
    // Log WHO was refused. When a legitimate tester is turned away (typo'd
    // allowlist entry, Google alias, TESTER_EMAILS unset on the host) this line
    // is the only way to see it from the server side.
    console.warn(
        `Pre-launch lock refused uid=${req.user?.uid || 'none'} email=${req.user?.email || 'none'} ` +
        `(allowlisted testers: ${TESTER_EMAILS.length}, masters: ${MASTER_UIDS.length})`
    );
    return res.status(403).json({ error: 'Access restricted: App is currently in pre-launch mode for Master Account access only.' });
};

/**
 * Planning advice for the 3D configurator's PDF export.
 *
 * Registered BEFORE the auth middleware on purpose: the configurator runs in
 * an iframe with no Firebase client, so it cannot attach a bearer token — and
 * this route previously existed only in the configurator's standalone dev
 * server, meaning the embedded product's PDF silently lost its Planning
 * Guidance page (the fetch 404ed and the catch swallowed it). It is a cheap
 * text-only call, hard-capped by the strict per-IP aiLimiter.
 */
/**
 * Traffic-light permitted-development verdict, computed by CODE.
 *
 * The light must never hallucinate, so the thresholds live here as plain
 * maths (verified UK GPDO Class E, Aug 2026) and the model is only allowed
 * to explain a verdict it is handed - never to decide one:
 *   green - total height <= 2.5m: no 2m boundary set-off needed (the other
 *           Class E conditions - behind the house, coverage, use - still apply)
 *   amber - within the limits (gable: eaves <= 2.5m and ridge <= 4m;
 *           flat: total <= 3m) BUT only when sited 2m+ from every boundary,
 *           which the configurator cannot know - so: fine if positioned
 *           right, confirm before building
 *   red   - exceeds the Class E envelope; no siting rescues it
 * Mirrored client-side in Sidebar.tsx for the live pill - keep in sync.
 */
const pdVerdict = (roomDetails) => {
    const isGableRoof = String(roomDetails.shape) === 'Gable';
    const total = Number(roomDetails.overallTotalHeightMm)
        || Math.max(Number(roomDetails.overallTotalFrontHeightMm) || 0, Number(roomDetails.overallTotalBackHeightMm) || 0)
        || Number(roomDetails.heightMm) || 0;
    const eaves = Number(roomDetails.eavesHeightMm) || total;
    let verdict;
    if (total > 0 && total <= 2500) verdict = 'green';
    else if (isGableRoof ? (eaves <= 2500 && total <= 4000) : total <= 3000) verdict = 'amber';
    else verdict = 'red';
    return { verdict, total, eaves, isGableRoof };
};

app.post('/api/planning-advice', aiLimiter, async (req, res) => {
    try {
        const { roomDetails } = req.body;
        if (!roomDetails || typeof roomDetails !== 'object') {
            return res.status(400).json({ error: "Room details required" });
        }

        const { verdict, total, eaves, isGableRoof } = pdVerdict(roomDetails);
        const VERDICT_HEADLINES = {
            green: 'Likely Permitted Development',
            amber: 'Permitted Development with conditions - get advice',
            red: 'Planning permission likely required',
        };

        /**
         * The PD CHECKLIST - each Class E criterion as pass / fail / unknown,
         * all decided by code from the design's real numbers. 'unknown' means
         * the configurator cannot know it (siting, land status, use) - those
         * render amber and are exactly the questions NAPC answers.
         */
        const maxTotal = isGableRoof ? 4000 : 3000;
        const checks = [
            {
                label: `Overall height within the ${isGableRoof ? '4.0m dual-pitch' : '3.0m'} limit`,
                status: total <= maxTotal ? 'pass' : 'fail',
                detail: `This design: ${(total / 1000).toFixed(2)}m`,
            },
            ...(isGableRoof ? [{
                label: 'Eaves height within the 2.5m limit',
                status: eaves <= 2500 ? 'pass' : 'fail',
                detail: `This design: ${(eaves / 1000).toFixed(2)}m`,
            }] : []),
            {
                label: 'Buildable within 2m of a boundary',
                status: total <= 2500 ? 'pass' : (total <= maxTotal ? 'unknown' : 'fail'),
                detail: total <= 2500
                    ? 'Under 2.5m overall - no 2m boundary set-off needed'
                    : (total <= maxTotal ? 'Over 2.5m - must sit 2m+ from every boundary' : 'Exceeds PD limits regardless of siting'),
            },
            {
                label: 'Single storey',
                status: 'pass',
                detail: 'All configurator designs are single storey',
            },
            {
                label: 'Behind the front of the house',
                status: 'unknown',
                detail: 'Depends on siting - not forward of the principal elevation',
            },
            {
                label: 'Garden coverage under 50%',
                status: 'unknown',
                detail: 'Total of all outbuildings and extensions on the plot',
            },
            {
                label: 'Incidental use (no sleeping accommodation)',
                status: 'unknown',
                detail: 'Office, gym or studio qualifies; an annexe does not',
            },
            {
                label: 'Not listed / designated land restrictions',
                status: 'unknown',
                detail: 'Conservation areas, AONB and listed buildings carry extra rules',
            },
        ];
        /**
         * Indicative likelihood score. Deterministic and deliberately simple:
         * anchored on the verdict, because the dims are the only part we can
         * actually measure - the unknowns assume typical siting and use.
         */
        const score = verdict === 'green' ? 90 : verdict === 'amber' ? 65 : 15;

        const prompt = `You are a professional but very approachable UK planning consultant explaining a
PRE-COMPUTED permitted development verdict to a homeowner. You must NOT change the verdict - your job is
to explain it clearly and helpfully.

THE BUILDING:
${JSON.stringify(roomDetails, null, 2).slice(0, 3000)}

THE COMPUTED FACTS (authoritative - use these numbers):
- Roof: ${isGableRoof ? 'gable (dual pitched)' : 'flat / single pitch'}
- Overall height (ground to highest point): ${total}mm
- Eaves height: ${eaves}mm
- VERDICT: ${verdict.toUpperCase()} - "${VERDICT_HEADLINES[verdict]}"

VERDICT MEANINGS (Class E, GPDO 2015):
- GREEN: total height <= 2.5m, so the 2m boundary set-off does NOT apply - it can sit right against a fence. Be clear the OTHER Class E conditions still apply: behind the front of the house, coverage, incidental use, and no side-of-house placement on designated land.
- AMBER: within the height limits (${isGableRoof ? 'eaves <= 2.5m, ridge <= 4m for a dual-pitched roof' : 'overall <= 3m'}) BUT
  this only applies when the building is sited 2m or more from EVERY boundary. The siting is not known,
  so the owner must confirm it. ${!isGableRoof && total > 2500 ? 'Also caveat: some authorities apply the 2.5m eaves rule strictly to flat roofs - worth professional confirmation.' : ''}
- RED: exceeds the permitted development envelope regardless of siting.${verdict === 'red' ? ` State the nearest compliant option plainly: ${isGableRoof ? `lower the ridge to 4000mm (and eaves to 2500mm or less)` : `lower the overall height to 3000mm`}, or apply for planning permission.` : ''}

STANDARD CONDITIONS that always apply (mention briefly): property must be a house not a flat, building
behind the front of the house, outbuildings covering under 50% of the garden, incidental use (no sleeping
accommodation), stricter rules on conservation areas / listed buildings, and Building Regulations are a
separate question (usually exempt under 15 sqm, or under 30 sqm if over 1m from boundaries or
non-combustible).

In napcNote, strongly recommend the National Annexe Planning Company (NAPC) at www.napc.uk${verdict !== 'green' ? ' - for this verdict especially, a Lawful Development Certificate or planning application handled by NAPC is the safe route' : ' for a Lawful Development Certificate giving formal proof this building is lawful'}.

Plain English, no jargon, no markdown symbols.`;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        headline: { type: Type.STRING, description: "One-sentence plain-English summary of the verdict for THIS building" },
                        reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Why this verdict: the specific measurements vs the limits" },
                        caveats: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Standard conditions and what could change the answer" },
                        buildingRegs: { type: Type.STRING, description: "Two-sentence Building Regulations note" },
                        napcNote: { type: Type.STRING, description: "The NAPC recommendation with www.napc.uk" },
                    },
                    required: ["headline", "reasons", "caveats", "buildingRegs", "napcNote"]
                }
            }
        });

        const parsed = JSON.parse(response.text);
        // Legacy plain-text version, composed from the same parts, for any
        // consumer still reading `advice` as a string.
        const advice = [
            `${VERDICT_HEADLINES[verdict].toUpperCase()}`,
            parsed.headline,
            '',
            'WHY:',
            ...parsed.reasons.map((r, i) => `${i + 1}. ${r}`),
            '',
            'WORTH KNOWING:',
            ...parsed.caveats.map((c, i) => `${i + 1}. ${c}`),
            '',
            'BUILDING REGULATIONS: ' + parsed.buildingRegs,
            '',
            parsed.napcNote,
        ].join('\n');

        res.json({
            verdict,
            headline: parsed.headline,
            reasons: parsed.reasons,
            caveats: parsed.caveats,
            buildingRegs: parsed.buildingRegs,
            napcNote: parsed.napcNote,
            totalHeightMm: total,
            eavesHeightMm: eaves,
            checks,
            score,
            advice,
        });
    } catch (error) {
        console.error("Planning advice error:", error);
        res.status(500).json({ error: "Failed to generate planning advice" });
    }
});

/**
 * Beta code redemption.
 *
 * Registered BEFORE the master lock, because by definition the caller has not
 * been let in yet. Authentication is still required - you must be a signed-in
 * Firebase user to redeem - so this is not an anonymous endpoint.
 *
 * Success grants a `beta` custom claim rather than writing a Firestore field.
 * The claim rides inside the signed ID token, so enforceMasterLock can check it
 * without a database read on every request.
 */
const betaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8, // brute force protection - the code is 74 bits, this makes guessing hopeless
    keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip) || 'unknown',
    message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
    validate: { ip: false, xForwardedForHeader: false }
});

app.post('/api/beta/redeem', verifyFirebaseToken, betaLimiter, async (req, res) => {
    const expected = (process.env.BETA_CODE || '').trim();
    if (!expected) {
        console.warn('[BETA] Redemption attempted but BETA_CODE is not set on this host.');
        return res.status(503).json({ error: 'The beta is not currently open.' });
    }

    // Compared with case and whitespace removed, because this gets typed by
    // hand off an email. The hyphens are significant.
    const supplied = sanitizeString(req.body.code, 64).toUpperCase().replace(/\s+/g, '');
    if (supplied !== expected.toUpperCase().replace(/\s+/g, '')) {
        console.warn(`[BETA] Bad code from uid=${req.user.uid} email=${req.user.email || 'none'}`);
        return res.status(403).json({ error: 'That access code is not valid.' });
    }

    try {
        // Preserve any claims already on the account rather than replacing them.
        const existing = (await admin.auth().getUser(req.user.uid)).customClaims || {};
        await admin.auth().setCustomUserClaims(req.user.uid, { ...existing, beta: true });

        if (db) {
            await db.collection('users').doc(req.user.uid).set({
                plan: 'beta',
                betaJoinedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        console.log(`[BETA] Access granted to uid=${req.user.uid} email=${req.user.email || 'none'}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('[BETA] Failed to grant access:', e);
        res.status(500).json({ error: 'Could not activate your account. Please try again.' });
    }
});

/**
 * Free public planning checker - a lead-gen tool, deliberately open to anyone.
 *
 * Registered BEFORE the master lock for the same reason as beta redemption:
 * its whole point is that no account is needed. It spends real Gemini tokens
 * with nobody to bill, so the per-IP daily cap is strict, and the refusal
 * message itself sends people to NAPC - even the rate limit is marketing.
 */
const planningCheckLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => ipKeyGenerator(req.ip) || 'unknown',
    message: { error: 'Daily limit reached for the free checker. For a full assessment, speak to the National Annexe Planning Company at www.napc.uk.' },
    validate: { ip: false, xForwardedForHeader: false }
});

app.post('/api/public/planning-check', planningCheckLimiter, async (req, res) => {
    try {
        // Forgiving units: this trade thinks in millimetres, so "8000" in a
        // metres box means 8m. Anything over 100 is unambiguously mm.
        const num = (v, max) => {
            let n = parseFloat(v);
            if (!isFinite(n) || n <= 0) return null;
            if (n > 100) n = n / 1000;
            return n <= max ? Math.round(n * 100) / 100 : null;
        };
        const widthM     = num(req.body.widthM, 50);
        const depthM     = num(req.body.depthM, 50);
        const heightM    = num(req.body.heightM, 20);
        const boundaryM  = num(req.body.boundaryM, 1000);
        const description = sanitizeString(req.body.description, 600);
        const isHouse       = sanitizeBool(req.body.isHouse);
        const designatedLand = sanitizeBool(req.body.designatedLand);
        const forwardOfHouse = sanitizeBool(req.body.forwardOfHouse);
        const useRaw = sanitizeString(req.body.use, 20);
        const useLabel = {
            incidental: 'incidental use - office, gym, studio or hobby room',
            garage: 'a garage or carport (incidental use; note any NEW driveway, access or dropped kerb is separate from Class E and may need its own consent)',
            sleeping: 'guest room / occasional sleeping accommodation',
            annexe: 'a self-contained annexe with kitchen/bathroom, lived in',
            other: 'unspecified - judge from the description',
        }[useRaw] || 'unspecified - judge from the description';
        if (!widthM || !depthM || !heightM || boundaryM === null || !description.trim()) {
            return res.status(400).json({ error: 'Please fill in the dimensions, boundary distance and a short description.' });
        }

        const prompt = `
You are a UK planning guidance assistant assessing whether a proposed garden building is LIKELY to fall under Permitted Development (Class E, Part 1, Schedule 2 of the GPDO 2015 - outbuildings), or LIKELY to need planning permission.

THE PROPOSAL:
- Footprint: ${widthM}m wide x ${depthM}m deep
- Maximum height: ${heightM}m
- Distance to the nearest boundary: ${boundaryM}m
- The property is ${isHouse ? 'a house' : 'NOT confirmed to be a house (may be a flat/maisonette - flats have NO permitted development rights for outbuildings)'}
- On designated land (conservation area / AONB / National Park / World Heritage Site) or listed: ${designatedLand ? 'YES' : 'not stated - assume no but caveat it'}
- Position relative to the house: ${forwardOfHouse ? 'IN FRONT of the principal elevation (between the house and the road) - this alone fails Class E' : 'behind or beside the house (not forward of the principal elevation)'}
- Stated main use: ${useLabel}
- The applicant describes it as: "${description}"

APPLY THE CLASS E TESTS, including:
- Within 2m of a boundary, TOTAL height must not exceed 2.5m.
- Beyond 2m: max eaves 2.5m; max overall height 4m (dual-pitched roof) or 3m (any other roof).
- Single storey only; no verandas, balconies or raised platforms over 300mm.
- Not forward of the principal elevation.
- Outbuildings + extensions must not cover more than 50% of the curtilage.
- Use must be incidental to the enjoyment of the dwellinghouse (a garden office or gym usually qualifies; SLEEPING accommodation / self-contained annexe does NOT and typically needs permission).
- Designated land and listed buildings carry extra restrictions: no outbuildings between a side elevation and the boundary on designated land; on National Parks / AONB / the Broads / World Heritage Sites, a building MORE THAN 20m from the house is limited to 10 square metres total; listed buildings have NO Class E rights at all.
- Houses created by prior-approval conversions (Class Q barn conversions, Class M, MA, N, P, PA, G) have NO Class E rights - if the description hints the house is a conversion, caveat this.
- Local authorities can remove PD rights via Article 4 directions or conditions on earlier permissions - always caveat that the applicant should confirm none apply.

RULES FOR YOUR ANSWER:
- Be honest about what you cannot know from this information; put those in caveats.
- This is guidance, NOT legal advice or a formal determination - only a Lawful Development Certificate or planning decision settles it.
- In napcNote, direct the user to the National Annexe Planning Company (NAPC) at www.napc.uk for a professional assessment, certificates of lawfulness and planning applications - especially if the verdict is not clearly permitted development.`;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        verdict: { type: Type.STRING, enum: ["likely_permitted_development", "likely_needs_permission", "unclear"] },
                        headline: { type: Type.STRING, description: "One-sentence plain-English answer" },
                        reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The specific Class E tests this proposal passes or fails" },
                        caveats: { type: Type.ARRAY, items: { type: Type.STRING }, description: "What could change the answer" },
                        napcNote: { type: Type.STRING, description: "Referral to NAPC (www.napc.uk)" },
                    },
                    required: ["verdict", "headline", "reasons", "caveats", "napcNote"]
                }
            }
        });
        const text = response.text;
        if (!text) throw new Error('No answer returned');
        res.json({ result: JSON.parse(text) });
    } catch (e) {
        console.error('planning-check error:', e);
        res.status(500).json({ error: 'The checker could not run just now. Please try again in a moment.' });
    }
});

/**
 * Public client-share endpoint - the read side of "share this project with
 * your customer". Registered BEFORE the master lock because the whole point
 * is that the homeowner has no account.
 *
 * The token is a 128-bit random string the owner generated; possession of it
 * IS the authorisation, like an unlisted YouTube link. Only presentation
 * fields ever leave: name, estimate and image assets. Client contact details
 * and notes are private CRM data and are deliberately never included.
 */
const shareLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    keyGenerator: (req) => ipKeyGenerator(req.ip) || 'unknown',
    message: { error: 'Too many requests. Please try again shortly.' },
    validate: { ip: false, xForwardedForHeader: false }
});

app.get('/api/share/:token', shareLimiter, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Sharing is temporarily unavailable.' });
        const token = String(req.params.token || '');
        if (!/^[a-f0-9]{32}$/.test(token)) {
            return res.status(404).json({ error: 'This share link is not valid.' });
        }
        const snap = await db.collection('projects').where('shareToken', '==', token).limit(1).get();
        if (snap.empty) {
            return res.status(404).json({ error: 'This share link is not valid or has been disabled.' });
        }
        const p = snap.docs[0].data();
        const assets = Array.isArray(p.assets) ? p.assets : [];
        res.json({
            name: typeof p.name === 'string' ? p.name.slice(0, 120) : 'Project',
            estimateValue: typeof p.estimateValue === 'number' ? p.estimateValue : null,
            images: assets
                .filter(a => a && typeof a.downloadUrl === 'string' && typeof a.contentType === 'string' && a.contentType.startsWith('image/'))
                .slice(0, 24)
                .map(a => ({ url: a.downloadUrl, name: typeof a.name === 'string' ? a.name.slice(0, 80) : 'render', kind: a.kind || 'other' })),
        });
    } catch (e) {
        console.error('share fetch error:', e);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

// Protect all API routes and enforce master lock
app.use('/api', verifyFirebaseToken, enforceMasterLock);

// Prefer the non-VITE name. The VITE_ prefix is kept only as a fallback for
// existing deployments — Vite inlines any VITE_* var into the client bundle,
// so this key must be migrated to GEMINI_API_KEY and the old name deleted.
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.warn("WARNING: Missing GEMINI_API_KEY environment variable. AI features will not work.");
} else if (!process.env.GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY) {
    console.warn("WARNING: Using deprecated VITE_GEMINI_API_KEY. Rename this env var to GEMINI_API_KEY.");
}

// Initialize Gemini Client via v1beta for early access preview models
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });

const fileToGenerativePart = (base64Data, mimeType) => {
    return {
        inlineData: {
            data: base64Data,
            mimeType,
        },
    };
};

app.post('/api/generateLineDrawing', userAiLimiter, async (req, res) => {
    try {
        const base64Image      = sanitizeString(req.body.base64Image, 10_000_000);
        const additionalPrompt = sanitizeString(req.body.additionalPrompt, 2000);
        const isHighQuality    = sanitizeBool(req.body.isHighQuality);
        const ratio            = sanitizeString(req.body.ratio, 10);
        const hasColor         = sanitizeBool(req.body.hasColor);
        const environmentImage = sanitizeString(req.body.environmentImage, 10_000_000);
        const isProMode        = sanitizeBool(req.body.isProMode);
        
        // Phase 2: Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, isHighQuality ? CREDIT_COSTS.STANDARD_RES : CREDIT_COSTS.LOW_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const hasImage = base64Image && typeof base64Image === 'string' && base64Image.trim().length > 100;
        const hasEnv = environmentImage && typeof environmentImage === 'string' && environmentImage.trim().length > 100;

        // Build the text prompt, adapting based on whether we have an image or are working from text
        const baseTask = hasColor
            ? `Create a precise technical line drawing of the ENTIRE scene, but fill the major planes with flat, untextured, solid colors to indicate material types.
               - 100% Black uniform outlines for all geometry.
               - Fill planes with flat contextual colors (e.g., green for grass/trees, blue for glass, brown for timber, grey for concrete, terracotta for roof).
               - NO shading, NO photorealistic textures, NO ambient occlusion shadows, NO gradients.`
            : `Create a precise, high-contrast technical line drawing of the ENTIRE scene.
               - 100% White background canvas.
               - 100% Black uniform lines. DO NOT isolate the building in white space.
               - NO shading, NO greyscale, NO ambient occlusion shadows. Clean, vector-like quality suitable for a blueprint.`;

        let taskInstruction = `TASK:\n${baseTask}`;
        if (hasImage && hasEnv) {
            taskInstruction += `\n\nCRITICAL CONTEXT INTEGRATION:
            Two images are provided:
            1. The first image is the environment/site context (garden, landscape, surroundings).
            2. The second image is the building/garden room design to be inserted.
            You MUST target the existing building or structure in the environment image and REPLACE it with the building design from the second image. 
            - DELETE the old structure from the scene.
            - PLACE the new building design in its exact place, or in the most logical position.
            - Keep the grass, fences, trees, and landscape from the environment image, but ensure the ONLY building shown is the new one from the second image.
            - The final drawing must be a single, unified architectural line drawing where the new building looks naturally part of the old garden.`;
        } else if (hasImage) {
            taskInstruction += `\n\nDraw the building, garden, trees, fences, furniture, and landscape details. EXACT PERSPECTIVE MATCH to the input.\n            CRITICAL: DO NOT invent new geometry. DO NOT add decking, patios, or change the roof shape. ONLY draw what is physically present in the input image.`;
        } else {
            taskInstruction += `\n\nGenerate a brand new architectural CAD line drawing from the description below. Standard front-elevation perspective unless otherwise described.`;
        }

        const textPrompt = `
      STYLE: ${hasColor ? 'Architectural CAD Wireframe with Flat Base Colors' : 'Technical Architectural CAD Wireframe (DWG/DXF Style)'} - FULL SCENE.
      ENGINE: Nano Banana Pro (V3.2).
      
      ${taskInstruction}
      
      DESCRIPTION / MODIFICATIONS:
      ${additionalPrompt ? additionalPrompt : (hasImage ? 'None. Reproduce the combined geometry exactly.' : 'A generic modern residential building with landscaping.')}
      
      The output must look like a complete site plan elevation exported from Revit or AutoCAD.
      CRITICAL RESOLUTION: Ensure the output is high-definition (2K).
    `;

        const parts = [];
        if (hasEnv) parts.push(fileToGenerativePart(environmentImage, "image/jpeg"));
        if (hasImage) parts.push(fileToGenerativePart(base64Image, "image/jpeg"));
        parts.push({ text: textPrompt });

        console.log(`[DEBUG] Final parts array length: ${parts.length}`);
        if (!hasImage) console.log(`[DEBUG] Text Prompt: ${textPrompt.substring(0, 50)}...`);

        const imageModel = 'gemini-3.1-flash-image';
        const modelName = imageModel;
        
        console.log(`[DEBUG] hasImage: ${hasImage}, modelName: ${modelName}`);

        const imageConfig = {
            imageSize: isHighQuality ? "2K" : "1K"
        };

        // For text-to-image (hasImage is false), the preview models often reject the aspectRatio parameter
        if (hasImage) {
            imageConfig.aspectRatio = isHighQuality ? "16:9" : (ratio || "16:9");
        }
        
        console.log(`[DEBUG] imageConfig: ${JSON.stringify(imageConfig)}`);

        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig,
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const rData = part.inlineData.data;
                const b64Data = Buffer.isBuffer(rData) ? rData.toString("base64") : ((rData instanceof Uint8Array || rData instanceof ArrayBuffer) ? Buffer.from(rData).toString("base64") : rData);
                return res.json({ result: b64Data });
            }
        }
        throw new Error("No image generated");
    } catch (error) {
        console.error("Line drawing error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.post('/api/analyzeComponents', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);

        // Note: analyzeComponents is a free supporting feature — no credit deduction.

        const imagePart = fileToGenerativePart(base64Image, "image/png");

        const prompt = `
      Analyze this image of a building and identify the exterior materials.
      
      CRITICAL INSTRUCTIONS:
      1. Determine if this is a photograph/render or a plain black-and-white line drawing.
      2. WALLS VS CLADDING: Identify the main wall material. If it is brick, explicitly say "Brick work" or the specific brick type (e.g. "Red brick"). Only call it "Cladding" if it is timber/composite cladding.
      3. DECKING/GROUND: ONLY return a value if there is a clearly visible raised deck, paved patio, or path directly attached to or in front of the building. If the ground is simply grass or natural ground, return 'none'.
      4. IF IT IS A LINE DRAWING:
         - Deduce materials based on architectural patterns.
         - Horizontal lines: "Timber Cladding" or "Composite Cladding".
         - Stippled: "Render".
         - Grid: "Tiles".
      5. DOORS: Describe material, color, and glazing zone (e.g. "top-half glazed").
      6. ABSENT ELEMENTS: If an element is not clearly visible in the image, return
         exactly 'none' for that field. This applies to EVERY field - windows, doors,
         decking alike. A building with no windows gets windows: 'none'. NEVER assume
         an element exists because buildings usually have one; describe only what is
         actually in the image. Glazed doors are doors, not windows.
      7. Return ONLY a valid JSON object.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: {
                parts: [imagePart, { text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        walls: { type: Type.STRING },
                        roof: { type: Type.STRING },
                        windows: { type: Type.STRING },
                        doors: { type: Type.STRING },
                        decking: { type: Type.STRING },
                    }
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No analysis returned");
        
        // Robust JSON extraction — strip markdown fences first, then grab JSON object
        const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = stripped.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not find JSON in response: " + stripped.substring(0, 200));
        
        try {
            res.json({ result: JSON.parse(jsonMatch[0]) });
        } catch (parseError) {
            console.error("JSON Parse Error in analyzeComponents:", parseError, text);
            // Graceful fallback for non-json responses when AI gets confused (e.g. line drawings)
            res.json({ result: { walls: "none", roof: "none", windows: "none", doors: "none", decking: "none" } });
        }
    } catch (error) {
        console.error("analyzeComponents error:", error, error.stack);
        // Removed require('fs') to prevent node crashes
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.post('/api/renderBuilding', userAiLimiter, async (req, res) => {
    try {
        const base64Image      = sanitizeString(req.body.base64Image, 10_000_000);
        const additionalPrompt = sanitizeString(req.body.additionalPrompt, 2000);
        let isHighQuality    = sanitizeBool(req.body.isHighQuality);
        const ratio            = sanitizeString(req.body.ratio, 10);
        const isProMode        = sanitizeBool(req.body.isProMode);
        const orientation      = sanitizeString(req.body.orientation, 50);
        const isSketchUpMode   = sanitizeBool(req.body.isSketchUpMode);
        const studioBackground = sanitizeString(req.body.studioBackground, 200);
        const isBatchSequence  = sanitizeBool(req.body.isBatchSequence);
        const cameraEffects    = sanitizeBool(req.body.cameraEffects);
        const seed             = req.body.seed ? parseInt(req.body.seed) : undefined;
        const houseStyleBlock  = buildHouseStyle(cameraEffects);
        // Sanitize each material field individually — they are embedded directly in AI prompts
        const rawMats          = req.body.materials || {};
        const materials = {
            walls:   sanitizeString(rawMats.walls,   200),
            roof:    sanitizeString(rawMats.roof,    200),
            windows: sanitizeString(rawMats.windows, 200),
            doors:   sanitizeString(rawMats.doors,   200),
            decking: sanitizeString(rawMats.decking, 200),
        };

        // Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        // Standard plan is 1080p-class: the 4K flag from the client is
        // overridden server-side, never trusted.
        if (access.plan === 'standard') isHighQuality = false;

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const buildMaterialInstruction = (label, value) => {
            if (!value || value.trim() === '' || value.toLowerCase() === 'none') {
                return `- ${label}: PRESERVE ORIGINAL MATERIAL exactly as seen in the source image.`;
            }
            return `- ${label}: ${value}`;
        };

        const deckingValue = materials.decking && materials.decking.trim().toLowerCase() !== 'none' ? materials.decking : null;

        /**
         * Hard constraints from the 3D configurator's scene spec.
         *
         * When the source image came from "Send to Render Engine" the client
         * attaches the room's actual data — so instead of the model counting
         * doors in a screenshot, the prompt states the truth outright. Missing
         * or malformed spec degrades silently to the screenshot-only prompt.
         */
        const buildConfigSpecBlock = (spec) => {
            if (!spec || typeof spec !== 'object') return '';
            try {
                const mm = (v) => (typeof v === 'number' && isFinite(v) ? `${Math.round(v)}mm` : null);
                const lines = [];
                const wStr = mm(spec.widthMm), dStr = mm(spec.depthMm);
                if (wStr && dStr) lines.push(`- Building footprint: ${wStr} wide x ${dStr} deep.`);
                if (spec.shape) lines.push(`- Roof form: ${spec.shape === 'Gable' ? 'gable (dual pitched)' : 'flat roof'}.`);
                const doors = Array.isArray(spec.doors) ? spec.doors.slice(0, 12) : [];
                lines.push(`- Door sets: EXACTLY ${doors.length}.${doors.length ? '' : ' Render no exterior door sets beyond what the source shows.'}`);
                doors.forEach((dr, i) => {
                    const style = dr.style === 'crittall' ? 'black steel Crittall-style with a grid of slim glazing bars' : 'standard glazed';
                    lines.push(`  - Door ${i + 1}: ${Math.max(1, parseInt(dr.leaves) || 1)} leaf, ${mm(dr.widthMm) || 'unspecified width'} x ${mm(dr.heightMm) || 'unspecified height'}, ${style}, on the ${sanitizeString(String(dr.wall || ''), 10) || 'front'} elevation.`);
                });
                const windows = Array.isArray(spec.windows) ? spec.windows.slice(0, 12) : [];
                lines.push(`- Windows: EXACTLY ${windows.length}.${windows.length ? '' : ` This building has NO windows. Do not add any window openings on any elevation.${doors.length ? ' The only glazing is in the door sets listed above.' : ''}`}`);
                windows.forEach((wn, i) => {
                    const style = wn.style === 'crittall' ? 'Crittall-style glazing bar grid' : 'standard';
                    lines.push(`  - Window ${i + 1}: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${style}, ${sanitizeString(String(wn.wall || ''), 10) || 'front'} elevation.`);
                });
                /**
                 * GEOMETRY ONLY - no material or colour claims.
                 *
                 * This block used to assert `spec.cladding`, the single global
                 * cladding value. A building can be clad differently on each
                 * elevation, so on a design that was black on one face and
                 * mahogany on another this said "clad in cedar composite" and,
                 * being labelled absolute truth, overrode what the image plainly
                 * showed. The render came back uniformly light.
                 *
                 * Appearance now comes from the image analysis, exactly as it
                 * does for a manual upload. The spec is kept only for the things
                 * a picture genuinely can be miscounted on - how many doors,
                 * how wide, which elevation - where it cannot contradict what is
                 * visible, only make it precise.
                 */
                if (spec.claddingOrientation) lines.push(`- Cladding board direction: ${spec.claddingOrientation === 'vertical' ? 'vertical' : 'horizontal'} (direction only - take the material and colour from the image).`);
                const sky = Array.isArray(spec.skylights) ? spec.skylights.length : 0;
                if (sky > 0) lines.push(`- Skylights: EXACTLY ${sky}.`);
                if (!lines.length) return '';
                return `
      CONFIGURED DIMENSIONS AND COUNTS - use these to be exact about SIZE, COUNT
      and POSITION. They say nothing about materials, colour or finish: take all
      of those from the image and the MATERIAL ASSIGNMENTS section.
      The client configured this exact building. The render MUST show precisely:
${lines.map(l => '      ' + l).join('\n')}
      Do not add or remove any of the elements listed above.`;
            } catch (e) {
                console.warn('configSpec block skipped:', e.message || e);
                return '';
            }
        };
        const configSpecBlock = buildConfigSpecBlock(req.body.configSpec);

        /**
         * The spec is ground truth for what EXISTS; the material analyser only
         * knows what a screenshot looks like. On a windowless building the
         * analyser still returns a windows description (its schema demands
         * one), which lands in MATERIAL ASSIGNMENTS as "Windows: grey
         * aluminium..." two lines under "Windows: EXACTLY 0" - and the model
         * resolves that contradiction by inventing windows. When the spec says
         * an element has zero instances, its material line must say so too,
         * not describe a material for it.
         */
        {
            const spec = req.body.configSpec;
            if (spec && typeof spec === 'object') {
                if (Array.isArray(spec.windows) && spec.windows.length === 0) {
                    materials.windows = 'NONE. This building has zero windows - do not render any window openings.';
                }
                if (Array.isArray(spec.doors) && spec.doors.length === 0) {
                    materials.doors = 'NONE. This building has zero exterior door sets - do not render any.';
                }
            }
        }

        /**
         * SITE CONTEXT - rebuild the client's garden around the building.
         *
         * The photo never reaches the model. This is a written brief produced
         * by /api/scene/describe, exactly as a visualiser works from site
         * photos: the garden is rebuilt as CGI, so it is recognisably the
         * client's without a single pixel being composited. That sidesteps
         * perspective, scale and sun-direction matching entirely.
         *
         * The block MUST re-scope the NO HALLUCINATIONS rule above it. That
         * rule forbids inventing decking, patios and structures absent from the
         * source - which is precisely what a described garden asks for. Left
         * unqualified the two instructions contradict each other, and there is
         * no telling which one the model follows. The configured-specification
         * block learned that lesson the hard way.
         */
        const buildSiteContextBlock = (ctx) => {
            if (!ctx || typeof ctx !== 'object') return '';
            const line = (label, v) => (typeof v === 'string' && v.trim() ? `      - ${label}: ${sanitizeString(v, 400)}` : null);
            const lines = [
                line('Boundary', ctx.boundary),
                line('Ground and levels', ctx.levels),
                line('Paving and hard landscaping', ctx.hardLandscaping),
                line('Planting', ctx.planting),
                line('Beyond the boundary', ctx.context),
                line('Aspect and light', ctx.aspect),
                line('Overall character', ctx.character),
            ].filter(Boolean);
            if (!lines.length) return '';

            return `
      SITE CONTEXT - BUILD THIS GARDEN AROUND THE BUILDING:
      The client's own garden, described from their photograph. Recreate it as
      part of this render.

      THIS SECTION OVERRIDES THE "NO HALLUCINATIONS" RULE ABOVE, WHICH APPLIES
      TO THE BUILDING ONLY. The building's geometry stays exactly as shown in
      the source image. The SURROUNDINGS below are to be built even though they
      do not appear in it - replace whatever background the source has.

${lines.join('\n')}

      Render this as a real garden photographed on the day: correct contact
      shadows where the building meets the ground, planting with real depth and
      variation rather than repeated copies, and boundary treatments that
      continue naturally out of frame. It should look like the building was
      photographed in this garden, not placed on top of it.`;
        };
        const siteContextBlock = buildSiteContextBlock(req.body.sceneContext);

        /**
         * Material instruction for CGI-model sources (3D Configurator, SketchUp).
         *
         * Deliberately different from buildMaterialInstruction. For a photograph,
         * "preserve the original material" is right. For a flat-shaded 3D model
         * it is the bug: it tells the model to keep the configurator's plastic
         * look, which is exactly what we are trying to replace. When no material
         * is specified we want the COLOUR intent honoured but rendered as a real
         * physical surface.
         */
        const buildCgiMaterialInstruction = (label, value) => {
            if (!value || value.trim() === '' || value.toLowerCase() === 'none') {
                return `- ${label}: Keep the colour and intent shown in the model, but render it as a REAL physical material with authentic texture, grain, seams, edge wear and light response. Do NOT reproduce the model's flat fill colour.`;
            }
            return `- ${label}: ${value}`;
        };

        const sketchUpPrompt = `
      RENDER ENGINE SETTINGS:
      - Engine: Nano Banana Pro (V3.2).
      - Target: 8K-UHD Photograph-Quality Architectural Visualization.
      - Quality: Ultra-realistic, Physically Based Rendering (PBR), sharp focus, hyper-detailed micro-textures.

      WHAT THE INPUT IS - AND WHAT YOU ARE:
      The source is the flat-shaded viewport of a finished 3D model (CAD /
      SketchUp / configurator) - the equivalent of SketchUp's solid mode. YOU
      are the offline render engine that scene has been sent to. Behave exactly
      as Blender Cycles or V-Ray behaves when the artist clicks Render: the
      scene's geometry is ALREADY FINAL and is not yours to edit. A render
      engine physically cannot add a window, move a door, change a roof line or
      resize a wall - it can only light and shade the polygons it was handed.
      Hold yourself to that standard. The input is NOT a photograph and its
      flat-shaded appearance must NOT be preserved - but its geometry is the
      complete and only truth.

      TASK: Produce a full photorealistic architectural render of this exact building.
      This is a COMPLETE RE-RENDER of materials and lighting, not an upscale, filter
      or enhancement pass - and not a redesign.

      YOU MUST REPLACE, NOT PRESERVE:
      - Discard the model's flat fill colours, uniform shading and plastic CGI look entirely.
      - Discard hard, aliased CG edges. Real materials have thickness, bevels and shadow lines.
      - Rebuild all lighting from scratch: real sun angle, soft sky fill, global illumination,
        contact shadows, ambient occlusion in every recess and reveal.
      - Add authentic surface detail: timber grain and board joints, metal seams and standing
        ribs, glass with real reflections, refraction and interior falloff. Materials are
        NEWLY INSTALLED and immaculate - no dirt, staining, moss or weathering. This is a
        presentation visual, not a survey photo.
      - Materials must respond physically to light: correct roughness, specularity and
        reflectance for each surface.

      GEOMETRY & CONTEXT RULES - CRITICAL:
      - STRICT GEOMETRY LOCK: reproduce the EXACT structure, proportions, roof pitch, and
        window and door positions shown. Changing the appearance is required; changing the
        DESIGN is forbidden.
      - OPENINGS ARE A ONE-TO-ONE MAPPING: every door and window in the render must be
        visible in the source, and every door and window in the source must appear in the
        render - same position, same size, same count. If an opening is not in the source,
        it does not exist. A blank wall in the model stays a blank wall in the render.
      - NO HALLUCINATIONS: do NOT invent structures, decking, patios, porches or raised
        platforms that are not present in the source.
      - PRESERVE THE COMPOSITION: keep the same camera angle and framing.
      - IGNORE 3D GRID LINES: the source may show a floor grid on the ground. Never render
        these. Replace with natural, seamless ground or grass.

      ${configSpecBlock}

      MATERIAL ASSIGNMENTS:
      ${buildCgiMaterialInstruction('Walls', materials.walls)}
      ${buildCgiMaterialInstruction('Roof', materials.roof)}
      ${buildCgiMaterialInstruction('Windows', materials.windows)}
      ${buildCgiMaterialInstruction('Doors', materials.doors)}
      ${buildCgiMaterialInstruction('Decking/Ground', materials.decking)}

      COLOR & LIGHTING PRECISION:
      - If a colour like "Black", "Charred", "Anthracite" or "Dark" is specified, render it as a
        deep, rich, non-reflective tone. DO NOT wash out to grey.
      - Keep contrast controlled and natural. Depth comes from soft directional falloff
        and ambient occlusion, not from hard shadows or crushed blacks.

      ${siteContextBlock}

      ${houseStyleBlock}

      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE - THIS SUPERSEDES THE HOUSE STYLE COMPOSITION AND CONTEXT RULES ABOVE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only. Keep the house style's camera, focus and finish guidance - the building must still be tack sharp with true-to-life material colour.` : ''}
      ${isBatchSequence ? `\n      BATCH SEQUENCE CONTINUITY: This image is one angle of a multi-angle set of the SAME property, rendered independently. You cannot see the other angles, so do not try to recall them - reproduce the SITE CONTEXT above exactly as written, because every angle in this set is given the identical description. Same boundary treatment, same planting, same paving, same sun position and time of day, same weather and sky. Nothing about the setting may differ between angles except the viewpoint.` : ''}

      FINAL OUTPUT: The quality bar is a flagship offline archviz render - Blender Cycles /
      V-Ray with professional post-production. Physically accurate light and materials,
      crisp true edges, immaculate presentation. It must NOT look like a raw game-engine
      screenshot, a flat CAD export, or an obviously AI-generated image.
      CRITICAL: Output resolution 3840 x 2160 pixels (4K UHD).
    `;

        const standardPrompt = `
      RENDER ENGINE SETTINGS:
      - Engine: Nano Banana Pro (V3.2).
      - Target: 8K-UHD Photograph-Quality Architectural Visualization.
      - Quality: Ultra-realistic, Physically Based Rendering (PBR), sharp focus, hyper-detailed micro-textures.
      
      TASK: Render the architecture using the exact materials specified below.
      ${orientation ? `\nSPATIAL CONTEXT: You are rendering the [${orientation}] elevation. Apply materials to this specific facing side.` : ''}

      GEOMETRY & CONTEXT RULES — CRITICAL:
      - STRICT GEOMETRY LOCK: Reproduce the EXACT structure shown. Do NOT add, remove, or modify any architectural elements. DO NOT change the roof pitch or shape.\n      - NO HALLUCINATIONS: Do NOT invent structures, decking, patios, porches, or raised platforms unless clearly visible in the source. Your assignment is surface-level materials only.\n      - PRESERVE THE ENVIRONMENT: Render surrounding landscape, fences, trees, and sky exactly as shown.

      ${configSpecBlock}

      MATERIAL ASSIGNMENTS:
      ${buildMaterialInstruction('Walls/Main Facade', materials.walls)}
      ${buildMaterialInstruction('Roof', materials.roof)}
      ${buildMaterialInstruction('Windows', materials.windows)}
      ${buildMaterialInstruction('Doors', materials.doors)}
      ${deckingValue
        ? `- Decking/Ground: ${deckingValue}`
        : `- Decking/Ground: NATURAL GRASS only. DO NOT render any decking, patio slabs, or paved areas.`
      }

      COLOR & LIGHTING PRECISION:
      - If a colour like "Black", "Charred", "Anthracite", or "Dark" is specified, render it as deep, rich, non-reflective tone. DO NOT wash out to grey.
      - Keep contrast controlled and natural. Depth comes from soft directional falloff
        and ambient occlusion, not from hard shadows or crushed blacks.

      ${siteContextBlock}

      ${houseStyleBlock}

      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE - THIS SUPERSEDES THE HOUSE STYLE COMPOSITION AND CONTEXT RULES ABOVE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only. Keep the house style's camera, focus and finish guidance - the building must still be tack sharp with true-to-life material colour.` : ''}
      ${isBatchSequence ? `\n      BATCH SEQUENCE CONTINUITY: This image is one angle of a multi-angle set of the SAME property, rendered independently. You cannot see the other angles, so do not try to recall them - reproduce the SITE CONTEXT above exactly as written, because every angle in this set is given the identical description. Same boundary treatment, same planting, same paving, same sun position and time of day, same weather and sky. Nothing about the setting may differ between angles except the viewpoint.` : ''}

      FINAL OUTPUT: The quality bar is a flagship offline archviz render - Blender Cycles /
      V-Ray with professional post-production. Physically accurate light and materials, crisp
      true edges, immaculate presentation - not an obviously AI-generated image.
      CRITICAL: Output resolution 3840 x 2160 pixels (4K UHD).
    `;

        const prompt = isSketchUpMode ? sketchUpPrompt : standardPrompt;

        /** Run one generation pass; returns the image as base64, or null. */
        const runRender = async (promptText) => {
            const response = await ai.models.generateContent({
                // Every plan renders on Gemini's best image model (Nano Banana
                // Pro): quality is the product and must not differ by tier -
                // plans differ on volume and resolution, never on fidelity.
                // Costs $0.134/image at 1K-2K and $0.24 at 4K (verified
                // ai.google.dev/gemini-api/docs/pricing, Aug 2026) - factor
                // this into per-render cost when billing goes live.
                model: 'gemini-3-pro-image',
                contents: {
                    parts: [imagePart, { text: promptText }]
                },
                config: {
                    outputMimeType: "image/jpeg",
                    imageConfig: {
                        // CGI-model sources keep the source framing rather than being
                        // forced to 16:9, so the composition the user set up in the
                        // configurator survives. Fallback guards against an empty ratio.
                        aspectRatio: (isHighQuality && !isSketchUpMode) ? "16:9" : (ratio || "16:9"),
                        imageSize: isHighQuality ? "4K" : "2K",
                        ...(seed !== undefined && !isNaN(seed) && { seed })
                    },
                    temperature: 0.2,
                    ...(seed !== undefined && !isNaN(seed) && { seed })
                }
            });
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    const rData = part.inlineData.data;
                    return Buffer.isBuffer(rData) ? rData.toString("base64") : ((rData instanceof Uint8Array || rData instanceof ArrayBuffer) ? Buffer.from(rData).toString("base64") : rData);
                }
            }
            console.error("No render generated. Response data:", JSON.stringify(response, null, 2));
            return null;
        };

        /**
         * VERIFICATION PASS - the render is inspected before the customer sees it.
         *
         * A cheap vision call counts what is actually IN the finished image and
         * compares it against ground truth. Ground truth comes from the
         * configurator spec when there is one; for photo and SketchUp uploads
         * the SOURCE image supplies it instead - the geometry lock says the
         * output must show exactly the openings the source shows, so the
         * source's own counts are the truth to hold the render to.
         *
         * Fails soft by design: if the inspector itself errors, the render is
         * treated as passing. A QA outage must never take rendering down.
         */
        const inspectBuilding = async (b64) => {
            try {
                const resp = await ai.models.generateContent({
                    model: 'gemini-3.5-flash-lite',
                    contents: {
                        parts: [fileToGenerativePart(b64, "image/jpeg"), { text:
                            'This is an image of a single garden building. Count only what is clearly visible on the BUILDING itself; ignore fences, other structures and background. Glazed doors are doors, not windows - do not count door glazing as windows.' }]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                doorSets: { type: Type.INTEGER, description: "Number of exterior door sets on the building" },
                                windows: { type: Type.INTEGER, description: "Number of windows, excluding glazing that is part of a door" },
                                roofForm: { type: Type.STRING, enum: ["flat", "gable", "other"] },
                            },
                            required: ["doorSets", "windows", "roofForm"]
                        }
                    }
                });
                return JSON.parse(resp.text);
            } catch (e) {
                console.warn('[VERIFY] inspection errored:', e.message || e);
                return null;
            }
        };
        const compareCounts = (expected, seen, truthWord) => {
            const failures = [];
            if (expected.doors !== null && seen.doorSets !== expected.doors) failures.push(`the render shows ${seen.doorSets} exterior door set(s) but the ${truthWord} has EXACTLY ${expected.doors}`);
            if (expected.windows !== null && seen.windows !== expected.windows) failures.push(`the render shows ${seen.windows} window(s) but the ${truthWord} has EXACTLY ${expected.windows}`);
            if (expected.roof && seen.roofForm !== 'other' && seen.roofForm !== expected.roof) failures.push(`the render shows a ${seen.roofForm} roof but the ${truthWord} has a ${expected.roof} roof`);
            return failures;
        };

        let b64Data = await runRender(prompt);
        if (!b64Data) throw new Error("No render generated. Check server logs for response payload.");

        /**
         * Verify + ONE corrective retry. The retry is an internal cost, not
         * re-charged to the user - it exists to fix OUR mistake, not to bill
         * twice. Whichever attempt fails fewer checks is what the customer
         * receives. Wrapped so no verification error can fail a good render.
         */
        let verification = { checked: false };
        try {
            const specForVerify = req.body.configSpec;
            let expected = null;
            let truthWord = 'configured building';
            if (specForVerify && typeof specForVerify === 'object') {
                expected = {
                    doors: Array.isArray(specForVerify.doors) ? Math.min(specForVerify.doors.length, 12) : null,
                    windows: Array.isArray(specForVerify.windows) ? Math.min(specForVerify.windows.length, 12) : null,
                    roof: specForVerify.shape ? (specForVerify.shape === 'Gable' ? 'gable' : 'flat') : null,
                };
            } else if (!studioBackground) {
                const src = await inspectBuilding(base64Image);
                if (src) {
                    expected = { doors: src.doorSets, windows: src.windows, roof: src.roofForm !== 'other' ? src.roofForm : null };
                    truthWord = 'source image';
                }
            }
            if (expected && !(expected.doors === null && expected.windows === null && expected.roof === null)) {
                const firstSeen = await inspectBuilding(b64Data);
                if (firstSeen) {
                    const failures = compareCounts(expected, firstSeen, truthWord);
                    verification = { checked: true, passed: failures.length === 0, retried: false };
                    if (failures.length) {
                        console.warn('[VERIFY] render failed checks, retrying once:', failures.join('; '));
                        const correction = `

      PREVIOUS ATTEMPT REJECTED - CORRECTIONS REQUIRED:
      A previous render of this exact scene was rejected by quality control because:
${failures.map(f => `      - ${f}`).join('\n')}
      Fix these exactly. ${specForVerify ? 'The CONFIGURED DIMENSIONS AND COUNTS section is the absolute truth for what exists on this building.' : 'The SOURCE image is the absolute truth - reproduce exactly the doors, windows and roof it shows, nothing more and nothing less.'}`;
                        const retryB64 = await runRender(prompt + correction);
                        if (retryB64) {
                            const secondSeen = await inspectBuilding(retryB64);
                            const failures2 = secondSeen ? compareCounts(expected, secondSeen, truthWord) : [];
                            verification = { checked: true, passed: failures2.length === 0, retried: true };
                            if (failures2.length <= failures.length) b64Data = retryB64;
                            if (failures2.length) console.warn('[VERIFY] retry still failing checks, returning best attempt:', failures2.join('; '));
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[VERIFY] verification skipped:', e.message || e);
        }

        /**
         * Cost log - one small fire-and-forget document per render. A month of
         * these answers the real cost-per-render question (Google billing /
         * count by model+size) and shows whether any account's usage is out of
         * line, without slowing the response down.
         */
        if (db) {
            db.collection('renderLog').add({
                uid: req.user?.uid || 'unknown',
                endpoint: 'renderBuilding',
                model: 'gemini-3-pro-image',
                imageSize: isHighQuality ? '4K' : '2K',
                sketchUpMode: isSketchUpMode,
                verified: verification.checked ? verification.passed : null,
                retried: !!verification.retried,
                ts: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(e => console.warn('[COSTLOG] write failed:', e.message || e));
        }

        return res.json({ result: b64Data, verification });
    } catch (error) {
        console.error("Render error in /api/renderBuilding:", error, error.stack);
        // Log the real error above; never echo internals to the client.
        res.status(500).json({ error: 'The render could not be completed. Please try again in a moment.' });
    }
});

app.post('/api/editImage', userAiLimiter, async (req, res) => {
    try {
        const base64Image   = sanitizeString(req.body.base64Image, 10_000_000);
        const maskImage     = sanitizeString(req.body.maskImage, 10_000_000);
        const editPrompt    = sanitizeString(req.body.editPrompt, 1000); // embedded directly in prompt — strict cap
        let isHighQuality = sanitizeBool(req.body.isHighQuality);
        const ratio         = sanitizeString(req.body.ratio, 10);
        const isProMode     = sanitizeBool(req.body.isProMode);

        // Phase 2: Credit-based deduction
        // Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        // Standard plan is 1080p-class: the 4K flag from the client is
        // overridden server-side, never trusted.
        if (access.plan === 'standard') isHighQuality = false;

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const parts = [imagePart];

        if (maskImage) {
            // If a mask is provided, append it so Gemini can use it for spatial reference
            const maskPart = fileToGenerativePart(maskImage, "image/jpeg");
            parts.push(maskPart);
        }

        const prompt = `
        ROLE: Expert Architectural Retoucher & Precise Inpainting Engine.
        
        TASK:
        Perform a strictly LOCALIZED EDIT on the input image based on this instruction:
        "${editPrompt}"

        CRITICAL PRESERVATION RULES - FAILURE IS UNACCEPTABLE:
        1. IDENTIFY TARGET: Determine exactly which object or area needs changing based on the prompt.
        ${maskImage ? '2. MASK ENFORCEMENT: A mask is provided. YOU MUST ONLY ALTER PIXELS WITHIN THE MASKED AREA. The entire rest of the image MUST remain 100% frozen.' : '2. LOCALIZED ONLY: You must ONLY alter the specific objects mentioned in the prompt. Everything else MUST be treated as frozen.'}
        3. NO GLOBAL RE-RENDERING: Do not "re-imagine" or re-render the entire scene. The surrounding architecture, sky, grass, people, and details must remain PIXEL-PERFECT identical to the original input. This is not a style transfer; it is a localized clone/replace.
        4. ZERO COMPRESSION/SMUDGING: Do not apply global smoothing, denoising, or compression artifacts. The original sharpness must be perfectly maintained. ABSOLUTELY NO AI generated "brush stroke" or painterly effect.
        5. SEAMLESS BLENDING: The edited area must seamlessly blend into the original HD photo, matching the exact grain, lighting, and micro-textures.

        QUALITY:
        - Output Resolution: ${isHighQuality ? '4K (3840x2160)' : 'High Definition'}.
        - CRITICAL DIMENSIONS: ${isHighQuality ? 'Set the output resolution strictly to 3840 x 2160 pixels. This is a hard limit for 4K UHD at a 16:9 aspect ratio. Do not upscale, do not increase the pixel count beyond these dimensions, and do not use a 5K or 6K multiplier. Lock the render to these exact coordinates to ensure the 0.15p pricing tier. Maintain 100% of the original image resolution.' : 'Standard HD.'}
      `;

        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: parts
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: ratio,
                    imageSize: isHighQuality ? "4K" : "2K",
                    editMode: "EDIT_MODE_DEFAULT"
                },
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No edit generated");

    } catch (error) {
        console.error("Edit error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.post('/api/analyzeMaterials', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);

        // Route through the same gate as every other AI endpoint. Calling
        // deductCredits directly meant trial users hit the paid-only path and
        // were told "Free accounts are currently suspended" for a feature the
        // trial is supposed to include.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const imagePart = fileToGenerativePart(base64Image, "image/png");

        const prompt = `
        ROLE: Expert Architectural Materials Analyst.

        TASK:
        Carefully examine the provided image of a building / property.
        Visually identify the existing materials for the following 5 categories:
        1. Cladding(walls, exterior finish)
        2. Roof
        3. Windows
        4. Doors
        5. Decking / Ground(driveway, patio, garden path)
        
        If a category is not clearly visible in the image, provide a generic standard option(e.g. "Standard UPVC" or "Standard Concrete").

        OUTPUT FORMAT:
        Return short, descriptive strings(e.g. "Weathered Red Brick", "Dark Standing Seam Zinc", "Black Aluminum Crittall Style") for each field.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: {
                parts: [
                    imagePart,
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        cladding: { type: Type.STRING },
                        roof: { type: Type.STRING },
                        windows: { type: Type.STRING },
                        doors: { type: Type.STRING },
                        decking: { type: Type.STRING },
                    },
                    required: ["cladding", "roof", "windows", "doors", "decking"]
                },
                temperature: 0.2
            }
        });

        const text = response.text;
        if (!text) throw new Error("No text returned from Gemini");

        // Use standard clean text replacement in case of unexpected format despite schema
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        const materials = JSON.parse(cleanText);
        res.json({ result: materials });

    } catch (error) {
        console.error("Material analysis error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

/**
 * Batch counterpart of /api/analyzeMaterials — one call over every angle of
 * the same building. This route existed in server.js.original but never made
 * it across in the rebuild, so every multi-image batch upload 404ed and the
 * client fell back to "Could not auto-detect batch materials".
 */
app.post('/api/analyzeBatchMaterials', userAiLimiter, async (req, res) => {
    try {
        const { base64Images } = req.body;
        if (!Array.isArray(base64Images) || base64Images.length === 0) {
            return res.status(400).json({ error: "Expected an array of images" });
        }
        if (base64Images.length > 5) {
            return res.status(400).json({ error: "A batch is at most 5 images" });
        }
        const images = base64Images.map(img => sanitizeString(img, 10_000_000)).filter(Boolean);
        if (images.length !== base64Images.length) {
            return res.status(400).json({ error: "Every batch entry must be an image" });
        }

        const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const parts = images.map(img => fileToGenerativePart(img, "image/jpeg"));
        const prompt = `
        ROLE: Expert Architectural Analyst.
        TASK: You are looking at ${images.length} images of the same building (e.g. a garden room/studio) from different angles.

        CRITICAL INSTRUCTIONS:
        1. Identify the spatial orientation of EACH image (e.g., "Front Elevation", "Left Side", "Right Side", "Back", "Angle").
        2. Analyze the main exterior materials visible in EACH image individually. Building sides often have different cladding (e.g. Cedar on the front, cheap metal on the sides).
        3. DECKING/GROUND: ONLY return a value if a clearly visible raised deck, paved patio, or path is directly in front of the building. If the ground is simply grass, return 'none'.
        4. DOORS - CRITICAL: Describe the EXACT glazing zone on every visible door:
           - If glass is ONLY on the top half and bottom is solid: write "top-half glazed, bottom solid panel".
           - If the door is fully glazed top to bottom: write "full-height glazed".
           - Always include: material, colour, door style and the glazing zone.
           - Example: "Anthracite grey aluminium composite door, top-half glazed, bottom solid panel".
        5. If a component is not visible in that specific angle, return "none".

        Return a JSON array where each object corresponds to an image in the exact order they were provided.
        `;
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            orientation: { type: Type.STRING },
                            walls: { type: Type.STRING },
                            roof: { type: Type.STRING },
                            windows: { type: Type.STRING },
                            doors: { type: Type.STRING },
                            decking: { type: Type.STRING }
                        }
                    }
                },
                temperature: 0.2
            }
        });

        const text = response.text;
        if (!text) throw new Error("No analysis returned");
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json({ result: JSON.parse(cleanText) });

    } catch (error) {
        console.error("Batch analysis error:", error);
        res.status(500).json({ error: "Batch material analysis failed. Please try again." });
    }
});

app.post('/api/analyzeScene', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);

        // Route through the same gate as every other AI endpoint. Calling
        // deductCredits directly meant trial users hit the paid-only path and
        // were told "Free accounts are currently suspended" for a feature the
        // trial is supposed to include.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const imagePart = fileToGenerativePart(base64Image, "image/png");

        const prompt = `
      Analyze this architectural scene/environment.
      
      1. Provide a short (1 sentence) descriptive summary of what is in the image (e.g., "A modern two-story house with a large wooden deck and manicured lawn.").
      2. Suggest 4 specific human activities or animals that would naturally fit into this EXACT scene to make it feel "lived-in" (e.g., "A golden retriever sitting on the deck", "Children playing with a ball on the grass").
      
      Return the result as JSON.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: {
                parts: [
                    imagePart,
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        peopleSuggestions: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                    },
                    required: ["description", "peopleSuggestions"]
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No analysis returned");
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanText);
        res.json({ result });
    } catch (error) {
        console.error("Scene analysis error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.post('/api/applyWeather', userAiLimiter, async (req, res) => {
    try {
        const base64Image   = sanitizeString(req.body.base64Image, 10_000_000);
        let isHighQuality = sanitizeBool(req.body.isHighQuality);
        const ratio         = sanitizeString(req.body.ratio, 10);
        const isProMode     = sanitizeBool(req.body.isProMode);
        const rawWeather    = req.body.weather || {};
        const weather = {
            condition: sanitizeString(rawWeather.condition, 100),
            season:    sanitizeString(rawWeather.season,    50),
            timeOfDay: sanitizeString(rawWeather.timeOfDay, 50),
        };

        // Phase 2: Credit-based deduction
        // Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        // Standard plan is 1080p-class: the 4K flag from the client is
        // overridden server-side, never trusted.
        if (access.plan === 'standard') isHighQuality = false;

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const prompt = `
      RENDER ENGINE: Blender Cycles / Unreal Engine 5.
      TASK: Re-light and compose this scene based on the weather config.
      
      SETTINGS:
      Condition: ${weather.condition}
      Season: ${weather.season}
      Time of Day: ${weather.timeOfDay}
      
      QUALITY RULES:
      - Maintain 4k RAW Photorealistic quality.
      - CRITICAL DIMENSIONS: Set the output resolution strictly to 3840 x 2160 pixels. This is a hard limit for 4K UHD at a 16:9 aspect ratio. Do not upscale, do not increase the pixel count beyond these dimensions, and do not use a 5K or 6K multiplier. Lock the render to these exact coordinates to ensure the 0.15p pricing tier.
      - Physically correct lighting calculations (Ray Tracing).
      - Accurate reflections on glass and wet surfaces.
      - Volumetric lighting where appropriate (e.g. fog, golden hour).
      - NO loss of detail. NO cartoon filters. NO painterly brush strokes.
      - Maintain photographic grain and sharp micro-textures for close-ups.
      - Keep the building geometry 100% locked. Only change lighting and atmosphere.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: [
                    imagePart,
                    { text: prompt }
                ]
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: ratio,
                    imageSize: isHighQuality ? "4K" : "2K"
                },
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No weather image generated");

    } catch (error) {
        console.error("Weather error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.post('/api/analyzeExteriorDetails', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);

        // Route through the same gate as every other AI endpoint. Calling
        // deductCredits directly meant trial users hit the paid-only path and
        // were told "Free accounts are currently suspended" for a feature the
        // trial is supposed to include.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const imagePart = fileToGenerativePart(base64Image, "image/png");
        const prompt = `
            Analyze this exterior architectural image.
            
            TASK: Identify 16 distinct, physical exterior details of the building itself that would look excellent in a close-up 'macro' photograph.
            
            CRITICAL RULES:
            - ONLY focus on the MAIN BUILDING ROOM/STRUCTURE. 
            - DO NOT include ANY landscape or garden details whatsoever (NO grass, NO stones, NO pebbles, NO paving, NO trees, NO plants).
            - Focus on TEXTURES (e.g., 'Western Red Cedar Grain', 'Slate Roof Texture', 'Zinc Seam Detail', 'Brickwork Bond').
            - Focus on FIXTURES (e.g., 'Exterior Wall Light', 'Bifold Door Mechanism', 'Timber Window Frame Joint', 'Guttering Profile').
            - Focus on ARCHITECTURAL JUNCTIONS (e.g., 'Roof Overhang Detail', 'Cladding Corner Trim', 'Threshold Detail').
            
            OUTPUT:
            - Return ONLY a JSON array of strings.
            - Example: ["Cedar Cladding Texture", "Timber Window Frame", "Brickwork Bond", "Exterior Downlight", "Door Handle"]
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: {
                parts: [imagePart, { text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        const text = response.text;
        const fallback = [
            "Cladding Texture", "Roof Detail", "Window Frame Corner", "Soffit Detail",
            "External Lighting", "Exterior Trim", "Door Handle", "Glass Reflection",
            "Gutter Detail", "Timber Grain", "Brickwork Texture", "Threshold Detail",
            "Fascia Board", "Wall Junction", "Panel Seam", "Step Detail"
        ];

        if (!text) return res.json({ result: fallback });
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json({ result: JSON.parse(cleanText) });

    } catch (error) {
        console.error("Detail analysis error:", error);
        const fallback = [
            "Cladding Texture", "Roof Detail", "Window Frame Corner", "Soffit Detail",
            "External Lighting", "Exterior Trim", "Door Handle", "Glass Reflection",
            "Gutter Detail", "Timber Grain", "Brickwork Texture", "Threshold Detail",
            "Fascia Board", "Wall Junction", "Panel Seam", "Step Detail"
        ];
        res.json({ result: fallback }); // return fallback on error here too
    }
});

app.post('/api/generatePresentationBoard', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const isProMode   = sanitizeBool(req.body.isProMode);
        // Sanitize focusPoints — each string is injected into an AI prompt
        const rawPoints   = Array.isArray(req.body.focusPoints) ? req.body.focusPoints : [];
        const focusPoints = rawPoints.map(p => sanitizeString(p, 200));
        
        // Phase 2: Credit-based deduction
        // Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, CREDIT_COSTS.UHD_4K);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        if (focusPoints.length !== 4) {
            throw new Error("Must select exactly 4 focus points");
        }

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const prompt = `
        TASK: Create an "Architectural Presentation Sheet" for this project in a 2x2 Grid Layout.
        
        INPUT: Use the provided image as the absolute source of truth.
        
        OUTPUT LAYOUT (2x2 GRID):
        Generate 4 DISTINCT close-up/macro shots based on the user's selection. 
        DO NOT include the full 'Master Shot'. Only specific details.
        
        Quadrant 1 (Top Left): ${focusPoints[0]}
        Quadrant 2 (Top Right): ${focusPoints[1]}
        Quadrant 3 (Bottom Left): ${focusPoints[2]}
        Quadrant 4 (Bottom Right): ${focusPoints[3]}
        
        PRECISION & ACCURACY RULES (CRITICAL):
        - ACT AS A MACRO CAMERA LENS: You are OPTICALLY ZOOMING into the EXACT geometry of the provided input image.
        - You MUST strictly keep to the base design. DO NOT add extra details, DO NOT invent new window frame angles, sizes, or structural changes that are not visible in the source image.
        - ABSOLUTELY NO HALLUCINATIONS OF WALL ANGLES AND STRUCTURES. DO NOT ADD 45 DEGREE TURNS OR NEW CORNERS unless explicitly in the source.
        - PRESERVE 100% of the original wall planes, structural geometry, and material direction.
        - The close-up must physically align and make logical sense contextually when compared to the source image.
        - If the user asks for a 'Timber window frame', zoom in directly on the exact timber window frame shown in the source without altering the surrounding structural shape or adding bevels.
        
        STYLE:
        - High-End ArchViz Portfolio style.
        - Macro Photography with Depth of Field (Bokeh).
        - 1:1 Aspect Ratio output (perfect square presentation).
        - Thin white separator lines between the 4 grid items.
        - Maintain 4K RAW true-to-life photorealism. Ensure extreme micro-texture detail as this is a macro shot. DO NOT allow texture painting/smoothing.
        - CRITICAL DIMENSIONS: Strictly lock the output resolution to exactly 2160 x 2160 pixels (4K Square limit). Do not exceed this pixel count to ensure pricing tier.
      `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: [
                    imagePart,
                    { text: prompt }
                ]
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: "1:1", // Force square for the grid
                    imageSize: "4K"
                },
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No presentation board generated");

    } catch (error) {
        console.error("Scene Studio error:", error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});


// --- ANIMATION STUDIO ---
//
// Three routes rather than one, because video does not fit the shape every other
// AI route here uses.
//
// Measured against the real model: interactions.create() takes ~45s and hands
// back a file that is still PROCESSING, which then needs ~6s of polling before
// it can be downloaded. So the work is split - /start does the expensive call
// and returns a file handle, /status reports whether it is ready, and /video
// streams the bytes. The client shows progress across the whole minute instead
// of staring at one silent request.
//
// The file also lives behind Google's API key, so it can never be handed to the
// browser directly; /video is the proxy that keeps the key server-side.

const resolveEffectivePlan = async (req) => {
    if (isMasterUser(req.user)) return 'master';
    if (isTesterUser(req.user)) return 'tester';
    if (!db) return 'free';
    try {
        const snap = await db.collection('users').doc(req.user.uid).get();
        return snap.exists ? (snap.data().plan || 'free') : 'free';
    } catch (e) {
        console.error('[ANIMATION] Plan lookup failed:', e.message || e);
        return null; // caller treats null as "refuse", never as "free"
    }
};

app.post('/api/animation/start', userAiLimiter, async (req, res) => {
    let claimed = false;
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const preset      = sanitizeString(req.body.preset, 40);
        const extra       = sanitizeString(req.body.extraPrompt, 800);
        const aspectRatio = req.body.aspectRatio === '9:16' ? '9:16' : '16:9';
        const modifiers   = Array.isArray(req.body.modifiers)
            ? req.body.modifiers.slice(0, 8).map(m => sanitizeString(m, 40))
            : [];

        if (!base64Image) {
            return res.status(400).json({ error: 'A source image is required.' });
        }

        const plan = await resolveEffectivePlan(req);
        if (plan === null) {
            return res.status(503).json({ error: 'Could not verify your plan. Please try again shortly.' });
        }
        if (!ANIMATION_PLANS.has(plan)) {
            return res.status(403).json({ error: 'Animation Studio is part of the Business plan.' });
        }

        // Claimed BEFORE the model is called, not after. Google bills for the
        // generation whether or not we manage to deliver it, so the allowance
        // has to be spent at the moment the spend is committed.
        const quota = await claimAnimation(req.user.uid);
        if (!quota.allowed) {
            return res.status(quota.status).json({ error: quota.error });
        }
        claimed = true;

        const prompt = buildAnimationPrompt(preset, modifiers, extra);

        /**
         * One generation attempt. Normal completion is ~40-90s; the video
         * backend occasionally hangs for many minutes before failing, which is
         * exactly the "waited 300 seconds then it errored" experience. Each
         * attempt is therefore capped, and a failed or timed-out first attempt
         * gets ONE automatic retry - transient backend wobbles usually clear
         * immediately.
         */
        const generateOnce = async () => {
            const interaction = await ai.interactions.create({
                model: 'gemini-omni-flash-preview',
                input: [
                    { type: 'image', data: base64Image, mime_type: 'image/jpeg' },
                    { type: 'text', text: prompt },
                ],
                // snake_case throughout. The published JS example shows
                // generationConfig/videoConfig and the API rejects both.
                generation_config: { video_config: { task: 'image_to_video' } },
                // 'uri' not 'base64': output measured at 2.5 MB, and inline delivery
                // is capped around 4 MB. A longer or busier clip would silently
                // exceed it.
                response_format: { type: 'video', aspect_ratio: aspectRatio, delivery: 'uri' },
            });
            const uri = interaction?.output_video?.uri;
            const match = uri && uri.match(/files\/([a-zA-Z0-9_-]+)/);
            if (!match) throw new Error('The model did not return a video.');
            return match[1];
        };
        const ATTEMPT_TIMEOUT_MS = 240_000;
        const withTimeout = (p) => Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error('Generation timed out')), ATTEMPT_TIMEOUT_MS)),
        ]);

        let fileId;
        try {
            fileId = await withTimeout(generateOnce());
        } catch (firstErr) {
            console.warn('[ANIM] first attempt failed, retrying once:', firstErr.message || firstErr);
            fileId = await withTimeout(generateOnce());
        }

        res.json({
            fileName: `files/${fileId}`,
            remaining: quota.remaining,
            limit: ANIMATION_MONTHLY_LIMIT,
        });

    } catch (error) {
        console.error('Animation start error:', error);
        if (claimed) await releaseAnimation(req.user.uid);
        // The allowance really was released above - saying so stops users
        // abandoning the feature believing a failed attempt cost them a clip.
        res.status(500).json({ error: 'The animation service is having a busy moment and the clip could not be generated. Your monthly allowance was NOT used - please try again in a few minutes.' });
    }
});

app.get('/api/animation/status', async (req, res) => {
    try {
        const name = sanitizeString(req.query.file, 120);
        if (!/^files\/[a-zA-Z0-9_-]+$/.test(name)) {
            return res.status(400).json({ error: 'Invalid file reference.' });
        }
        const info = await ai.files.get({ name });
        const state = info?.state?.name || info?.state || 'PROCESSING';
        res.json({ state, ready: state === 'ACTIVE' });
    } catch (error) {
        console.error('Animation status error:', error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.get('/api/animation/video', async (req, res) => {
    try {
        const name = sanitizeString(req.query.file, 120);
        if (!/^files\/[a-zA-Z0-9_-]+$/.test(name)) {
            return res.status(400).json({ error: 'Invalid file reference.' });
        }

        // Streamed through the server rather than redirected to: the download
        // URL only works with our API key attached, and that key must never
        // reach the browser.
        // Use the shared apiKey (with its VITE_ fallback) — reading the env var
        // directly meant a deployment still on the deprecated name could
        // generate clips (paying for them) but never download them.
        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${name}:download?alt=media`,
            { headers: { 'x-goog-api-key': apiKey } }
        );
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: 'Could not fetch the finished video.' });
        }

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="modulr-animation.mp4"');
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.send(buffer);

    } catch (error) {
        console.error('Animation download error:', error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});


// --- BILLING / ACCOUNT ENDPOINTS ---

/**
 * Mirror the account's Projects entitlement onto its user document.
 *
 * Projects are written by the browser straight to Firestore, so the control that
 * actually stops an unentitled account creating them is a Firestore rule — and a
 * rule can only read documents. It cannot see MASTER_UIDS, TESTER_EMAILS or
 * anything else that lives in the environment.
 *
 * Writing the resolved answer here is what lets one rule cover every kind of
 * entitled account. It is deliberately a separate boolean rather than an
 * overloaded `plan` value: stamping plan:'master' on a document would also hand
 * out unmetered rendering via UNLIMITED_PLANS, and would keep doing so after the
 * UID was removed from the allowlist.
 *
 * The read first keeps this to one write per entitlement change rather than one
 * per page load.
 */
const syncProjectAccess = async (uid, enabled) => {
    if (!db) return;
    try {
        const ref = db.collection('users').doc(uid);
        const snap = await ref.get();
        if (snap.exists && snap.data().projectsEnabled === enabled) return;
        await ref.set({ projectsEnabled: enabled }, { merge: true });
    } catch (e) {
        console.error('[PROJECT ACCESS] Sync failed for uid:', uid, '|', e.message || e);
    }
};

/** Animations still available this month, from a user document. A stored period
 *  from an earlier month means the allowance has already rolled over. */
const animationsLeftFor = (data) => {
    const used = data?.animationPeriod === currentPeriod() ? (data.animationsUsed || 0) : 0;
    return Math.max(0, ANIMATION_MONTHLY_LIMIT - used);
};

/** Attach the feature flags the client gates its UI on. The client must never
 *  derive these from the plan string itself — that would mean maintaining the
 *  entitlement list in two places, free to drift apart. */
const withEntitlements = (payload, data) => {
    const canUseAnimation = ANIMATION_PLANS.has(payload.plan);
    return {
        ...payload,
        canUseProjects: PROJECT_PLANS.has(payload.plan),
        canUseAnimation,
        animationsLimit: ANIMATION_MONTHLY_LIMIT,
        animationsLeft: canUseAnimation ? animationsLeftFor(data) : 0,
    };
};

app.get('/api/user/credits', async (req, res) => {
    try {
        if (isMasterUser(req.user)) {
            await syncProjectAccess(req.user.uid, true);
            // Read for the animation counter only - master bypasses every other
            // limit, but the monthly video allowance is a cost ceiling rather
            // than an entitlement, so it applies to the owner too.
            const snap = db ? await db.collection('users').doc(req.user.uid).get() : null;
            return res.json(withEntitlements(
                { credits: 'Unlimited', plan: 'master' },
                snap?.exists ? snap.data() : {}
            ));
        }

        // Tester: report the remaining renders and days so the account page can
        // show a countdown.
        if (isTesterUser(req.user) || req.user?.beta === true) {
            const snap = await db.collection('users').doc(req.user.uid).get();
            const data = snap.exists ? snap.data() : {};
            const used = data.testerRendersUsed || 0;
            const startedAt = data.testerStartedAt || Date.now();
            const expiresAt = startedAt + TESTER_DAYS * 86400000;
            const msLeft = Math.max(0, expiresAt - Date.now());
            if (data.projectsEnabled !== true) await syncProjectAccess(req.user.uid, true);
            return res.json(withEntitlements({
                credits: Math.max(0, TESTER_RENDERS - used),
                plan: req.user?.beta === true && !isTesterUser(req.user) ? 'beta' : 'tester',
                rendersLeft: Math.max(0, TESTER_RENDERS - used),
                rendersPerDay: TESTER_RENDERS,
                trialDaysLeft: Math.ceil(msLeft / 86400000),
                trialExpiresAt: new Date(expiresAt).toISOString(),
                trialBlocked: used >= TESTER_RENDERS || msLeft <= 0,
            }));
        }

        const userRef = db.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            // Device/IP fingerprint check to prevent trial abuse via new accounts
            const clientIp = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
            const { createHash } = await import('crypto');
            const ipHash = createHash('sha256').update(clientIp).digest('hex');
            
            const trialFingerprintRef = db.collection('trial_fingerprints').doc(ipHash);
            const existingTrial = await trialFingerprintRef.get();
            
            if (existingTrial.exists) {
                console.warn(`[TRIAL ABUSE] Blocked repeat trial from IP hash: ${ipHash.slice(0, 8)}...`);
                await userRef.set({
                    credits: 0, plan: 'free', trialBlocked: true, projectsEnabled: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.json(withEntitlements({ credits: 0, plan: 'free', rendersLeft: 0, rendersPerDay: RENDERS_PER_DAY, trialDaysLeft: 0, trialBlocked: true }));
            }

            const starterCredits = 0; // Removed starter credits so they can't spam other credit endpoints, but can still use trial renders.
            const now = Date.now();
            const trialExpiresAt = new Date(now + TRIAL_HOURS * 3600000).toISOString();
            await Promise.all([
                userRef.set({
                    credits: starterCredits, plan: 'free', projectsEnabled: false,
                    trialStartTimestamp: now,
                    trialExpiresAt: trialExpiresAt,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }),
                trialFingerprintRef.set({
                    uid: req.user.uid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                })
            ]);
            return res.json(withEntitlements({ credits: starterCredits, plan: 'free', rendersLeft: RENDERS_PER_DAY, rendersPerDay: RENDERS_PER_DAY, trialDaysLeft: 1, trialExpiresAt, trialBlocked: false }));
        }

        const data = userDoc.data();
        const plan = data.plan || 'free';

        // Keep the flag the Firestore rules read in step with the plan Stripe
        // last set - this is where a new subscriber gains Projects and where a
        // cancelled one loses the ability to add more.
        const entitled = PROJECT_PLANS.has(plan);
        if (data.projectsEnabled !== entitled) await syncProjectAccess(req.user.uid, entitled);

        // For free/trial plan: enrich response with daily render info
        if (plan === 'free') {
            const now = Date.now();
            const trialStart = data.trialStartTimestamp || now;
            const trialExpiresAt = data.trialExpiresAt || new Date(trialStart + TRIAL_HOURS * 3600000).toISOString();
            const msElapsed = now - trialStart;
            const trialExpired = msElapsed >= TRIAL_HOURS * 3600000;
            const rendersUsed = data.trialRendersUsed || 0;
            const rendersLeft = Math.max(0, RENDERS_PER_DAY - rendersUsed);
            
            return res.json(withEntitlements({
                credits: data.credits || 0,
                plan,
                rendersLeft,
                rendersPerDay: RENDERS_PER_DAY,
                trialDaysLeft: trialExpired ? 0 : 1,
                trialExpiresAt: trialExpiresAt,
                trialBlocked: rendersLeft <= 0 || trialExpired
            }));
        }

        // Unlimited plans report a sentinel rather than a balance — the UI
        // renders an infinity symbol for any non-numeric value.
        if (UNLIMITED_PLANS.has(plan)) {
            return res.json(withEntitlements({ credits: 'Unlimited', plan }, data));
        }

        res.json(withEntitlements({ credits: data.credits || 0, plan }, data));
    } catch (error) {
        console.error("Error fetching user credits:", error);
        res.status(500).json({ error: "Could not fetch credits balance" });
    }
});

/**
 * CONTENT STUDIO
 *
 * Two endpoints, both behind the same auth and lock as everything else in /api.
 */

/** Aspect ratios the image model accepts, keyed by the studio's format ids. */
const CONTENT_RATIOS = {
    square: '1:1',
    portrait: '4:5',
    story: '9:16',
    linkedin: '16:9',
};

/**
 * AI Reframe - extend a render into a different aspect ratio.
 *
 * The difference between this and the browser-side compositor is the whole
 * point of the feature. A canvas can letterbox a landscape render into a 9:16
 * story, or blur the sides to fill it; only the model can invent the extra sky
 * above and lawn below so the result looks like it was photographed that way.
 *
 * Costs a render, because it IS one - the model generates a new image. Priced
 * at LOW_RES: the output is for a phone screen, so paying 4K rates for it would
 * be daft.
 */
app.post('/api/content/reframe', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const format = sanitizeString(req.body.format, 20);
        const ratio = CONTENT_RATIOS[format];

        if (!base64Image) return res.status(400).json({ error: 'A source image is required.' });
        if (!ratio) return res.status(400).json({ error: 'Unknown format.' });

        const access = await enforceRenderAccess(req, CREDIT_COSTS.LOW_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        const prompt = `
      TASK: Re-frame this architectural photograph to a ${ratio} aspect ratio by EXTENDING the scene.

      THIS IS AN EXTENSION, NOT A CROP AND NOT A ZOOM:
      - The building must stay COMPLETE and UNCHANGED. Do not cut any part of it
        off, do not resize it relative to its surroundings, and do not alter its
        materials, colours, proportions, windows or doors in any way.
      - Generate NEW scenery to fill the space the new shape adds: more sky above,
        more garden, lawn or paving below, more planting and fencing to the sides.
      - Everything you add must be a plausible continuation of what is already
        there - same time of day, same sun direction and shadow length, same
        weather, same lens, same colour grade, same depth of field.
      - Match grain and sharpness across the join. There must be no visible seam,
        vignette or tonal step where the original image ends.

      COMPOSITION:
      - Place the building slightly below centre, leaving the upper third calmer,
        so a caption or logo can sit over the image without covering the subject.
      - Keep the horizon level and the verticals of the building perfectly upright.

      OUTPUT: a single photorealistic image at ${ratio}, indistinguishable from a
      real photograph taken in that format.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt },
                ],
            },
            config: {
                outputMimeType: 'image/jpeg',
                imageConfig: { aspectRatio: ratio, imageSize: '1K' },
                // Low, because this is a faithfulness task rather than a creative
                // one - the extension should be boring and seamless.
                temperature: 0.15,
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const d = part.inlineData.data;
                const b64 = Buffer.isBuffer(d) ? d.toString('base64')
                    : ((d instanceof Uint8Array || d instanceof ArrayBuffer) ? Buffer.from(d).toString('base64') : d);
                return res.json({ result: b64 });
            }
        }
        throw new Error('No reframed image was returned.');
    } catch (error) {
        console.error('[CONTENT] Reframe failed:', error);
        res.status(500).json({ error: 'Could not reframe that image. Please try again.' });
    }
});

/**
 * Post copy written from the SPEC, not from the picture.
 *
 * A generic caption tool is looking at pixels and guessing. This one is handed
 * the real dimensions and materials, which is why it can say "4.2m x 3m in
 * Siberian larch" instead of "a beautiful modern garden building".
 */
/**
 * Look at the render and suggest overlay copy.
 *
 * Different job from the caption endpoint. A caption is prose under the post;
 * this is the handful of words that sit ON the image, where the constraint is
 * severity - four words that fit a headline, not a paragraph. It reads the
 * picture as well as the spec, so it can say "evening light" or "bifolds" when
 * that is what is actually in shot.
 *
 * Free: it is a small text response, not an image generation.
 */
app.post('/api/content/suggest', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        if (!base64Image) return res.status(400).json({ error: 'An image is required.' });
        const businessName = sanitizeString(req.body.businessName, 80);
        const details = req.body.details && typeof req.body.details === 'object' ? req.body.details : {};

        const prompt = `You are an art director writing the words that go ON a social post for a UK garden room company${businessName ? ` called ${businessName}` : ''}.

Look at the image. Note the building's character, materials, glazing, planting, light and time of day.
Known specification (use it, never contradict it, never invent beyond it):
${JSON.stringify(details, null, 2).slice(0, 1200)}

Give FOUR different options. Each has:
- "headline": 2 to 5 words. This is set large over the photo, so it must be short, concrete and specific to THIS building. No slogans, no "transform your space", no exclamation marks.
- "subline": 3 to 8 words of supporting detail - dimensions, material, or use. Sentence case.

Vary the angle across the four: one factual, one about the feeling of the space, one about the material or craft, one about what it is used for.
British English. No emoji, no hashtags, no markdown.

Return STRICT JSON only, no code fence:
{"options":[{"headline":"...","subline":"..."}],"altText":"one sentence describing the image for accessibility"}`;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt },
                ],
            },
        });

        const raw = String(response.text || '').replace(/```json|```/g, '').trim();
        try {
            const parsed = JSON.parse(raw);
            const options = Array.isArray(parsed.options) ? parsed.options.slice(0, 6).map(o => ({
                headline: String(o.headline || '').slice(0, 60),
                subline: String(o.subline || '').slice(0, 90),
            })).filter(o => o.headline) : [];
            return res.json({ options, altText: String(parsed.altText || '') });
        } catch {
            console.warn('[CONTENT] Suggest returned unparseable JSON');
            return res.json({ options: [], altText: '' });
        }
    } catch (error) {
        console.error('[CONTENT] Suggest failed:', error);
        res.status(500).json({ error: 'Could not read that image. Please try again.' });
    }
});

/**
 * Read a photo of a client's garden and describe it as a buildable brief.
 *
 * The goal is NOT to composite the building into the photograph. Asking an
 * image model to place a render into a real scene means asking it to solve
 * perspective, scale and sun direction at once, which it cannot do - it skews
 * the building, guesses the size, and quietly redesigns it on the way through.
 *
 * So the photo is treated the way a visualiser treats site photos: as a brief.
 * The garden gets rebuilt as CGI from this description, which is why the output
 * has to be a list of renderable ELEMENTS - fence type and height, planting,
 * paving material, levels - rather than atmosphere. The client recognises their
 * garden because the parts match, not because any pixels survived.
 *
 * Free: a small text response, no image generation.
 */
app.post('/api/scene/describe', userAiLimiter, async (req, res) => {
    try {
        /**
         * A photo, a written note, or both.
         *
         * Plenty of customers can simply say "north facing, close-board fence,
         * lawn and a patio" without hunting for a photograph, and someone who
         * has a photo often knows something it does not show - the shed that is
         * out of shot, the fence they are about to replace. Where both arrive
         * the note WINS, because it is the correction the person made after
         * seeing what the photo produced.
         */
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const notes = sanitizeString(req.body.notes, 1500);
        if (!base64Image && !notes) {
            return res.status(400).json({ error: 'Add a photo or describe the garden.' });
        }

        const prompt = `You are a senior architectural visualiser writing a site brief for a client's garden. Another artist will rebuild this garden in 3D from your description alone - they will never see the source material.

${base64Image ? 'Work from the photograph provided.' : 'Work from the written description below alone.'}
${notes ? `\nThe client says:\n"""${notes}"""\n${base64Image ? 'Where this disagrees with the photo, BELIEVE THE CLIENT - they know their garden, and the photo may be old or out of shot.' : ''}` : ''}
${!base64Image ? 'Fill in anything they have not mentioned with the most typical UK garden option, and keep it plain and unremarkable rather than inventing features.' : ''}

Describe ONLY the setting. Ignore any existing building, shed or outbuilding: a new garden room will be placed here, and describing the old one would confuse the render.

Be concrete and physical. "Close-board timber fence, about 1.8m, weathered grey-brown" is useful. "A charming, peaceful space" is not - it cannot be built.

Where something is unclear in the photo, choose the most typical UK garden option rather than guessing wildly, and keep it plain.

Return STRICT JSON only, no code fence, no markdown:
{
  "boundary": "fence or wall type, height, material, condition",
  "levels": "flat, sloping, terraced, steps and their rough height",
  "hardLandscaping": "patio, path and decking materials, colours, sizes",
  "planting": "lawn condition, trees, shrubs, borders - species where obvious, character where not",
  "context": "what is visible beyond the boundary - neighbouring rooflines, trees, open fields",
  "aspect": "which way the garden appears to face and where the light comes from",
  "character": "one short phrase - suburban, rural, courtyard, coastal",
  "summary": "two sentences a visualiser could build from"
}`;

        const parts = [];
        if (base64Image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: { parts },
        });

        const raw = String(response.text || '').replace(/```json|```/g, '').trim();
        try {
            const p = JSON.parse(raw);
            const pick = (v) => (typeof v === 'string' ? v.slice(0, 400) : '');
            return res.json({
                boundary: pick(p.boundary),
                levels: pick(p.levels),
                hardLandscaping: pick(p.hardLandscaping),
                planting: pick(p.planting),
                context: pick(p.context),
                aspect: pick(p.aspect),
                character: pick(p.character),
                summary: pick(p.summary),
            });
        } catch {
            console.warn('[SCENE] Describe returned unparseable JSON');
            return res.status(502).json({ error: 'Could not read that photo. Please try another.' });
        }
    } catch (error) {
        console.error('[SCENE] Describe failed:', error);
        res.status(500).json({ error: 'Could not read that photo. Please try again.' });
    }
});

app.post('/api/content/captions', userAiLimiter, async (req, res) => {
    try {
        const platform = sanitizeString(req.body.platform, 20) || 'instagram';
        const tone = sanitizeString(req.body.tone, 30) || 'friendly';
        const businessName = sanitizeString(req.body.businessName, 80);
        const details = req.body.details && typeof req.body.details === 'object' ? req.body.details : {};

        const house = platform === 'linkedin'
            ? 'LinkedIn: professional and specific, first person plural, a short case-study note. No emoji. 3-4 short paragraphs at most.'
            : 'Instagram: warm and direct, short lines, a hook in the first sentence because the rest is hidden behind "more". A few tasteful emoji are fine.';

        const prompt = `You write social posts for a UK garden room and outbuilding company${businessName ? ` called ${businessName}` : ''}.

Write a post about this finished project. These are the REAL specifications - use the actual numbers and materials, never invent any:
${JSON.stringify(details, null, 2).slice(0, 2000)}

Platform - ${house}
Tone: ${tone}.

RULES:
- British English. Metres and millimetres, never feet.
- Never invent a price, a lead time, a location or a client name that is not above.
- No hard sell and no "DM us now" energy. One gentle closing line is enough.
- Do not use markdown, asterisks or headings.

Return STRICT JSON only, no code fence, in exactly this shape:
{"caption":"the post text","hashtags":["#tag","#tag"],"altText":"one sentence describing the image for accessibility"}
Between 8 and 12 hashtags, lowercase, a mix of broad and niche, relevant to UK garden rooms.`;

        const response = await ai.models.generateContent({
            model: 'gemini-pro-latest',
            contents: prompt,
        });

        // The model is asked for bare JSON but will occasionally fence it anyway.
        const raw = String(response.text || '').replace(/```json|```/g, '').trim();
        try {
            const parsed = JSON.parse(raw);
            return res.json({
                caption: String(parsed.caption || ''),
                hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 14).map(String) : [],
                altText: String(parsed.altText || ''),
            });
        } catch {
            // Better a caption with no hashtags than an error screen.
            return res.json({ caption: raw, hashtags: [], altText: '' });
        }
    } catch (error) {
        console.error('[CONTENT] Caption generation failed:', error);
        res.status(500).json({ error: 'Could not write a caption. Please try again.' });
    }
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        /**
         * Billing kill switch.
         *
         * Enforced HERE and not only in the UI. A disabled button is a
         * suggestion; this is the control. Without it, anyone could POST to
         * this endpoint directly and start a real subscription before the
         * billing flow is finished.
         *
         * Set BILLING_ENABLED=true to open payments.
         */
        if (process.env.BILLING_ENABLED !== 'true') {
            return res.status(503).json({
                error: 'Subscriptions are not open yet. Modulr Studio is currently in private beta.',
                billingClosed: true,
            });
        }

        if (!stripe) throw new Error("Stripe is not configured on the server");

        // The price ID is the ONLY thing we accept from the client, and it must
        // match a known catalogue entry. Plan, credit quantity and billing mode
        // all come from the server-side catalogue — never from the request.
        const priceId = sanitizeString(req.body.priceId, 200);
        const entry = PRICE_CATALOG[priceId];

        if (!entry) {
            console.warn('[STRIPE] Rejected checkout for unknown priceId:', priceId, '| uid:', req.user.uid);
            return res.status(400).json({ error: 'Unknown or unavailable plan.' });
        }

        // Never interpolate the client-controlled Origin header into a redirect
        // target — that is an open redirect off the back of a real payment flow.
        const origin = allowedOrigins.includes(req.headers.origin)
            ? req.headers.origin
            : (process.env.VITE_APP_URL || 'https://modulrstudio.co.uk');

        const purchaseMetadata = {
            firebase_uid: req.user.uid,
            plan: entry.plan,
            credits: String(entry.credits)
        };

        const sessionPayload = {
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: entry.mode,
            automatic_tax: { enabled: true },
            success_url: `${origin}/account?success=true`,
            cancel_url: `${origin}/pricing?canceled=true`,
            client_reference_id: req.user.uid,
            metadata: purchaseMetadata,
        };

        // For subscriptions, also set metadata on the Subscription object itself.
        // This is CRITICAL for invoice.paid renewal events to work — invoices
        // inherit metadata from the Subscription, not the checkout Session.
        if (entry.mode === 'subscription') {
            sessionPayload.subscription_data = { metadata: purchaseMetadata };
        }

        const session = await stripe.checkout.sessions.create(sessionPayload);

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ error: "Could not start checkout. Please try again." });
    }
});

app.post('/api/create-portal-session', async (req, res) => {
    try {
        if (!stripe) throw new Error("Stripe is not configured");

        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists) throw new Error("User not found");

        const customerId = userDoc.data().stripeCustomerId;
        if (!customerId) {
            return res.status(400).json({ error: "No active Stripe customer found. Please subscribe to a plan first." });
        }

        // Same open-redirect reasoning as the checkout session — never trust the
        // client-supplied Origin header as a redirect target.
        const origin = allowedOrigins.includes(req.headers.origin)
            ? req.headers.origin
            : (process.env.VITE_APP_URL || 'https://modulrstudio.co.uk');

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/account`,
        });

        res.json({ url: portalSession.url });
    } catch (error) {
        console.error("Portal error:", error);
        res.status(500).json({ error: "Could not open the billing portal. Please try again." });
    }
});

// Serve static files from the Vite build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA routing: serve index.html for any unknown GET requests
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        const indexPath = path.join(__dirname, 'dist', 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
    }
    next();
});

/**
 * Final error handler. Must be registered AFTER every route — Express only
 * routes errors to handlers declared later than the code that threw, so the
 * early handler above never saw anything thrown inside a route.
 */
app.use((err, req, res, next) => {
    console.error('[UNHANDLED]', req.method, req.path, '|', err?.stack || err?.message || err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});

// Increase timeouts for long-running AI generation (5 minutes)
server.timeout = 300000;
server.keepAliveTimeout = 300000;
server.headersTimeout = 305000;

server.on('error', (e) => {
    console.error('Server error:', e);
});

server.on('close', () => {
    console.log('Server closed');
});
