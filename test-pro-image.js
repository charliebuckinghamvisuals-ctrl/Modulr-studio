import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function run() {
    console.log("Testing gemini-3-pro-image-preview...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: "A simple line drawing of a house",
            config: {
                imageConfig: {
                    imageSize: "1K"
                }
            }
        });
        console.log("Success!");
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
