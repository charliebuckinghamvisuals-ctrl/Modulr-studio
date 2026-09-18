import React, { useEffect, useState } from 'react';

/**
 * The waiting state, shared by every tool that generates something.
 *
 * A bare spinner gives no answer to the only two questions someone has while
 * waiting - is it still working, and how much longer - so long renders read as
 * a hang. This answers both: the message changes as the job progresses and
 * the elapsed count proves the page is alive.
 *
 * The field (18 Sep 2026): a slow flowing gradient - soft tints of the
 * accent drifting across the whole render box and breathing - the picture
 * "thinking" rather than a bar filling. It fills whatever box it is put in
 * (absolute inset-0), so it is the same size as the render it is standing
 * in for. A pixel grid was tried first and read as noise.
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

/**
 * The field: three large, heavily blurred tints of the accent drifting slowly
 * across a white box and breathing - a flowing gradient, not a grid (Charlie:
 * the grid was "too much"). Pure CSS keyframes, so it costs nothing.
 */
const Field: React.FC = () => (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <span className="gen-blob gen-blob-1" />
        <span className="gen-blob gen-blob-2" />
        <span className="gen-blob gen-blob-3" />
    </div>
);

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
            <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                <div className="bg-white border border-slate-200 px-6 py-4 text-center shadow-sm">
                    <p className="text-sm font-bold text-accent">{headline}</p>
                    <p className="text-xs text-slate-500 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {elapsed}s elapsed · usually {estimate}
                    </p>
                </div>
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
