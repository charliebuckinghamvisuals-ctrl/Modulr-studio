import React from 'react';
import { Film, Sparkles } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';

/**
 * Animation showcase — the moving counterpart to the Gallery.
 *
 * Data-driven on purpose: adding a new clip is one entry here plus the mp4
 * (and ideally a matching poster jpg) in public/. Clips autoplay muted on
 * loop, which browsers allow without user interaction, and the poster keeps
 * the tile from flashing empty while the video buffers.
 */
const CLIPS: { id: string; src: string; poster?: string; caption: string }[] = [
    { id: 'clip-1', src: '/hero-clip-1.mp4', poster: '/hero-clip-1.jpg', caption: 'Slow push in · golden hour' },
    { id: 'clip-2', src: '/hero-clip-2.mp4', poster: '/hero-clip-2.jpg', caption: 'Gentle breeze through the planting' },
    { id: 'clip-3', src: '/hero-clip-3.mp4', poster: '/hero-clip-3.jpg', caption: 'Cinematic pan across the elevation' },
    { id: 'clip-4', src: '/hero-clip-4.mp4', poster: '/hero-clip-4.jpg', caption: 'Locked-off scene with living light' },
];

export const AnimationsView: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="ANIMATIONS" />

            {/* Ambient Lighting */}
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="flex-1 p-8 md:p-16 lg:p-24 relative z-10 w-full">
                <div className="max-w-[1600px] mx-auto space-y-24">

                    {/* Header — same voice as the Gallery */}
                    <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                            <Film size={14} className="animate-pulse" />
                            Motion Showcase
                        </div>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05]">
                            The Modulr <br />
                            Animation Gallery
                        </h1>
                        <p className="text-lg text-secondary max-w-2xl mx-auto font-medium">
                            Cinematic clips generated in Animation Studio — a render brought to life
                            with camera moves, breeze and light, in seconds.
                        </p>
                    </div>

                    {/* Clip grid */}
                    <section className="space-y-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 py-4">
                            {CLIPS.map((clip, idx) => (
                                <div
                                    key={clip.id}
                                    className="group relative glass-panel rounded-[2.5rem] border border-border bg-white shadow-2xl overflow-hidden transition-all duration-700 hover:shadow-[0_40px_80px_rgba(0,0,0,0.15)] hover:-translate-y-3 animate-in fade-in slide-in-from-bottom-12"
                                    style={{ animationDelay: `${idx * 120}ms` }}
                                >
                                    <div className="relative w-full aspect-video overflow-hidden bg-slate-900">
                                        <video
                                            src={clip.src}
                                            poster={clip.poster}
                                            autoPlay
                                            muted
                                            loop
                                            playsInline
                                            preload="metadata"
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 transform translate-y-4 group-hover:translate-y-0">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <span className="text-white text-[10px] uppercase font-bold tracking-[0.3em] block">Animation Studio</span>
                                                    <span className="text-white/80 text-xs font-medium">{clip.caption}</span>
                                                </div>
                                                <div className="p-3 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white">
                                                    <Sparkles size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Footer */}
                    <div className="text-center py-12 border-t border-border mt-8">
                        <p className="text-accent/60 text-xs font-bold uppercase tracking-[0.3em]">Generated with Modulr Animation Studio</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
