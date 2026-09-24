import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, GenerateVideosOperation } from "@google/genai";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import helmet from 'helmet';
import { mountRender } from './render/index.js';
import { drawImage, FINISH_MODEL, GEOMETRY_MODEL, safeRatio } from './render/providers/gemini.js';
import { verifyRender } from './render/verify.js';
import { inventoryFromItems } from './render/inventory.js';
import { LINE_CONVERSION_PROMPT } from './render/prompt.js';
import { buildWeatherPrompt, GENERIC_WEATHER_ITEMS } from './render/weather.js';

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
 * PRICING RESTRUCTURED 20 Sep 2026 (Charlie), superseding 17 Sep:
 *
 *   Configurator  £49.99 a month / £499.90 a year (plan key 'standard')
 *                 full 3D configurator, walk inside/outside, projects, saved
 *                 designs, clients and PDFs. NO AI tools: no Render Engine,
 *                 material close-ups, plan or line-converter AI, Animation
 *                 Studio or 4K.
 *   The Hub       £199 a month / £1,990 a year (plan key 'business')
 *                 everything in Configurator plus 250 renders a month and the
 *                 AI tools.
 *
 * The plan keys 'standard' and 'business' are kept as they were: they are in
 * Stripe metadata, Firestore user documents and the webhook, so renaming them
 * would mean a migration for a label. Only the labels and prices changed.
 * Video credit packs £25 / £50 / £100 and the founding coupon (£59 off The
 * Hub for 12 months, first five companies and month-one trial converts) are
 * unchanged. The Stripe objects are created by scripts/stripe-setup.mjs,
 * which prints the IDs below as environment variables; nothing is typed by
 * hand. A price with no ID set is simply not on sale yet.
 */
const BILLING_PRICES = {
    standard_monthly: { env: 'STRIPE_PRICE_STANDARD_MONTHLY', plan: 'standard', mode: 'subscription', label: 'Configurator, monthly', pence: 4999 },
    standard_yearly:  { env: 'STRIPE_PRICE_STANDARD_YEARLY',  plan: 'standard', mode: 'subscription', label: 'Configurator, yearly',  pence: 49990 },
    business_monthly: { env: 'STRIPE_PRICE_BUSINESS_MONTHLY', plan: 'business', mode: 'subscription', label: 'The Hub, monthly',      pence: 19900 },
    business_yearly:  { env: 'STRIPE_PRICE_BUSINESS_YEARLY',  plan: 'business', mode: 'subscription', label: 'The Hub, yearly',       pence: 199000 },
    video_25:         { env: 'STRIPE_PRICE_VIDEO_25',         plan: null, mode: 'payment', label: '7 animations (£25)',  pence: 2500,  videoCreditsPence: 2500 },
    video_50:         { env: 'STRIPE_PRICE_VIDEO_50',         plan: null, mode: 'payment', label: '15 animations (£50)',  pence: 5000,  videoCreditsPence: 5000 },
    video_100:        { env: 'STRIPE_PRICE_VIDEO_100',        plan: null, mode: 'payment', label: '30 animations (£100)', pence: 10000, videoCreditsPence: 10000 },
};
for (const [key, p] of Object.entries(BILLING_PRICES)) {
    const id = process.env[p.env];
    if (id) PRICE_CATALOG[id] = { key, plan: p.plan, credits: 0, mode: p.mode, videoCreditsPence: p.videoCreditsPence || 0 };
}
/** The founding coupons: first five companies (max_redemptions 5) and month-one trial converts (dated). */
const FOUNDING_COUPON = process.env.STRIPE_COUPON_FOUNDING || null;
const MONTH_ONE_COUPON = process.env.STRIPE_COUPON_MONTH_ONE || null;

/**
 * Animation, pay as you go. Business includes ANIMATION_MONTHLY_LIMIT Kling
 * clips a month; beyond that a clip is paid from the video credit balance
 * at these prices (Higgsfield list cost 17 Sep: Kling 2.6 Pro 44p, Seedance
 * 2.5 720p £1.30 per 8s clip). Seedance is priced here but only switched on
 * once HIGGSFIELD_API_KEY is present - see /api/animation/start.
 */
/**
 * Video models through the Higgsfield API (17 Sep 2026), priced per second
 * from Higgsfield's LIST rates (the console shows 30-50% promo rates; plan
 * on list), which set how many animations a clip counts as (below):
 *   Seedance 2.5 image-to-video: token-metered, tokens = s x w x h x 24 /
 *     1024 at $0.0214 per 1,000 -> $0.2056/s at 480p, $0.4625/s at 720p.
 *   Kling 3.0 Pro image-to-video: $0.168/s list for 3-15s clips.
 * USD to GBP at 0.79. The UI always shows the price before the button.
 * HF_CREDENTIALS = "KEY_ID:KEY_SECRET" from the Higgsfield console.
 */
const USD_TO_GBP = 0.79;
const hfReady = () => !!process.env.HF_CREDENTIALS;
const VIDEO_MODELS = {
    seedance: {
        label: 'Seedance 2.5', vendor: 'ByteDance', path: 'bytedance/seedance-2.5/image-to-video',
        minSeconds: 4, maxSeconds: 15, defaultSeconds: 5, resolutions: ['480p', '720p'], defaultResolution: '720p', audio: true,
        costUsdPerSecond: (res) => ((res === '480p' ? 854 * 480 : 1280 * 720) * 24 / 1024) / 1000 * 0.0214,
        available: () => hfReady(),
        blurb: 'The most cinematic. Cuts between shots and close-ups on a prompt.',
    },
    kling: {
        label: 'Kling 3.0 Pro', vendor: 'Kling', path: 'kling-video/v3.0/pro/image-to-video',
        minSeconds: 3, maxSeconds: 15, defaultSeconds: 5, resolutions: ['1080p'], defaultResolution: '1080p', audio: true,
        costUsdPerSecond: () => 0.168,
        // Without Higgsfield credentials Kling still runs on the fal.ai route
        // below, at a fixed 8 seconds - the previous engine.
        available: () => hfReady() || !!process.env.FAL_KEY,
        blurb: 'Sharp, faithful camera moves. The everyday clip.',
    },
};
/**
 * Clips are sold as ANIMATIONS (Charlie, 24 Sep 2026: "14 Seedance clips for
 * £100 is outrageous - I'd rather they have 30"). One animation is £3.33, so
 * the £100 pack is 30 of them, £50 is 15 and £25 is 7. The balance stays in
 * pence, so nothing already bought changes value.
 *
 * A clip is one animation unless it costs us more than ANIMATION_COST_CAP to
 * make, at Higgsfield's LIST rate: then it is two, or three. Pack prices
 * are + VAT since 24 Sep 2026, so an animation brings in the full £3.33 (it
 * was £2.78 when they included VAT); the cap keeps every clip at under 56%
 * of that. In practice: any Kling clip up to 8s, Seedance up to
 * 5s at 720p or 10s at 480p = 1; an 8-10s Seedance 720p = 2 (at 1 it would
 * cost £2.92 of the £3.33 - next to no margin); 15s Seedance 720p = 3.
 * Both figures can be moved with env vars without a deploy of the UI.
 */
const ANIMATION_PENCE = Number(process.env.ANIMATION_PENCE) > 0 ? Math.round(Number(process.env.ANIMATION_PENCE)) : 333;
const ANIMATION_COST_CAP = Number(process.env.ANIMATION_COST_CAP_PENCE) > 0 ? Number(process.env.ANIMATION_COST_CAP_PENCE) : 185;
/** Our list cost of a clip, in pence. */
const videoCostPence = (modelKey, seconds, resolution) =>
    VIDEO_MODELS[modelKey].costUsdPerSecond(resolution) * seconds * USD_TO_GBP * 100;
/** How many animations a clip counts as. */
const videoAnimations = (modelKey, seconds, resolution) =>
    Math.max(1, Math.ceil(videoCostPence(modelKey, seconds, resolution) / ANIMATION_COST_CAP));
/** What the customer pays for a clip, in pence. */
const videoPricePence = (modelKey, seconds, resolution) => videoAnimations(modelKey, seconds, resolution) * ANIMATION_PENCE;
/** The pricing table the UI shows, per model, resolution and length. */
const VIDEO_LENGTHS = [3, 4, 5, 6, 8, 10, 12, 15];
const videoPricing = () => Object.fromEntries(Object.entries(VIDEO_MODELS).map(([k, m]) => {
    const lengths = VIDEO_LENGTHS.filter(s => s >= m.minSeconds && s <= m.maxSeconds);
    return [k, {
        label: m.label, vendor: m.vendor, blurb: m.blurb, available: m.available(), audio: m.audio,
        minSeconds: m.minSeconds, maxSeconds: m.maxSeconds, defaultSeconds: m.defaultSeconds, resolutions: m.resolutions, defaultResolution: m.defaultResolution,
        animationPence: ANIMATION_PENCE,
        // Kept for older clients: the price of a one-second clip.
        pencePerSecond: Object.fromEntries(m.resolutions.map(r => [r, videoPricePence(k, 1, r)])),
        priceFor: Object.fromEntries(m.resolutions.map(r => [r, Object.fromEntries(lengths.map(s => [s, videoPricePence(k, s, r)]))])),
        animationsFor: Object.fromEntries(m.resolutions.map(r => [r, Object.fromEntries(lengths.map(s => [s, videoAnimations(k, s, r)]))])),
    }];
}));

// ---- Higgsfield API (https://api.higgsfield.ai) ---------------------------
const hfHeaders = () => ({ Authorization: `Key ${process.env.HF_CREDENTIALS}`, 'Content-Type': 'application/json' });
/** Inputs must be public URLs: upload the frame to Higgsfield's storage first. */
const hfUpload = async (base64, mime = 'image/jpeg') => {
    const r = await fetch('https://api.higgsfield.ai/files/generate-upload-url', { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ content_type: mime }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.upload_url || !j.public_url) throw new Error('Higgsfield upload URL failed: ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
    const put = await fetch(j.upload_url, { method: 'PUT', headers: { 'Content-Type': mime, ...(j.upload_headers || {}) }, body: Buffer.from(base64, 'base64') });
    if (!put.ok) throw new Error('Higgsfield upload failed: ' + put.status);
    return j.public_url;
};
/** Submit a generation; returns the opaque handle "hf:<request id>". */
const hfStart = async (modelPath, input) => {
    const r = await fetch(`https://api.higgsfield.ai/${modelPath}`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify(input) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.request_id) {
        console.error('[HF] submit failed', r.status, JSON.stringify(j).slice(0, 400));
        throw Object.assign(new Error('The model did not start a video job.'), { detail: j });
    }
    return `hf:${j.request_id}`;
};
const HF_HANDLE_RE = /^hf:[a-zA-Z0-9-]{8,80}$/;
/** Poll: { done:false } or { done:true, uri }. Throws on failed / nsfw / canceled. */
const hfResolve = async (handle) => {
    const id = handle.slice(3);
    const r = await fetch(`https://api.higgsfield.ai/requests/${id}/status`, { headers: hfHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Video status failed: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    const status = String(j.status || '').toLowerCase();
    if (['failed', 'nsfw', 'canceled', 'cancelled'].includes(status)) throw new Error(`Video generation ${status}: ${JSON.stringify(j.error || j.detail || '').slice(0, 200)}`);
    if (status !== 'completed') return { done: false };
    let uri = j.video?.url || j.output?.video?.url || (Array.isArray(j.videos) && j.videos[0]?.url) || j.result?.video?.url;
    if (!uri) {
        // Some models hand the output back from the result endpoint instead.
        const rr = await fetch(`https://api.higgsfield.ai/requests/${id}/result`, { headers: hfHeaders() });
        const res = await rr.json().catch(() => ({}));
        uri = res.video?.url || res.output?.video?.url || (Array.isArray(res.videos) && res.videos[0]?.url);
        if (!uri) throw new Error('Video finished but no file was returned: ' + JSON.stringify(res).slice(0, 200));
    }
    return { done: true, uri };
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
/**
 * PASS 2 - MATERIALS AND LIGHTING, on the pro image model.
 *
 * The two image models split the job between them. flash-image is faithful:
 * handed a flat configurator view it reproduces the building exactly, but its
 * surfaces stay a little flat - "the configurator textures dropped into a
 * rendered garden", as Charlie put it. The pro model is the better materials
 * artist, but handed that SAME flat view it re-composes the building (the
 * 25 Aug regression). Handed a finished photoreal render instead, it has
 * nothing left to interpret: in the 4 Sep A/B it kept every edge and upgraded
 * the surfaces. So pass 1 locks the geometry, pass 2 finishes it, and the QA
 * inspection runs on pass 2 against the ORIGINAL source - any drift and pass
 * 1 is what ships.
 */
const MATERIALS_PASS_PROMPT = `
      YOU ARE A MATERIALS AND LIGHTING FINISHING PASS - NOT A DESIGNER.
      The input is an already-correct architectural render. Its geometry, camera,
      every edge, every opening, every proportion and the exact framing are FINAL
      and are not yours to touch. Treat the image as a locked 3D scene that has
      been rendered once at draft quality: your only job is to re-render its
      SURFACES at flagship offline quality - Blender Cycles / V-Ray with a
      professional CGI artist's material library.

      PIXEL-LEVEL GEOMETRY LOCK: every edge in the output sits exactly where it
      sits in the input. Same building length, height and depth; same door and
      window count, size and position; same roof line and fascia depth; same
      decking outline; same camera and crop. Do not move, add, remove, resize or
      restyle ANYTHING. If you are unsure whether something is geometry or
      material, leave it exactly as it is.

      UPGRADE ONLY THESE, KEEPING EACH ITEM'S COLOUR AND TYPE:
      - Cladding: real composite/timber board relief - visible grain, the shadow
        line in every board groove, subtle tonal variation board to board, correct
        roughness and soft sheen. Same colour family as the input, never shifted.
      - Fascia and frames: crisp powder-coated aluminium with a fine edge highlight
        and correct reflectance. Same colour as the input.
      - A solid door stays a SOLID, FLUSH, PLAIN door: no raised panels, no
        mouldings, no glazing, no letterbox, no change of handle. Glazed doors
        stay glazed with the same leaf count and bar pattern.
      - NO RESTYLING OF ANY KIND: no added trims, panels, lights, house numbers,
        planters, furniture, steps or canopies. Nothing that is not in the input.
      - Glass: real reflections of the garden and sky, slight refraction, a dim
        interior visible through it.
      - Decking and paving: individual boards or slabs with grain and joints, and a
        contact shadow where the building meets them.
      - Lighting: physically based sun and sky, ambient occlusion in every reveal,
        recess and under the fascia; soft contact shadows on the ground.
      - Surroundings: keep the same garden, fence, planting and sky; only their
        material realism may improve.

      FINAL OUTPUT: indistinguishable from a top-tier archviz still, immaculate
      new materials (no dirt, weathering or damage), and geometrically identical
      to the input at every pixel.
`;

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

      LIGHTING - EDITORIAL, NOT OVERCAST:
      - Late golden hour into early dusk: a low, warm sun from the side, long soft
        shadows across the lawn, the sky graded from warm near the horizon to a
        cool clear blue above. This is the light a magazine would shoot in.
      - INTERIOR LIGHTS ON: a warm glow through every pane of glazing. Any soffit
        downlights, wall lights or external fittings on the building are lit and
        casting their own soft pools.
      - NOTHING INVENTED INSIDE OR ON THE BUILDING: the interior shows exactly
        what the source shows and nothing more. If the source room is empty it
        stays empty, warmly lit. Do not add furniture, lamps, rugs, art, plants,
        curtains or people indoors, and do not add benches, chairs, tables,
        parasols, bikes or any garden furniture outside. Furniture and fittings
        that ARE in the source are kept exactly as placed.
      - No blown highlights, no crushed blacks; warm and cool balanced, the
        building still reading at its true material colour.
      - Gentle ambient occlusion under the eaves, soffits and decking edge, and a
        believable contact shadow where the structure meets the ground.

      COMPOSITION & CONTEXT - A DESIGNED GARDEN:
      - A mature, designed UK rear garden, styled like an editorial photograph
        rather than a builder's yard: a neatly mown lawn; layered borders of
        ornamental grasses, hydrangeas, lavender and evergreen shrubs; one or
        two planted pots by the doors; a pebble or paving margin where lawn meets
        building; a timber fence or hedge behind; mature trees and neighbouring
        rooflines softening the edges. PLANTING IS THE ONLY DRESSING: no
        furniture, lighting or objects that are not in the source. Everything
        looks installed and tended. Styled, not cluttered: nothing competes with
        the building.
      - The building occupies the majority of the frame with comfortable breathing
        space. Not a wide landscape shot. THIS NEVER JUSTIFIES MOVING THE CAMERA:
        when the source image establishes a viewpoint, its exact framing wins -
        render the scene as composed, never zoomed, cropped or re-angled.
      - Horizon level, verticals true, no wide-angle distortion or converging walls.

      FINISH:
      - Warm, natural, true-to-life colour grade - the materials read at their
        real colour under real evening light. No oversaturation, no HDR halos, no
        heavy vignette, no lens flare.
      - Crisp micro-texture: timber grain, board joints, glass reflections, grass blades.
      - Presentation condition: every material newly installed, clean and true. No
        moss, staining or weathering - this is a marketing visual.
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
/** The full 3D configurator (interiors, kitchens, walkthrough, saving, send
 *  to render). 20 Sep 2026: the Configurator plan ('standard') is here - the
 *  full configurator IS that plan; what it lacks is the AI tools. */
const FULL_CONFIG_PLANS = new Set(['standard', 'business', 'master', 'tester', 'beta']);
/** Floor Plan Studio (18 Sep 2026): The Hub only, each plan spends a render. */
const FLOOR_PLAN_PLANS = new Set(['business', 'master']);
/**
 * Plans that may generate images at all: the Render Engine, material
 * close-ups, Line Converter, Weather Lab and Floor Plan Studio.
 *
 * The Configurator plan ('standard') is deliberately absent (Charlie, 20 Sep
 * 2026): at £49.99 it is the 3D configurator, projects and PDFs, with no AI
 * generation of any kind. The trial has the tools so a prospect can judge the
 * output; The Hub has them with the 250-a-month allowance. The render
 * allowance check below refuses this plan outright, and the entitlement is
 * sent to the client so the tool pages can show the upgrade screen instead
 * of a failed render.
 *
 * Written as the plans WITHOUT the tools rather than a list of those with
 * them, so an unexpected plan value keeps the behaviour it had before (it
 * falls through to the credit-balance path, which refuses at zero).
 */
const NO_RENDER_TOOL_PLANS = new Set(['standard']);
const canUseRenderTools = (plan) => !NO_RENDER_TOOL_PLANS.has(plan);

/**
 * Video generation settings.
 *
 * Veo 3.1 Fast at 1080p, chosen 26 Aug 2026 over the previous
 * gemini-omni-flash-preview, which only ever returned 720p and looked soft.
 *
 * The tier matters financially. Published Gemini API rates:
 *   Veo 3.1 Standard  $0.40/sec  -> an 8s clip is ~£2.53
 *   Veo 3.1 Fast      $0.12/sec  -> an 8s clip is ~£0.76
 * Fast at 1080p therefore costs about the same as the old 720p model (~£0.80 a
 * clip) while doubling the resolution - a free quality upgrade. Standard is
 * 3.3x the agreed animation budget, so it is a deliberate choice, not a
 * default: switching ANIMATION_MODEL to 'veo-3.1-generate-preview' triples the
 * worst-case bill for every Business subscriber. Multiply before changing it.
 *
 * Unlike the old model, Veo honours durationSeconds (the previous one always
 * returned ~10s regardless) and supports negative prompts.
 */
const ANIMATION_MODEL = 'veo-3.1-fast-generate-preview';
const ANIMATION_RESOLUTION = '1080p';

/**
 * The model that LOOKS at images and answers in JSON: material detection,
 * scene description, exterior details, the solid-door inspector, planning
 * advice. Moved from the gemini-pro-latest alias (Gemini 3.1 Pro, frozen
 * since February) to Gemini 3.8 Flash on 15 Sep 2026: it scores higher on
 * 4 of 5 shared benchmarks and #4 of 53 on vision evals, at $0.75/$3.75
 * per 1M tokens against Pro's $2/$12. Pinned by id, not an alias, so a
 * swap under our feet cannot change results the way the alias did. The
 * per-render fidelity inspector stays on 3.5 Flash-Lite - it runs two or
 * three times a render and Lite is the cheapest thing that does the job.
 */
const ANALYSIS_MODEL = 'gemini-3.8-flash';
const ANIMATION_SECONDS = 8;

/**
 * Which model animates.
 *
 * Kling O3 Pro through fal.ai's queue API, decided 15 Sep 2026 after a
 * like-for-like A/B against Veo 3.1 Fast on the same render: both held the
 * building, Kling committed to the camera move where Veo barely moved, and
 * the price is the same (~$0.11/s at 1080p without audio, ~90p a clip).
 * Needs FAL_KEY on the server; without it the Veo path above still runs,
 * so a missing key degrades rather than blanks the studio. ANIMATION_ENGINE=veo
 * forces Veo for a comparison. Handles stay opaque to the client: a Veo job
 * is "models/.../operations/...", a Kling job is "kling:<request id>", and
 * /status and /video read the prefix to know which service to ask.
 */
const ANIMATION_ENGINE = (process.env.FAL_KEY && process.env.ANIMATION_ENGINE !== 'veo') ? 'kling' : 'veo';
// Kling O3 Pro at 1080p: newer than v3 Pro at the same $0.112/s without
// audio. The 4K variants cost $0.42/s and are not this. Override with
// KLING_MODEL_ID to try another endpoint without a code change.
const KLING_MODEL_ID = process.env.KLING_MODEL_ID || 'fal-ai/kling-video/o3/pro/image-to-video';
const KLING_LABEL = KLING_MODEL_ID.replace('fal-ai/kling-video/', 'kling-').split('/').join('-');
const falHeaders = () => ({ Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' });

/** Start a Kling clip; returns the opaque handle. */
const klingStart = async ({ base64Image, prompt, negativePrompt, aspectRatio }) => {
    const r = await fetch(`https://queue.fal.run/${KLING_MODEL_ID}`, {
        method: 'POST',
        headers: falHeaders(),
        body: JSON.stringify({
            // O3 takes image_url (v3 called it start_image_url).
            image_url: `data:image/jpeg;base64,${base64Image}`,
            prompt,
            negative_prompt: negativePrompt,
            duration: String(ANIMATION_SECONDS),
            // A garden room has nothing to say; audio only adds cost and a
            // soundtrack nobody asked for.
            generate_audio: false,
            cfg_scale: 0.5,
            aspect_ratio: aspectRatio,
        }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.request_id) {
        console.error('[KLING] submit failed', r.status, JSON.stringify(json).slice(0, 400));
        throw new Error('The model did not start a video job.');
    }
    return `kling:${json.request_id}`;
};

const KLING_HANDLE_RE = /^kling:[a-zA-Z0-9-]{8,80}$/;

/** Kling status: { done } or, when finished, { done: true, uri }. Throws on failure. */
const klingResolve = async (handle) => {
    const id = handle.slice('kling:'.length);
    // Status and result live under the APP (owner/app), not the full model
    // path - "fal-ai/kling-video", with "/o3/pro/image-to-video" being a
    // route within it. The full path 405s.
    const app = KLING_MODEL_ID.split('/').slice(0, 2).join('/');
    const st = await fetch(`https://queue.fal.run/${app}/requests/${id}/status`, { headers: falHeaders() });
    const status = await st.json().catch(() => ({}));
    if (!st.ok) throw new Error(`Video status failed: ${st.status} ${JSON.stringify(status).slice(0, 200)}`);
    if (status.status !== 'COMPLETED') return { done: false };
    // The result lives at the response_url the status hands back (the bare
    // request URL - a "/response" suffix 405s). Taken from fal, checked to
    // be fal, never built here.
    const responseUrl = String(status.response_url || '');
    if (!responseUrl.startsWith('https://queue.fal.run/')) throw new Error(`Video result URL unexpected: ${responseUrl.slice(0, 80)}`);
    const rs = await fetch(responseUrl, { headers: falHeaders() });
    const result = await rs.json().catch(() => ({}));
    const uri = result?.video?.url;
    if (!rs.ok || !uri) throw new Error(`Video generation failed: ${JSON.stringify(result?.detail || result).slice(0, 300)}`);
    return { done: true, uri };
};

/**
 * Animations per calendar month, per account.
 *
 * This number is a BUDGET, not a product decision. At the settings above an 8s
 * clip is roughly £0.76, so ten of those is about £7.60 a month - the ceiling
 * agreed in the Aug 2026 launch plan (cut from 15 as a cost control; animation
 * is still the largest single line item on a Business account).
 *
 * Business is otherwise an unlimited plan, so if you raise this you are raising
 * the worst-case bill for every subscriber simultaneously. Multiply before
 * changing it.
 */
const ANIMATION_MONTHLY_LIMIT = 3; // 17 Sep 2026: three included Kling clips a month on Business, then video credits

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
 * Claim one 4K export from this month's allowance. Same transactional shape as
 * claimAnimation, for the same reason: concurrent requests must not all pass
 * the same read.
 */
const claimFourKExport = async (uid) => {
    if (!db) return { allowed: true, remaining: FOUR_K_EXPORTS_PER_MONTH };

    const userRef = db.collection('users').doc(uid);
    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : {};
            const period = currentPeriod();
            const used = data.fourKPeriod === period ? (data.fourKUsed || 0) : 0;

            if (used >= FOUR_K_EXPORTS_PER_MONTH) {
                return {
                    allowed: false,
                    status: 402,
                    error: `You have used all ${FOUR_K_EXPORTS_PER_MONTH} 4K exports for this month. Your allowance resets on the 1st. Renders continue at 2K as normal.`,
                };
            }

            transaction.set(userRef, {
                fourKPeriod: period,
                fourKUsed: used + 1,
            }, { merge: true });

            return { allowed: true, remaining: FOUR_K_EXPORTS_PER_MONTH - (used + 1) };
        });
    } catch (e) {
        console.error('[4K EXPORT] Quota check failed for uid:', uid, '|', e.message || e);
        // Fail closed - a database blip must not become unmetered 4K generation.
        return { allowed: false, status: 503, error: '4K export temporarily unavailable. Please try again shortly.' };
    }
};

/** Hand back a 4K export that was claimed but never generated. */
const releaseFourKExport = async (uid) => {
    if (!db) return;
    try {
        const userRef = db.collection('users').doc(uid);
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : {};
            if (data.fourKPeriod !== currentPeriod()) return;
            const used = data.fourKUsed || 0;
            if (used > 0) transaction.set(userRef, { fourKUsed: used - 1 }, { merge: true });
        });
    } catch (e) {
        console.error('[4K EXPORT] Refund failed for uid:', uid, '|', e.message || e);
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
/**
 * Camera moves. Written for Kling (15 Sep 2026), which does what it is
 * told: the old Veo wording - "almost imperceptibly closer", "only slightly
 * nearer" - came back as a clip in which nothing moved at all. Each move is
 * now a real, visible move, still smooth and slow, and the framing rule
 * (same angle, same side of the building) is stated with it.
 */
const ANIMATION_PRESETS = {
    push_in: 'CAMERA: a slow, steady push-in on a motorised slider, moving smoothly towards the building for the whole clip so it is noticeably closer and larger in frame by the end. The camera angle and the side of the building in view never change; it moves straight forward, never tilts, never cuts.',
    pan: 'CAMERA: a slow, even sideways tracking move on a motorised slider, gliding across the scene at one constant pace for the whole clip, the building sliding smoothly through the frame. Same height, same angle, no tilt, no cut.',
    orbit: 'CAMERA: a slow, smooth arc around the building at a constant distance, travelling far enough that the perspective visibly changes while the same face of the building stays in view. No tilt, no cut.',
    still: 'CAMERA: locked off on a tripod, perfectly still for the whole clip. All the movement is in the scene: wind, sky, light and wildlife.',
};

const ANIMATION_MODIFIERS = {
    motion_blur: 'Subtle natural motion blur consistent with a real cinema camera at a 180 degree shutter angle.',
    breeze: 'A stronger breeze: the trees and shrubs sway visibly, grass ripples in waves across the lawn, leaves flutter and a few drift loose, every plant staying rooted where it grows.',
    golden_hour: 'Warm low golden-hour sunlight with long soft shadows.',
    people: 'A person walks slowly through the scene in the distance, small in frame and out of focus.',
};

/**
 * The life every clip has, whether or not a modifier asks for more. Without
 * this the lock below reads as "hold still", and a still is not an
 * animation: the garden should look like a real place on a real day.
 */
const ANIMATION_AMBIENT_MOTION =
    'LIVING SCENE: the garden is alive. Leaves and branches move gently in a light wind, grass and long planting sway, ornamental grasses nod. ' +
    'Clouds drift slowly across the sky. A few small birds fly across the far distance. ' +
    'Light plays on the glazing - soft reflections of the moving trees and sky in the windows and doors. ' +
    'Shadows soften and shift almost imperceptibly as the light changes. The movement is natural, continuous and gentle, never a gust, never a cut.';

/** Scene lock, stated twice on purpose.
 *
 *  The clip generator was observed redesigning the scene mid-clip (new
 *  planting, altered building) even with a single fidelity sentence present.
 *  Two measures against that: the lock is much more explicit about WHAT is
 *  fixed (building, garden, every object's position, sky, lighting), and it is
 *  repeated AFTER the user's free-text — the model weights the end of a prompt
 *  heavily, so user wording can otherwise drown out an opening-only lock.
 *  Phrased entirely positively: this model does not honour "do not" wording. */
/**
 * The lock is on the BUILDING and the layout, not on the scene as a whole.
 * The earlier wording locked "every plant in exactly the same place, under
 * the same sky and the same lighting" and asked that any paused frame match
 * the source - which is a request for a photograph, and Kling obliged.
 */
const ANIMATION_SCENE_LOCK_OPENING =
    'BUILDING LOCK: the garden room is a real, finished building and stays exactly as the source image shows it in every frame - ' +
    'the same geometry, proportions, roof, cladding, doors, windows and colours, with nothing added, removed, moved or restyled. ' +
    'Paths, fences, walls, furniture and planting stay where they are; only the camera and natural motion change.';
const ANIMATION_SCENE_LOCK_CLOSING =
    'The building never changes; the garden around it breathes. No cuts, no scene changes, one continuous shot.';

/**
 * What must never appear. Veo honours negative prompts; the previous model did
 * not, which is why the locks above are phrased entirely positively. Keep both:
 * the positive lock still does the heavy lifting, and this closes off the
 * specific failures a generative video model reaches for - redesigning the
 * building, growing the scene, or drifting into a different shot.
 */
const ANIMATION_NEGATIVE_PROMPT = [
    'changing the building',
    'new or altered windows, doors, cladding or roof',
    'different building proportions',
    'added or removed structures, furniture, planting or vehicles',
    'the camera cutting to a different shot',
    'text, captions, watermarks or logos',
    'distorted or warping geometry',
    'people walking through the building',
].join(', ');

/** Assemble the final prompt. Order matters: subject, then scene lock, then
 *  camera, then atmosphere, then the user's text, then the scene lock again so
 *  it is the last instruction the model reads. */
const buildAnimationPrompt = (preset, modifiers, extra) => {
    // Order matters to Kling: what should MOVE comes before what must not.
    const parts = [
        'Cinematic architectural film of this garden room on a calm summer day, filmed on a full-frame cinema camera.',
        ANIMATION_PRESETS[preset] || ANIMATION_PRESETS.push_in,
        ANIMATION_AMBIENT_MOTION,
    ];
    for (const m of modifiers) {
        if (ANIMATION_MODIFIERS[m]) parts.push(ANIMATION_MODIFIERS[m]);
    }
    if (extra) parts.push('DIRECTOR\x27S NOTES: ' + extra);
    parts.push(ANIMATION_SCENE_LOCK_OPENING);
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

/**
 * Open beta (14 Sep 2026, Charlie's call): every signed-in account with a
 * confirmed email is a beta member - no access code, no allowlist entry.
 * Members are metered exactly like the hand-allowlisted testers
 * (TESTER_RENDERS renders in TESTER_DAYS days, 4K exports and animations on
 * their own monthly counters). A paid plan on the user's document always
 * wins, so a Standard or Business customer is never counted as a tester.
 * Master accounts are handled before this is ever consulted.
 */
const PAID_PLANS = new Set(['standard', 'business', 'master']);
const hasPaidPlan = async (uid) => {
    if (!db || !uid) return false;
    try {
        const snap = await db.collection('users').doc(uid).get();
        return snap.exists && PAID_PLANS.has(snap.data().plan);
    } catch (e) {
        console.error('[BETA] Plan lookup failed for uid:', uid, '|', e.message || e);
        return false;
    }
};
const isOpenBetaUser = async (user) => {
    if (!user || isMasterUser(user)) return false;
    if (user.beta !== true && user.email_verified !== true) return false;
    return !(await hasPaidPlan(user.uid));
};

// Tester allowance. 40 renders is roughly £5 of 4K image generation at current
// Gemini rates, which is the budget agreed per tester.
const TESTER_RENDERS = 40;
/** ...and no more than this many of them in one UTC day, so a trial cannot
 *  be emptied in an hour (Charlie, 17 Sep 2026). */
const TESTER_RENDERS_PER_DAY = 10;

/** Configurator plan ('standard'): renders per calendar month. Zero since the
 *  20 Sep 2026 restructure - the plan has no AI tools (RENDER_TOOL_PLANS). */
const STANDARD_RENDERS_PER_MONTH = 0;
const TESTER_DAYS = 7;
/** Business: renders per calendar month (17 Sep 2026: 250, alongside the
 *  daily ceiling below). Every generated image counts as one. */
const BUSINESS_RENDERS_PER_MONTH = 250;

/**
 * Business fair-use ceiling: renders per UTC day.
 *
 * "Unlimited" stays on the pricing page and stays true for real work - this
 * exists so one account cannot script the render endpoint into an unbounded
 * bill. At 25/day entirely on the expensive model the worst case is a known,
 * survivable number, and the counter resets overnight so nobody is ever
 * locked out for long. Master accounts are exempt.
 */
const BUSINESS_RENDERS_PER_DAY = 25;

/**
 * 4K exports per calendar month.
 *
 * Every tool GENERATES at 2K (same fidelity, half the price on the flagship
 * model - 4K buys pixels, not quality). 4K exists only as this metered
 * per-image export for the finals a client actually receives. 100 x 19p caps
 * the plan's 4K exposure at ~£19/month permanently. Like the animation
 * allowance this is a cost ceiling, not an entitlement, so it applies to
 * master accounts too.
 */
const FOUR_K_EXPORTS_PER_MONTH = 50; // 17 Sep 2026: 50, keeps Business above a 50% worst-case margin

/** Plans that may export 4K. Business feature; tester/beta included because
 *  evaluating output quality is the point of tester access, and the monthly
 *  counter bounds the spend either way. */
const FOUR_K_PLANS = new Set(['business', 'master', 'tester', 'beta']);

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
                return { success: false, balance: currentCredits, error: "4K Ultra HD requires The Hub" };
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
                return { allowed: false, error: 'Your 24-hour trial has ended. Upgrade to The Hub to continue rendering.' };
            }

            const rendersUsed = data.trialRendersUsed || 0;

            if (rendersUsed >= RENDERS_PER_DAY) {
                return { allowed: false, error: 'Trial limit reached (5 renders). Upgrade to The Hub for 250 renders a month.' };
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
            const dayKey = new Date().toISOString().slice(0, 10);
            const usedToday = (data?.testerDay === dayKey ? data?.testerDayUsed : 0) || 0;

            if (now >= expiresAt) {
                return { allowed: false, status: 402, error: `Your ${TESTER_DAYS}-day tester access has ended.` };
            }
            if (used >= TESTER_RENDERS) {
                return { allowed: false, status: 402, error: `Tester limit reached (${TESTER_RENDERS} renders).` };
            }
            if (usedToday >= TESTER_RENDERS_PER_DAY) {
                return { allowed: false, status: 402, error: `That's ${TESTER_RENDERS_PER_DAY} renders today, the trial's daily limit. It resets at midnight, with ${TESTER_RENDERS - used} of your ${TESTER_RENDERS} still to use.` };
            }

            transaction.set(userRef, {
                plan: 'tester',
                testerStartedAt: startedAt,
                testerExpiresAt: expiresAt,
                testerRendersUsed: used + 1,
                testerDay: dayKey,
                testerDayUsed: usedToday + 1,
            }, { merge: true });

            return { allowed: true, rendersLeft: TESTER_RENDERS - (used + 1) };
        });
    } catch (e) {
        console.error('[TESTER] Check failed:', e.message || e);
        return { allowed: false, status: 503, error: 'Render service temporarily unavailable. Please try again shortly.' };
    }
};

/**
 * Business fair-use: claim one render from today's allowance. Same transactional
 * counter as the tester one, keyed on the UTC day so it resets overnight
 * rather than on the 1st. This is an abuse ceiling, not a meter - see
 * BUSINESS_RENDERS_PER_DAY.
 */
const checkBusinessRender = async (user) => {
    if (!db) return { allowed: true };
    const userRef = db.collection('users').doc(user.uid);
    const dayKey = new Date().toISOString().slice(0, 10); // e.g. "2026-08-26"
    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.exists ? snap.data() : null;
            const used = (data?.businessDay === dayKey ? data?.businessRendersUsed : 0) || 0;
            const monthKey = dayKey.slice(0, 7);
            const usedMonth = (data?.businessMonth === monthKey ? data?.businessMonthRendersUsed : 0) || 0;
            if (usedMonth >= BUSINESS_RENDERS_PER_MONTH) {
                return { allowed: false, status: 402, error: `You've used all ${BUSINESS_RENDERS_PER_MONTH} renders in The Hub this month. Your allowance resets on the 1st.` };
            }
            if (used >= BUSINESS_RENDERS_PER_DAY) {
                return { allowed: false, status: 402, error: `You've reached today's ceiling of ${BUSINESS_RENDERS_PER_DAY} renders. It resets at midnight, with ${BUSINESS_RENDERS_PER_MONTH - usedMonth} of this month's ${BUSINESS_RENDERS_PER_MONTH} still to use.` };
            }
            transaction.set(userRef, {
                businessDay: dayKey,
                businessRendersUsed: used + 1,
                businessMonth: monthKey,
                businessMonthRendersUsed: usedMonth + 1,
            }, { merge: true });
            return { allowed: true, rendersLeft: BUSINESS_RENDERS_PER_MONTH - (usedMonth + 1), rendersLeftToday: BUSINESS_RENDERS_PER_DAY - (used + 1) };
        });
    } catch (e) {
        console.error('[BUSINESS] Fair-use check failed:', e.message || e);
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
    if (isTesterUser(req.user) || await isOpenBetaUser(req.user)) {
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

    // Unlimited plans render without metering - but 'business' carries the
    // daily fair-use ceiling. Analysis rides free (every upload triggers one
    // automatically, same reasoning as testers and Standard). A Firestore doc
    // stamped plan:'master' stays truly unmetered, matching the UID allowlist
    // path above.
    if (UNLIMITED_PLANS.has(userPlan)) {
        if (userPlan === 'business' && creditCost !== CREDIT_COSTS.ANALYSIS) {
            const fairUse = await checkBusinessRender(req.user);
            if (!fairUse.allowed) {
                return { allowed: false, status: fairUse.status || 402, body: { error: fairUse.error } };
            }
            return { allowed: true, unlimited: true, plan: userPlan, rendersLeft: fairUse.rendersLeft };
        }
        return { allowed: true, unlimited: true, plan: userPlan };
    }

    /**
     * Configurator plan ('standard'): no AI generation at all (20 Sep 2026).
     * Refused here, at the one gate every image endpoint passes through, so
     * a client that shows the tool anyway still cannot spend money. The
     * client reads `canUseRenderTools` and shows the upgrade screen first.
     */
    if (!canUseRenderTools(userPlan)) {
        return {
            allowed: false,
            status: 403,
            body: {
                error: 'AI rendering is not part of the Configurator plan. Upgrade to The Hub for 250 renders a month and every studio tool.',
                upgradeRequired: true,
            },
        };
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

/**
 * Cost log - one small fire-and-forget document per billable image call. A
 * month of these answers the real cost-per-render question (Google billing /
 * count by model+size) and shows whether any account's usage is out of line,
 * without slowing the response down. EVERY endpoint that generates an image
 * must call this - blended cost cannot be measured from the flagship model
 * alone.
 */
const logRender = (req, endpoint, model, imageSize, extra = {}) => {
    if (!db) return;
    db.collection('renderLog').add({
        uid: req.user?.uid || 'unknown',
        endpoint,
        model,
        imageSize,
        ...extra,
        ts: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(e => console.warn('[COSTLOG] write failed:', e.message || e));
};

/* ------------------------------------------------------------------------
 * GPT Image 2.5 Sunburst - the one model that draws every image in the app.
 *
 * Decided 15 Sep 2026 after the leaderboards (LMArena Image Edit, Artificial
 * Analysis Editing) put Sunburst first for image EDITING - which is what a
 * render is here: keep the building, finish its surfaces. It replaces the
 * two-pass Gemini path (flash-image, then a Pro polish that was quietly
 * dropped whenever the fidelity check disliked it) for renders, edits,
 * weather, the material board, the line converter and the 4K export. The
 * Gemini code stays as the fallback ONLY when OPENAI_API_KEY is absent, so a
 * missing key degrades rather than blanks the site.
 *
 * QUALITY is the user's choice - high, xhigh ("Ultra") or max - and is
 * checked here, never trusted from the client: max is Business (and master)
 * only, anyone else asking for it gets xhigh. Cost is per output token, so
 * the tiers price roughly 1 : 2 : 4 at 2K; the returned usage goes into the
 * render log so real costs are on record rather than estimated.
 * ---------------------------------------------------------------------- */
const OPENAI_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
const IMAGE_QUALITIES = new Set(['high', 'xhigh', 'max']);
const MAX_QUALITY_PLANS = new Set(['business', 'master']);
const OPENAI_MAX_PIXELS = 8_294_400; // 3840 x 2160; the API's ceiling

const openAiReady = () => !!process.env.OPENAI_API_KEY;

/** The tier this request runs at: what was asked for, clamped to the plan. */
const resolveImageQuality = async (req) => {
    const asked = IMAGE_QUALITIES.has(req.body?.quality) ? req.body.quality : 'high';
    if (asked !== 'max') return { quality: asked, clamped: false };
    const plan = await resolveEffectivePlan(req);
    if (MAX_QUALITY_PLANS.has(plan)) return { quality: 'max', clamped: false };
    return { quality: 'xhigh', clamped: true };
};

/**
 * Output size for an aspect ratio at a given long edge. Edges must be
 * multiples of 16 and the total must stay under the API's pixel ceiling, so
 * a 4K square or 4:3 is scaled down rather than refused.
 */
const openAiSizeFor = (ratio, longEdge = 2048) => {
    const [rw, rh] = (String(ratio || '16:9').match(/^(\d+):(\d+)$/) || [null, 16, 9]).slice(1).map(Number);
    let w = rw >= rh ? longEdge : Math.round(longEdge * rw / rh);
    let h = rw >= rh ? Math.round(longEdge * rh / rw) : longEdge;
    if (w * h > OPENAI_MAX_PIXELS) {
        const k = Math.sqrt(OPENAI_MAX_PIXELS / (w * h));
        w = Math.floor(w * k); h = Math.floor(h * k);
    }
    const snap = (v) => Math.max(256, Math.floor(v / 16) * 16);
    return `${snap(w)}x${snap(h)}`;
};

/** The usage fields worth keeping against a render. */
const openAiUsageLog = (usage) => usage ? {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
} : {};

/** Turn an OpenAI refusal into words the user can act on, or null. */
const openAiRefusal = (status, json) => {
    const msg = String(json?.error?.message || '');
    if (/verified/i.test(msg)) return 'OpenAI needs the organisation verified before the GPT Image 2.5 models will answer: platform.openai.com, Settings, Organization, Verify Organization. Allow up to 15 minutes after verifying.';
    if (status === 429 || /quota|billing|balance/i.test(msg)) return 'The image service is out of credit or being rate limited. Please try again in a few minutes.';
    if (status === 401) return 'The image service rejected the server\'s API key. Check OPENAI_API_KEY on the server.';
    if (/safety|policy|moderation/i.test(msg)) return 'The image service declined this request on content grounds. Try different wording or a different source image.';
    return null;
};

/**
 * One Sunburst edit: the prompt plus one or more input images, returning
 * base64 JPEG and the usage. Throws with a clientMessage on a refusal the
 * user can do something about; returns { b64: null } when the model simply
 * produced nothing.
 */
const openAiImageEdit = async ({ prompt, images, size, quality, label = 'edit', mask = null }) => {
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    for (const [i, img] of images.entries()) {
        const mime = img.mime || 'image/jpeg';
        form.append(images.length > 1 ? 'image[]' : 'image', new Blob([Buffer.from(img.b64, 'base64')], { type: mime }), `input-${i}.${mime === 'image/png' ? 'png' : 'jpg'}`);
    }
    // A real inpainting mask: a PNG the size of the (single) input whose
    // TRANSPARENT pixels are the only ones the model may paint. Distinct from
    // passing a mask as a second reference image, which the model merely
    // looks at.
    if (mask) form.append('mask', new Blob([Buffer.from(mask, 'base64')], { type: 'image/png' }), 'mask.png');
    form.append('size', size);
    form.append('quality', quality);
    form.append('output_format', 'jpeg');
    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error(`[OPENAI] ${label} failed`, r.status, JSON.stringify(json).slice(0, 500));
        const clientMessage = openAiRefusal(r.status, json);
        if (clientMessage) throw Object.assign(new Error('openai refused: ' + r.status), { clientMessage });
        return { b64: null, usage: null };
    }
    console.log(`[OPENAI] ${label} ${quality} ${size} in ${((Date.now() - t0) / 1000).toFixed(1)}s`, json?.usage ? JSON.stringify(json.usage) : '');
    return { b64: json?.data?.[0]?.b64_json || null, usage: json?.usage || null };
};

/** Text-to-image on the same model, for the line converter's no-source mode. */
const openAiImageGenerate = async ({ prompt, size, quality, label = 'generate' }) => {
    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size, quality, output_format: 'jpeg', n: 1 }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error(`[OPENAI] ${label} failed`, r.status, JSON.stringify(json).slice(0, 500));
        const clientMessage = openAiRefusal(r.status, json);
        if (clientMessage) throw Object.assign(new Error('openai refused: ' + r.status), { clientMessage });
        return { b64: null, usage: null };
    }
    console.log(`[OPENAI] ${label} ${quality} ${size} in ${((Date.now() - t0) / 1000).toFixed(1)}s`, json?.usage ? JSON.stringify(json.usage) : '');
    return { b64: json?.data?.[0]?.b64_json || null, usage: json?.usage || null };
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
console.log("IMAGE ENGINE:", openAiReady() ? `${OPENAI_IMAGE_MODEL} (OPENAI_API_KEY present)` : "Gemini fallback - OPENAI_API_KEY MISSING, add it on Render");
console.log("ANIMATION ENGINE:", ANIMATION_ENGINE === 'kling' ? `${KLING_LABEL} via fal.ai` : `${ANIMATION_MODEL} - Veo fallback, FAL_KEY MISSING, add it on Render`);

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
        // Video credit packs: a one-off payment that tops up the video balance
        // (pence) and grants no plan.
        let videoCreditsPence = parseInt(object.metadata?.videoCreditsPence || "0") || 0;
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
                    if (videoCreditsPence > 0) {
                        update.videoCreditsPence = admin.firestore.FieldValue.increment(videoCreditsPence);
                        update.videoCreditsBoughtAt = admin.firestore.FieldValue.serverTimestamp();
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

    // Open beta: any account with an email may come in once that email is
    // confirmed. The beta claim is kept for accounts that redeemed a code
    // before the beta opened.
    if (req.user?.beta === true || req.user?.email) {
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
/**
 * Contents that take a building outside "incidental to the enjoyment of the
 * dwellinghouse", which is the Class E use test.
 *
 * A bed is the decisive one: sleeping accommodation is not incidental at ANY
 * height, so it fails Class E outright no matter how low the roof is. That is
 * why this returns a hard fail rather than a caution - a design with a bed in
 * it is an annexe and needs permission, and telling someone "amber, check your
 * siting" about it would be wrong in a way that costs them money.
 *
 * A wardrobe alone is not decisive (a studio can have storage), but a shower
 * and a toilet and a kitchen together describe somewhere you can live
 * independently, which is the other way schemes fail this test.
 */
const assessIncidentalUse = (contents) => {
    const has = (t) => Array.isArray(contents) && contents.includes(t);
    if (has('bed')) {
        return { incidental: false, reason: 'The design contains a bed. Sleeping accommodation is not incidental use, so this falls outside permitted development at any height.' };
    }
    const wet = (has('shower') ? 1 : 0) + (has('toilet') ? 1 : 0);
    if (wet === 2 && has('kitchen_island')) {
        return { incidental: false, reason: 'The design has a shower, a toilet and a kitchen. Together those describe self-contained living accommodation rather than incidental use.' };
    }
    if (wet === 2) {
        return { incidental: 'unknown', reason: 'The design has both a shower and a toilet. A cloakroom is usually fine, but combined with sleeping or cooking space it reads as an annexe - worth confirming.' };
    }
    return { incidental: true, reason: 'Nothing in the design implies sleeping or self-contained living accommodation.' };
};

const pdVerdict = (roomDetails) => {
    const isGableRoof = String(roomDetails.shape) === 'Gable';
    const total = Number(roomDetails.overallTotalHeightMm)
        || Math.max(Number(roomDetails.overallTotalFrontHeightMm) || 0, Number(roomDetails.overallTotalBackHeightMm) || 0)
        || Number(roomDetails.heightMm) || 0;
    const eaves = Number(roomDetails.eavesHeightMm) || total;

    const use = assessIncidentalUse(roomDetails.contents);

    let verdict;
    if (total > 0 && total <= 2500) verdict = 'green';
    else if (isGableRoof ? (eaves <= 2500 && total <= 4000) : total <= 3000) verdict = 'amber';
    else verdict = 'red';

    /*
     * The use test overrides the height test, never the other way round.
     * Heights decide how a COMPLIANT building must be sited; the use test
     * decides whether Class E applies at all. A 2.2m garden room with a bed in
     * it is not a green light with a caveat - it is outside permitted
     * development, and the traffic light has to say so.
     */
    if (use.incidental === false) verdict = 'red';
    else if (use.incidental === 'unknown' && verdict === 'green') verdict = 'amber';

    return { verdict, total, eaves, isGableRoof, use };
};

app.post('/api/planning-advice', aiLimiter, async (req, res) => {
    try {
        const { roomDetails } = req.body;
        if (!roomDetails || typeof roomDetails !== 'object') {
            return res.status(400).json({ error: "Room details required" });
        }

        const { verdict, total, eaves, isGableRoof, use } = pdVerdict(roomDetails);
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
                /*
                 * The one unknown the configurator can actually answer. It
                 * knows what was placed inside the building, so a design with a
                 * bed in it gets a definite fail here rather than a shrug -
                 * which is the difference between a checklist someone can act
                 * on and one that hedges on every line.
                 */
                label: 'Incidental use (no sleeping accommodation)',
                status: use.incidental === false ? 'fail' : use.incidental === true ? 'pass' : 'unknown',
                detail: use.reason,
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
        // A use failure is not a "probably fine" - it is outside Class E, so the
        // bar reads near-zero rather than the 15% a merely-too-tall building gets.
        const score = use.incidental === false ? 5
            : verdict === 'green' ? 90 : verdict === 'amber' ? 65 : 15;

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
- Contents placed inside: ${Array.isArray(roomDetails.contents) && roomDetails.contents.length ? roomDetails.contents.join(', ') : 'none recorded'}
- Incidental use test: ${use.incidental === false ? 'FAILED' : use.incidental === true ? 'passed' : 'uncertain'} - ${use.reason}${use.incidental === false ? `

THIS IS THE DECIDING FACT. Lead with it. The building fails the incidental-use test, so it is outside
permitted development no matter what the heights are - do NOT tell them the height is fine and leave it
there, and do NOT suggest lowering the roof as the fix, because the roof is not the problem. The honest
options are: remove the sleeping accommodation and use it as an office, gym or studio, or apply for
planning permission for an annexe. Say which. Be matter-of-fact rather than alarming - annexes are
consented every day, it is just a different application.` : ''}

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
            model: ANALYSIS_MODEL,
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
            model: ANALYSIS_MODEL,
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

/**
 * Project file upload, through the server.
 *
 * The browser normally uploads straight to Firebase Storage, and storage.rules
 * decide. Those rules read the account's projectsEnabled flag with a
 * cross-service firestore.get(), which only works once the Storage service
 * agent holds the "Firebase Rules Firestore Service Agent" IAM role - without
 * it EVERY upload is refused (storage/unauthorized, 23 Sep 2026). The client
 * falls back to this route when that happens, so saving never depends on a
 * console setting.
 *
 * It applies the same controls the rules do - signed in, projects enabled,
 * the project is theirs, image or PDF, under 25 MB - and checks the bytes
 * really are what the declared type says. Same path layout and download-URL
 * form as a direct upload, so the rest of the app cannot tell the difference.
 */
const PROJECT_ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const PROJECT_ASSET_KINDS = new Set(['proposal', 'exterior_render', 'interior_render', 'line_drawing', 'floor_plan', 'document', 'other']);
const PROJECT_ASSET_MAX = 25 * 1024 * 1024;
const assetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    keyGenerator: (req) => ipKeyGenerator(req.ip) || 'unknown',
    message: { error: 'Too many uploads. Please try again shortly.' },
    validate: { ip: false, xForwardedForHeader: false }
});
const looksLike = (buf, type) => {
    if (type === 'application/pdf') return buf.slice(0, 5).toString('latin1') === '%PDF-';
    if (type === 'image/png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
    if (type === 'image/webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
    return false;
};

app.post('/api/projects/:projectId/assets', assetLimiter, verifyFirebaseToken,
    express.raw({ type: () => true, limit: PROJECT_ASSET_MAX }), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Storage is not available right now.' });
        const uid = req.user.uid;
        const projectId = String(req.params.projectId || '');
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return res.status(400).json({ error: 'Unknown project.' });

        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const body = Buffer.isBuffer(req.body) ? req.body : null;
        if (!PROJECT_ASSET_TYPES.has(contentType)) return res.status(415).json({ error: 'Only PNG, JPEG, WebP and PDF files can be attached.' });
        if (!body || body.length === 0) return res.status(400).json({ error: 'The file was empty.' });
        if (body.length >= PROJECT_ASSET_MAX) return res.status(413).json({ error: 'That file is over the 25 MB limit.' });
        if (!looksLike(body, contentType)) return res.status(415).json({ error: 'That file is not the type it says it is.' });

        const kind = PROJECT_ASSET_KINDS.has(String(req.query.kind)) ? String(req.query.kind) : 'other';
        const name = String(req.query.name || 'file').replace(/[\u0000-\u001f]/g, '').slice(0, 120) || 'file';

        // The same two checks the rules make: entitled, and the owner.
        const account = await db.collection('users').doc(uid).get();
        if (!account.exists || account.data().projectsEnabled !== true) {
            return res.status(403).json({ error: 'Projects is not included on your plan.' });
        }
        const projectRef = db.collection('projects').doc(projectId);
        const project = await projectRef.get();
        if (!project.exists || project.data().ownerUid !== uid) return res.status(404).json({ error: 'Unknown project.' });

        const { randomUUID } = await import('crypto');
        const assetId = randomUUID();
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        const storagePath = `projects/${uid}/${projectId}/${assetId}-${safeName}`;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'modulr-studio.firebasestorage.app';
        const token = randomUUID();
        await admin.storage().bucket(bucketName).file(storagePath).save(body, {
            resumable: false,
            contentType,
            metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
        });
        const asset = {
            id: assetId,
            storagePath,
            downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
            name,
            contentType,
            sizeBytes: body.length,
            kind,
            createdAt: Date.now(),
        };
        await projectRef.update({
            assets: admin.firestore.FieldValue.arrayUnion(asset),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({ asset });
    } catch (e) {
        console.error('project asset upload error:', e);
        res.status(500).json({ error: 'The file could not be saved. Please try again in a moment.' });
    }
});

/**
 * The company's price book - its rates for quoting (services/quoteEngine.ts).
 *
 * Saved through the server, not straight from the browser: users/{uid} is the
 * record the entitlement system trusts, and the Firestore rules let the client
 * write only materialLibrary and branding there. Widening that list would need
 * a rules deploy in step with this code; a route ships with the server.
 *
 * The book is plain data the client shapes and normalises on read. Here it is
 * only size-capped and required to be an object with an items array, so a
 * malformed or oversized write cannot bloat the account record.
 */
const PRICE_BOOK_MAX = 250 * 1024;
const priceBookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    keyGenerator: (req) => ipKeyGenerator(req.ip) || 'unknown',
    message: { error: 'Too many saves. Please try again shortly.' },
    validate: { ip: false, xForwardedForHeader: false }
});

app.get('/api/price-book', priceBookLimiter, verifyFirebaseToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Price book is not available right now.' });
        const snap = await db.collection('users').doc(req.user.uid).get();
        const book = snap.exists ? snap.data().priceBook : null;
        res.json({ priceBook: book && typeof book === 'object' ? book : null });
    } catch (e) {
        console.error('price book read error:', e);
        res.status(500).json({ error: 'Your price book could not be loaded.' });
    }
});

/**
 * A picture of one of the company's set designs, for the price book and the
 * top of a quote. Stored through the server for the same reason project
 * files can be (the Storage rules' cross-service check, see the assets
 * route). The client shrinks it to a JPEG first; the cap is a backstop.
 */
const PRICE_BOOK_IMAGE_MAX = 6 * 1024 * 1024;
app.post('/api/price-book/images', priceBookLimiter, verifyFirebaseToken,
    express.raw({ type: () => true, limit: PRICE_BOOK_IMAGE_MAX }), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Images are not available right now.' });
        const uid = req.user.uid;
        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const body = Buffer.isBuffer(req.body) ? req.body : null;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return res.status(415).json({ error: 'Use a PNG, JPEG or WebP image.' });
        if (!body || body.length === 0) return res.status(400).json({ error: 'The image was empty.' });
        if (body.length >= PRICE_BOOK_IMAGE_MAX) return res.status(413).json({ error: 'That image is too large.' });
        if (!looksLike(body, contentType)) return res.status(415).json({ error: 'That file is not the image type it says it is.' });

        const account = await db.collection('users').doc(uid).get();
        if (!account.exists || account.data().projectsEnabled !== true) {
            return res.status(403).json({ error: 'Quoting is not included on your plan.' });
        }
        const { randomUUID } = await import('crypto');
        const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
        const storagePath = `pricebook/${uid}/${randomUUID()}.${ext}`;
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'modulr-studio.firebasestorage.app';
        const token = randomUUID();
        await admin.storage().bucket(bucketName).file(storagePath).save(body, {
            resumable: false,
            contentType,
            metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
        });
        res.json({ url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}` });
    } catch (e) {
        console.error('price book image error:', e);
        res.status(500).json({ error: 'The image could not be saved. Please try again in a moment.' });
    }
});

app.put('/api/price-book', priceBookLimiter, verifyFirebaseToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Price book is not available right now.' });
        const book = req.body?.priceBook;
        if (!book || typeof book !== 'object' || Array.isArray(book) || !Array.isArray(book.items)) {
            return res.status(400).json({ error: 'That price book could not be read.' });
        }
        if (Buffer.byteLength(JSON.stringify(book)) > PRICE_BOOK_MAX) {
            return res.status(413).json({ error: 'The price book is too large to save.' });
        }
        // Quoting is part of Projects; the same entitlement the rules check.
        const ref = db.collection('users').doc(req.user.uid);
        const account = await ref.get();
        if (!account.exists || account.data().projectsEnabled !== true) {
            return res.status(403).json({ error: 'Quoting is not included on your plan.' });
        }
        // update, not set-merge: merge would deep-merge the nested maps and
        // keep fields the user has cleared.
        await ref.update({ priceBook: { ...book, updatedAt: Date.now() } });
        res.json({ ok: true });
    } catch (e) {
        console.error('price book save error:', e);
        res.status(500).json({ error: 'Your price book could not be saved. Please try again in a moment.' });
    }
});


// Protect all API routes and enforce master lock
/**
 * The prices on sale, for the pricing page: key, Stripe price ID, label,
 * pence. Public - the page is read before anyone signs in - so it sits
 * above the token check like the planning checker. Unset IDs are not
 * offered; nothing here can start a payment.
 */
app.get('/api/public/billing-prices', (_req, res) => {
    const prices = Object.fromEntries(Object.entries(BILLING_PRICES).map(([key, p]) => [key, { priceId: process.env[p.env] || null, label: p.label, pence: p.pence, plan: p.plan, mode: p.mode }]));
    const vp = videoPricing();
    res.json({ billingEnabled: process.env.BILLING_ENABLED === 'true', prices, founding: !!FOUNDING_COUPON,
        // The pricing page quotes the 8 second clip.
        videoModels: Object.fromEntries(Object.entries(vp).map(([k, v]) => [k, { label: v.label, available: v.available, resolution: v.defaultResolution, pricePence: videoPricePence(k, 8, v.defaultResolution), animations8s: videoAnimations(k, 8, v.defaultResolution) }])), animationPence: ANIMATION_PENCE });
});

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

/**
 * THE RENDER ENGINE - render/ (rebuilt 17 Sep 2026).
 *
 * One route, /api/render: line drawing + shaded view + itemised inventory
 * -> gemini-3-pro-image, verified item by item on the analysis model, one
 * retry through flash-image. Mounted here so it borrows auth, credits and
 * the cost log from this file without touching Firestore or a key itself.
 * /api/renderBuilding below is the previous engine and is being retired.
 */
// resolveEffectivePlan is declared further down (a const, not hoisted): the
// thunk defers the lookup to request time.
mountRender(app, { ai, Type, ANALYSIS_MODEL, enforceRenderAccess, CREDIT_COSTS, userAiLimiter, logRender, sanitizeString, resolveEffectivePlan: (req) => resolveEffectivePlan(req), FLOOR_PLAN_PLANS, isMasterUser: (u) => isMasterUser(u) });

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

        if (openAiReady()) {
            // Sunburst: an edit when there is a source (environment first,
            // then the building, matching the prompt's "first / second"), a
            // plain generation when the drawing is from a description alone.
            const { quality } = await resolveImageQuality(req);
            const size = openAiSizeFor(ratio || '16:9', isHighQuality ? 2048 : 1024);
            const images = [];
            if (hasEnv) images.push({ b64: environmentImage, mime: 'image/jpeg' });
            if (hasImage) images.push({ b64: base64Image, mime: 'image/jpeg' });
            const out = images.length
                ? await openAiImageEdit({ prompt: textPrompt, images, size, quality, label: 'lineDrawing' })
                : await openAiImageGenerate({ prompt: textPrompt, size, quality, label: 'lineDrawing' });
            if (!out.b64) throw new Error("No image generated");
            logRender(req, 'generateLineDrawing', OPENAI_IMAGE_MODEL, imageConfig.imageSize, { quality, ...openAiUsageLog(out.usage) });
            return res.json({ result: out.b64, quality });
        }

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
                logRender(req, 'generateLineDrawing', modelName, imageConfig.imageSize);
                return res.json({ result: b64Data });
            }
        }
        throw new Error("No image generated");
    } catch (error) {
        console.error("Line drawing error:", error);
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
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
            model: ANALYSIS_MODEL,
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

        // Enforce render access (trial for free users, credit deduction for paid).
        // Every plan GENERATES at 2K - identical fidelity to 4K on this model at
        // half the price. 4K exists only as the metered /api/export4k action, so
        // the client's old isHighQuality flag is ignored here entirely.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
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
                // The deck, as sized - including any side extension past the
                // building, which is the customer's deck and not a mistake.
                const outline = Array.isArray(spec.deckOutline) && spec.deckOutline.length >= 3
                    ? spec.deckOutline.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 40)
                    : null;
                if ((spec.hasDecking || spec.hasPictureFrame) && outline && outline.length >= 3) {
                    // A reshaped deck: the outline the customer pulled into place,
                    // so the words describe the shape rather than three sizes.
                    let a = 0;
                    for (let i = 0; i < outline.length; i++) { const [x1, z1] = outline[i], [x2, z2] = outline[(i + 1) % outline.length]; a += x1 * z2 - x2 * z1; }
                    const area = Math.round(Math.abs(a) / 2 * 10) / 10;
                    lines.push(`- DECKING: a timber/composite deck of about ${area} m² in a custom ${outline.length}-sided outline, exactly the shape and extent the source image shows - it runs under and out from the building and may wrap a corner or step in and out. Keep every edge where the image has it; the roof and canopy above do NOT follow the deck.`);
                } else if (spec.hasDecking || spec.hasPictureFrame) {
                    const front = Number(spec.deckingSizeMm) || 1500, left = Number(spec.deckingLeftMm) || 0, right = Number(spec.deckingRightMm) || 0;
                    const sides = [left ? `${left}mm past the LEFT side of the building` : null, right ? `${right}mm past the RIGHT side of the building` : null].filter(Boolean);
                    lines.push(`- DECKING: a timber/composite deck ${front}mm deep across the full front of the building${sides.length ? `, and extending ${sides.join(' and ')} - the deck is deliberately wider than the building there; the roof and canopy above do NOT extend with it` : ''}. Keep the deck exactly the size and shape the source image shows.`);
                }

                /**
                 * GARDEN BOUNDARY - from the configurator's drawn runs. The
                 * screenshot shows the fences and walls as real geometry;
                 * these words say what each is made of, so a stone wall is
                 * rendered as stone and a hedge as a hedge, at the height
                 * drawn. Runs are listed in drawing order.
                 */
                const boundary = Array.isArray(spec.garden?.boundary) ? spec.garden.boundary.slice(0, 12) : [];
                if (boundary.length) {
                    const runs = boundary
                        .map((b, i) => (typeof b?.text === 'string' && b.text.trim()) ? `run ${i + 1} (${Math.round((Number(b.lengthMm) || 0) / 100) / 10} m): ${sanitizeString(b.text, 120)}` : null)
                        .filter(Boolean);
                    if (runs.length) lines.push(`- GARDEN BOUNDARY, exactly as drawn in the source image and to be kept where it is: ${runs.join('; ')}. Render each run in that material at that height. A run listed as open has no fence or wall - leave it open. Do not add any fence, wall or hedge that is not listed.`);
                }
                // PATHS - the paved ribbons drawn on the plan, kept on their line.
                const paths = Array.isArray(spec.garden?.paths) ? spec.garden.paths.slice(0, 12) : [];
                if (paths.length) {
                    const list = paths.map((p, i) => (typeof p?.text === 'string' && p.text.trim()) ? `path ${i + 1}: ${sanitizeString(p.text, 120)}` : null).filter(Boolean);
                    if (list.length) lines.push(`- GARDEN PATHS, exactly where the source image shows them, in the paving named: ${list.join('; ')}. Keep every path on its drawn line at its drawn width, with crisp, level, evenly jointed paving. Do not add any path, patio or paving that is not listed.`);
                }
                /**
                 * EXTERIOR LIGHT FITTINGS - from the configurator's placed
                 * objects. Without this the model treated the small grey boxes
                 * in the screenshot as a suggestion and drew whatever lantern it
                 * fancied, moved it, or dropped one. Charlie: "I said do not
                 * change style, just colour". So: count, shape, size, finish,
                 * wall, height - and an order not to restyle.
                 */
                const lights = Array.isArray(spec.exteriorLights) ? spec.exteriorLights.slice(0, 12) : [];
                if (lights.length) {
                    const list = lights.map((l, i) => (typeof l?.text === 'string' && l.text.trim()) ? `fitting ${i + 1}: ${sanitizeString(l.text, 240)}` : null).filter(Boolean);
                    const n = lights.reduce((s, l) => s + (Number(l?.count) || 1), 0);
                    if (list.length) lines.push(`- EXTERIOR LIGHT FITTINGS: exactly ${n}, exactly where the source image shows them, and NOTHING ELSE about them may change: ${list.join('; ')}. Each fitting keeps the precise shape, proportions, size and position seen in the source image - a slim flat box stays a slim flat box, it does not become a lantern, a cylinder or a different product. The ONLY property the words above set is the finish colour. Do not add any light fitting that is not listed, do not remove or move one, do not change its size. Fittings are OFF in daylight - no visible glow or light cone unless the scene is dusk or night.`);
                }

                // FREEFORM DECKS - drawn outlines at their own heights, each
                // a separate platform; a raised one steps down to a lower one.
                const decks = Array.isArray(spec.garden?.decks) ? spec.garden.decks.slice(0, 8) : [];
                if (decks.length) {
                    const list = decks.map((d, i) => (typeof d?.text === 'string' && d.text.trim()) ? `deck ${i + 1}: ${sanitizeString(d.text, 160)}` : null).filter(Boolean);
                    if (list.length) lines.push(`- GARDEN DECKING AREAS, exactly the outline, size and position the source image shows for each: ${list.join('; ')}. Each deck is its own level platform at the height stated with boards running straight and a clean fascia edge; where a higher deck meets a lower one the height difference is a real step. Do not add any deck, platform or step that is not listed.`);
                }

                /**
                 * CLADDING COLOUR, PER ELEVATION - from the client's order.
                 *
                 * This used to be left out on purpose: a single global
                 * cladding value overrode a design that was black on one face
                 * and mahogany on another. The right fix was never to drop the
                 * colour and let a vision model guess it from a flat-shaded
                 * screenshot - that is how a dark green building came back
                 * grey. The spec carries the colour PER ELEVATION, so it is
                 * stated per elevation, and the model has nothing to guess.
                 */
                const CLADDING_LOOKS = {
                    cedar_composite: 'warm cedar-toned composite boards (natural reddish-brown timber tone)',
                    oak_composite: 'oak-toned composite boards (mid golden-brown)',
                    light_oak_composite: 'light oak-toned composite boards (pale honey)',
                    black_composite: 'BLACK composite boards (deep charcoal-black, #1f2123)',
                    dark_grey_composite: 'DARK GREY composite boards (#4a5057)',
                    light_grey_composite: 'light grey composite boards (#a9aeb2)',
                    grey_composite: 'grey composite boards (#a9aeb2)',
                    white_composite: 'off-white composite boards (#e8e6e1)',
                    slate_blue_composite: 'SLATE BLUE composite boards (muted blue-grey, #7c93a6)',
                    sage_composite: 'SAGE GREEN composite boards (muted grey-green, #7e8c74)',
                    clay_composite: 'clay / terracotta-toned composite boards (#9a6b58)',
                    timber: 'natural larch timber boards',
                    cedar: 'natural cedar timber boards',
                    oak: 'oak timber boards',
                    composite_wood: 'brown composite boards',
                    composite_brown: 'brown composite boards',
                    composite_black: 'BLACK composite boards (deep charcoal-black)',
                    composite_grey: 'grey composite boards',
                    charred_wood: 'charred (shou sugi ban) BLACK timber boards',
                    render_white: 'smooth white render',
                    box_metal_grey: 'grey box-profile standing-seam metal sheet',
                    box_metal_black: 'BLACK box-profile standing-seam metal sheet',
                    corrugated_metal: 'corrugated metal sheet',
                    fire_board_grey: 'grey fibre-cement board',
                    corrugated_iron: 'galvanised CORRUGATED STEEL sheet, vertical profile (dull grey metal)',
                    painted_planks: 'PAINTED vertical timber boards',
                };
                // Painted planks carry their own colour - any hex the client
                // chose - so the look names it rather than a fixed family.
                const tint = (typeof spec.claddingTint === 'string' && /^#[0-9a-fA-F]{6}$/.test(spec.claddingTint)) ? spec.claddingTint.toLowerCase() : null;
                const look = (id) => {
                    if (typeof id !== 'string') return null;
                    if (id === 'painted_planks' && tint) return `PAINTED vertical timber boards, paint colour ${tint}`;
                    if (CLADDING_LOOKS[id]) return CLADDING_LOOKS[id];
                    return id.trim() ? sanitizeString(id.replace(/_/g, ' '), 40) : null;
                };
                const base = look(spec.cladding);
                const faces = [
                    ['Front', look(spec.claddingFront) || base],
                    ['Back', look(spec.claddingBack) || base],
                    ['Left', look(spec.claddingLeft) || base],
                    ['Right', look(spec.claddingRight) || base],
                ].filter(f => f[1]);
                if (faces.length) {
                    const uniform = faces.every(f => f[1] === faces[0][1]);
                    if (uniform && faces.length === 4) {
                        lines.push(`- Cladding, ALL elevations: ${faces[0][1]}. This is the ordered colour - render exactly this colour family as real boards. Do NOT shift it toward grey or any other colour.`);
                    } else {
                        lines.push('- Cladding is DIFFERENT per elevation - each face keeps its own listed colour:');
                        faces.forEach(([label, desc]) => lines.push(`  - ${label} elevation: ${desc}.`));
                    }
                    const gable = look(spec.claddingGable);
                    if (gable && spec.shape === 'Gable') lines.push(`  - Gable apex triangles: ${gable}.`);
                }
                if (spec.fasciaMaterial) {
                    const f = sanitizeString(String(spec.fasciaMaterial), 20);
                    lines.push(f === 'match_cladding'
                        ? '- Fascia / roof edge trim: the SAME material and colour as the cladding, boards running continuously up to the roof edge.'
                        : `- Fascia / roof edge trim: ${f.toUpperCase()}, a crisp flat band along the top of every wall, clearly distinct from the cladding below it.`);
                }
                if (spec.roofMaterial) {
                    const roofNames = { epdm: 'EPDM rubber membrane', sedum: 'sedum green roof', upvc: 'uPVC roof sheet', metal: 'standing-seam metal roof', rubber: 'textured black rubber roof sheeting', aluminium: 'black powder-coated aluminium roof sheet' };
                    const r = roofNames[spec.roofMaterial] || sanitizeString(String(spec.roofMaterial), 20);
                    const rc = typeof spec.roofColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(spec.roofColor) ? ` in ${spec.roofColor}` : '';
                    lines.push(`- Roof covering: ${r}${rc}.`);
                }
                if (typeof spec.frameColor === 'string' && spec.frameColor.trim()) {
                    const fc = sanitizeString(spec.frameColor, 20).toUpperCase();
                    const fmNames = { upvc: 'uPVC', aluminium: 'aluminium', timber: 'painted timber' };
                    const fm = fmNames[spec.frameMaterial] || 'aluminium';
                    lines.push(`- Window and door frames: ${fc} ${fm} on every opening. A SOLID door leaf is ${fc} like its frame - never the cladding colour.`);
                }

                /**
                 * The outdoor section (configurator utils/bay): one end of the
                 * building open at the front under the same roof. Without this
                 * the engines closed it in or drew a separate lean-to.
                 */
                if (spec.bay && typeof spec.bay === 'object' && (spec.bay.side === 'left' || spec.bay.side === 'right') && Number(spec.bay.widthMm) > 0) {
                    const side = spec.bay.side;
                    const bw = Math.round(Number(spec.bay.widthMm));
                    const total = mm(spec.widthMm);
                    const floor = spec.bay.floor === 'porcelain' ? 'porcelain paving slabs' : spec.bay.floor === 'base' ? 'the plain base' : 'timber decking boards';
                    const bd = Number(spec.bay.depthMm) > 0 ? Math.round(Number(spec.bay.depthMm)) : 0;
                    const depthWords = bd ? `${bd}mm deep from the front face - a CORNER of the building, with the enclosed room wrapping round behind it` : 'the full depth of the building';
                    const end = spec.bay.screen === 'slatted' ? `its ${side} end is a screen of slim vertical timber slats`
                        : spec.bay.screen === 'glass' ? `its ${side} end is a frameless clear glass screen`
                        : spec.bay.screen === 'open' ? `its ${side} end is fully open too`
                        : `its ${side} end wall is the building's own wall`;
                    const back = !bd && spec.bay.backWall === 'slatted' ? ' Its back is a screen of vertical timber slats.'
                        : !bd && spec.bay.backWall === 'open' ? ' Its back is open too - you can see straight through it to the garden behind.'
                        : '';
                    const finish = spec.bay.wallFinish === 'render' ? `painted render${/^#[0-9a-fA-F]{6}$/.test(String(spec.bay.wallColour || '')) ? ` in ${String(spec.bay.wallColour).toLowerCase()}` : ''}`
                        : spec.bay.wallFinish === 'cladding' && spec.bay.wallCladding ? (look(spec.bay.wallCladding) || 'a contrasting cladding')
                        : 'the same cladding as the outside of the building';
                    const soffit = spec.bay.soffit === 'cladding' ? 'clad to match the walls' : spec.bay.soffit === 'slats' ? 'lined with timber slats' : spec.bay.soffit === 'white' ? 'lined white' : "the exposed underside of the roof, in the roof's own dark material";
                    const postColour = spec.bay.post === 'timber' ? ' in natural timber' : spec.bay.post === 'black' ? ' in black' : spec.bay.post === 'white' ? ' in white' : ' in the frame colour';
                    const post = spec.bay.post === 'none' ? 'no post' : `a slim 100mm square corner post${postColour} carrying the roof at its outer front corner`;
                    lines.push(`- COVERED OUTDOOR SECTION at the ${side.toUpperCase()} end of the building, ${bw}mm wide${total ? ` of the ${total} total width` : ''}, ${depthWords}, under the SAME continuous roof, fascia and cladding line - it is part of this one building, not a lean-to or a separate structure. It has NO front wall: it is open to the garden along its whole front, with ${post}. The wall faces inside it are finished in ${finish}; ${end}.${back} Its ceiling is ${soffit}. A dividing wall separates it from the enclosed room. Floor: ${floor}, level with the room floor. The enclosed room with every door and window listed below is the rest of the width, to the ${side === 'left' ? 'right' : 'left'} of it. Do NOT put any door or window across the open section, and do NOT close it in with glazing.`);
                }

                /**
                 * WHERE on the wall. Counting openings is not enough: a door a
                 * fifth of the way along a long blank wall came back next to
                 * the glazing with the blank run gone, on a building that had
                 * shrunk to fit. offsetMm is measured from the wall's midpoint,
                 * and which way is "right" depends on which wall you are
                 * standing outside of - so it is spelt out as blank wall to
                 * each corner, which is what the eye actually checks.
                 */
                const wallLen = (wall) => (wall === 'left' || wall === 'right') ? spec.depthMm : spec.widthMm;
                const where = (op) => {
                    // A door in the outdoor section's divider is not on an
                    // elevation at all; its wording is handled where it is listed.
                    if (op.wall === 'bay') return '';
                    const L = wallLen(op.wall), off = op.offsetMm, w = op.widthMm;
                    if (![L, off, w].every(v => typeof v === 'number' && isFinite(v)) || L <= 0) return '';
                    const rightIsPositive = op.wall === 'front' || op.wall === 'left';
                    const toRight = rightIsPositive ? off : -off;
                    const gapL = Math.max(0, Math.round(L / 2 + toRight - w / 2));
                    const gapR = Math.max(0, Math.round(L / 2 - toRight - w / 2));
                    const centre = Math.abs(toRight) < 50 ? 'centred on the wall' : `centred ${Math.round(Math.abs(toRight))}mm ${toRight > 0 ? 'right' : 'left'} of the wall's midpoint`;
                    return ` Position, viewed from outside: ${centre}, leaving ${gapL}mm of blank wall to the left-hand corner and ${gapR}mm to the right-hand corner.`;
                };

                const doors = Array.isArray(spec.doors) ? spec.doors.slice(0, 12) : [];
                lines.push(doors.length
                    ? `- Door sets across the whole building, all elevations: ${doors.length}, listed below. Only the ones the source image shows are in frame.`
                    : `- Door sets: NONE anywhere on this building. Render no exterior door sets.`);
                doors.forEach((dr, i) => {
                    // 'solid' used to fall into the glazed branch - the prompt told
                    // the model an entrance door was glass, and it obliged.
                    const style = dr.style === 'crittall' ? 'black steel Crittall-style with a grid of slim glazing bars'
                        : dr.style === 'solid' ? 'SOLID UNGLAZED entrance door - an opaque flush panel leaf with NO glass anywhere in it; not a glazed set, not Crittall'
                        : 'standard glazed';
                    // The product, not just a leaf count: a 3-leaf bi-fold and a
                    // 3-pane slider look nothing alike. Older designs carry no
                    // kind, so it is read from the leaf count the way the
                    // configurator does (utils/doors.ts).
                    const leaves = Math.max(1, parseInt(dr.leaves) || 1);
                    const kind = ['hinged', 'french', 'bifold', 'sliding'].includes(dr.kind) ? dr.kind
                        : leaves <= 1 ? 'hinged' : leaves === 2 ? 'french' : 'bifold';
                    const product = kind === 'hinged' ? 'single hinged door, 1 leaf'
                        : kind === 'french' ? 'French doors - a pair of hinged leaves meeting in the middle, 2 leaves'
                        : kind === 'bifold' ? `bi-fold door set of ${leaves} equal folding leaves in one frame, with the slim vertical mullions between the leaves that a bi-fold has`
                        : `sliding door set of ${leaves} equal panes in one frame - large panes, slim vertical divisions, no folding hinges`;
                    const placeWords = dr.wall === 'bay'
                        ? 'in the dividing wall between the enclosed room and the covered outdoor section, opening into the section - it is INSIDE the section, seen only through its open front, never on an outside elevation'
                        : `on the ${sanitizeString(String(dr.wall || ''), 10) || 'front'} elevation`;
                    lines.push(`  - Door ${i + 1}: ${product}, ${mm(dr.widthMm) || 'unspecified width'} x ${mm(dr.heightMm) || 'unspecified height'}, ${style}, ${placeWords}.${where(dr)}`);
                });
                const windows = Array.isArray(spec.windows) ? spec.windows.slice(0, 12) : [];
                lines.push(windows.length
                    ? `- Windows across the whole building, all elevations: ${windows.length}, listed below. Only the ones the source image shows are in frame.`
                    : `- Windows: NONE anywhere on this building. Do not add any window openings on any elevation.${doors.length ? ' The only glazing is in the door sets listed above.' : ''}`);
                windows.forEach((wn, i) => {
                    const style = wn.style === 'crittall' ? 'Crittall-style glazing bar grid' : 'standard';
                    const placeWords = wn.wall === 'bay'
                        ? 'in the dividing wall between the enclosed room and the covered outdoor section - it is INSIDE the section, seen only through its open front, never on an outside elevation'
                        : `${sanitizeString(String(wn.wall || ''), 10) || 'front'} elevation`;
                    lines.push(`  - Window ${i + 1}: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${style}, ${placeWords}.${where(wn)}`);
                });
                if (spec.claddingOrientation) lines.push(`- Cladding board direction: ${spec.claddingOrientation === 'vertical' ? 'vertical' : 'horizontal'}.`);
                const sky = Array.isArray(spec.skylights) ? spec.skylights.length : 0;
                if (sky > 0) lines.push(`- Skylights across the whole roof: ${sky}. Only the ones the source image shows are in frame.`);
                if (!lines.length) return '';
                return `
      CONFIGURED BUILDING SPECIFICATION - the client configured and ORDERED this
      exact building. Use this list to be exact about the SIZE, STYLE and
      POSITION of what the source image shows. Where it states a cladding
      colour, a fascia, a roof covering or a door type, that is the client's
      order: render exactly that, as a real physical material - it overrides
      the flat-shaded colour in the source image AND anything in the MATERIAL
      ASSIGNMENTS section that disagrees with it.
      The list covers the WHOLE building - all four elevations - while the
      source image's camera sees only some of them. THE SOURCE IMAGE DECIDES
      WHAT IS IN FRAME: render an opening only where the source shows one.
      NEVER add, duplicate or move an opening onto a visible wall because it
      appears in this list, and NEVER change the camera to bring a hidden
      elevation into view. Listed items on elevations the camera cannot see
      simply stay out of frame.
${lines.map(l => '      ' + l).join('\n')}
      Do not invent any opening beyond this list, and do not render any listed
      opening that the source image does not show.`;
            } catch (e) {
                console.warn('configSpec block skipped:', e.message || e);
                return '';
            }
        };
        const configSpecBlock = buildConfigSpecBlock(req.body.configSpec);

        /**
         * The same order, as one line for the QA inspector.
         *
         * The inspector judges the render against the flat-shaded SOURCE, in
         * which a solid door is a dark rectangle that reads as glass - it
         * rejected a correct solid door for exactly that reason and then
         * pushed the retry back toward glazed. Door type and counts are
         * judged against what was ordered, not against the shading.
         */
        const buildSpecFacts = (spec) => {
            if (!spec || typeof spec !== 'object') return '';
            try {
                const doors = Array.isArray(spec.doors) ? spec.doors.slice(0, 12) : [];
                const windows = Array.isArray(spec.windows) ? spec.windows.slice(0, 12) : [];
                const wall = (o) => sanitizeString(String(o.wall || 'front'), 10);
                const d = doors.length
                    ? doors.map((dr, i) => `door ${i + 1} on the ${wall(dr)} wall is ${dr.style === 'solid' ? 'a SOLID unglazed panel door' : dr.style === 'crittall' ? 'glazed with Crittall bars' : 'glazed'}`).join('; ')
                    : 'no exterior doors';
                const w = windows.length ? `${windows.length} window${windows.length === 1 ? '' : 's'} (${windows.map(wn => wall(wn)).join(', ')})` : 'no windows';
                return `Across the whole building: ${d}; ${w}. Only the elevations the source camera sees are in frame.`;
            } catch { return ''; }
        };
        const specFacts = buildSpecFacts(req.body.configSpec);

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
                /**
                 * Same principle for colour and door type. The analyser
                 * describes what a flat-shaded screenshot LOOKS like, and its
                 * "dark grey composite" for a dark green building is exactly
                 * how the colour drifted. The spec knows what was ordered.
                 */
                if (typeof spec.cladding === 'string' && spec.cladding.trim()) {
                    materials.walls = 'Cladding EXACTLY as listed per elevation in the CONFIGURED BUILDING SPECIFICATION - that colour family, rendered as real boards with grain, joints and shadow lines. Do NOT take the wall colour from the image analysis or from the flat fill in the source.';
                }
                if (Array.isArray(spec.doors) && spec.doors.some(d => d && d.style === 'solid')) {
                    materials.doors = 'See the CONFIGURED BUILDING SPECIFICATION for each door set. A door listed there as SOLID is an opaque, unglazed panel door with no glass in it at all. ' + (materials.doors && materials.doors.toLowerCase() !== 'none' ? materials.doors : '');
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
      - PRESERVE THE COMPOSITION - THIS OVERRIDES THE HOUSE STYLE COMPOSITION
        GUIDANCE BELOW: keep the same camera position, angle, framing and
        distance as the source view. Do NOT zoom in, crop tighter, or orbit to
        a different viewpoint. The house style governs lighting, focus,
        materials and finish only - never the viewpoint.
      - IGNORE 3D GRID LINES: the source may show a floor grid on the ground. Never render
        these. Replace with natural, seamless ground or grass.
      - SET DRESSING: the flat green ground plane, the blank sky and the empty
        surroundings in this 3D view are PLACEHOLDERS, not the design. Build the
        designed garden and evening light described in the house style around the
        building. Anything actually modelled in the view - decking, a canopy, a
        boundary fence or wall, paths - is part of the design and is kept exactly
        where it is; the planting, lawn detail, sky and neighbours are yours to
        dress. Objects are not: no furniture indoors or out beyond what the view
        shows.

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
      CRITICAL: Output at 2K resolution (2048 pixels on the long edge). Do not
      exceed this pixel count - it locks the pricing tier.
    `;

        const standardPrompt = `
      RENDER ENGINE SETTINGS:
      - Engine: Nano Banana Pro (V3.2).
      - Target: 8K-UHD Photograph-Quality Architectural Visualization.
      - Quality: Ultra-realistic, Physically Based Rendering (PBR), sharp focus, hyper-detailed micro-textures.
      
      TASK: Render the architecture using the exact materials specified below.
      ${orientation ? `\nSPATIAL CONTEXT: You are rendering the [${orientation}] elevation. Apply materials to this specific facing side.` : ''}

      GEOMETRY & CONTEXT RULES — CRITICAL:
      - STRICT GEOMETRY LOCK: Reproduce the EXACT structure shown. Do NOT add, remove, or modify any architectural elements. DO NOT change the roof pitch or shape.\n      - CAMERA LOCK - THIS OVERRIDES THE HOUSE STYLE COMPOSITION GUIDANCE BELOW: keep the source image's exact camera position, camera angle, framing and crop. Every building, wall, opening and object visible in the source stays visible in the render, at the same position and the same scale in frame. Do NOT zoom in, do NOT crop tighter, do NOT move closer to the building, do NOT orbit to a different viewpoint. The house style below governs lighting, focus, materials and finish ONLY - never the viewpoint or how much of the scene is in frame.\n      - NO HALLUCINATIONS: Do NOT invent structures, decking, patios, porches, or raised platforms unless clearly visible in the source. Your assignment is surface-level materials only.\n      - PRESERVE THE ENVIRONMENT: Render surrounding landscape, neighbouring buildings, fences, trees, and sky exactly as shown, exactly where shown.

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
      CRITICAL: Output at 2K resolution (2048 pixels on the long edge). Do not
      exceed this pixel count - it locks the pricing tier.
    `;

        const prompt = isSketchUpMode ? sketchUpPrompt : standardPrompt;

        /**
         * IMAGE ENGINE - which model draws the render.
         *
         * Sunburst (GPT Image 2.5) at the user's quality tier - see
         * OPENAI_IMAGE_MODEL above for why. One edit call replaces both Gemini
         * passes; the QA inspection and corrective retry stay exactly as they
         * are, judging the output against the source. The source image goes
         * in as the edit input, so the geometry lock is the model's job just
         * as it was for Gemini. Without OPENAI_API_KEY on the server the
         * two-pass Gemini path below runs instead, so nothing goes dark.
         */
        const imageEngine = openAiReady() ? 'sunburst' : 'gemini';
        if (imageEngine === 'gemini') console.warn('[RENDER] OPENAI_API_KEY missing - drawing with Gemini instead of Sunburst');
        const { quality: imageQuality, clamped: qualityClamped } = await resolveImageQuality(req);

        /** The OpenAI edit size for this render: 2K on the long edge, matching
         *  the source's aspect. */
        const openAiSize = () => openAiSizeFor(isSketchUpMode ? (ratio || '16:9') : '16:9', 2048);

        /**
         * The hard rules, first. The edit endpoint's prompt is a single
         * field and the first lines carry the most weight; buried in the
         * middle of the long house-style prompt the door type was ignored -
         * Charlie's first Sunburst render was perfect except that a solid
         * door came back glazed, because the flat CAD source shows a solid
         * door as a dark rectangle that looks like glass.
         */
        const openAiHardRules = () => {
            const rules = [
                'HARD RULES - these override everything below.',
                'Edit the input image only: keep its exact camera, framing, crop, building geometry, roof form and every opening exactly where it is. Add nothing, remove nothing, move nothing.',
                'The input is a flat-shaded CAD view. A dark door panel in it is an OPAQUE SOLID door, not glass - render it as a plain flush panel with no glazing unless the specification below says that door is glazed.',
            ];
            if (specFacts) rules.push('SPECIFICATION (ground truth for door type): ' + specFacts);
            return rules.join('\n') + '\n\n';
        };

        /** One Sunburst edit of the SOURCE image with the render prompt, at
         *  the user's tier. The usage comes back so the log can price it. */
        let openAiUsage = null;
        const runOpenAIEdit = async (promptText) => {
            const out = await openAiImageEdit({
                prompt: openAiHardRules() + promptText,
                images: [{ b64: base64Image, mime: 'image/jpeg' }],
                size: openAiSize(),
                quality: imageQuality,
                label: 'render',
            });
            if (out.usage) openAiUsage = out.usage;
            return out.b64;
        };

        /** Run one generation pass; returns the image as base64, or null. */
        const runRender = async (promptText) => {
            if (imageEngine !== 'gemini') return runOpenAIEdit(promptText);
            const response = await ai.models.generateContent({
                /**
                 * FLASH-IMAGE, ON PURPOSE. This was switched to the "best"
                 * image model (gemini-3-pro-image) on 25 Aug 2026 for quality,
                 * and that is the commit that broke the render engine: the pro
                 * model RE-COMPOSES. Given a configurator view it shortened the
                 * building, moved a side window onto the front, restyled a
                 * solid door as glazed and pulled the camera in - with the
                 * prompt screaming geometry lock at it. Charlie reported it
                 * three times as "the AI changing my design".
                 *
                 * Proven with scripts/render-ab.mjs on 4 Sep 2026 - same
                 * source, same prompt, one variable at a time: flash-image
                 * reproduced the building exactly (geometry, sage cladding,
                 * solid black door, side window, fascia); every pro-model
                 * variant changed the building. Fidelity IS the quality here.
                 * Do not "upgrade" this model without re-running that harness.
                 */
                model: 'gemini-3.1-flash-image',
                contents: {
                    parts: [imagePart, { text: promptText }]
                },
                config: {
                    outputMimeType: "image/jpeg",
                    imageConfig: {
                        // CGI-model sources keep the source framing rather than being
                        // forced to 16:9, so the composition the user set up in the
                        // configurator survives. Fallback guards against an empty ratio.
                        aspectRatio: isSketchUpMode ? (ratio || "16:9") : "16:9",
                        // 2K always: same fidelity as 4K on this model, half the
                        // cost. 4K is the metered /api/export4k action only.
                        imageSize: "2K",
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
         * A cheap vision call compares the finished image against the SOURCE
         * image side by side - openings, roof form and camera. The source is
         * ALWAYS the ground truth, spec or no spec: the spec lists the whole
         * building across all four elevations, so its totals can never all be
         * visible in one view, and holding the render to them forced hidden
         * openings into shot. What must match is what the two cameras see.
         *
         * Fails soft by design: if the inspector itself errors, the render is
         * treated as passing. A QA outage must never take rendering down.
         *
         * Every inspection is a real billable call, so they are counted and
         * written to the cost log alongside the render - a cost-per-render
         * figure that ignores its own QA is not the true cost.
         */
        let qaCalls = 0;

        /**
         * One QA call comparing the SOURCE and the RENDER side by side.
         *
         * This used to be absolute counts: total the openings in the spec
         * (all four elevations) and count the openings visible in the render.
         * Those can never agree unless every opening happens to face the
         * camera, so a CORRECT render of a building with rear windows
         * "failed" - and the corrective retry then told the model to fix it,
         * which it did by painting the hidden windows onto visible walls or
         * orbiting the camera until they were in shot. QA was manufacturing
         * the exact defects it existed to catch. Comparing the two images
         * directly judges only what both cameras can see, so "matches the
         * source" is always achievable - and the source is geometry-exact for
         * a configurator screenshot.
         */
        const inspectRenderFidelity = async (srcB64, renderB64, facts) => {
            qaCalls++;
            try {
                const resp = await ai.models.generateContent({
                    model: 'gemini-3.5-flash-lite',
                    contents: {
                        parts: [
                            fileToGenerativePart(srcB64, "image/jpeg"),
                            fileToGenerativePart(renderB64, "image/jpeg"),
                            { text:
                                (facts ? 'CLIENT SPECIFICATION - the ground truth for door TYPE and opening counts, because image 1 is a flat-shaded CAD view in which a solid door looks like dark glass: ' + facts + ' ' : '') +
                                'Image 1 is a source image of a single garden building; image 2 is a photorealistic render made from it. Lighting, weather, surroundings and surface texture are allowed to differ - judge the building geometry, the camera, the cladding COLOUR FAMILY and whether each door is solid or glazed. Glazing that is part of a door belongs to the door and is never a window. Report: sameViewpoint - true only if the render keeps the source camera angle, side and framing of the building, with nothing the source shows cropped out; doorsMatch - true only if the render shows exactly the exterior door sets the source shows, same count on the same walls, none added, removed or moved; windowsMatch - true only if the render shows exactly the window openings the source shows - adding any window the source does not show, or losing one it does, is false, and a blank wall in the source must stay blank; roofMatch - true only if the roof form is unchanged (flat stays flat, pitched stays pitched); claddingColourMatch - true only if the wall cladding in the render is the same colour family as in the source (dark green stays green rather than turning grey, black stays black, a slightly lighter or darker shade of the same colour is fine); doorStyleMatch - judged against the CLIENT SPECIFICATION when one is given, otherwise the source: true only if every door listed as SOLID is an opaque unglazed FLUSH door in the render - a flush door that has gained raised panels, mouldings, glazing or a letterbox is a restyle and FAILS - and every glazed door is glazed in the render with the same leaf count.' }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                sameViewpoint: { type: Type.BOOLEAN, description: "true only if the render keeps the source's camera angle and framing of the building" },
                                doorsMatch: { type: Type.BOOLEAN, description: "true only if the render shows exactly the door sets the source shows" },
                                windowsMatch: { type: Type.BOOLEAN, description: "true only if the render shows exactly the windows the source shows" },
                                roofMatch: { type: Type.BOOLEAN, description: "true only if the roof form is unchanged" },
                                claddingColourMatch: { type: Type.BOOLEAN, description: "true only if the render's wall cladding is the same colour family as the source's" },
                                doorStyleMatch: { type: Type.BOOLEAN, description: "true only if solid doors stay solid and glazed doors stay glazed" },
                                problem: { type: Type.STRING, description: "One short sentence naming the worst difference; empty string if none" },
                            },
                            // Every flag is required. With structured output the
                            // model may omit an optional field, and an omitted
                            // claddingColourMatch is never `=== false` - so the
                            // colour and door-type guards silently never fired.
                            required: ["sameViewpoint", "doorsMatch", "windowsMatch", "roofMatch", "claddingColourMatch", "doorStyleMatch"]
                        }
                    }
                });
                return JSON.parse(resp.text);
            } catch (e) {
                console.warn('[VERIFY] inspection errored:', e.message || e);
                return null;
            }
        };

        /**
         * A second, single-question look at SOLID doors, on a stronger judge.
         *
         * The lite inspector passed a render in which a specified-solid door
         * had come back glazed: asked six things at once about two images, it
         * missed the glass. When the specification lists a solid door, this
         * asks one question of the render alone - is any door glazed - on the
         * full flash model. Only runs when there is a solid door to protect,
         * so it costs nothing on the common glazed-door design.
         */
        const inspectSolidDoors = async (renderB64) => {
            if (!/SOLID/.test(specFacts)) return null;
            qaCalls++;
            try {
                const resp = await ai.models.generateContent({
                    model: ANALYSIS_MODEL,
                    contents: {
                        parts: [
                            fileToGenerativePart(renderB64, "image/jpeg"),
                            { text: 'This is a render of a garden building. The client ordered: ' + specFacts + ' Look only at the doors that are visible. Report anyGlazedSolidDoor = true if any door that the order lists as SOLID shows glass, glazing panels, a window in the leaf, or see-through panes - a reflection on a flat opaque panel is NOT glazing. Report false if every solid door is an opaque panel leaf. Name the offending door in problem, or leave it empty.' }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                anyGlazedSolidDoor: { type: Type.BOOLEAN, description: "true if a door ordered as SOLID shows glass" },
                                problem: { type: Type.STRING, description: "which door, and what it shows; empty if none" },
                            },
                            required: ["anyGlazedSolidDoor"]
                        }
                    }
                });
                return JSON.parse(resp.text);
            } catch (e) {
                console.warn('[VERIFY] solid-door check errored:', e.message || e);
                return null;
            }
        };

        /** Pass 2: the pro model finishes the surfaces of a pass-1 render. */
        const runMaterialsPass = async (pass1B64) => {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image',
                contents: {
                    parts: [fileToGenerativePart(pass1B64, "image/jpeg"), { text: MATERIALS_PASS_PROMPT }]
                },
                config: {
                    outputMimeType: "image/jpeg",
                    imageConfig: {
                        aspectRatio: isSketchUpMode ? (ratio || "16:9") : "16:9",
                        imageSize: "2K",
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
            return null;
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
            // Studio renders deliberately isolate the building on a backdrop,
            // so the framing comparison would judge a scene that is meant to
            // differ. The openings and roof checks still apply - the studio
            // changes the setting, never the building.
            const checkFraming = !studioBackground;

            /** Run every check against one attempt; failures are prompt-ready sentences. */
            const gatherFailures = async (renderB64) => {
                const failures = [];
                const seen = await inspectRenderFidelity(base64Image, renderB64, specFacts);
                if (!seen) return failures;
                const why = seen.problem ? ` (${sanitizeString(String(seen.problem), 160)})` : '';
                if (seen.doorsMatch === false) failures.push(`the render does not show the same exterior door sets as the source image${why}. Render EXACTLY the door sets the source shows - same count, same walls, same positions; none added, none removed, none moved`);
                if (seen.windowsMatch === false) failures.push(`the render does not show the same windows as the source image${why}. Do NOT add any window opening the source does not show, and do not remove any it does - a blank wall in the source stays a blank wall`);
                if (seen.roofMatch === false) failures.push(`the render changed the roof form${why}. Keep the source image's exact roof form - flat stays flat, pitched stays pitched`);
                if (seen.claddingColourMatch === false) failures.push(`the render changed the cladding colour${why}. The wall cladding must stay the same colour family as the source image${req.body.configSpec ? ' and exactly the colour listed in the CONFIGURED BUILDING SPECIFICATION' : ''} - do not shift it toward grey or any other colour`);
                if (seen.doorStyleMatch === false) failures.push(`the render changed a door's type${why}. A solid, unglazed door in the source stays a solid, unglazed panel with no glass; a glazed door stays glazed`);
                if (checkFraming && seen.sameViewpoint === false) {
                    failures.push(`the render changed the camera${why}. The source image's exact camera position, angle, framing and crop are MANDATORY: same side of the building, same distance, nothing the source shows cropped out`);
                }
                // The dedicated solid-door look, only when the first pass did
                // not already catch a door-type change.
                if (seen.doorStyleMatch !== false) {
                    const solid = await inspectSolidDoors(renderB64);
                    if (solid && solid.anyGlazedSolidDoor === true) {
                        const which = solid.problem ? ` (${sanitizeString(String(solid.problem), 160)})` : '';
                        failures.push(`a door ordered as SOLID has been rendered with glass${which}. Render that door as an opaque, unglazed, flush panel leaf in the frame colour - no glazing, no panes, no window in the leaf`);
                    }
                }
                return failures;
            };

            const failures = await gatherFailures(b64Data);
            verification = { checked: true, passed: failures.length === 0, retried: false, failures };
            if (failures.length) {
                console.warn('[VERIFY] render failed checks, retrying once:', failures.join('; '));
                const correction = `

      PREVIOUS ATTEMPT REJECTED - CORRECTIONS REQUIRED:
      A previous render of this exact scene was rejected by quality control because:
${failures.map(f => `      - ${f}`).join('\n')}
      Fix these exactly. The SOURCE image is the absolute truth for geometry,
      openings and camera - reproduce exactly the doors, windows, roof and
      viewpoint it shows, nothing more and nothing less.${req.body.configSpec ? ' The CONFIGURED BUILDING SPECIFICATION only sizes and styles what the source already shows - it never adds anything - and it is the absolute truth for cladding colour, fascia and whether a door is solid or glazed.' : ''}`;
                const retryB64 = await runRender(prompt + correction);
                if (retryB64) {
                    const failures2 = await gatherFailures(retryB64);
                    verification = { checked: true, passed: failures2.length === 0, retried: true, failures: failures2 };
                    if (failures2.length <= failures.length) b64Data = retryB64;
                    if (failures2.length) console.warn('[VERIFY] retry still failing checks, returning best attempt:', failures2.join('; '));
                }
            }
        } catch (e) {
            console.warn('[VERIFY] verification skipped:', e.message || e);
        }

        /**
         * PASS 2 - see MATERIALS_PASS_PROMPT. CGI sources only: a photograph
         * already has real materials. Inspected against the ORIGINAL source
         * with the same checks as pass 1; the moment it fails one, pass 1
         * ships instead. It can improve a render, never make one worse.
         */
        let refined = false;
        // The OpenAI engines finish the surfaces in their one pass; the Gemini
        // materials pass would only give the Pro model a chance to drift.
        if (isSketchUpMode && b64Data && imageEngine === 'gemini') {
            try {
                const finished = await runMaterialsPass(b64Data);
                if (finished) {
                    const seenFailures = await inspectRenderFidelity(base64Image, finished, specFacts);
                    const drift = !seenFailures ? [] : [
                        seenFailures.doorsMatch === false && 'doors',
                        seenFailures.windowsMatch === false && 'windows',
                        seenFailures.roofMatch === false && 'roof',
                        seenFailures.claddingColourMatch === false && 'cladding colour',
                        seenFailures.doorStyleMatch === false && 'door type',
                        (!studioBackground && seenFailures.sameViewpoint === false) && 'camera',
                    ].filter(Boolean);
                    if (!drift.length) { b64Data = finished; refined = true; }
                    else console.warn('[REFINE] pass 2 changed the building (' + drift.join(', ') + '), keeping pass 1' + (seenFailures.problem ? ': ' + String(seenFailures.problem).slice(0, 160) : ''));
                }
            } catch (e) {
                console.warn('[REFINE] materials pass skipped:', e.message || e);
            }
        }

        logRender(req, 'renderBuilding', imageEngine === 'gemini' ? 'gemini-3.1-flash-image' : OPENAI_IMAGE_MODEL, '2K', {
            sketchUpMode: isSketchUpMode,
            imageEngine,
            // The tier that actually ran and what it cost in tokens - the
            // last call's usage, which is the one the customer received.
            quality: imageEngine === 'gemini' ? null : imageQuality,
            qualityClamped,
            ...openAiUsageLog(openAiUsage),
            verified: verification.checked ? verification.passed : null,
            retried: !!verification.retried,
            // Billable calls this render actually made, so the log prices
            // itself: image calls on the Pro model, plus the QA inspections.
            imageCalls: (verification.retried ? 2 : 1) + (refined ? 1 : 0),
            refined,
            refineModel: refined ? 'gemini-3-pro-image' : null,
            qaCalls,
            qaModel: qaCalls ? 'gemini-3.5-flash-lite' : null,
            // Why it failed, in the inspector's own words - truncated because
            // this is a diagnostic breadcrumb, not a transcript.
            failures: (verification.failures || []).map(f => String(f).slice(0, 300)),
        });

        return res.json({ result: b64Data, quality: imageEngine === 'gemini' ? null : imageQuality, qualityClamped, verification: { ...verification, refined, imageEngine } });
    } catch (error) {
        console.error("Render error in /api/renderBuilding:", error, error.stack);
        // A refusal we can explain in our own words (see runOpenAIEdit).
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
        // Log the real error above; never echo internals to the client.
        res.status(500).json({ error: 'The render could not be completed. Please try again in a moment.' });
    }
});

app.post('/api/editImage', userAiLimiter, async (req, res) => {
    try {
        const base64Image   = sanitizeString(req.body.base64Image, 10_000_000);
        const maskImage     = sanitizeString(req.body.maskImage, 10_000_000);
        const editPrompt    = sanitizeString(req.body.editPrompt, 1000); // embedded directly in prompt — strict cap
        const ratio         = sanitizeString(req.body.ratio, 10);
        const isProMode     = sanitizeBool(req.body.isProMode);

        // Generation is 2K on every plan - 4K is the metered /api/export4k
        // action only - so this always meters at the standard rate.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
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
        - Output Resolution: 2K High Definition.
        - CRITICAL DIMENSIONS: Output at 2K (2048 pixels on the long edge). Do not
          upscale and do not increase the pixel count beyond this - it locks the
          pricing tier. Maintain 100% of the original image's sharpness.
      `;

        parts.push({ text: prompt });

        if (openAiReady()) {
            // Sunburst: the render as the edit input, the mask (when drawn)
            // as a second image the prompt refers to, at the user's tier.
            const { quality } = await resolveImageQuality(req);
            const images = [{ b64: base64Image, mime: 'image/jpeg' }];
            if (maskImage) images.push({ b64: maskImage, mime: 'image/jpeg' });
            const out = await openAiImageEdit({
                prompt: (maskImage ? 'Image 1 is the photograph to edit. Image 2 is a mask of the SAME frame: the marked area is the only region you may change.\n\n' : '') + prompt,
                images, size: openAiSizeFor(ratio, 2048), quality, label: 'editImage',
            });
            if (!out.b64) throw new Error("No edit generated");
            logRender(req, 'editImage', OPENAI_IMAGE_MODEL, '2K', { quality, ...openAiUsageLog(out.usage) });
            return res.json({ result: out.b64, quality });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: {
                parts: parts
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: ratio,
                    imageSize: "2K",
                    editMode: "EDIT_MODE_DEFAULT"
                },
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                logRender(req, 'editImage', 'gemini-3.1-flash-image', '2K');
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No edit generated");

    } catch (error) {
        console.error("Edit error:", error);
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

/** What each Material Studio surface is called to the segmenter. */
const SEGMENT_PROMPTS = {
    cladding: 'the exterior wall cladding boards of the building, excluding windows, doors and frames',
    roof: 'the roof covering of the building, excluding the sky',
    windows: 'the window glass and window frames of the building',
    doors: 'the entrance doors of the building including their frames',
    decking: 'the decking or patio surface on the ground in front of the building, excluding the lawn',
};

/**
 * Segmentation masks for the surfaces the Material Studio can repaint.
 *
 * The client asks for a handful of labels (cladding, roof, windows, doors,
 * decking - or the subject of a free-text instruction) and gets back, per
 * region found, Gemini's 2D box (0-1000 normalised, [ymin, xmin, ymax,
 * xmax]) and a PNG probability mask that fills that box. The client scales
 * each mask into its box at the image's full resolution, thresholds it and
 * unions regions with the same label - that union is the ONLY area a
 * material change is allowed to touch (see /api/inpaintMasked and
 * utils/maskedEdit on the client).
 */
app.post('/api/segmentMaterials', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const rawLabels = Array.isArray(req.body.labels) ? req.body.labels : [];
        const labels = rawLabels.map(l => sanitizeString(l, 80)).filter(Boolean).slice(0, 8);
        if (!base64Image || !labels.length) return res.status(400).json({ error: 'An image and at least one label are needed' });
        if (!process.env.FAL_KEY) return res.status(503).json({ error: 'Surface mapping needs FAL_KEY on the server.' });

        const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
        if (!access.allowed) return res.status(access.status).json(access.body);

        /*
         * One SAM call per label, in parallel. The label is turned into the
         * referring expression the segmenter is best at ("the exterior wall
         * cladding boards of the building"); a free instruction goes through
         * as its own words. Each answer is a full-frame mask PNG, white where
         * the surface is - the client uses it directly.
         */
        const imageUrl = `data:image/jpeg;base64,${base64Image}`;
        const one = async (label) => {
            const prompt = SEGMENT_PROMPTS[label.toLowerCase()] || label;
            // Through fal's queue, not one long request: a cold start of the
            // segmenter has taken over four minutes, which no single HTTP
            // call should be asked to sit through. Submit, poll, fetch.
            const sub = await fetch('https://queue.fal.run/fal-ai/evf-sam', {
                method: 'POST', headers: falHeaders(),
                body: JSON.stringify({ image_url: imageUrl, prompt, mask_only: true, fill_holes: true }),
            });
            const subJson = await sub.json().catch(() => ({}));
            const statusUrl = subJson?.status_url, responseUrl = subJson?.response_url;
            if (!sub.ok || !statusUrl || !responseUrl) { console.warn('[SAM] submit', label, sub.status, JSON.stringify(subJson).slice(0, 200)); return null; }
            const deadline = Date.now() + 6 * 60 * 1000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 2500));
                const st = await fetch(statusUrl, { headers: falHeaders() }).then(r => r.json()).catch(() => ({}));
                if (st.status === 'COMPLETED') break;
                if (st.status === 'FAILED' || st.status === 'CANCELLED') { console.warn('[SAM] failed', label, JSON.stringify(st).slice(0, 200)); return null; }
            }
            const j = await fetch(responseUrl, { headers: falHeaders() }).then(r => r.json()).catch(() => ({}));
            const url = j?.image?.url;
            if (!url) { console.warn('[SAM] no mask', label, JSON.stringify(j).slice(0, 200)); return null; }
            const png = Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64');
            return { label, full: true, box_2d: [0, 0, 1000, 1000], mask: png };
        };
        const t0 = Date.now();
        const result = (await Promise.all(labels.map(one))).filter(Boolean);
        console.log(`[SAM] ${result.length}/${labels.length} surfaces in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        res.json({ result });
    } catch (error) {
        console.error('Segmentation error:', error);
        res.status(500).json({ error: 'Could not work out the surfaces in this image. Please try again.' });
    }
});

/**
 * A TRUE masked edit: paint only inside the mask.
 *
 * The client sends a crop of the photograph around the surface being changed
 * and a PNG mask the same size whose transparent pixels are the region to
 * repaint. The model (Sunburst) fills that region; the client then composites
 * the result back over the ORIGINAL pixels through the mask, so every pixel
 * outside it is byte-identical to the source and the image is never
 * re-synthesised. Sizes must be multiples of 16 - the client sees to that.
 */
app.post('/api/inpaintMasked', userAiLimiter, async (req, res) => {
    try {
        const base64Image = sanitizeString(req.body.base64Image, 10_000_000);
        const maskPng     = sanitizeString(req.body.maskPng, 10_000_000);
        const editPrompt  = sanitizeString(req.body.editPrompt, 800);
        const width       = Math.max(256, Math.min(3840, Math.floor((Number(req.body.width) || 0) / 16) * 16));
        const height      = Math.max(256, Math.min(3840, Math.floor((Number(req.body.height) || 0) / 16) * 16));
        if (!base64Image || !maskPng || !editPrompt) return res.status(400).json({ error: 'Image, mask and an instruction are needed' });
        if (!openAiReady()) return res.status(503).json({ error: 'Masked editing needs the image engine (OPENAI_API_KEY) on the server.' });

        const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) return res.status(access.status).json(access.body);

        const { quality } = await resolveImageQuality(req);
        const prompt = `You are an inpainting engine. Paint ONLY the transparent (masked) region of the image. Instruction for that region: ${editPrompt}
Rules: the new surface must follow the exact geometry, perspective, scale and lighting of the photograph - the same planes, the same shadows falling across it, the same reflections and weathering. Keep every boundary where the mask meets the untouched photograph seamless. Do not add, remove or move any object. Do not change anything outside the masked region; it will be discarded anyway. Photographic, sharp, no painterly texture.`;
        const out = await openAiImageEdit({
            prompt,
            images: [{ b64: base64Image, mime: 'image/jpeg' }],
            mask: maskPng,
            size: `${width}x${height}`,
            quality,
            label: 'inpaintMasked',
        });
        if (!out.b64) throw new Error('No edit generated');
        logRender(req, 'inpaintMasked', OPENAI_IMAGE_MODEL, `${width}x${height}`, { quality, ...openAiUsageLog(out.usage) });
        res.json({ result: out.b64, quality });
    } catch (error) {
        console.error('Masked inpaint error:', error);
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
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
            model: ANALYSIS_MODEL,
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
            model: ANALYSIS_MODEL,
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
            model: ANALYSIS_MODEL,
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

/**
 * Weather Lab (rebuilt 18 Sep 2026 on the contract engine - see
 * render/weather.js). Weather is the ONLY thing allowed to change: the
 * render's exact line drawing locks the geometry, the prompt says what the
 * weather physically does, and the result is verified against the source
 * render item by item with one strictly-better retry. The old route asked
 * Sunburst to "re-light and compose" and checked nothing.
 */
app.post('/api/applyWeather', userAiLimiter, async (req, res) => {
    const t0 = Date.now();
    try {
        const stripData = (v) => (typeof v === 'string' ? v.replace(/^data:[^;]+;base64,/, '') : '');
        const base64Image = stripData(sanitizeString(req.body.base64Image, 12_000_000));
        let line = stripData(sanitizeString(req.body.line, 6_000_000)) || null;
        const ratio = safeRatio(sanitizeString(req.body.ratio, 10));
        const rawWeather = req.body.weather || {};
        const weather = {
            condition: sanitizeString(rawWeather.condition, 100),
            season: sanitizeString(rawWeather.season, 50),
            timeOfDay: sanitizeString(rawWeather.timeOfDay, 50),
            notes: sanitizeString(rawWeather.notes, 300),
        };
        if (!base64Image || base64Image.length < 100) return res.status(400).json({ error: 'No image supplied.' });

        // Generation is 2K on every plan - 4K is the metered /api/export4k
        // action only - so this always meters at the standard rate.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) return res.status(access.status).json(access.body);

        const sniff = (b64) => { const h = Buffer.from(String(b64).slice(0, 32), 'base64'); return h[0] === 0x89 && h[1] === 0x50 ? 'image/png' : 'image/jpeg'; };
        const srcMime = sniff(base64Image);

        // The geometry lock: the engine's own drawing when the render came from
        // it, otherwise one drawn now (an ANALYSIS-priced Flash call).
        let lineSource = line ? 'engine' : 'none';
        let imageCalls = 0;
        if (!line) {
            line = await drawImage(ai, { model: GEOMETRY_MODEL, images: [{ b64: base64Image, mime: srcMime }], prompt: LINE_CONVERSION_PROMPT, ratio, label: 'weather-line' });
            imageCalls++;
            lineSource = line ? 'drawn' : 'none';
        }
        const lineMime = line ? sniff(line) : 'image/png';
        const references = line ? [{ b64: line, mime: lineMime }, { b64: base64Image, mime: srcMime }] : [{ b64: base64Image, mime: srcMime }];

        // What the verifier checks: the design's inventory when the client has
        // one (a render straight from the engine), the generic four otherwise.
        let items = inventoryFromItems(req.body.items);
        if (!items.length) items = inventoryFromItems(GENERIC_WEATHER_ITEMS);

        const prompt = buildWeatherPrompt({ ...weather, hasLine: !!line });
        let image = await drawImage(ai, { model: FINISH_MODEL, images: references, prompt, ratio, label: 'weather' });
        imageCalls++;
        if (!image) throw new Error('No weather image generated');

        // Verified against the SOURCE RENDER, not the drawing: same camera, same
        // items; lighting, sky and what lies on surfaces are allowed to differ.
        const verifyArgs = { model: ANALYSIS_MODEL, referenceB64: base64Image, referenceMime: srcMime, items, kind: 'render' };
        let verification = await verifyRender(ai, Type, { ...verifyArgs, renderB64: image });
        const attempts = [{ pass: 'weather', ...verification }];
        let shipped = 'pass1';
        if (verification.checked && !verification.passed) {
            console.warn('[WEATHER] pass 1 failed verification:', verification.failures.map(f => `${f.label}: ${f.problem}`).join('; '));
            const promoted = 'PREVIOUS ATTEMPT REJECTED. These were changed and must stay exactly as the source shows: ' + verification.failures.map(f => `${f.label} (${f.problem})`).join('; ') + '.\n\n';
            const retry = await drawImage(ai, { model: FINISH_MODEL, images: references, prompt: promoted + prompt, ratio, label: 'weather-retry' });
            imageCalls++;
            if (retry) {
                const v2 = await verifyRender(ai, Type, { ...verifyArgs, renderB64: retry });
                attempts.push({ pass: 'retry', ...v2 });
                if (!v2.checked || v2.failures.length < verification.failures.length) { image = retry; verification = v2; shipped = 'retry'; }
                if (!v2.passed) console.warn('[WEATHER] retry still failing, shipping the better attempt');
            }
        }

        logRender(req, 'applyWeather', FINISH_MODEL, '2K', {
            condition: weather.condition, season: weather.season, timeOfDay: weather.timeOfDay,
            imageCalls, qaCalls: attempts.length, shipped, lineSource, verified: verification.passed, verificationChecked: verification.checked,
            failures: verification.failures.map(f => `${f.id}: ${f.problem}`).slice(0, 12), seconds: Math.round((Date.now() - t0) / 1000),
        });
        return res.json({
            result: image,
            line: lineSource === 'drawn' ? line : undefined,
            engine: { finish: FINISH_MODEL, shipped, lineSource },
            verification: { ...verification, attempts: attempts.map(a => ({ pass: a.pass, checked: a.checked, passed: a.passed, failures: a.failures })) },
            seconds: Math.round((Date.now() - t0) / 1000),
        });
    } catch (error) {
        console.error("Weather error:", error);
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
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
        /**
         * Two kinds of analysis share this route (Charlie, 21 Sep 2026):
         * 'materials' - the original 16 textures and fixtures for the 2x2
         * macro sheet - and 'shots', which reads the render like a
         * photographer and suggests the camera shots worth taking of THIS
         * building, each a single framed picture the user picks from. Same
         * string[] shape either way, so the client's list is unchanged.
         */
        const kind = req.body.kind === 'shots' ? 'shots' : 'materials';
        const prompt = kind === 'materials' ? `
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
        ` : `
            You are an architectural photographer looking at this finished render of a garden building.

            TASK: Suggest 8 distinct close-up or detail SHOTS of this exact scene that would sit well in a brochure or on an architect's website. Each shot is one sentence: what the camera frames, what it focuses on, and roughly where it is looking from.

            RULES:
            - Every shot must be of something ACTUALLY VISIBLE in this image - name the real thing (the pool table seen through the sliding doors, the corner where the cladding meets the fascia, the wall light beside the window). Never invent a feature.
            - Mix them: two or three looking IN through the glazing at the interior, two or three tight on exterior materials or junctions (cladding, frames, fascia, deck edge, a light fitting), one or two at three-quarter angles that show a corner of the building, and one that catches a reflection in the glass.
            - Same building, same materials, same time of day and weather as the image; the shots are just closer and differently framed.
            - No garden-only shots (no lawn, plants or fences on their own).

            OUTPUT:
            - Return ONLY a JSON array of 8 strings, each a short sentence, e.g. "Close-up through the sliding doors of the pool table, focused on the table with the cladding soft in the foreground".
        `;

        const response = await ai.models.generateContent({
            model: ANALYSIS_MODEL,
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
        const fallback = kind === 'materials' ? [
            "Cladding Texture", "Roof Detail", "Window Frame Corner", "Soffit Detail",
            "External Lighting", "Exterior Trim", "Door Handle", "Glass Reflection",
            "Gutter Detail", "Timber Grain", "Brickwork Texture", "Threshold Detail",
            "Fascia Board", "Wall Junction", "Panel Seam", "Step Detail"
        ] : [
            "Close-up through the main glazing at the interior, focused on the furniture inside",
            "Tight three-quarter shot of the front corner where the cladding meets the fascia",
            "Detail of a door frame and handle with the cladding soft either side",
            "Close-up of the wall light against the cladding boards",
            "Low shot along the deck edge towards the doors",
            "Reflection of the garden and sky in the glazing, the interior just visible behind",
            "Detail of the roof edge and fascia line against the sky",
            "Close-up of the window frame corner and the boards around it",
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
        
        // Generation is 2K on every plan (the board was the last endpoint still
        // paying the 4K tier - 12p -> 8p), so it meters at the standard rate
        // like every other single-image call.
        const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
        if (!access.allowed) {
            return res.status(access.status).json(access.body);
        }

        /**
         * ONE shot, not a 2x2 sheet (Charlie, 21 Sep 2026). The user picks a
         * camera shot the analysis suggested ("close-up through the sliding
         * doors of the pool table, focused on the table") and this produces
         * that single picture from the render: a second camera on the same
         * scene, same building, same light, nothing redesigned.
         */
        if (focusPoints.length !== 1 && focusPoints.length !== 4) {
            throw new Error("Pick one camera shot, or four material focal points");
        }
        const shot = focusPoints[0];

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        // Four focal points: the original 2x2 material sheet (kept, Charlie
        // 21 Sep). One: a single camera shot.
        const prompt = focusPoints.length === 4 ? `
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
        - Maintain RAW true-to-life photorealism. Ensure extreme micro-texture detail as this is a macro shot. DO NOT allow texture painting/smoothing.
        - CRITICAL DIMENSIONS: Strictly lock the output resolution to exactly 2048 x 2048 pixels (2K Square limit). Do not exceed this pixel count to ensure pricing tier.
      ` : `
        TASK: You are a second camera on the SAME scene as the provided render. Take this one shot: ${shot}

        HARD RULES - these override everything below.
        - The provided image is the absolute source of truth. It shows a finished building; you are photographing it again from closer, not redesigning it.
        - Every wall, opening, frame, board, fitting and piece of furniture in your shot is exactly as the source shows it: same count, same position, same size, same shape, same colour, same material and board direction. Nothing is added, removed, moved, restyled or repeated.
        - Keep the same time of day, weather, sky and lighting as the source; the light simply falls on things from closer.
        - What is beyond the edge of the source image is unknown: frame the shot so it stays within what the source actually shows.
        - No people, no props, no new furniture, no text.

        STYLE:
        - A single photograph, editorial architectural photography: one strong key light as in the source, deep but open shadows, real contrast, a subtle warm grade.
        - A real camera's shallow depth of field where the shot calls for it - the subject sharp, the near and far softly out of focus - and true micro-texture on every material in focus: grain, joints, seams, fabric weave, glass with real reflections.
        - Square, 2048 x 2048 pixels.
      `;

        if (openAiReady()) {
            const { quality } = await resolveImageQuality(req);
            const out = await openAiImageEdit({
                prompt, images: [{ b64: base64Image, mime: 'image/jpeg' }],
                size: '2048x2048', quality, label: 'presentationBoard',
            });
            if (!out.b64) throw new Error("No presentation board generated");
            logRender(req, 'generatePresentationBoard', OPENAI_IMAGE_MODEL, '2K', { quality, ...openAiUsageLog(out.usage) });
            return res.json({ result: out.b64, quality });
        }

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
                    imageSize: "2K"
                },
                temperature: 0.2
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                logRender(req, 'generatePresentationBoard', 'gemini-3.1-flash-image', '2K');
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No presentation board generated");

    } catch (error) {
        console.error("Scene Studio error:", error);
        if (error && error.clientMessage) return res.status(400).json({ error: error.clientMessage });
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

/**
 * Upscale to 4K (18 Sep 2026). Decided: a TRUE upscale, not a re-draw.
 *
 * Every tool generates at 2K. This takes the finished, verified 2K image and
 * enlarges it with Topaz (on fal.ai, "CGI" mode, built for renders) to 3840
 * on the long edge. Pixel for pixel the same picture, sharper - it cannot
 * move a window, which the previous version (a Sunburst / Gemini
 * "reproduce this at 4K" generation, ~19p) could and sometimes did.
 * Costs $0.08 an image (~6p) up to 24MP. Metered at FOUR_K_EXPORTS_PER_MONTH
 * per calendar month, Business only; the claim is only spent on success.
 *
 * Needs FAL_KEY. Without it the route says so rather than falling back to a
 * re-draw - the whole point is that the geometry does not change.
 */
const UPSCALE_MODEL = 'fal-ai/topaz/upscale/image';
const UPSCALE_LONG_EDGE = 3840;

/** Pixel size of a JPEG or PNG from its header; null if unreadable. */
const imageDims = (b64) => {
    try {
        const b = Buffer.from(b64.slice(0, 200_000), 'base64');
        if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
        let i = 2;
        while (i < b.length - 9) {
            if (b[i] !== 0xFF) return null;
            const m = b[i + 1];
            if (m >= 0xC0 && m <= 0xC3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
            i += 2 + b.readUInt16BE(i + 2);
        }
    } catch { /* fall through */ }
    return null;
};

/** Submit to fal's queue and wait for the file; returns { b64, mime, width, height }. */
const topazUpscale = async ({ base64Image, factor, format }) => {
    const submit = await fetch(`https://queue.fal.run/${UPSCALE_MODEL}`, {
        method: 'POST', headers: falHeaders(),
        body: JSON.stringify({
            image_url: `data:image/jpeg;base64,${base64Image}`,
            model: 'CGI',
            upscale_factor: factor,
            output_format: format,
            // A render has no faces to "enhance"; leaving this on invents them.
            face_enhancement: false,
            subject_detection: 'All',
        }),
    });
    const job = await submit.json().catch(() => ({}));
    if (!submit.ok || !job.request_id) throw new Error('Upscale did not start: ' + submit.status + ' ' + JSON.stringify(job).slice(0, 300));
    // Status and result live under the app (owner/app), not the full path.
    const app = UPSCALE_MODEL.split('/').slice(0, 2).join('/');
    const t0 = Date.now();
    let responseUrl = null;
    while (Date.now() - t0 < 180_000) {
        await new Promise(r => setTimeout(r, 1500));
        const st = await fetch(`https://queue.fal.run/${app}/requests/${job.request_id}/status`, { headers: falHeaders() });
        const status = await st.json().catch(() => ({}));
        if (!st.ok) throw new Error('Upscale status failed: ' + st.status);
        if (status.status === 'COMPLETED') { responseUrl = String(status.response_url || ''); break; }
    }
    if (!responseUrl) throw new Error('Upscale timed out');
    if (!responseUrl.startsWith('https://queue.fal.run/')) throw new Error('Upscale result URL unexpected');
    const rs = await fetch(responseUrl, { headers: falHeaders() });
    const result = await rs.json().catch(() => ({}));
    const url = result?.image?.url;
    if (!rs.ok || !url) throw new Error('Upscale failed: ' + JSON.stringify(result?.detail || result).slice(0, 300));
    const file = await fetch(url);
    if (!file.ok) throw new Error('Upscale file fetch failed: ' + file.status);
    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString('base64');
    // fal does not report the size; read it off the file.
    const d = imageDims(b64) || {};
    return { b64, mime: result.image.content_type || (format === 'png' ? 'image/png' : 'image/jpeg'), width: d.w, height: d.h };
};

app.post('/api/export4k', userAiLimiter, async (req, res) => {
    let claimed = false;
    let uid = null;
    try {
        const base64Image = sanitizeString(req.body.base64Image, 12_000_000).replace(/^data:[^;]+;base64,/, '');
        const format = req.body.format === 'png' ? 'png' : 'jpeg';
        if (!base64Image || base64Image.trim().length < 100) {
            return res.status(400).json({ error: 'No image supplied for export.' });
        }
        if (!process.env.FAL_KEY) {
            return res.status(503).json({ error: 'The 4K upscaler is not configured on this server (FAL_KEY).' });
        }

        const plan = await resolveEffectivePlan(req);
        if (plan === null) {
            return res.status(503).json({ error: '4K export temporarily unavailable. Please try again shortly.' });
        }
        if (!FOUR_K_PLANS.has(plan)) {
            return res.status(403).json({ error: '4K export is part of The Hub. Your renders are delivered at 2K.' });
        }

        const dims = imageDims(base64Image);
        const longEdge = dims ? Math.max(dims.w, dims.h) : 2048;
        // Exactly what reaches 3840 on the long edge, within Topaz's range;
        // an image already past 4K is sharpened at 1.5x rather than refused.
        const factor = Math.min(4, Math.max(1.5, Math.round((UPSCALE_LONG_EDGE / longEdge) * 100) / 100));

        uid = req.user.uid;
        const claim = await claimFourKExport(uid);
        if (!claim.allowed) {
            return res.status(claim.status || 402).json({ error: claim.error });
        }
        claimed = true;

        const t0 = Date.now();
        const out = await topazUpscale({ base64Image, factor, format });
        logRender(req, 'export4k', 'topaz-cgi', '4K', { factor, from: dims, to: { w: out.width, h: out.height }, seconds: Math.round((Date.now() - t0) / 1000) });
        return res.json({ result: out.b64, mime: out.mime, width: out.width, height: out.height, factor, fourKLeft: claim.remaining });
    } catch (error) {
        // The claim is only spent on success - a failure at the upscaler must
        // not cost the user one of their fifty.
        if (claimed && uid) await releaseFourKExport(uid);
        console.error("4K export error:", error);
        res.status(500).json({ error: 'The 4K upscale could not be completed. Your allowance was not used - please try again in a moment.' });
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
        const plan = snap.exists ? (snap.data().plan || 'free') : 'free';
        if (PAID_PLANS.has(plan)) return plan;
        // Open tester access: a confirmed email with no paid plan is a tester.
        if (req.user?.beta === true || req.user?.email_verified === true) return 'tester';
        return plan;
    } catch (e) {
        console.error('[ANIMATION] Plan lookup failed:', e.message || e);
        return null; // caller treats null as "refuse", never as "free"
    }
};

/**
 * Video credit balance, in pence, on the user document. Debit is a
 * transaction that refuses to go below zero; refund puts it back when a
 * generation fails (Higgsfield refunds us too, so nobody is out of pocket).
 */
const debitVideoCredits = async (uid, pence, modelKey) => {
    if (!db) return { ok: false, error: 'Billing unavailable.', balance: 0 };
    const ref = db.collection('users').doc(uid);
    try {
        return await db.runTransaction(async (t) => {
            const snap = await t.get(ref);
            const balance = (snap.exists && Number(snap.data().videoCreditsPence)) || 0;
            if (balance < pence) {
                return { ok: false, balance, error: `This clip costs £${(pence / 100).toFixed(2)} and your video credit balance is £${(balance / 100).toFixed(2)}. Top up video credits to continue.` };
            }
            t.set(ref, { videoCreditsPence: balance - pence, lastVideoCharge: { pence, model: modelKey, at: Date.now() } }, { merge: true });
            return { ok: true, balance: balance - pence };
        });
    } catch (e) {
        console.error('[VIDEO CREDITS] debit failed:', e.message || e);
        return { ok: false, error: 'Billing temporarily unavailable. Please try again shortly.', balance: 0 };
    }
};
const refundVideoCredits = async (uid, pence) => {
    if (!db || !pence) return;
    try { await db.collection('users').doc(uid).set({ videoCreditsPence: admin.firestore.FieldValue.increment(pence) }, { merge: true }); }
    catch (e) { console.error('[VIDEO CREDITS] refund failed:', e.message || e); }
};

app.post('/api/animation/start', userAiLimiter, async (req, res) => {
    let claimed = false;
    let chargedPence = 0;
    try {
        // Parked for launch (18 Sep 2026): master only until the Higgsfield key is on and tested.
        if (!isMasterUser(req.user)) return res.status(403).json({ error: 'Animation Studio is coming soon.' });
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
            // Same per-account override withEntitlements honours, so the
            // button and the endpoint agree. One extra read, and only on the
            // path that was about to refuse.
            let override = false;
            if (db) {
                try {
                    const snap = await db.collection('users').doc(req.user.uid).get();
                    override = snap.exists && snap.data().animationEnabled === true;
                } catch (e) {
                    console.error('[ANIMATION] Override lookup failed:', e.message || e);
                }
            }
            if (!override) {
                return res.status(403).json({ error: 'Animation Studio is part of The Hub.' });
            }
        }

        /**
         * Which model, and who pays. Business includes ANIMATION_MONTHLY_LIMIT
         * Kling clips a month; after that, or for Seedance, the clip is paid
         * from the video credit balance at VIDEO_MODELS prices. Claimed or
         * debited BEFORE the model is called - the provider bills whether or
         * not we deliver - and released / refunded below if it fails.
         */
        const videoModel = req.body.model === 'seedance' ? 'seedance' : 'kling';
        const vm = VIDEO_MODELS[videoModel];
        if (!vm.available()) {
            return res.status(400).json({ error: `${vm.label} is not switched on yet.` });
        }
        const useHf = hfReady();
        // The clip: length and resolution, clamped to the model; on the fal
        // fallback Kling is fixed at 8 seconds 1080p as before.
        const seconds = useHf ? Math.min(vm.maxSeconds, Math.max(vm.minSeconds, parseInt(req.body.duration) || vm.defaultSeconds)) : ANIMATION_SECONDS;
        const resolution = vm.resolutions.includes(req.body.resolution) ? req.body.resolution : vm.defaultResolution;
        const sound = req.body.sound === true || req.body.sound === 'on';
        const freePrompt = sanitizeString(req.body.prompt, 1200);
        const pricePence = videoPricePence(videoModel, seconds, resolution);
        /**
         * Included clips: Business gets ANIMATION_MONTHLY_LIMIT Kling clips a
         * month of up to 8 seconds. Anything longer, or Seedance, is paid
         * from the video credit balance at the price shown on the button.
         */
        let charge = { kind: 'included', pence: 0 };
        let quota = { remaining: 0 };
        if (videoModel === 'kling' && seconds <= 8) {
            quota = await claimAnimation(req.user.uid);
            if (quota.allowed) { claimed = true; }
            else if (quota.status !== 402) { return res.status(quota.status).json({ error: quota.error }); }
            else quota = { remaining: 0 };
        }
        if (!claimed) {
            const debit = await debitVideoCredits(req.user.uid, pricePence, videoModel);
            if (!debit.ok) {
                return res.status(402).json({ error: debit.error, videoCreditsPence: debit.balance, needsVideoCredits: true, pricePence });
            }
            charge = { kind: 'credits', pence: pricePence, balance: debit.balance };
        }
        chargedPence = charge.pence;

        // A free-text prompt from the new studio replaces the preset build;
        // the scene lock is always appended so the building never changes.
        const prompt = freePrompt
            ? `${freePrompt} ${ANIMATION_SCENE_LOCK_OPENING} ${ANIMATION_SCENE_LOCK_CLOSING}`
            : buildAnimationPrompt(preset, modifiers, extra);

        /**
         * Kick off one generation. Veo is a long-running operation: this call
         * returns in seconds with an operation handle, and the actual work
         * happens server-side while /status polls. That is a better fit than
         * the old model's single blocking call, which sat open for ~45s and
         * occasionally hung for minutes.
         *
         * A failed create is retried once - transient backend wobbles usually
         * clear immediately - and the attempt count is logged, because a
         * retried attempt may also have billed.
         */
        let videoAttempts = 0;
        const startOnce = async () => {
            videoAttempts++;
            const operation = await ai.models.generateVideos({
                model: ANIMATION_MODEL,
                prompt,
                image: { imageBytes: base64Image, mimeType: 'image/jpeg' },
                config: {
                    aspectRatio,
                    resolution: ANIMATION_RESOLUTION,
                    durationSeconds: ANIMATION_SECONDS,
                    numberOfVideos: 1,
                    // Veo DOES honour negative prompts, unlike the previous
                    // model - so the scene lock finally gets to say plainly
                    // what must not happen, instead of only hinting positively.
                    negativePrompt: ANIMATION_NEGATIVE_PROMPT,
                },
            });
            if (!operation?.name) throw new Error('The model did not start a video job.');
            return operation.name;
        };

        let operationName;
        if (useHf) {
            videoAttempts = 1;
            const imageUrl = await hfUpload(base64Image, 'image/jpeg');
            const input = videoModel === 'seedance'
                ? { image_url: imageUrl, prompt, duration: seconds, resolution, output_format: 'mp4', generate_audio: sound }
                : { image_url: imageUrl, prompt, duration: seconds, sound: sound ? 'on' : 'off', cfg_scale: 0.5, multi_shots: false };
            operationName = await hfStart(vm.path, input);
        } else if (ANIMATION_ENGINE === 'kling') {
            videoAttempts = 1;
            operationName = await klingStart({ base64Image, prompt, negativePrompt: ANIMATION_NEGATIVE_PROMPT, aspectRatio });
        } else {
            try {
                operationName = await startOnce();
            } catch (firstErr) {
                console.warn('[ANIM] first attempt failed, retrying once:', firstErr.message || firstErr);
                operationName = await startOnce();
            }
        }

        /**
         * Cost log. Video is by far the most expensive call here (~76p a clip
         * against ~10p for a render), and it was the ONE endpoint missing from
         * the log - so "what does a project cost" could not be answered for any
         * project containing an animation.
         */
        logRender(req, 'animation', useHf ? vm.path : (ANIMATION_ENGINE === 'kling' ? KLING_LABEL : ANIMATION_MODEL), useHf ? resolution : ANIMATION_RESOLUTION, {
            engine: useHf ? 'higgsfield' : ANIMATION_ENGINE,
            videoModel, videoAttempts, aspectRatio,
            durationSeconds: seconds, sound,
            charge: charge.kind, pricePence: charge.pence,
            costPenceEstimate: Math.round(vm.costUsdPerSecond(resolution) * seconds * USD_TO_GBP * 100),
        });

        // Named `fileName` for backwards compatibility: the client treats this
        // as an opaque handle and hands it back to /status and /video, so the
        // switch from file handles to operation names needs no client change.
        res.json({
            fileName: operationName,
            remaining: quota.remaining,
            limit: ANIMATION_MONTHLY_LIMIT,
            charge,
            seconds, resolution, model: videoModel,
        });

    } catch (error) {
        console.error('Animation start error:', error);
        if (claimed) await releaseAnimation(req.user.uid);
        if (chargedPence) await refundVideoCredits(req.user.uid, chargedPence);
        // The allowance really was released above - saying so stops users
        // abandoning the feature believing a failed attempt cost them a clip.
        res.status(500).json({ error: 'The animation service is having a busy moment and the clip could not be generated. Your monthly allowance was NOT used - please try again in a few minutes.' });
    }
});

/**
 * Operation names look like
 * `models/veo-3.1-fast-generate-preview/operations/abc123`. Validated rather
 * than trusted: the handle comes back from the browser, and it is used to make
 * an authenticated call with our own API key attached.
 */
const OPERATION_NAME_RE = /^models\/[a-zA-Z0-9._-]{1,80}\/operations\/[a-zA-Z0-9_-]{1,80}$/;

/** Resolve a finished video operation to its download URI, or null if it is
 *  still running. Throws if the operation itself failed. */
const resolveVideoUri = async (operationName) => {
    if (operationName.startsWith('kling:')) return klingResolve(operationName);
    // The SDK hydrates the result through the operation object it is given
    // (operation._fromAPIResponse), so a bare { name } is refused with
    // "_fromAPIResponse is not a function" and every status poll 500s. It
    // has to be a real GenerateVideosOperation carrying the name.
    const handle = new GenerateVideosOperation();
    handle.name = operationName;
    const op = await ai.operations.getVideosOperation({ operation: handle });
    if (!op?.done) return { done: false };
    if (op.error) {
        const detail = op.error.message || JSON.stringify(op.error);
        throw new Error(`Video generation failed: ${detail}`);
    }
    const uri = op.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
        // Done, no video: almost always a safety filter rather than a fault.
        const filtered = op.response?.raiMediaFilteredReasons?.join('; ');
        throw new Error(filtered ? `The clip was blocked: ${filtered}` : 'The model did not return a video.');
    }
    return { done: true, uri };
};

app.get('/api/animation/status', async (req, res) => {
    try {
        const name = sanitizeString(req.query.file, 200);
        if (!OPERATION_NAME_RE.test(name) && !KLING_HANDLE_RE.test(name) && !HF_HANDLE_RE.test(name)) {
            return res.status(400).json({ error: 'Invalid job reference.' });
        }
        const result = HF_HANDLE_RE.test(name) ? await hfResolve(name) : await resolveVideoUri(name);
        res.json({ state: result.done ? 'ACTIVE' : 'PROCESSING', ready: result.done });
    } catch (error) {
        console.error('Animation status error:', error);
        res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
});

app.get('/api/animation/video', async (req, res) => {
    try {
        const name = sanitizeString(req.query.file, 200);
        if (!OPERATION_NAME_RE.test(name) && !KLING_HANDLE_RE.test(name) && !HF_HANDLE_RE.test(name)) {
            return res.status(400).json({ error: 'Invalid job reference.' });
        }

        const isHf = HF_HANDLE_RE.test(name);
        const result = isHf ? await hfResolve(name) : await resolveVideoUri(name);
        if (!result.done) {
            return res.status(409).json({ error: 'The animation is still rendering.' });
        }

        /**
         * SSRF guard. The URI is read from an API response and is then fetched
         * WITH OUR API KEY ATTACHED, so it must be proven to be Google's own
         * endpoint before that happens - never fetched just because the
         * response supplied it.
         */
        let target;
        try {
            target = new URL(result.uri);
        } catch {
            return res.status(502).json({ error: 'Could not fetch the finished video.' });
        }
        const isKling = name.startsWith('kling:');
        // fal serves finished files from its own media CDN (v3.fal.media and
        // friends), publicly, no key. Google's needs ours. Anything else is
        // refused: the URL came from an API response, not from us.
        const falHost = /(^|\.)fal\.media$/.test(target.hostname) || /(^|\.)fal\.run$/.test(target.hostname);
        // Higgsfield serves finished files from its CDN, publicly. The host is
        // whatever the API answered with, so the guard here is: https, a real
        // public hostname (no addresses, nothing local), and no key sent.
        const hfHost = isHf && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target.hostname) && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(target.hostname);
        const allowed = isHf ? hfHost : isKling ? falHost : target.hostname === 'generativelanguage.googleapis.com';
        if (target.protocol !== 'https:' || !allowed) {
            console.error('Animation download refused, unexpected host:', target.hostname);
            return res.status(502).json({ error: 'Could not fetch the finished video.' });
        }

        // Streamed through the server rather than redirected to: the download
        // URL only works with our API key attached, and that key must never
        // reach the browser.
        // Use the shared apiKey (with its VITE_ fallback) — reading the env var
        // directly meant a deployment still on the deprecated name could
        // generate clips (paying for them) but never download them.
        const upstream = await fetch(target.href, (isKling || isHf) ? {} : { headers: { 'x-goog-api-key': apiKey } });
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

/** 4K exports still available this month, same rollover rule. */
const fourKLeftFor = (data) => {
    const used = data?.fourKPeriod === currentPeriod() ? (data.fourKUsed || 0) : 0;
    return Math.max(0, FOUR_K_EXPORTS_PER_MONTH - used);
};

/** Attach the feature flags the client gates its UI on. The client must never
 *  derive these from the plan string itself — that would mean maintaining the
 *  entitlement list in two places, free to drift apart. */
const withEntitlements = (payload, data) => {
    /**
     * `animationEnabled` on the user document is a per-account override.
     *
     * Animation is otherwise gated by PLAN, and the only plans that carry it
     * are the paid ones. That leaves no way to let one tester or team member
     * try it without moving them onto Business - which would also lift their
     * render cap and mark them as a customer. The flag grants exactly the one
     * thing. The monthly clip allowance still applies to them like anyone
     * else, so the cost stays bounded. Set with scripts/grant-animation.mjs.
     */
    const canUseAnimation = ANIMATION_PLANS.has(payload.plan) || data?.animationEnabled === true;
    const canExport4K = FOUR_K_PLANS.has(payload.plan);
    return {
        ...payload,
        canUseProjects: PROJECT_PLANS.has(payload.plan),
        // The FULL configurator (interiors, kitchens, walkthrough, saving,
        // send to render) is on every paid plan and the trial (20 Sep 2026).
        canUseFullConfigurator: FULL_CONFIG_PLANS.has(payload.plan),
        // AI image tools (Render Engine, material close-ups, Line Converter,
        // Weather Lab, Floor Plan Studio). False on the Configurator plan
        // only; the render allowance check refuses it server-side as well.
        canUseRenderTools: canUseRenderTools(payload.plan),
        canUseAnimation,
        animationsLimit: ANIMATION_MONTHLY_LIMIT,
        animationsLeft: canUseAnimation ? animationsLeftFor(data) : 0,
        canExport4K,
        fourKLimit: FOUR_K_EXPORTS_PER_MONTH,
        fourKLeft: canExport4K ? fourKLeftFor(data) : 0,
        // Pay-as-you-go video: the balance and the price of each clip, so the
        // Animation Studio can show "3 included left" or "£1.50 from credits".
        videoCreditsPence: Number(data?.videoCreditsPence) || 0,
        videoModels: videoPricing(),
        includedClipSeconds: 8,
        rendersPerMonth: payload.plan === 'business' ? BUSINESS_RENDERS_PER_MONTH : payload.plan === 'standard' ? STANDARD_RENDERS_PER_MONTH : payload.plan === 'tester' ? TESTER_RENDERS : null,
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
        if (isTesterUser(req.user) || await isOpenBetaUser(req.user)) {
            const snap = await db.collection('users').doc(req.user.uid).get();
            const data = snap.exists ? snap.data() : {};
            const used = data.testerRendersUsed || 0;
            const startedAt = data.testerStartedAt || Date.now();
            const expiresAt = startedAt + TESTER_DAYS * 86400000;
            const msLeft = Math.max(0, expiresAt - Date.now());
            if (data.projectsEnabled !== true) await syncProjectAccess(req.user.uid, true);
            return res.json(withEntitlements({
                credits: Math.max(0, TESTER_RENDERS - used),
                plan: 'tester',
                rendersLeft: Math.max(0, TESTER_RENDERS - used),
                rendersPerDay: TESTER_RENDERS,
                trialDaysLeft: Math.ceil(msLeft / 86400000),
                trialExpiresAt: new Date(expiresAt).toISOString(),
                trialBlocked: used >= TESTER_RENDERS || msLeft <= 0,
            }, data));
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
            model: ANALYSIS_MODEL,
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
                error: "We're not accepting payments at the moment.",
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
            plan: entry.plan || '',
            credits: String(entry.credits),
            videoCreditsPence: String(entry.videoCreditsPence || 0),
        };

        const sessionPayload = {
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: entry.mode,
            // Prices are + VAT (24 Sep 2026): Stripe adds VAT at checkout, and
            // a company can put its VAT number on the invoice.
            automatic_tax: { enabled: true },
            tax_id_collection: { enabled: true },
            success_url: `${origin}/account?success=true`,
            cancel_url: `${origin}/pricing?canceled=true`,
            client_reference_id: req.user.uid,
            metadata: purchaseMetadata,
        };

        // For subscriptions, also set metadata on the Subscription object itself.
        // This is CRITICAL for invoice.paid renewal events to work — invoices
        // inherit metadata from the Subscription, not the customer Session.
        if (entry.mode === 'subscription') {
            sessionPayload.subscription_data = { metadata: purchaseMetadata };
        }
        // A one-off pack has no subscription to carry the customer, so the
        // payment must create one - the balance is keyed on the Stripe customer.
        if (entry.mode === 'payment') sessionPayload.customer_creation = 'always';

        /**
         * Founding price on Business: the first five companies, and any trial
         * user converting within a month of starting. Stripe enforces the five
         * (max_redemptions) and the date; if a coupon is spent or expired the
         * checkout is retried without it rather than failing.
         */
        const coupons = [];
        if (entry.plan === 'business' && entry.mode === 'subscription') {
            if (FOUNDING_COUPON) coupons.push(FOUNDING_COUPON);
            if (MONTH_ONE_COUPON && db) {
                try {
                    const snap = await db.collection('users').doc(req.user.uid).get();
                    const started = snap.exists ? (snap.data().testerStartedAt || snap.data().trialStartTimestamp) : null;
                    if (started && Date.now() - started < 31 * 86400000) coupons.push(MONTH_ONE_COUPON);
                } catch (e) { console.warn('[STRIPE] month-one lookup failed:', e.message || e); }
            }
        }
        let session = null;
        for (const coupon of [...coupons, null]) {
            try {
                session = await stripe.checkout.sessions.create(coupon ? { ...sessionPayload, discounts: [{ coupon }] } : sessionPayload);
                if (coupon) console.log('[STRIPE] founding coupon applied:', coupon, 'uid:', req.user.uid);
                break;
            } catch (e) {
                if (!coupon) throw e;
                console.warn('[STRIPE] coupon not applied (' + coupon + '):', e.message || e);
            }
        }

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
