import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const urlMap = {
    'composite_color.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_diff_1k.jpg',
    'composite_normal.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_nor_gl_1k.jpg',
    'composite_roughness.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_rough_1k.jpg',
    'composite_ao.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_ao_1k.jpg'
};

const outDir = 'garden-scene-builder/public/textures/';

async function download(url, filename) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to get '${url}': ${res.status} ${res.statusText}`);
    await finished(Readable.fromWeb(res.body).pipe(fs.createWriteStream(outDir + filename)));
    console.log(`Downloaded ${filename}`);
}

async function main() {
    for (const [filename, url] of Object.entries(urlMap)) {
        await download(url, filename);
    }
}
main().catch(console.error);
