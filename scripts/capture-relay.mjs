/**
 * Catch what the configurator posts on "Send to Render Engine" and save it
 * as a test design: shaded.jpg, line.png, spec.json.
 *
 *   node scripts/capture-relay.mjs [port=3077]
 *
 * In the configurator tab (dev server, Business mode), listen for the
 * RENDER_3D_SCENE message and forward it here:
 *   window.addEventListener('message', e => { if (e.data?.type==='RENDER_3D_SCENE')
 *     fetch('http://localhost:3077/save?name=my-design', { method:'POST', body: JSON.stringify(e.data) }) })
 * then press the button. Then: node scripts/render-live.mjs test-designs/my-design/shaded.jpg test-designs/my-design/line.png test-designs/my-design/spec.json
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 3077);
const strip = (s) => (typeof s === 'string' ? s.replace(/^data:[^;]+;base64,/, '') : null);

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.end(); return; }
    if (req.method !== 'POST') { res.statusCode = 404; res.end('POST /save?name=x'); return; }
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'capture').replace(/[^a-z0-9_-]/gi, '');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const dir = path.join(ROOT, 'test-designs', name);
            fs.mkdirSync(dir, { recursive: true });
            const shaded = strip(data.image), line = strip(data.lineImage);
            if (shaded) fs.writeFileSync(path.join(dir, 'shaded.jpg'), Buffer.from(shaded, 'base64'));
            if (line) fs.writeFileSync(path.join(dir, 'line.png'), Buffer.from(line, 'base64'));
            fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(data.roomSpec || null, null, 2));
            const msg = `saved ${name}: shaded ${shaded ? Math.round(shaded.length / 1365) + 'KB' : 'none'}, line ${line ? Math.round(line.length / 1365) + 'KB' : 'none'}, spec ${data.roomSpec ? 'yes' : 'none'}`;
            console.log(msg); res.end(msg);
        } catch (e) { console.error(e); res.statusCode = 500; res.end(String(e.message || e)); }
    });
}).listen(port, () => console.log('capture relay on http://localhost:' + port + '/save?name=<design>'));
