/**
 * Copy the configurator build into public/3d-config - the ONLY way changes
 * to garden-scene-builder reach the app or the live site.
 *
 *   node scripts/deploy-3d-config.mjs        (run vite build first)
 *
 * Order matters. This used to be "delete every hashed asset, then copy the
 * new ones". When a file's content had not changed its hash had not either,
 * so the same filename was deleted and recreated within a few milliseconds -
 * and Vite's dev server, which keeps an in-memory list of what is in public/
 * and updates it from a file watcher, missed the re-add. It then served the
 * SPA index.html for that CSS URL with a 200, and the configurator came up
 * completely unstyled on localhost until the server was restarted. Copying
 * first and pruning only what the new build no longer contains never
 * deletes a file that is about to exist.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'garden-scene-builder', 'dist');
const DEST = path.join(ROOT, 'public', '3d-config');

const distAssets = path.join(DIST, 'assets');
const destAssets = path.join(DEST, 'assets');
if (!fs.existsSync(distAssets)) { console.error('no build in garden-scene-builder/dist - run vite build first'); process.exit(1); }
fs.mkdirSync(destAssets, { recursive: true });

// 1. New assets in, overwriting same-named files in place.
const fresh = new Set(fs.readdirSync(distAssets));
for (const f of fresh) fs.copyFileSync(path.join(distAssets, f), path.join(destAssets, f));
// 2. Then the page that references them.
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DEST, 'index.html'));
// 3. Only now, drop hashed assets the new build no longer has.
const pruned = [];
for (const f of fs.readdirSync(destAssets)) {
    if (!fresh.has(f) && /^index(\.es)?-[A-Za-z0-9_-]+\.(js|css)$/.test(f)) { fs.unlinkSync(path.join(destAssets, f)); pruned.push(f); }
}

// 4. Models: anything the build carries in models/ that the app's copy does
//    not have yet, or has an older copy of. Charlie also drops models
//    straight into public/3d-config/models, so nothing there is pruned.
//    (17 Sep 2026: the door handle shipped in the source tree but never
//    reached here, so the app loaded a 404 and drew no handles.)
//    The PDF fonts go the same way (23 Sep 2026: they were never copied, and
//    the dev server answered the font URLs with index.html).
for (const dir of ['models', 'fonts']) {
    const from = path.join(DIST, dir), to = path.join(DEST, dir);
    let copied = 0;
    if (fs.existsSync(from)) {
        fs.mkdirSync(to, { recursive: true });
        for (const f of fs.readdirSync(from)) {
            const src = path.join(from, f), dst = path.join(to, f);
            if (!fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs) { fs.copyFileSync(src, dst); copied++; }
        }
    }
    console.log(`${dir}: ${copied} copied`);
}

const html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
const refs = html.match(/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g) || [];
const missing = refs.filter(r => !fs.existsSync(path.join(DEST, r)));
console.log(`deployed ${fresh.size} asset(s); pruned ${pruned.length}${pruned.length ? ': ' + pruned.join(', ') : ''}`);
console.log('index.html references: ' + refs.join(', '));
if (missing.length) { console.error('MISSING: ' + missing.join(', ')); process.exit(1); }
