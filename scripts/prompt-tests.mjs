/**
 * Smoke tests for the prompt-assembly logic in server.js.
 *
 * These extract the real functions from the file (no framework, no mocks, no
 * API calls) and assert the invariants that have actually broken before:
 * the zero-count reinforcement, the spec-over-analyser override, and the
 * verification comparison. Run with `npm test`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js'), 'utf8');
let failures = 0;
const check = (name, cond) => {
    if (cond) { console.log(`  PASS  ${name}`); }
    else { failures++; console.error(`  FAIL  ${name}`); }
};

// ── buildConfigSpecBlock ────────────────────────────────────────────────────
const sanitizeString = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const specMatch = src.match(/const buildConfigSpecBlock = \(spec\) => \{[\s\S]*?\n        \};/);
check('buildConfigSpecBlock found in server.js', !!specMatch);
const buildConfigSpecBlock = eval('(' + specMatch[0].replace('const buildConfigSpecBlock = ', '').replace(/;\s*$/, '') + ')');

const windowless = buildConfigSpecBlock({
    widthMm: 4000, depthMm: 3000, shape: 'Flat',
    doors: [{ leaves: 2, widthMm: 1800, heightMm: 2100, style: 'crittall', wall: 'front' }],
    windows: [], skylights: [],
});
check('zero windows -> NONE stated', windowless.includes('Windows: NONE anywhere on this building'));
check('zero windows -> reinforcement sentence present', windowless.includes('Do not add any window openings'));
check('zero windows + doors -> door glazing clause present', windowless.includes('door sets listed above'));

const bare = buildConfigSpecBlock({ widthMm: 3000, depthMm: 2000, shape: 'Flat', doors: [], windows: [] });
check('zero doors AND windows -> no dangling door reference', !bare.includes('door sets listed above'));
check('zero doors -> door fallback sentence present', bare.includes('Render no exterior door sets'));

const windowed = buildConfigSpecBlock({
    widthMm: 6000, depthMm: 3500, shape: 'Gable',
    doors: [], windows: [{ widthMm: 1200, heightMm: 1000, style: 'crittall', wall: 'left' }],
});
check('one window -> count stated', windowed.includes('all elevations: 1, listed below'));
check('gable shape -> gable roof stated', windowed.includes('gable'));

// ── the client's order: colour, fascia, door type (4 Sep 2026) ─────────────
// A dark green building came back grey and a solid door came back glazed.
const ordered = buildConfigSpecBlock({
    widthMm: 6000, depthMm: 4000, shape: 'Flat',
    cladding: 'sage_composite', fasciaMaterial: 'black', roofMaterial: 'epdm', frameColor: 'anthracite',
    doors: [{ leaves: 1, widthMm: 900, heightMm: 2100, style: 'solid', wall: 'left', offsetMm: -1500 }],
    windows: [{ widthMm: 1200, heightMm: 1000, style: 'crittall', wall: 'front' }],
});
check('cladding colour stated from the spec', ordered.includes('SAGE GREEN'));
check('uniform cladding -> one ALL elevations line', ordered.includes('Cladding, ALL elevations'));
check('fascia stated from the spec', ordered.includes('Fascia') && ordered.includes('BLACK'));
check('roof covering stated', ordered.includes('EPDM'));
check('solid door -> SOLID UNGLAZED', /Door 1:.*SOLID UNGLAZED/.test(ordered));
check('solid door -> never described as glazed', !/Door 1:[^\n]*standard glazed/.test(ordered));
check('header no longer disclaims colour', !ordered.includes('says nothing about materials'));
check('frame colour stated from the spec', ordered.includes('frames: ANTHRACITE'));
// Left wall, 4000 deep, 900 wide door 1500mm left of centre (viewed from
// outside, +offset is right on the left wall): 2000 - 1500 - 450 = 50 to the
// left corner, 2000 + 1500 - 450 = 3050 to the right.
check('door position stated as blank wall to each corner', ordered.includes('leaving 50mm of blank wall to the left-hand corner and 3050mm to the right-hand corner'));
check('QA inspector receives the order, not just the shading', src.includes('inspectRenderFidelity(base64Image, renderB64, specFacts)'));

const perFace = buildConfigSpecBlock({
    widthMm: 6000, depthMm: 4000, shape: 'Flat',
    cladding: 'black_composite', claddingFront: 'cedar_composite',
    doors: [], windows: [],
});
check('per-elevation cladding -> each face listed', perFace.includes('Front elevation: warm cedar') && perFace.includes('Back elevation: BLACK'));
check('per-elevation cladding -> no ALL elevations claim', !perFace.includes('Cladding, ALL elevations'));

// The QA inspection must now judge colour family and door type.
check('QA checks cladding colour family', src.includes('claddingColourMatch'));
check('QA checks solid vs glazed doors', src.includes('doorStyleMatch'));
check('QA failure sentence for colour drift exists', src.includes('the render changed the cladding colour'));

// ── render verification ─────────────────────────────────────────────────────
// compareCounts (absolute counts against the spec) was replaced on 2 Sep by
// inspectRenderFidelity, a vision comparison of render against SOURCE that
// returns booleans. It lives inside the request handler, so it is checked
// structurally: every check must exist and must feed a corrective retry.
check('inspectRenderFidelity exists', src.includes('const inspectRenderFidelity'));
for (const flag of ['sameViewpoint', 'doorsMatch', 'windowsMatch', 'roofMatch', 'claddingColourMatch', 'doorStyleMatch']) {
    check(`QA reports ${flag}`, src.includes(`${flag}: { type: Type.BOOLEAN`));
    check(`QA acts on ${flag} === false`, src.includes(`seen.${flag} === false`));
}
// Optional schema fields can be omitted by the model, and an omitted flag is
// never `=== false` - the guard would silently never fire. All six must be required.
const qaRequired = src.match(/required: \[("sameViewpoint"[^\]]*)\]/);
check('QA schema requires every flag', !!qaRequired && ['sameViewpoint', 'doorsMatch', 'windowsMatch', 'roofMatch', 'claddingColourMatch', 'doorStyleMatch'].every(f => qaRequired[1].includes(`"${f}"`)));
check('one corrective retry on failure', src.includes('retrying once'));
check('best attempt wins, never the worse one', src.includes('if (failures2.length <= failures.length) b64Data = retryB64;'));

// ── guard rails on the render pipeline ──────────────────────────────────────
// The render engine must stay on flash-image: the pro image model re-composes
// the building (A/B of 4 Sep 2026, scripts/render-ab.mjs). 4K export may use pro.
const renderCall = src.slice(src.indexOf('const runRender = async (promptText) => {'), src.indexOf('const runMaterialsPass'));
check('render engine uses the faithful flash image model', renderCall.includes("model: 'gemini-3.1-flash-image'"));
check('render engine is NOT on the re-composing pro model', !renderCall.includes("model: 'gemini-3-pro-image'"));

// ── pass 2: materials on the pro model, guarded ──────────────────────────────
const pass2 = src.slice(src.indexOf('const runMaterialsPass = async'), src.indexOf('let b64Data = await runRender(prompt);'));
check('materials pass uses the pro image model', pass2.includes("model: 'gemini-3-pro-image'"));
check('materials pass prompt locks geometry', src.includes('PIXEL-LEVEL GEOMETRY LOCK'));
check('materials pass only runs on CGI sources', src.includes("if (isSketchUpMode && b64Data && imageEngine === 'gemini') {"));
// The OpenAI engines are a single edit pass, so the Gemini materials pass must not follow them.
check('materials pass never follows an OpenAI engine', src.includes("imageEngine === 'gemini') {"));
check('OpenAI engines refuse cleanly without a key', src.includes('OPENAI_API_KEY') && src.includes("status(400)"));
check('materials pass is inspected against the ORIGINAL source', src.includes('inspectRenderFidelity(base64Image, finished, specFacts)'));
check('materials pass never replaces pass 1 when it drifts', src.includes('keeping pass 1'));
check('standard renders are 2K, not 1K', !src.includes('imageSize: isHighQuality ? "4K" : "1K"'));
// Every plan renders at 2K; 4K is the metered export action, so there is no per-plan clamp any more.
check('renderBuilding charges STANDARD_RES for every plan', src.includes('enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES)'));
check('no raw error.message reaches clients', !src.includes('json({ error: error.message })'));

console.log(failures === 0 ? '\nAll prompt tests passed.' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
