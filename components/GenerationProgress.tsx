import React, { useEffect, useRef, useState } from 'react';

/**
 * The waiting state, shared by every tool that generates something.
 *
 * A bare spinner gives no answer to the only two questions someone has while
 * waiting - is it still working, and how much longer - so long renders read as
 * a hang. This answers both: the message changes as the job progresses and
 * the elapsed count proves the page is alive.
 *
 * The field (18 Sep 2026, from Charlie's recording of Higgsfield's loader):
 * the whole viewport is a grid of tiny squares, nearly invisible, and two or
 * three soft glows drift slowly across it and breathe - the picture
 * "thinking" rather than a bar filling. It fills whatever box it is put in
 * (absolute inset-0), so it is the same size as the render it is standing
 * in for. Drawn on a canvas, not DOM cells: 6,000+ cells re-coloured 30
 * times a second would drop frames as elements.
 */

interface GenerationProgressProps {
    /** Messages to move through, in order, as time passes. */
    stages: string[];
    /** Roughly how long this job usually takes. Paces the stages. */
    expectedSeconds: number;
    /** Overrides the current stage - for a message the server actually sent. */
    message?: string | null;
    /** Human phrasing for the estimate, e.g. "about a minute". */
    expectedLabel?: string;
}

const CELL = 8;       // css px per cell, gap included
const GAP = 2;
const ACCENT = [64, 90, 86]; // --accent

/** The drifting glows: slow Lissajous paths so they never repeat visibly. */
const GLOWS = [
    { ax: 0.31, ay: 0.23, px: 0.0, py: 1.1, r: 0.20, w: 1.0 },
    { ax: 0.19, ay: 0.29, px: 2.1, py: 0.4, r: 0.16, w: 0.85 },
    { ax: 0.24, ay: 0.17, px: 4.2, py: 2.8, r: 0.12, w: 0.7 },
];

const Field: React.FC = () => {
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        let raf = 0; let w = 0, h = 0, dpr = 1;
        const fit = () => {
            const box = canvas.parentElement?.getBoundingClientRect();
            w = Math.max(1, Math.floor(box?.width || 300)); h = Math.max(1, Math.floor(box?.height || 200));
            dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = w * dpr; canvas.height = h * dpr;
            canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        fit();
        const ro = new ResizeObserver(fit); if (canvas.parentElement) ro.observe(canvas.parentElement);
        const t0 = performance.now();
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const draw = () => {
            const t = (performance.now() - t0) / 1000;
            ctx.clearRect(0, 0, w, h);
            const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
            const breathe = 0.75 + 0.25 * Math.sin(t * 1.3);
            const glows = GLOWS.map(g => ({
                x: (0.5 + 0.42 * Math.sin(t * g.ax + g.px)) * w,
                y: (0.5 + 0.42 * Math.sin(t * g.ay + g.py)) * h,
                r: g.r * Math.max(w, h), w: g.w,
            }));
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2;
                    let v = 0;
                    for (const g of glows) {
                        const dx = cx - g.x, dy = cy - g.y;
                        v += g.w * Math.exp(-(dx * dx + dy * dy) / (2 * g.r * g.r));
                    }
                    // A little grain so the field is not perfectly smooth.
                    const grain = 0.85 + 0.15 * Math.sin(i * 12.9898 + j * 78.233 + t * 0.7);
                    const a = Math.min(0.6, 0.025 + v * breathe * grain * 0.7);
                    ctx.fillStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a.toFixed(3)})`;
                    ctx.fillRect(i * CELL + GAP / 2, j * CELL + GAP / 2, CELL - GAP, CELL - GAP);
                }
            }
            if (!reduced) raf = requestAnimationFrame(draw);
        };
        draw();
        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);
    return <canvas ref={ref} className="absolute inset-0 block" aria-hidden />;
};

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
    stages,
    expectedSeconds,
    message,
    expectedLabel,
}) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const started = Date.now();
        const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(t);
    }, []);

    const perStage = Math.max(1, expectedSeconds / Math.max(1, stages.length));
    const stageIndex = Math.min(stages.length - 1, Math.floor(elapsed / perStage));
    const headline = message || stages[stageIndex] || 'Working…';
    const estimate = expectedLabel
        || (expectedSeconds >= 50 ? 'about a minute' : `about ${Math.round(expectedSeconds)} seconds`);

    return (
        <div className="absolute inset-0 bg-white overflow-hidden">
            <Field />
            <div className="absolute inset-x-0 bottom-0 p-6 text-center pointer-events-none">
                <p className="text-sm font-bold text-slate-700 bg-white/80 inline-block px-3 py-1">{headline}</p>
                <p className="text-xs text-slate-400 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {elapsed}s elapsed · usually {estimate}
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
