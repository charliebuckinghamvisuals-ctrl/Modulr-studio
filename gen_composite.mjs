import fs from 'fs';

function writeBMP(filename, width, height, getPixel) {
    const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
    const dataSize = rowSize * height;
    const fileSize = 54 + dataSize;
    
    const buffer = Buffer.alloc(fileSize);
    
    // Header
    buffer.write('BM', 0);
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(0, 6);
    buffer.writeUInt32LE(54, 10);
    
    // DIB Header
    buffer.writeUInt32LE(40, 14);
    buffer.writeUInt32LE(width, 18);
    buffer.writeUInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(24, 28);
    buffer.writeUInt32LE(0, 30);
    buffer.writeUInt32LE(dataSize, 34);
    buffer.writeUInt32LE(2835, 38);
    buffer.writeUInt32LE(2835, 42);
    buffer.writeUInt32LE(0, 46);
    buffer.writeUInt32LE(0, 50);
    
    // Pixels
    for (let y = 0; y < height; y++) {
        const bmpY = height - 1 - y;
        const rowOffset = 54 + bmpY * rowSize;
        for (let x = 0; x < width; x++) {
            const [r, g, b] = getPixel(x, y);
            buffer.writeUInt8(b, rowOffset + x * 3);
            buffer.writeUInt8(g, rowOffset + x * 3 + 1);
            buffer.writeUInt8(r, rowOffset + x * 3 + 2);
        }
    }
    
    fs.writeFileSync(filename, buffer);
}

const w = 512;
const h = 512;
const numSlats = 8; // 8 boards per 2 meters = 250mm per board. Very realistic.
const slatH = h / numSlats;
const grooveW = 8; // 8 pixels of 512 = 1.5% groove

const outDir = 'garden-scene-builder/public/textures/';

writeBMP(outDir + 'composite_color.bmp', w, h, (x, y) => {
    const localY = y % slatH;
    if (localY < grooveW) return [50, 50, 50]; // groove
    return [220, 220, 220]; // slat (flat base color, tinting will occur via material.color)
});

writeBMP(outDir + 'composite_normal.bmp', w, h, (x, y) => {
    const localY = y % slatH;
    if (localY < grooveW) {
        if (localY < 2) return [128, 50, 255]; // bevel up
        if (localY > grooveW - 2) return [128, 200, 255]; // bevel down
        return [128, 128, 255]; // flat groove
    }
    return [128, 128, 255]; // flat slat
});

writeBMP(outDir + 'composite_roughness.bmp', w, h, (x, y) => {
    const localY = y % slatH;
    if (localY < grooveW) return [255, 255, 255]; // max rough in groove
    return [150, 150, 150]; // slat roughness
});

writeBMP(outDir + 'composite_ao.bmp', w, h, (x, y) => {
    const localY = y % slatH;
    if (localY < grooveW) return [50, 50, 50]; // dark in groove
    if (localY < grooveW + 4) return [180, 180, 180]; // soft shadow near groove
    if (localY > slatH - 4) return [180, 180, 180];
    return [255, 255, 255]; // full lit slat
});
console.log("Generated BMP files");
