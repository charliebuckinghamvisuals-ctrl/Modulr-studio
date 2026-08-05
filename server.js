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
const MODULR_HOUSE_STYLE = `
      HOUSE STYLE - APPLY TO EVERY RENDER:

      CAMERA & FOCUS:
      - Full-frame DSLR, 35-50mm lens, eye level, natural three-quarter viewpoint.
      - Shallow-to-moderate depth of field. The BUILDING IS THE SUBJECT and must be
        tack sharp from corner to corner.
      - The background - fences, neighbouring rooflines, distant planting - falls
        gently out of focus. Soft, natural bokeh. Never blur the building itself.
      - Foreground grass immediately nearest the camera may soften slightly. Keep
        the frame clear of clutter; nothing should compete with the building.

      LIGHTING:
      - Soft, bright, overcast daylight. Diffuse and even, no harsh direct sun,
        no blown highlights, no heavy black shadows.
      - Gentle ambient occlusion under the eaves, soffits and decking edge.
      - Subtle, believable contact shadow where the structure meets the ground.

      COMPOSITION & CONTEXT:
      - A realistic UK domestic rear garden: mown lawn, timber fence panels with
        concrete posts, mature planting, neighbouring rooftops soft in the distance.
      - The building occupies the majority of the frame with comfortable breathing
        space. Not a wide landscape shot.
      - Horizon level, verticals true, no wide-angle distortion or converging walls.

      FINISH:
      - Neutral, true-to-life colour grade. Materials read at their real colour.
      - No oversaturation, no HDR halos, no heavy vignette, no lens flare.
      - Crisp micro-texture: timber grain, board joints, glass reflections, grass blades.
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

const enforceRenderAccess = async (req, creditCost) => {
    // Master account — always allowed. Keyed on UID allowlist, never on the
    // email claim, and never on a Firestore field the user's document controls.
    if (isMasterUser(req.user)) {
        return { allowed: true };
    }

    // Testers are metered by render count and an expiry date, not by credits.
    if (isTesterUser(req.user)) {
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
        return { allowed: true, unlimited: true };
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
    max: 100,
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
    max: 5, // max 5 renders per minute per individual user
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
    // Testers are let through the pre-launch lock. Their usage is still bounded
    // by enforceRenderAccess, which caps renders and expires the account.
    if (isMasterUser(req.user) || isTesterUser(req.user)) {
        return next();
    }
    return res.status(403).json({ error: 'Access restricted: App is currently in pre-launch mode for Master Account access only.' });
};

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
        res.status(500).json({ error: error.message });
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
      6. Return ONLY a valid JSON object.
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
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/renderBuilding', userAiLimiter, async (req, res) => {
    try {
        const base64Image      = sanitizeString(req.body.base64Image, 10_000_000);
        const additionalPrompt = sanitizeString(req.body.additionalPrompt, 2000);
        const isHighQuality    = sanitizeBool(req.body.isHighQuality);
        const ratio            = sanitizeString(req.body.ratio, 10);
        const isProMode        = sanitizeBool(req.body.isProMode);
        const orientation      = sanitizeString(req.body.orientation, 50);
        const isSketchUpMode   = sanitizeBool(req.body.isSketchUpMode);
        const studioBackground = sanitizeString(req.body.studioBackground, 200);
        const isBatchSequence  = sanitizeBool(req.body.isBatchSequence);
        const seed             = req.body.seed ? parseInt(req.body.seed) : undefined;
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

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const buildMaterialInstruction = (label, value) => {
            if (!value || value.trim() === '' || value.toLowerCase() === 'none') {
                return `- ${label}: PRESERVE ORIGINAL MATERIAL exactly as seen in the source image.`;
            }
            return `- ${label}: ${value}`;
        };

        const deckingValue = materials.decking && materials.decking.trim().toLowerCase() !== 'none' ? materials.decking : null;

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

      WHAT THE INPUT IS:
      The source is a flat-shaded 3D model preview (CAD / SketchUp / configurator).
      Treat it STRICTLY as a geometry, layout and composition reference. It is NOT
      a photograph and its appearance must NOT be preserved.

      TASK: Produce a full photorealistic architectural render of this exact building.
      This is a COMPLETE RE-RENDER, not an upscale, filter or enhancement pass.

      YOU MUST REPLACE, NOT PRESERVE:
      - Discard the model's flat fill colours, uniform shading and plastic CGI look entirely.
      - Discard hard, aliased CG edges. Real materials have thickness, bevels and shadow lines.
      - Rebuild all lighting from scratch: real sun angle, soft sky fill, global illumination,
        contact shadows, ambient occlusion in every recess and reveal.
      - Add authentic surface detail: timber grain and board joints, metal seams and standing
        ribs, glass with real reflections, refraction and interior falloff, subtle dirt and
        weathering at ground level.
      - Materials must respond physically to light: correct roughness, specularity and
        reflectance for each surface.

      GEOMETRY & CONTEXT RULES - CRITICAL:
      - STRICT GEOMETRY LOCK: reproduce the EXACT structure, proportions, roof pitch, and
        window and door positions shown. Changing the appearance is required; changing the
        DESIGN is forbidden.
      - NO HALLUCINATIONS: do NOT invent structures, decking, patios, porches or raised
        platforms that are not present in the source.
      - PRESERVE THE COMPOSITION: keep the same camera angle and framing.
      - IGNORE 3D GRID LINES: the source may show a floor grid on the ground. Never render
        these. Replace with natural, seamless ground or grass.

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

      ${MODULR_HOUSE_STYLE}

      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE - THIS SUPERSEDES THE HOUSE STYLE COMPOSITION AND CONTEXT RULES ABOVE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only. Keep the house style's camera, focus and finish guidance - the building must still be tack sharp with true-to-life material colour.` : ''}
      ${isBatchSequence ? `\n      BATCH SEQUENCE CONTINUITY: This image is part of a multi-angle batch sequence. You MUST maintain exactly the same surrounding landscape, garden design, driveway, sky, trees, and general environment style as the other angles of this property.` : ''}

      FINAL OUTPUT: The result must be indistinguishable from a real architectural photograph
      (DSLR quality). It must NOT look like a 3D model, a game engine screenshot, or a
      retouched CAD export.
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

      ${MODULR_HOUSE_STYLE}

      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE - THIS SUPERSEDES THE HOUSE STYLE COMPOSITION AND CONTEXT RULES ABOVE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only. Keep the house style's camera, focus and finish guidance - the building must still be tack sharp with true-to-life material colour.` : ''}
      ${isBatchSequence ? `\n      BATCH SEQUENCE CONTINUITY: This image is part of a multi-angle batch sequence. You MUST maintain exactly the same surrounding landscape, garden design, driveway, sky, trees, and general environment style as the other angles of this property.` : ''}

      FINAL OUTPUT: The result must be indistinguishable from a real architectural photograph (DSLR quality).
      CRITICAL: Output resolution 3840 x 2160 pixels (4K UHD).
    `;

        const prompt = isSketchUpMode ? sketchUpPrompt : standardPrompt;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: [imagePart, { text: prompt }]
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    // CGI-model sources keep the source framing rather than being
                    // forced to 16:9, so the composition the user set up in the
                    // configurator survives. Fallback guards against an empty ratio.
                    aspectRatio: (isHighQuality && !isSketchUpMode) ? "16:9" : (ratio || "16:9"),
                    imageSize: isHighQuality ? "4K" : "1K",
                    ...(seed !== undefined && !isNaN(seed) && { seed })
                },
                temperature: 0.2,
                ...(seed !== undefined && !isNaN(seed) && { seed })
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const rData = part.inlineData.data;
                const b64Data = Buffer.isBuffer(rData) ? rData.toString("base64") : ((rData instanceof Uint8Array || rData instanceof ArrayBuffer) ? Buffer.from(rData).toString("base64") : rData);
                return res.json({ result: b64Data });
            }
        }
        
        console.error("No render generated. Response data:", JSON.stringify(response, null, 2));
        throw new Error("No render generated. Check server logs for response payload.");
    } catch (error) {
        console.error("Render error in /api/renderBuilding:", error, error.stack);
        // Removed require('fs') to prevent node crashes
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/editImage', userAiLimiter, async (req, res) => {
    try {
        const base64Image   = sanitizeString(req.body.base64Image, 10_000_000);
        const maskImage     = sanitizeString(req.body.maskImage, 10_000_000);
        const editPrompt    = sanitizeString(req.body.editPrompt, 1000); // embedded directly in prompt — strict cap
        const isHighQuality = sanitizeBool(req.body.isHighQuality);
        const ratio         = sanitizeString(req.body.ratio, 10);
        const isProMode     = sanitizeBool(req.body.isProMode);

        // Phase 2: Credit-based deduction
        // Enforce render access (trial for free users, credit deduction for paid)
        const access = await enforceRenderAccess(req, isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

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
                    imageSize: isHighQuality ? "4K" : "1K",
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
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/applyWeather', userAiLimiter, async (req, res) => {
    try {
        const base64Image   = sanitizeString(req.body.base64Image, 10_000_000);
        const isHighQuality = sanitizeBool(req.body.isHighQuality);
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
                    imageSize: isHighQuality ? "4K" : "1K"
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
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});


// --- BILLING / ACCOUNT ENDPOINTS ---

app.get('/api/user/credits', async (req, res) => {
    try {
        if (isMasterUser(req.user)) {
            return res.json({ credits: 'Unlimited', plan: 'master' });
        }

        // Tester: report the remaining renders and days so the account page can
        // show a countdown.
        if (isTesterUser(req.user)) {
            const snap = await db.collection('users').doc(req.user.uid).get();
            const data = snap.exists ? snap.data() : {};
            const used = data.testerRendersUsed || 0;
            const startedAt = data.testerStartedAt || Date.now();
            const expiresAt = startedAt + TESTER_DAYS * 86400000;
            const msLeft = Math.max(0, expiresAt - Date.now());
            return res.json({
                credits: Math.max(0, TESTER_RENDERS - used),
                plan: 'tester',
                rendersLeft: Math.max(0, TESTER_RENDERS - used),
                rendersPerDay: TESTER_RENDERS,
                trialDaysLeft: Math.ceil(msLeft / 86400000),
                trialExpiresAt: new Date(expiresAt).toISOString(),
                trialBlocked: used >= TESTER_RENDERS || msLeft <= 0,
            });
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
                    credits: 0, plan: 'free', trialBlocked: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.json({ credits: 0, plan: 'free', rendersLeft: 0, rendersPerDay: RENDERS_PER_DAY, trialDaysLeft: 0, trialBlocked: true });
            }

            const starterCredits = 0; // Removed starter credits so they can't spam other credit endpoints, but can still use trial renders.
            const now = Date.now();
            const trialExpiresAt = new Date(now + TRIAL_HOURS * 3600000).toISOString();
            await Promise.all([
                userRef.set({
                    credits: starterCredits, plan: 'free',
                    trialStartTimestamp: now,
                    trialExpiresAt: trialExpiresAt,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }),
                trialFingerprintRef.set({
                    uid: req.user.uid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                })
            ]);
            return res.json({ credits: starterCredits, plan: 'free', rendersLeft: RENDERS_PER_DAY, rendersPerDay: RENDERS_PER_DAY, trialDaysLeft: 1, trialExpiresAt, trialBlocked: false });
        }
        
        const data = userDoc.data();
        const plan = data.plan || 'free';

        // For free/trial plan: enrich response with daily render info
        if (plan === 'free') {
            const now = Date.now();
            const trialStart = data.trialStartTimestamp || now;
            const trialExpiresAt = data.trialExpiresAt || new Date(trialStart + TRIAL_HOURS * 3600000).toISOString();
            const msElapsed = now - trialStart;
            const trialExpired = msElapsed >= TRIAL_HOURS * 3600000;
            const rendersUsed = data.trialRendersUsed || 0;
            const rendersLeft = Math.max(0, RENDERS_PER_DAY - rendersUsed);
            
            return res.json({
                credits: data.credits || 0,
                plan,
                rendersLeft,
                rendersPerDay: RENDERS_PER_DAY,
                trialDaysLeft: trialExpired ? 0 : 1,
                trialExpiresAt: trialExpiresAt,
                trialBlocked: rendersLeft <= 0 || trialExpired
            });
        }

        // Unlimited plans report a sentinel rather than a balance — the UI
        // renders an infinity symbol for any non-numeric value.
        if (UNLIMITED_PLANS.has(plan)) {
            return res.json({ credits: 'Unlimited', plan });
        }

        res.json({ credits: data.credits || 0, plan });
    } catch (error) {
        console.error("Error fetching user credits:", error);
        res.status(500).json({ error: "Could not fetch credits balance" });
    }
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
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
