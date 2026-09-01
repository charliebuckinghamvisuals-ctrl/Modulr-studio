import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

// ambientCG CC0 interior floors. These ship as zips of the full PBR set,
// so they are NOT fetched by this script - see ACG_FLOORS below for the
// provenance record. Downloaded, resized to 1024 and renamed to this
// project's <prefix>_color/_normal/_roughness/_ao convention.
//   WoodFloor051 -> oak_plank        (https://ambientcg.com/a/WoodFloor051)
//   WoodFloor053 -> oak_herringbone  (https://ambientcg.com/a/WoodFloor053)
//   WoodFloor008 -> smoked_oak       (https://ambientcg.com/a/WoodFloor008, no AO map)
//   WoodFloor040 -> rustic_pine     (https://ambientcg.com/a/WoodFloor040)
//   WoodFloor062 -> light_oak       (https://ambientcg.com/a/WoodFloor062, no AO map)
//   WoodFloor014 -> walnut_parquet  (https://ambientcg.com/a/WoodFloor014)
//   Fabric061    -> upholstery      (https://ambientcg.com/a/Fabric061, 40cm tile)
//                                   sofa / sofa_l / armchair / footstool
//   Worktops (Marble_20_1K swap, and the continuous run slabs):
//     Marble012 -> wt_carrara     Onyx015   -> wt_onyx
//     Marble014 -> wt_cream       Marble007 -> wt_travertine
//     Marble011 -> wt_umber       Marble006 -> wt_nero
//     Wood083A  -> wt_oak
//   Wallpaper001A -> wallpaper    (interior wall faces; colour multiplies through)

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
