import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The homepage hero: a set of Animation Studio clips, one after another.
 *
 * Each clip plays to its end and hands over to the next with a crossfade -
 * timed off the video's own `ended` event rather than a fixed interval, because
 * the clips are different lengths (8s and 10s) and a timer would cut one short
 * or leave the other sitting on a frozen last frame.
 */

interface HeroClip {
    src: string;
    poster: string;
    caption: string;
}

const CLIPS: HeroClip[] = [
    { src: '/hero-clip-1.mp4', poster: '/hero-clip-1.jpg', caption: 'Sauna and pilates studio, golden hour' },
    { src: '/hero-clip-2.mp4', poster: '/hero-clip-2.jpg', caption: 'Garden room and deck, evening light' },
    { src: '/hero-clip-3.mp4', poster: '/hero-clip-3.jpg', caption: 'Cedar-clad garden studio, summer garden' },
    { src: '/hero-clip-4.mp4', poster: '/hero-clip-4.jpg', caption: 'Charred timber annexe with a gable roof' },
];

export const HeroVideoCarousel: React.FC = () => {
    const [active, setActive] = useState(0);
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

    const prefersReducedMotion = React.useMemo(
        () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        []
    );

    const next = useCallback(() => setActive(i => (i + 1) % CLIPS.length), []);

    /**
     * Drive playback off the active index.
     *
     * Every clip is rewound and paused as it leaves, so returning to one starts
     * it from the top rather than resuming a clip the viewer has already partly
     * seen. play() is caught because a browser can still refuse it - an
     * unhandled rejection here would surface as a console error on the homepage.
     */
    useEffect(() => {
        videoRefs.current.forEach((v, i) => {
            if (!v) return;
            // React sets `muted` as an attribute, but autoplay policy reads the
            // property - without this line nothing plays in Chrome or Safari.
            v.muted = true;
            if (i === active) {
                v.currentTime = 0;
                if (!prefersReducedMotion) v.play().catch(() => {});
            } else {
                v.pause();
                v.currentTime = 0;
            }
        });
    }, [active, prefersReducedMotion]);

    return (
        <div className="w-full">
            <div className="relative rounded-3xl md:rounded-[2.5rem] overflow-hidden border border-border bg-slate-100 shadow-2xl">
                <div className="relative w-full aspect-video">
                    {CLIPS.map((clip, i) => (
                        <video
                            key={clip.src}
                            ref={el => { videoRefs.current[i] = el; }}
                            src={clip.src}
                            poster={clip.poster}
                            loop={false}
                            muted
                            playsInline
                            /* Only the clip playing and the one after it are
                               worth fetching. Eagerly loading all four is ~10 MB
                               on a homepage most visitors will scroll straight
                               past. */
                            preload={i === active || i === (active + 1) % CLIPS.length ? 'auto' : 'none'}
                            onEnded={next}
                            aria-hidden={i !== active}
                            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                                i === active ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                    ))}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-8">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/25 backdrop-blur-md text-white text-[9px] font-bold uppercase tracking-[0.2em]">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            Architectural Intelligence
                        </div>

                        <p
                            className="hidden sm:block mt-3 text-white text-base md:text-xl font-light leading-snug max-w-lg"
                            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 2px 14px rgba(0,0,0,0.75)' }}
                        >
                            {CLIPS[active].caption} — rendered in Modulr Studio, then brought to
                            life in Animation Studio.
                        </p>

                        {/* Wide hit targets on a narrow mark: the dot is 8px but
                            the button around it is 24px, so it is tappable. */}
                        <div className="mt-4 flex items-center gap-1">
                            {CLIPS.map((clip, i) => (
                                <button
                                    key={clip.src}
                                    onClick={() => setActive(i)}
                                    aria-label={`Show clip ${i + 1}: ${clip.caption}`}
                                    aria-current={i === active}
                                    className="p-2 group"
                                >
                                    <span
                                        className={`block h-1.5 rounded-full transition-all duration-500 ${
                                            i === active
                                                ? 'w-8 bg-white'
                                                : 'w-1.5 bg-white/45 group-hover:bg-white/80'
                                        }`}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
