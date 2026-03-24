import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("Missing API Key");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function run() {
    console.log("Starting image generation test...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: "A garden room with slatted cladding",
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    imageSize: "1K"
                }
            }
        });
        console.log("Response received.");
        const parts = response.candidates?.[0]?.content?.parts || [];
        console.log("Parts returned:", parts.length);
        if (parts[0]?.inlineData) {
            console.log("SUCCESS! Got an image, MIME:", parts[0].inlineData.mimeType);
        } else {
            console.log("FAILED. Got:", JSON.stringify(parts));
        }
    } catch (e) {
        console.error("API Error caught by SDK:", e);
    }
}
run();
