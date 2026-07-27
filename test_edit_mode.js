import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

async function run() {
    console.log("Starting test...");
    
    // Create a simple blank white 256x256 image in base64 as dummy input
    const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAAA1BMVEW10NBjIGB0AAAAH0lEQVRoge3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAvg0hAAABmmDh1QAAAABJRU5ErkJggg==";
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: [
                { inlineData: { data: dummyImageBase64, mimeType: "image/png" } },
                "Add a red circle in the center"
            ],
            config: {
                outputMimeType: "image/png",
                imageConfig: {
                    editMode: "EDIT_MODE_DEFAULT"
                }
            }
        });
        console.log("Success! Parts returned:", response.candidates?.[0]?.content?.parts?.length);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
