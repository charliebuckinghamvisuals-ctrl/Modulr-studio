import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function run() {
    console.log("Reproducing Text to Line error with gemini-3.1-pro-preview...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: { parts: [{ text: "A simple line drawing of a house" }] },
            config: {
                outputMimeType: "image/jpeg",
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "2K"
                },
                temperature: 0.2
            }
        });
        console.log("Success!");
    } catch (e) {
        console.error("FAILED:", e.message);
        if (e.response) {
            console.error("DETAILS:", JSON.stringify(e.response, null, 2));
        }
    }
}
run();
