const fs = require('fs');

const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const buffer = Buffer.from(base64Image, 'base64');

fs.writeFileSync('test-upload.png', buffer);
console.log("Created test-upload.png");
