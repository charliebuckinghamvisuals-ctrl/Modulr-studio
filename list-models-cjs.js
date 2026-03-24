import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI(apiKey);

async function list() {
    try {
        const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).listModels();
        const sortedModels = [...result.models].sort((a, b) => a.name.localeCompare(b.name));
        for (const m of sortedModels) {
            console.log(m.name);
        }
    } catch (e) {
        console.error(e);
    }
}
list();
