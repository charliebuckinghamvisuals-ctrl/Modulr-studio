/**
 * Capture a configurator source image headlessly, exactly as "Send to
 * Render Engine" does (canvas.toDataURL), plus the room spec it sends.
 *
 * Usage: node capture-design.js <outDir>
 * Writes <outDir>/source.jpg, <outDir>/source.png and <outDir>/spec.json.
 *
 * Builds a fixed test design that mirrors the one Charlie reported on 4 Sep:
 * long flat-roof room, solid door front-left, long blank run, 3-leaf slider
 * front-right, narrow window on the left wall, sage composite, black fascia.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || '.';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
    // Drive the machine's own Chrome/Edge rather than downloading a bundled one.
    const candidates = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ];
    const executablePath = candidates.find(p => fs.existsSync(p));
    if (!executablePath) throw new Error('No Chrome or Edge found to drive');
    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

    await page.goto('http://localhost:3000/3d-config/index.html', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => !!window.__modulrStore, { timeout: 60000 });

    // Nudge the canvas so R3F sizes to the real viewport (see memory note).
    await page.evaluate(async () => {
        const c = document.querySelector('canvas');
        if (c && c.width < 400) {
            const p = c.parentElement; p.style.height = '1079px';
            window.dispatchEvent(new Event('resize'));
            await new Promise(r => setTimeout(r, 300));
            p.style.height = ''; window.dispatchEvent(new Event('resize'));
        }
    });
    await page.waitForFunction(() => !!window.__modulrScene && document.querySelector('canvas').width > 400, { timeout: 60000 });

    // Build the test design.
    await page.evaluate(() => {
        const st = window.__modulrStore.getState();
        const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
        st.scene.objects.slice().forEach(o => window.__modulrStore.getState().removeObject(o.id));
        window.__modulrStore.getState().updateRoom({
            widthMm: 7000, depthMm: 4500, shape: 'Flat',
            cladding: 'sage_composite', claddingOrientation: 'vertical',
            fasciaMaterial: 'black', frameColor: 'black', frameColorInner: undefined,
            roofMaterial: 'epdm', baseMaterial: 'composite_decking', hasDecking: true,
            doors: [
                { id: id(), wall: 'front', widthMm: 900,  heightMm: 2100, offsetMm: -2500, leaves: 1, style: 'solid' },
                { id: id(), wall: 'front', widthMm: 2400, heightMm: 2100, offsetMm: 1800,  leaves: 3, style: 'standard' },
            ],
            windows: [
                { id: id(), wall: 'left', widthMm: 600, heightMm: 1600, offsetMm: 1600, sillMm: 300, leaves: 1 },
            ],
        });
        window.__modulrStore.getState().setViewMode('3d');
    });
    await new Promise(r => setTimeout(r, 3000));

    // Front-left three-quarter view, like the reported render's source.
    await page.evaluate(async () => {
        const gs = window.__modulrScene.__r3f.root.getState();
        const st = window.__modulrStore.getState();
        st.setSelectedElementId && st.setSelectedElementId(null);
        st.setSelectedObjectId && st.setSelectedObjectId(null);
        if (gs.controls && gs.controls.setLookAt) await gs.controls.setLookAt(-6.2, 2.4, 6.8, 0.8, 1.1, -0.3, false);
    });
    // Let textures/models settle.
    await new Promise(r => setTimeout(r, 8000));

    const { jpg, png, spec, size } = await page.evaluate(() => {
        const gs = window.__modulrScene.__r3f.root.getState();
        gs.gl.render(window.__modulrScene, gs.camera);
        const c = gs.gl.domElement;
        return {
            jpg: c.toDataURL('image/jpeg', 0.92).split(',')[1],
            png: c.toDataURL('image/png').split(',')[1],
            spec: window.__modulrStore.getState().scene.room,
            size: [c.width, c.height],
        };
    });
    fs.writeFileSync(path.join(outDir, 'source.jpg'), Buffer.from(jpg, 'base64'));
    fs.writeFileSync(path.join(outDir, 'source.png'), Buffer.from(png, 'base64'));
    fs.writeFileSync(path.join(outDir, 'spec.json'), JSON.stringify(spec, null, 2));
    console.log('captured', size.join('x'), '->', outDir);
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
