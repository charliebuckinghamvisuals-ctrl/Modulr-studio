import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

/**
 * The 3D Configurator walkthrough recording, cropped to the app itself.
 *
 * The source was a square social export - title text above, logo pill below,
 * the recording letterboxed between them. The site already carries the brand
 * and a heading, so the page shows only the recording (2880x1226 out of the
 * 2880x2880 frame), scaled to 1600 wide. Same containment rule as the hero:
 * it draws inside the content column, never full-bleed, so a 1600px source
 * stays sharp on a retina laptop.
 *
 * Nothing is fetched until the frame scrolls into view - it is 84 seconds and
 * ~9 MB, which is not worth loading for a visitor who never reaches it. Once
 * visible it plays muted and loops; leaving the viewport pauses it.
 */

interface Chapter {
    label: string;
    /** Seconds into the recording. */
    at: number;
}

const CHAPTERS: Chapter[] = [
    { label: 'Walk outside', at: 0 },
    { label: 'Step inside', at: 18 },
    { label: 'Change finishes as you walk', at: 50 },
];

interface WalkthroughShowcaseProps {
    /** Show the chapter buttons under the frame. */
    chapters?: boolean;
    className?: string;
}

export const WalkthroughShowcase: React.FC<WalkthroughShowcaseProps> = ({ chapters = true, className = '' }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [inView, setInView] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);

    const prefersReducedMotion = React.useMemo(
        () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        []
    );

    useEffect(() => {
        const el = frameRef.current;
        if (!el || !('IntersectionObserver' in window)) { setInView(true); return; }
        const io = new IntersectionObserver(
            entries => setInView(entries.some(e => e.isIntersecting)),
            { threshold: 0.35 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        // Autoplay policy reads the property, not the attribute.
        v.muted = true;
        if (inView && !prefersReducedMotion) {
            v.play().catch(() => {});
        } else {
            v.pause();
        }
    }, [inView, prefersReducedMotion]);

    const toggle = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {}); else v.pause();
    };

    const seek = (at: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = at;
        v.play().catch(() => {});
    };

    const activeChapter = CHAPTERS.reduce((acc, c, i) => (current >= c.at ? i : acc), 0);

    return (
        <div className={`w-full ${className}`}>
            <div
                ref={frameRef}
                className="relative rounded-3xl md:rounded-[2.5rem] overflow-hidden border border-border bg-slate-100 shadow-2xl"
            >
                {/* The crop's own ratio, so the whole recording shows with no
                    further cropping - the same "see all of it" rule as the hero. */}
                <div className="relative w-full" style={{ aspectRatio: '2880 / 1226' }}>
                    <video
                        ref={videoRef}
                        src={inView ? '/config-walkthrough.mp4' : undefined}
                        poster="/config-walkthrough.jpg"
                        muted
                        loop
                        playsInline
                        preload="none"
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onTimeUpdate={e => setCurrent((e.target as HTMLVideoElement).currentTime)}
                        className="absolute inset-0 w-full h-full"
                        aria-label="Screen recording of the Modulr Studio 3D Configurator: walking around the outside of a garden games room, stepping inside, and changing finishes while walking"
                    />

                    <div className="absolute inset-x-0 top-0 p-4 sm:p-5 flex items-start justify-between pointer-events-none">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/45 border border-white/25 backdrop-blur-md text-white text-[9px] font-bold uppercase tracking-[0.2em]">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            Recorded in the 3D Configurator
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={toggle}
                        aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
                        className="absolute bottom-4 left-4 sm:bottom-5 sm:left-5 w-11 h-11 rounded-full bg-black/50 border border-white/25 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>
                </div>
            </div>

            {chapters && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {CHAPTERS.map((c, i) => (
                        <button
                            key={c.label}
                            type="button"
                            onClick={() => seek(c.at)}
                            aria-current={i === activeChapter}
                            className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                                i === activeChapter
                                    ? 'bg-accent text-white border-accent'
                                    : 'bg-white/60 text-secondary border-border hover:border-accent/50 hover:text-accent'
                            }`}
                        >
                            {c.label}
                        </button>
                    ))}
                    <span className="ml-auto text-[11px] text-secondary/60 hidden sm:inline">
                        Games room, walked from the garden to the sofa. Real screen recording, nothing staged.
                    </span>
                </div>
            )}
        </div>
    );
};
