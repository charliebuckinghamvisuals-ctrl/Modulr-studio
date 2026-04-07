import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY, httpOptions: { apiVersion: 'v1beta' } });

// Need a real base64 jpeg
const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // PNG, but any valid image

async function runTest(structName, imagePayload) {
    try {
        await ai.models.generateVideos({
            model: "veo-3.1-lite-generate-preview",
            source: {
                prompt: "A simple",
                image: imagePayload
            },
            config: { numberOfVideos: 1 }
        });
        console.log("SUCCESS:", structName);
        return true;
    } catch (e) {
        console.error("FAILED:", structName, "->", e.message.substring(0, 150));
        return false;
    }
}

async function testAll() {
    await runTest("Direct bytesBase64Encoded", {
        bytesBase64Encoded: dummyBase64,
        mimeType: "image/png"
    });
    
    await runTest("Direct inlineData", {
        inlineData: {
            data: dummyBase64,
            mimeType: "image/png"
        }
    });

    await runTest("Wrapped image struct", {
        image: {
            bytesBase64Encoded: dummyBase64,
            mimeType: "image/png"
        }
    });

    await runTest("Direct imageBytes", {
        imageBytes: dummyBase64,
        mimeType: "image/png"
    });
    
    await runTest("Wrapped imageBytes", {
        image: {
            imageBytes: dummyBase64,
            mimeType: "image/png"
        }
    });
}

testAll();
