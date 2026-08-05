import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Replicate from "replicate";
import sharp from "sharp";
import dotenv from "dotenv";

dotenv.config();

// Note: Replicate will automatically pick up process.env.REPLICATE_API_TOKEN
const replicate = new Replicate();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  /**
   * Auth gate for every /api route below.
   *
   * These endpoints call Gemini and Replicate on our own billed API keys. With
   * no gate at all — as this file previously stood — deploying it publicly
   * would expose an anonymous, unmetered proxy to those keys, which anyone
   * could drive until the bill or the quota ran out.
   *
   * Local development is unaffected: with no GARDEN_API_TOKEN set the server
   * refuses to serve the API rather than serving it to everyone.
   */
  const GARDEN_API_TOKEN = process.env.GARDEN_API_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";

  if (!GARDEN_API_TOKEN) {
    console.warn(
      "[garden-scene-builder] GARDEN_API_TOKEN is not set. AI endpoints are DISABLED. " +
      "Set GARDEN_API_TOKEN to enable them."
    );
  }

  app.use("/api", (req, res, next) => {
    if (!GARDEN_API_TOKEN) {
      return res.status(503).json({ error: "AI endpoints are not configured on this server." });
    }
    const header = req.headers.authorization || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (provided !== GARDEN_API_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  });

  // Basic abuse throttle: these calls are expensive, so cap them per IP.
  const apiHits = new Map<string, { count: number; resetAt: number }>();
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 10;

  app.use("/api", (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = apiHits.get(key);
    if (!entry || now > entry.resetAt) {
      apiHits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }
    if (entry.count >= MAX_PER_WINDOW) {
      return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }
    entry.count++;
    next();
  });

  if (isProduction && !GARDEN_API_TOKEN) {
    console.error("[garden-scene-builder] Refusing to expose unauthenticated AI endpoints in production.");
  }

    // API Routes
  app.post("/api/generate-environment", async (req, res) => {
    try {
      const { prompt, image } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is required" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const parts: any[] = [];
      
      // If we have an image from the canvas, process it
      if (image) {
        // Strip the data URL prefix if present
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const mimeType = image.match(/^data:(image\/\w+);base64,/)?.[1] || "image/png";
        
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          }
        });
      }
      
      parts.push({
        text: `You are an expert architectural visualizer. I am providing a reference image of a 3D garden room/outbuilding design. Re-render this building as a photorealistic architectural render. Integrate this exact building design naturally into the following described environment: ${prompt}. 
        
Crucially: 
- Maintain the exact architectural shape, structure, cladding type, colors, and window/door placements of the provided building. DO NOT turn it into an abstract sculpture.
- Recreate the lighting, global illumination, shadows, and real-world materials so that the entire composition is fully unified, beautiful, and highly realistic.
- The garden room building should be the main subject, situated realistically on the ground within the environment.`
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: parts,
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
          }
        }
      });

      let imageBase64 = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          imageBase64 = `data:${mimeType};base64,${base64EncodeString}`;
          break;
        }
      }

      if (!imageBase64) {
        throw new Error("No image generated by the AI");
      }

      res.json({ imageBase64: imageBase64 });
    } catch (error: any) {
      console.error("Image generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  app.post("/api/analyze-environment", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
         return res.status(400).json({ error: "Image is required" });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is required" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Analyze this outdoor background image. Return a JSON object containing the recommended lighting values to composite a 3D model into this scene.
Provide exactly this format, do not include markdown blocks:
{
  "sunColor": "#ffffff",
  "sunIntensity": 1.5,
  "ambientColor": "#cccccc",
  "ambientIntensity": 0.5,
  "skyType": "cloudy" // cloudy or sunny
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg"
                }
            }
        ],
        config: {
            responseMimeType: "application/json"
        }
      });

      const text = response.text || "{}";
      const data = JSON.parse(text);
      res.json(data);
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  app.post("/api/harmonize", async (req, res) => {
    try {
      // collageBase64 is the combined image (background photo + pasted transparent room)
      const { collageBase64, roomMaterials, creativity = 65, enhanceModel } = req.body;
      
      if (!collageBase64) {
        return res.status(400).json({ error: "collageBase64 is required" });
      }

      const mimeType = collageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || "image/png";
      const base64Data = collageBase64.replace(/^data:image\/\w+;base64,/, "");

      console.log("Enhancing image with Gemini 3.1 Flash Image...");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const materialsPrompt = roomMaterials ? ` Materials: ${roomMaterials}.` : "";
      let instruction = `Enhance this architectural composite. Make the lighting, shadows, and textures perfectly photorealistic so the building blends seamlessly into the garden environment.${materialsPrompt} 
      
      CRITICAL INSTRUCTION: You MUST preserve the exact geometry, structural design, window placement, and scale of the building. DO NOT change the shape of the building, DO NOT add or remove architectural features. Just enhance the materials, lighting, global illumination, and blend it naturally with the background.`;

      if (enhanceModel) {
          instruction += " Make it look like a high-end CGI octane render, unreal engine 5 quality, perfectly balanced lighting, highest quality PBR textures.";
      }

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: [{
          role: 'user',
          parts: [
            { text: instruction },
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }],
      });

      let finalImageUrl = collageBase64;
      const parts = geminiResponse.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData);
      
      if (imagePart && imagePart.inlineData) {
        finalImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      } else {
        throw new Error("Gemini did not return an image part.");
      }
      
      res.json({ harmonizedImageUrl: finalImageUrl });

    } catch (error: any) {
      console.error("Harmonize error:", error.response?.data || error);
      const errorMessage = error.response?.data?.detail || error.message || "Failed to harmonize image";
      res.status(500).json({ error: errorMessage });
    }
  });


  app.post("/api/planning-advice", async (req, res) => {
    try {
      const { roomDetails } = req.body;
      if (!roomDetails) {
        return res.status(400).json({ error: "Room details required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is required" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a professional but very approachable planning consultant in the UK. 
Provide a simplified, easy-to-understand planning guide for a proposed garden room with the following specifications:
${JSON.stringify(roomDetails, null, 2)}

CRITICAL NOTE FOR HEIGHTS:
The overall total front height from ground to the very top is ${roomDetails.overallTotalFrontHeightMm || roomDetails.heightMm}mm.
The overall total back height from ground to the very top is ${roomDetails.overallTotalBackHeightMm || roomDetails.backHeightMm}mm.
Always use these numbers when assessing height for Permitted Development limits.

Provide a simplified assessment covering:
1. Do I need planning permission? (A simple summary of Permitted Development Rights based on dimensions and roof style, avoiding confusing jargon).
2. Building Regulations (a simple summary based on size, boundary, and use).
3. Recommendation: You must strongly recommend the National Association of Planning Consultants (NAPC) and provide their website link: www.napc.uk. Explain why they are highly recommended (e.g., they are experts in securing planning permission and certificates of lawfulness for garden rooms, ensuring a stress-free and smooth process).

Write this as a helpful guide for a homeowner. Use plain text formatting. Do NOT use markdown symbols like asterisks (*) or hash (#). Use capitalized words for emphasis and numbering for lists. Keep it conversational but professional.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt
      });

      res.json({ advice: response.text });
    } catch (error: any) {
      console.error("Planning advice error:", error);
      res.status(500).json({ error: error.message || "Failed to generate planning advice" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
