import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The waiting state, shared by every tool that generates something.
 *
 * A bare spinner gives no answer to the only two questions someone has while
 * waiting - is it still working, and how much longer - so long renders read as
 * a hang. This answers both: the message changes as the job progresses, the
 * elapsed count proves the page is alive, and the bar gives a sense of pace.
 *
 * The bar is honest about being an estimate. It eases toward, but never
 * reaches, the end: nothing here knows the real completion, and a bar that sits
 * pinned at 100% while the user waits is worse than no bar.
 */

interface GenerationProgressProps {
    /** Messages to move through, in order, as time passes. */
    stages: string[];
    /** Roughly how long this job usually takes. Paces the stages and the bar. */
    expectedSeconds: number;
    /** Overrides the current stage - for a message the server actually sent. */
    message?: string | null;
    /** Human phrasing for the estimate, e.g. "about a minute". */
    expectedLabel?: string;
}

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

    // Approaches 92% asymptotically rather than marching to 100%, so running
    // over the estimate degrades gracefully instead of stalling on a full bar.
    const pct = Math.min(92, 92 * (1 - Math.exp(-elapsed / (expectedSeconds * 0.55))));

    const estimate = expectedLabel
        || (expectedSeconds >= 50 ? 'about a minute' : `about ${Math.round(expectedSeconds)} seconds`);

    return (
        <div className="flex flex-col items-center justify-center text-center gap-4 px-6">
            <Loader2 size={30} className="animate-spin text-accent" />
            <div>
                <p className="text-sm font-bold text-slate-700">{headline}</p>
                <p className="text-xs text-slate-400 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {elapsed}s elapsed · usually {estimate}
                </p>
            </div>
            <div className="w-full max-w-xs h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                <div
                    className="h-full bg-accent rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${pct}%` }}
                />
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
