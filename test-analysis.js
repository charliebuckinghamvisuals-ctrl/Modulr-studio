import fs from 'fs';

async function test() {
    try {
        const image = fs.readFileSync('test-upload.png');
        const base64Image = image.toString('base64');

        console.log("Sending request to http://localhost:3005/api/analyzeComponents");
        const res = await fetch("http://localhost:3005/api/analyzeComponents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64Image })
        });

        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Result:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
}
test();
