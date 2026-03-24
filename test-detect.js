import fs from 'fs';
import { analyzeComponents, generatePresentationBoard } from './services/geminiService.js';

// create a dummy 1x1 white pixel base64 image
const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function test() {
    console.log("Testing analyzeComponents...");
    try {
        const res = await analyzeComponents(dummyBase64);
        console.log("Success:", res);
    } catch (err) {
        console.error("Error:", err);
    }
}

test();
