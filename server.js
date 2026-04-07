import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increase limit for large base64 images

// Error handler for JSON parsing or payload limits
app.use((err, req, res, next) => {
    if (err) {
        console.error("Express middleware error:", err.message);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
    next();
});

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

app.post('/api/generateLineDrawing', async (req, res) => {
    try {
        const { base64Image, additionalPrompt, isHighQuality, ratio, hasColor, environmentImage, isProMode } = req.body;
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
            taskInstruction += `\n\nDraw the building, garden, trees, fences, furniture, and landscape details. Exact perspective match to the input. PRESERVE TEXT PERFECTLY.`;
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
                return res.json({ result: part.inlineData.data });
            }
        }
        throw new Error("No image generated");
    } catch (error) {
        console.error("Line drawing error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyzeComponents', async (req, res) => {
    try {
        const { base64Image } = req.body;
        const imagePart = fileToGenerativePart(base64Image, "image/png");

        const prompt = `
      Analyze this image of a building and identify the exterior materials.
      
      CRITICAL INSTRUCTIONS:
      1. Determine if this is a photograph/render or a plain black-and-white line drawing.
      2. WALLS VS CLADDING: Identify the main wall material. If it is brick, explicitly say "Brick work" or the specific brick type (e.g. "Red brick"). Only call it "Cladding" if it is timber/composite cladding.
      3. DECKING/GROUND: ONLY return a value if there is a clearly visible raised deck, paved patio, or path directly attached to or in front of the building. If the ground is simply grass or natural ground, return 'none'.
      4. IF IT IS A LINE DRAWING (No base colors, just black lines on white):
         - Deduce the expected materials based on architectural patterns.
         - Horizontal lines on walls: "Timber Cladding" or "Weatherboard".
         - Stippled/Clean surfaces: "White Render" or "Brick work".
         - Grid patterns on roofs: "Tiles".
      5. DOORS - CRITICAL: Do NOT just say "Door". You MUST describe:
         a) The material and colour (e.g. "Anthracite grey aluminium").
         b) The EXACT glazing zone: Is the glass on the TOP HALF only, the FULL height, or a narrow side panel?
            - If top half has glass and bottom half is solid panel: say "top-half glazed, bottom solid panel".
            - If fully glazed: say "full-height glazed".
            - If only a narrow side strip: say "narrow side-lite glazed".
         c) The door style (e.g. "single swing door", "composite door", "bifold").
         Example output: "Anthracite grey aluminium composite door, top-half glazed, bottom solid panel".
      6. WINDOWS: Describe frame colour, glazing type, and approximate position on the building.
      7. IF A COMPONENT IS MISSING or not visible: Return 'none'.
    `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview', // Always use Pro for text reasoning!
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
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json({ result: JSON.parse(cleanText) });

    } catch (error) {
        console.error("Analysis error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyzeBatchMaterials', async (req, res) => {
    try {
        const { base64Images } = req.body;
        if (!base64Images || !Array.isArray(base64Images)) throw new Error("Expected array of images");

        const parts = base64Images.map(img => fileToGenerativePart(img, "image/jpeg"));
        const prompt = `
      ROLE: Expert Architectural Analyst.
      TASK: You are looking at ${base64Images.length} images of the same building (e.g. a garden room/studio) from different angles.
      
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
            model: 'gemini-3.1-pro-preview', // Pro for reasoning across multiple images
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
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No analysis returned");
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json({ result: JSON.parse(cleanText) });

    } catch (error) {
        console.error("Batch Analysis error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/renderBuilding', async (req, res) => {
    try {
        const { base64Image, materials, additionalPrompt, isHighQuality, ratio, isProMode, orientation, isSketchUpMode } = req.body;
        // Changed to jpeg to significantly reduce file size while maintaining quality
        const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

        const buildMaterialInstruction = (label, value) => {
            if (!value || value.trim() === '' || value.toLowerCase() === 'none') {
                return `- ${label}: PRESERVE ORIGINAL MATERIAL exactly as seen in the source image.`;
            }
            return `- ${label}: ${value}`;
        };

        const deckingValue = materials.decking && materials.decking.trim().toLowerCase() !== 'none' ? materials.decking : null;

        // SketchUp mode: pixel-faithful enhance only ΓÇö no redrawing, no geometry inference
        const sketchUpPrompt = `
      RENDER ENGINE: Nano Banana Pro (V3.2) ΓÇö ENHANCE / UPSCALE MODE ONLY.
      
      ABSOLUTE CRITICAL RULE ΓÇö THIS IS NOT A RE-RENDER:
      The input image is a coloured 3D model screenshot (SketchUp or similar) with pre-applied materials.
      Your ONLY task is to ENHANCE and UPSCALE it to photorealistic quality.
      YOU MUST NOT redraw, re-compose, extend, crop, or hallucinate ANY part of the scene.
      
      GEOMETRY LOCK ΓÇö NON-NEGOTIABLE:
      - Every wall, roof plane, window, door, and structural edge in the output MUST match the input PIXEL-FOR-PIXEL in position, angle, and proportion.
      - Do NOT extend the building beyond its visible edges in the source image.
      - Do NOT add, remove, or move anything. Not a tree. Not a blade of grass. Not a shadow. Nothing.
      - If the building appears to end or be cropped at the edge of the frame, keep it ending there. Do NOT continue or complete the building.
      - The composition (camera angle, crop, framing) MUST be 100% identical to the input.
      
      ENHANCEMENT TASK:
      - Apply photorealistic micro-textures and physically based rendering (PBR) to the materials already visible in the source.
      - Enhance lighting to be natural and architecturally accurate ΓÇö crisp shadows, accurate reflections.
      - DO NOT change any material colours. DO NOT swap any materials. Preserve every colour and finish exactly.
      - Enhance the surrounding environment (sky, grass, trees) to photorealistic quality without moving or adding any elements.
      
      MATERIAL ASSIGNMENTS (apply ONLY if materials provided below differ from their detected state in the image ΓÇö otherwise preserve):
      ${buildMaterialInstruction('Walls/Main Facade', materials.walls)}
      ${buildMaterialInstruction('Roof', materials.roof)}
      ${buildMaterialInstruction('Windows', materials.windows)}
      ${buildMaterialInstruction('Doors', materials.doors)}
      ${deckingValue
        ? `- Decking/Ground: Apply photorealistic texture to the existing ${deckingValue} shown in the source.`
        : `- Decking/Ground: Preserve exactly as shown in the source image.`
      }
      
      SCENE MODIFICATIONS (apply subtly without altering geometry):
      ${additionalPrompt || 'None'}
      
      FINAL OUTPUT REQUIREMENT:
      The result must look like the exact same photo taken with a DSLR camera, with all geometry in exactly the same position as the input.
      CRITICAL: Output resolution 3840 x 2160 pixels (4K UHD).
    `;

        const standardPrompt = `
      RENDER ENGINE SETTINGS:
      - Engine: Nano Banana Pro (V3.2).
      - Target: 8k-UHD Photograph-Quality Architectural Visualization.
      - Quality: Ultra-realistic, Physically Based Rendering (PBR), sharp focus, hyper-detailed micro-textures.
      - DO NOT add artistic filters, painterly effects, or smooth brush strokes.
      
      TASK:
      Render the architecture and its environment using the Nano Banana Pro engine.
      ${orientation ? `\nCRITICAL SPATIAL CONTEXT: You are rendering the [${orientation}] elevation/view of the building. Apply the materials specifically aiming at this visible side.` : ''}
      
      GEOMETRY & CONTEXT RULES ΓÇö CRITICAL:
      - STRICT GEOMETRY LOCK: You MUST reproduce the EXACT structure shown in the source image. Do NOT add, remove, or modify any architectural elements.
      - NO HALLUCINATIONS: Do NOT invent new structures. Do NOT add decking, patios, steps, porches, or any raised platforms unless they are explicitly visible in the source geometry.
      - DOORS: Reproduce the door EXACTLY as shown ΓÇö pay close attention to where the glass panels are positioned (top half, full height, etc.). DO NOT move or extend glazing that isn't in the source image.
      - PRESERVE THE ENVIRONMENT: Render the surrounding landscape, garden, fence, trees, and sky exactly as shown in the source.
      - IF INPUT IS A COLORED RENDER: Treat this as an Image-to-Image / Upscale / Enhance task. Keep 95% of the original colours, lighting, and layout.

      MATERIAL ASSIGNMENTS:
      ${buildMaterialInstruction('Walls/Main Facade', materials.walls)}
      ${buildMaterialInstruction('Roof', materials.roof)}
      ${buildMaterialInstruction('Windows', materials.windows)}
      ${buildMaterialInstruction('Doors', materials.doors)}
      ${deckingValue
        ? `- Decking/Ground: ${deckingValue}`
        : `- Decking/Ground: NONE. The ground in front of and around the building is NATURAL GRASS. DO NOT render any decking boards, patio slabs, raised platforms, or paved areas. The transition from building to ground must be grass only.`
      }

      DOOR ACCURACY RULE (CRITICAL):
      The door description specifies the EXACT glazing zone. You MUST render ONLY that zone as glass:
      - If "top-half glazed" ΓåÆ ONLY the upper portion of the door has glass. The lower panel is SOLID.
      - If "full-height glazed" ΓåÆ The entire door height is glass.
      - If "narrow side-lite" ΓåÆ Only a thin vertical strip beside the door is glass.
      DO NOT extend or relocate the glazing zone beyond what is described.

      COLOR & LIGHTING PRECISION:
      - PIGMENT ACCURACY: If a material colour like "Black", "Charred", "Anthracite", or "Dark" is specified, render it as a deep, rich, non-reflective pitch-tone. DO NOT wash out to grey.
      - CONTRAST: Use high-contrast architectural lighting. Ensure shadows are deep and blacks are absolute.

      SCENE MODIFICATIONS:
      ${additionalPrompt || 'None'}
      
      FINAL OUTPUT REQUIREMENT:
      The result must be indistinguishable from a real high-end unedited architectural photograph from a DSLR camera.
      Focus on extremely sharp crisp realistic lighting, hard shadows, and micro-textures.
      CRITICAL: Set the output resolution strictly to 3840 x 2160 pixels (4K UHD). Lock the render to these exact dimensions.
    `;

        const prompt = isSketchUpMode ? sketchUpPrompt : standardPrompt;

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
                    aspectRatio: (isHighQuality && !isSketchUpMode) ? "16:9" : ratio,
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
        throw new Error("No render generated");

    } catch (error) {
        console.error("Render error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/editImage', async (req, res) => {
    try {
        const { base64Image, maskImage, editPrompt, isHighQuality, ratio, isProMode } = req.body;
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

app.post('/api/analyzeMaterials', async (req, res) => {
    try {
        const { base64Image } = req.body;
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

app.post('/api/analyzeScene', async (req, res) => {
    try {
        const { base64Image } = req.body;
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

app.post('/api/applyWeather', async (req, res) => {
    try {
        const { base64Image, weather, isHighQuality, ratio, isProMode } = req.body;
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

app.post('/api/analyzeExteriorDetails', async (req, res) => {
    try {
        const { base64Image } = req.body;
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

app.post('/api/generatePresentationBoard', async (req, res) => {
    try {
        const { base64Image, focusPoints, isProMode } = req.body;
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
