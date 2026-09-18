import React, { useEffect, useMemo, useState } from 'react';

/**
 * The waiting state, shared by every tool that generates something.
 *
 * A bare spinner gives no answer to the only two questions someone has while
 * waiting - is it still working, and how much longer - so long renders read as
 * a hang. This answers both: the message changes as the job progresses, the
 * elapsed count proves the page is alive, and the pixel field gives a sense
 * of pace.
 *
 * The pixel field (18 Sep 2026, after Charlie liked Higgsfield's loader): a
 * grid of small squares that fill in, in a fixed random order, as the
 * estimate runs - the image "resolving". It is honest about being an
 * estimate: it eases toward, but never reaches, full, because nothing here
 * knows the real completion, and a field that sits complete while the user
 * waits is worse than none. A few squares near the front keep flickering so
 * it never looks frozen.
 */

interface GenerationProgressProps {
    /** Messages to move through, in order, as time passes. */
    stages: string[];
    /** Roughly how long this job usually takes. Paces the stages and the field. */
    expectedSeconds: number;
    /** Overrides the current stage - for a message the server actually sent. */
    message?: string | null;
    /** Human phrasing for the estimate, e.g. "about a minute". */
    expectedLabel?: string;
}

const COLS = 32, ROWS = 18;

/** A fixed shuffle of every cell, so the fill order is random but stable. */
const useFillOrder = () => useMemo(() => {
    const n = COLS * ROWS;
    const order = new Array<number>(n);
    for (let i = 0; i < n; i++) order[i] = i;
    // Seeded shuffle: the same field every time, so it reads as one animation.
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rank = new Array<number>(n);
    order.forEach((cell, i) => { rank[cell] = i / n; });
    return rank;
}, []);

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
    stages,
    expectedSeconds,
    message,
    expectedLabel,
}) => {
    const [elapsed, setElapsed] = useState(0);
    const [tick, setTick] = useState(0);
    const rank = useFillOrder();

    useEffect(() => {
        const started = Date.now();
        const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
        const f = setInterval(() => setTick(x => x + 1), 120);
        return () => { clearInterval(t); clearInterval(f); };
    }, []);

    const perStage = Math.max(1, expectedSeconds / Math.max(1, stages.length));
    const stageIndex = Math.min(stages.length - 1, Math.floor(elapsed / perStage));
    const headline = message || stages[stageIndex] || 'Working…';

    // Approaches 92% asymptotically rather than marching to 100%, so running
    // over the estimate degrades gracefully instead of stalling on a full field.
    const frac = Math.min(0.92, 0.92 * (1 - Math.exp(-elapsed / (expectedSeconds * 0.55))));

    const estimate = expectedLabel
        || (expectedSeconds >= 50 ? 'about a minute' : `about ${Math.round(expectedSeconds)} seconds`);

    // Cells with rank under `frac` are filled; the band just ahead of the front
    // flickers so the field is visibly alive between ticks.
    const cells = useMemo(() => {
        const out: number[] = [];
        for (let i = 0; i < COLS * ROWS; i++) {
            const r = rank[i];
            if (r < frac) out.push(1);
            else if (r < frac + 0.06) out.push(((i * 7 + tick) % 5) === 0 ? 1 : ((i * 3 + tick) % 4) === 0 ? 0.5 : 0);
            else out.push(0);
        }
        return out;
    }, [rank, frac, tick]);

    return (
        <div className="flex flex-col items-center justify-center text-center gap-5 px-6 w-full">
            <div
                className="grid w-full max-w-md gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
                aria-hidden
            >
                {cells.map((v, i) => (
                    <span
                        key={i}
                        className="block aspect-square"
                        style={{
                            backgroundColor: v === 1 ? 'var(--accent)' : v === 0.5 ? 'rgba(64,90,86,0.45)' : 'rgba(64,90,86,0.08)',
                            transition: 'background-color 240ms ease-out',
                        }}
                    />
                ))}
            </div>
            <div>
                <p className="text-sm font-bold text-slate-700">{headline}</p>
                <p className="text-xs text-slate-400 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(elapsed)}s elapsed · usually {estimate}
                </p>
            </div>
        </div>
    );
};

/** Stage copy for the image tools. Deliberately describes the pipeline rather
 *  than inventing percentages we cannot know. */
export const RENDER_STAGES = [
    'Reading your drawing…',
    'Locking the geometry…',
    'Applying materials…',
    'Lighting the scene…',
    'Rendering detail…',
    'Finishing the image…',
];
