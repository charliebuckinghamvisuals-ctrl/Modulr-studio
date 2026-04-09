import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });

async function test() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: {
                parts: [{ text: 'Hello' }]
            }
        });
        console.log("Success:", response.text);
    } catch(e) {
        console.error("Error:", e.message);
    }
}
test();
