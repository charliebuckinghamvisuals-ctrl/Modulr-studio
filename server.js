import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import Stripe from 'stripe';

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
 * Helper to check and deduct credits from a user's account
 * @param {object} user - Firebase User Object
 * @param {number} amount - Number of credits to deduct
 * @returns {Promise<{success: boolean, balance: number, error?: string}>}
 */
const deductCredits = async (user, amount) => {
    if (!db) return { success: true, balance: 9999 }; // Dev mode safety

    // Master Account Override
    if (user.email === 'charlie@napc.uk') {
        return { success: true, balance: 999999 };
    }

    const uid = user.uid;
    const userRef = db.collection('users').doc(uid);
    
    try {
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            
            if (!userDoc.exists) {
                // Initialize default user if they don't exist yet but are authenticated
                const initialData = {
                    credits: 5, // 5 starter credits for free trial
                    plan: 'free',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
                transaction.set(userRef, initialData);
                
                if (initialData.credits < amount) {
                    return { success: false, balance: initialData.credits, error: "Insufficient credits" };
                }
                
                const newBalance = initialData.credits - amount;
                transaction.update(userRef, { credits: newBalance });
                return { success: true, balance: newBalance };
            }

            const plan = userDoc.exists ? (userDoc.data().plan || 'free') : 'free';
            const currentCredits = userDoc.exists ? (userDoc.data().credits || 0) : 5;

            // Feature Gating: 4K UHD requires Business or Master plan
            if (amount === CREDIT_COSTS.UHD_4K && plan !== 'business' && plan !== 'master') {
                return { success: false, balance: currentCredits, error: "4K Ultra HD Support Requires Professional Studio Plan" };
            }

            if (currentCredits < amount) {
                return { success: false, balance: currentCredits, error: "Insufficient credits" };
            }

            const newBalance = currentCredits - amount;
            transaction.update(userRef, { credits: newBalance });
            return { success: true, balance: newBalance };
        });
    } catch (e) {
        console.error("Credit deduction transaction failed:", e);
        return { success: false, balance: 0, error: "Internal Credit Error" };
    }
};

const app = express();
app.set('trust proxy', 1); // Enable proxy trust for Render load balancers
const port = process.env.PORT || 3005;

console.log("--- SERVER STARTUP DEBUG ---");
console.log("CWD:", process.cwd());
console.log("DIRNAME:", __dirname);
console.log("PORT ENV:", process.env.PORT);
console.log("PORT SELECT:", port);
console.log("API KEY STATUS:", process.env.VITE_GEMINI_API_KEY ? "EXISTS (SAFE)" : "MISSING");

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
    validate: false, 
    validate: { ip: false, xForwardedForHeader: false }
});

const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 10,
    message: { error: "IP-based render limit reached. Please wait a minute." },
    validate: false
});

// Per-User AI Limiter (Phase 1)
const userAiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5, // max 5 renders per minute per individual user
    keyGenerator: (req) => req.user?.uid || req.ip || 'unknown',
    message: { error: "You have reached your individual render limit. Please wait a minute." },
    standardHeaders: true,
    validate: false,
    legacyHeaders: false,
});

// Middleware
app.use(cors());

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
        let plan = object.metadata?.plan || 'free';
        let customerId = object.customer;

        // If it's an invoice, we need to extract line item metadata or look up the subscription
        if (event.type === 'invoice.paid' && !uid) {
            try {
                // Subscription typically has the metadata
                const subscription = await stripe.subscriptions.retrieve(object.subscription);
                uid = subscription.metadata?.firebase_uid;
                creditsToAward = parseInt(subscription.metadata?.credits || "0");
                plan = subscription.metadata?.plan || 'free';
            } catch (err) {
                console.error("[STRIPE] Error retrieving subscription for invoice:", err.message);
            }
        }

        if (uid && creditsToAward > 0) {
            try {
                await db.collection('users').doc(uid).set({
                    credits: admin.firestore.FieldValue.increment(creditsToAward),
                    plan: plan,
                    stripeCustomerId: customerId,
                    lastPaymentAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log(`[STRIPE] ${event.type} processed: Awarded ${creditsToAward} credits to ${uid}`);
            } catch (error) {
                console.error("[STRIPE] Error updating user credits in Firestore:", error);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.json({ limit: '20mb' })); // Reduced from 100mb for DoS protection (Images compress to ~1MB max client-side)
app.use(globalLimiter);

// Error handler for JSON parsing or payload limits
app.use((err, req, res, next) => {
    if (err) {
        console.error("Express middleware error:", err.message);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
    next();
});

// Middleware to verify Firebase JWT
const verifyFirebaseToken = async (req, res, next) => {
    // 🔥 DEVELOPMENT BYPASS: Set to true only for local feature testing. IMPORTANT: MUST BE FALSE IN PRODUCTION.
    const MOCK_AUTH = false;
    
    if (MOCK_AUTH) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error("CRITICAL SECURITY FATAL: MOCK_AUTH is enabled in a production environment!");
        }
        req.user = { uid: "testuser", email: "charlie@napc.uk" };
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

// Protect all API routes
app.use('/api', verifyFirebaseToken);

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.warn("WARNING: Missing VITE_GEMINI_API_KEY environment variable. AI features will not work.");
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
        const { base64Image, additionalPrompt, isHighQuality, ratio, hasColor, environmentImage, isProMode } = req.body;
        
        // Phase 2: Credit-based deduction
        const cost = isHighQuality ? CREDIT_COSTS.STANDARD_RES : CREDIT_COSTS.LOW_RES;
        const creditCheck = await deductCredits(req.user, cost);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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

        const imageModel = isProMode ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';
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
        const { base64Image } = req.body;

        // Phase 2: Analysis deduction
        const creditCheck = await deductCredits(req.user, CREDIT_COSTS.ANALYSIS);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
        }

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
            model: 'gemini-3.1-pro-preview',
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
        try { require('fs').appendFileSync('error.log', '\\n[' + new Date().toISOString() + '] analyzeComponents: ' + (error.stack || error.message)); } catch(_) {}
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/renderBuilding', userAiLimiter, async (req, res) => {
    try {
        const { base64Image, materials, additionalPrompt, isHighQuality, ratio, isProMode, orientation, isSketchUpMode, studioBackground } = req.body;
        
        // Phase 2: Credit-based deduction
        const cost = isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES;
        const creditCheck = await deductCredits(req.user, cost);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
        }

        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const buildMaterialInstruction = (label, value) => {
            if (!value || value.trim() === '' || value.toLowerCase() === 'none') {
                return `- ${label}: PRESERVE ORIGINAL MATERIAL exactly as seen in the source image.`;
            }
            return `- ${label}: ${value}`;
        };

        const deckingValue = materials.decking && materials.decking.trim().toLowerCase() !== 'none' ? materials.decking : null;

        const sketchUpPrompt = `
      RENDER ENGINE: Nano Banana Pro (V3.2) — ENHANCE / UPSCALE MODE ONLY.
      
      ABSOLUTE CRITICAL RULE:
      The input image is a coloured 3D model screenshot with pre-applied materials.
      Your ONLY task is to ENHANCE and UPSCALE it to photorealistic quality by applying lighting, reflections, and textures.\n      GEOMETRY MUST BE PIXEL-LOCKED. Do NOT redraw, re-compose, or extend any geometry.\n      DO NOT invent structures, decking, patios, porches, or raised platforms.\n      DO NOT change the roof pitch, shape, or modify any architectural elements.\n      PRESERVE the environment exactly as shown.
      
      MATERIAL ASSIGNMENTS:
      ${buildMaterialInstruction('Walls', materials.walls)}
      ${buildMaterialInstruction('Roof', materials.roof)}
      ${buildMaterialInstruction('Windows', materials.windows)}
      ${buildMaterialInstruction('Doors', materials.doors)}
      ${buildMaterialInstruction('Decking/Ground', materials.decking)}
      
      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only.` : ''}
      FINAL OUTPUT: 4K UHD Photorealistic.
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
      - Use high-contrast architectural lighting with crisp shadows.

      SCENE MODIFICATIONS: ${additionalPrompt || 'None'}
      ${studioBackground ? `\n      STUDIO OVERRIDE: Render this building completely isolated on a ${studioBackground}. Do NOT render grass, trees, fences, skies, or any natural environment. Pure studio lighting only.` : ''}

      FINAL OUTPUT: The result must be indistinguishable from a real architectural photograph (DSLR quality).
      CRITICAL: Output resolution 3840 x 2160 pixels (4K UHD).
    `;

        const prompt = isSketchUpMode ? sketchUpPrompt : standardPrompt;

        const response = await ai.models.generateContent({
            model: isProMode ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
            contents: {
                parts: [imagePart, { text: prompt }]
            },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: (isHighQuality && !isSketchUpMode) ? "16:9" : ratio,
                    imageSize: isHighQuality ? "4K" : "1K"
                },
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
        
        console.error("No render generated. Response data:", JSON.stringify(response, null, 2));
        throw new Error("No render generated. Check server logs for response payload.");
    } catch (error) {
        console.error("Render error in /api/renderBuilding:", error, error.stack);
        try { require('fs').appendFileSync('error.log', '\\n[' + new Date().toISOString() + '] renderBuilding: ' + (error.stack || error.message)); } catch(_) {}
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/editImage', userAiLimiter, async (req, res) => {
    try {
        const { base64Image, maskImage, editPrompt, isHighQuality, ratio, isProMode } = req.body;

        // Phase 2: Credit-based deduction
        const cost = isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES;
        const creditCheck = await deductCredits(req.user, cost);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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
            model: isProMode ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
            contents: {
                parts: parts
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
        throw new Error("No edit generated");

    } catch (error) {
        console.error("Edit error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyzeMaterials', userAiLimiter, async (req, res) => {
    try {
        const { base64Image } = req.body;

        // Phase 2: Analysis deduction
        const creditCheck = await deductCredits(req.user, CREDIT_COSTS.ANALYSIS);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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
            model: 'gemini-3.1-pro-preview',
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
        const { base64Image } = req.body;

        // Phase 2: Analysis deduction
        const creditCheck = await deductCredits(req.user, CREDIT_COSTS.ANALYSIS);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
        }

        const imagePart = fileToGenerativePart(base64Image, "image/png");

        const prompt = `
      Analyze this architectural scene/environment.
      
      1. Provide a short (1 sentence) descriptive summary of what is in the image (e.g., "A modern two-story house with a large wooden deck and manicured lawn.").
      2. Suggest 4 specific human activities or animals that would naturally fit into this EXACT scene to make it feel "lived-in" (e.g., "A golden retriever sitting on the deck", "Children playing with a ball on the grass").
      
      Return the result as JSON.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
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
        const { base64Image, weather, isHighQuality, ratio, isProMode } = req.body;

        // Phase 2: Credit-based deduction
        const cost = isHighQuality ? CREDIT_COSTS.UHD_4K : CREDIT_COSTS.STANDARD_RES;
        const creditCheck = await deductCredits(req.user, cost);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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
            model: isProMode ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
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
        const { base64Image } = req.body;

        // Phase 2: Analysis deduction
        const creditCheck = await deductCredits(req.user, CREDIT_COSTS.ANALYSIS);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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
            model: 'gemini-3.1-pro-preview',
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
        const { base64Image, focusPoints, isProMode } = req.body;
        
        // Phase 2: Credit-based deduction
        const cost = CREDIT_COSTS.UHD_4K; // Presentation boards are high-detail
        const creditCheck = await deductCredits(req.user, cost);
        if (!creditCheck.success) {
            return res.status(402).json({ error: creditCheck.error, balance: creditCheck.balance });
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
            model: isProMode ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview',
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
        if (req.user.email === 'charlie@napc.uk') {
            return res.json({ credits: 'Unlimited', plan: 'master' });
        }

        const userRef = db.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            // New user, give them trial credits (5 renders)
            const starterCredits = 5;
            await userRef.set({
                credits: starterCredits,
                plan: 'free',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.json({ credits: starterCredits, plan: 'free' });
        }
        const data = userDoc.data();
        res.json({ credits: data.credits || 0, plan: data.plan || 'free' });
    } catch (error) {
        console.error("Error fetching user credits:", error);
        res.status(500).json({ error: "Could not fetch credits balance" });
    }
});

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { priceId, planName, creditsAmount, isOneTime } = req.body;
        
        if (!stripe) throw new Error("Stripe is not configured on the server");

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: isOneTime ? 'payment' : 'subscription',
            automatic_tax: { enabled: true },
            success_url: `${req.headers.origin}/account?success=true`,
            cancel_url: `${req.headers.origin}/pricing?canceled=true`,
            metadata: {
                firebase_uid: req.user.uid,
                plan: planName || 'credits_pack',
                credits: creditsAmount
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ error: error.message });
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

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${req.headers.origin}/account`,
        });

        res.json({ url: portalSession.url });
    } catch (error) {
        console.error("Portal error:", error);
        res.status(500).json({ error: error.message });
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
