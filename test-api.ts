import { analyzeExteriorDetails } from './services/geminiService';

async function runTest() {
    try {
        console.log('Testing Scene Studio Analysis API...');
        const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const result = await analyzeExteriorDetails(base64Image);
        console.log('Success! Result:', result);
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

runTest();
