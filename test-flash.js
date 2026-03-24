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
    console.log("Starting generation...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-preview',
            contents: "Draw me a picture of a house",
            config: {
                imageConfig: {
                    imageSize: "1K"
                }
            }
        });
        console.log("Response received.");
        const parts = response.candidates?.[0]?.content?.parts || [];
        console.log("Parts returned:", parts.length);
        if (parts[0]?.inlineData) {
            console.log("Got an image!");
        } else {
            console.log("Got text:", parts[0]?.text);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
