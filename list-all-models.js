import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key found");
    process.exit(1);
}

const genAI = new GoogleGenAI(apiKey);

async function listModels() {
    try {
        const models = await genAI.models.list();
        const sortedModels = Array.from(models).sort((a, b) => a.name.localeCompare(b.name));
        for (const m of sortedModels) {
            console.log(m.name);
        }
    } catch (e) {
        console.error("Listing models failed:", e.message);
    }
}

listModels();
