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

// 17 Sep 2026: six Animation Studio clips (Seedance and Kling), re-encoded
// for the web at up to 1920 wide, no audio, fast-start.
const CLIPS: HeroClip[] = [
    { src: '/hero-clip-8.mp4', poster: '/hero-clip-8.jpg', caption: 'Sage garden office in autumn rain, wet deck and falling leaves' },
    { src: '/hero-clip-7.mp4', poster: '/hero-clip-7.jpg', caption: 'Black timber annexe with Crittall doors, summer garden' },
    { src: '/hero-clip-2.mp4', poster: '/hero-clip-2.jpg', caption: 'Dark-clad garden room and deck at dusk' },
    { src: '/hero-clip-6.mp4', poster: '/hero-clip-6.jpg', caption: 'Cedar garden office with corner glazing' },
    { src: '/hero-clip-5.mp4', poster: '/hero-clip-5.jpg', caption: 'Gable garden room, standing-seam roof, high summer' },
    { src: '/hero-clip-1.mp4', poster: '/hero-clip-1.jpg', caption: 'Larch garden office, autumn evening' },
    { src: '/hero-clip-4.mp4', poster: '/hero-clip-4.jpg', caption: 'Curved-roof timber cabin with Crittall doors' },
    { src: '/hero-clip-3.mp4', poster: '/hero-clip-3.jpg', caption: 'Grey garden studio in the snow' },
];

/**
 * `fullBleed`: the wide home-page hero - a 16:9 frame with no crop, soft
 * corners, larger caption. The page caps its width (18 Sep 2026: 1400px);
 * true edge-to-edge drew the 1920-wide clips at 2880+ device px on a retina
 * laptop and read as blurry, the same finding as 6 Aug. The default is the
 * contained card used elsewhere.
 */
/**
 * `quiet` (editorial home, 20 Sep 2026): no chrome at all - no corner
 * radius, shadow, badge or caption sentence - just the clips, a light
 * gradient, the clip name and the dots tucked bottom right. `children` is
 * the page's own headline block, laid over the bottom left of the frame.
 */
export const HeroVideoCarousel: React.FC<{ fullBleed?: boolean; quiet?: boolean; children?: React.ReactNode }> = ({ fullBleed = false, quiet = false, children }) => {
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

    const dots = (
        <div className={`flex items-center gap-1 ${quiet ? '' : 'mt-4'}`}>
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
    );

    return (
        <div className="w-full">
            <div className={`relative overflow-hidden ${quiet ? 'bg-[#141a19]' : `bg-slate-100 ${fullBleed ? 'rounded-2xl md:rounded-3xl shadow-2xl' : 'rounded-3xl md:rounded-xl border border-border shadow-2xl'}`}`}>
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

                    {quiet ? (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-t from-[#141a19]/80 via-[#141a19]/20 to-transparent pointer-events-none" />
                            {/* The page's headline block, bottom left. */}
                            {children && <div className="absolute inset-x-0 bottom-0">{children}</div>}
                            {/* Clip name and dots, bottom right, out of the copy's way. */}
                            <div className="absolute right-4 sm:right-6 lg:right-10 bottom-4 sm:bottom-6 lg:bottom-9 flex flex-col items-end gap-1">
                                <p className="hidden md:block text-[10px] uppercase tracking-[0.25em] text-white/75 text-right max-w-xs" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                    {CLIPS[active].caption}
                                </p>
                                {dots}
                            </div>
                        </>
                    ) : (
                    <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

                    <div className={`absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-8 ${fullBleed ? 'md:px-10 lg:px-14 md:pb-10' : ''}`}>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-none bg-black/40 border border-white/25 backdrop-blur-md text-white text-[9px] font-bold uppercase tracking-[0.2em]">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            Architectural Intelligence
                        </div>

                        <p
                            className={`hidden sm:block mt-3 text-white font-light leading-snug ${fullBleed ? 'text-lg md:text-2xl lg:text-3xl max-w-2xl' : 'text-base md:text-xl max-w-lg'}`}
                            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 2px 14px rgba(0,0,0,0.75)' }}
                        >
                            {CLIPS[active].caption}, rendered in Modulr Studio, then brought to
                            life in Animation Studio.
                        </p>

                        {/* Wide hit targets on a narrow mark: the dot is 8px but
                            the button around it is 24px, so it is tappable. */}
                        {dots}
                    </div>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
};
