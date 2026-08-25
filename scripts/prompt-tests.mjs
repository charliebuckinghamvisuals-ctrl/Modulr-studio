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
check('zero windows -> EXACTLY 0 stated', windowless.includes('Windows: EXACTLY 0'));
check('zero windows -> reinforcement sentence present', windowless.includes('NO windows'));
check('zero windows + doors -> door glazing clause present', windowless.includes('door sets listed above'));

const bare = buildConfigSpecBlock({ widthMm: 3000, depthMm: 2000, shape: 'Flat', doors: [], windows: [] });
check('zero doors AND windows -> no dangling door reference', !bare.includes('door sets listed above'));
check('zero doors -> door fallback sentence present', bare.includes('Render no exterior door sets'));

const windowed = buildConfigSpecBlock({
    widthMm: 6000, depthMm: 3500, shape: 'Gable',
    doors: [], windows: [{ widthMm: 1200, heightMm: 1000, style: 'crittall', wall: 'left' }],
});
check('one window -> EXACTLY 1', windowed.includes('Windows: EXACTLY 1'));
check('gable shape -> gable roof stated', windowed.includes('gable'));

// ── verification comparison ─────────────────────────────────────────────────
const cmpMatch = src.match(/const compareCounts = \(expected, seen, truthWord\) => \{[\s\S]*?\n        \};/);
check('compareCounts found in server.js', !!cmpMatch);
const compareCounts = eval('(' + cmpMatch[0].replace('const compareCounts = ', '').replace(/;\s*$/, '') + ')');

check('matching counts -> no failures',
    compareCounts({ doors: 1, windows: 0, roof: 'flat' }, { doorSets: 1, windows: 0, roofForm: 'flat' }, 'configured building').length === 0);
check('invented window -> failure reported',
    compareCounts({ doors: 1, windows: 0, roof: 'flat' }, { doorSets: 1, windows: 2, roofForm: 'flat' }, 'configured building').length === 1);
check('inspector unsure about roof (other) -> not a failure',
    compareCounts({ doors: 1, windows: 1, roof: 'gable' }, { doorSets: 1, windows: 1, roofForm: 'other' }, 'source image').length === 0);
check('wrong roof form -> failure reported',
    compareCounts({ doors: 0, windows: 0, roof: 'gable' }, { doorSets: 0, windows: 0, roofForm: 'flat' }, 'source image').length === 1);

// ── guard rails on the render pipeline ──────────────────────────────────────
check('all plans use the pro image model', src.includes("model: 'gemini-3-pro-image'"));
check('standard renders are 2K, not 1K', !src.includes('imageSize: isHighQuality ? "4K" : "1K"'));
check('standard plan resolution clamp exists', src.includes("if (access.plan === 'standard') isHighQuality = false;"));
check('no raw error.message reaches clients', !src.includes('json({ error: error.message })'));

console.log(failures === 0 ? '\nAll prompt tests passed.' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
