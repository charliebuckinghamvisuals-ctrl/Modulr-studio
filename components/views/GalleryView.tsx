import React from 'react';
import { Image as ImageIcon, Sparkles, Filter, LayoutGrid } from 'lucide-react';
import { CompareSlider } from '../CompareSlider';
import { DraftingBackground } from '../DraftingBackground';

export const GalleryView: React.FC = () => {
    const renderItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) => ({
        id,
        type: 'render' as const,
        image: `/gallery-${id}.jpg.png`
    }));

    const sliderItems = [12, 13, 14, 15, 16, 17].map((id) => ({
        id,
        type: 'slider' as const,
        before: `/gallery-${id}-before.jpg.png`,
        after: `/gallery-${id}-after.jpg.png`
    }));

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="GALLERY" />

            {/* Ambient Lighting */}
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="flex-1 p-8 md:p-16 lg:p-24 relative z-10 w-full">
                <div className="max-w-[1600px] mx-auto space-y-32">
                    
                    {/* Header */}
                    <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                            <ImageIcon size={14} className="animate-pulse" />
                            Architectural Showcase
                        </div>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05]">
                            The Modulr <br/>
                            Studio Gallery
                        </h1>
                        <p className="text-lg text-secondary max-w-2xl mx-auto font-medium">
                            A curated selection of photorealistic 4K renders, technical line drawings, and before/after transformations—all created using Modulr Studio.
                        </p>
                        
                        <div className="mt-12 flex justify-center">
                            <div className="px-8 py-6 rounded-[2.5rem] bg-accent/5 border border-accent/10 backdrop-blur-md max-w-3xl shadow-sm hover:shadow-md transition-all duration-500">
                                <p className="text-lg md:text-xl font-bold text-accent tracking-tight leading-relaxed">
                                    Want to see your own projects featured here? Send us your Modulr Studio designs and be showcased with your business name in our official gallery.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section 1: Sliders */}
                    <section className="space-y-12">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <h2 className="text-2xl md:text-4xl font-bold text-accent tracking-tight">Interactive Transformations</h2>
                            <p className="text-secondary text-sm max-w-xl">Swipe to see how our engine transforms technical geometry into stunning 4K visualizations.</p>
                            <div className="h-px w-24 bg-accent/20"></div>
                        </div>
                        
                        <div className="space-y-16">
                            {/* Row 1: 3 Sliders */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 py-4">
                                {sliderItems.slice(0, 3).map((item, idx) => (
                                    <div 
                                        key={item.id} 
                                        className="group relative glass-panel rounded-[2.5rem] border border-border bg-white shadow-2xl overflow-hidden transition-all duration-700 hover:shadow-[0_40px_80px_rgba(0,0,0,0.15)] hover:-translate-y-4 animate-in fade-in slide-in-from-bottom-12"
                                        style={{ animationDelay: `${idx * 100}ms`, height: '480px' }}
                                    >
                                        <CompareSlider 
                                            beforeImage={item.before!} 
                                            afterImage={item.after!}
                                            beforeLabel="Lines"
                                            afterLabel="Render"
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Row 2: The Big "Hero" Slider */}
                            <div className="flex justify-center">
                                {sliderItems.slice(3, 4).map((item, idx) => (
                                    <div 
                                        key={item.id} 
                                        className="group relative glass-panel rounded-[3rem] border border-border bg-white shadow-[0_50px_100px_rgba(0,0,0,0.1)] overflow-hidden transition-all duration-700 hover:shadow-[0_60px_120px_rgba(0,0,0,0.2)] hover:-translate-y-6 animate-in fade-in slide-in-from-bottom-16 w-full max-w-5xl"
                                        style={{ animationDelay: '350ms', height: '620px' }}
                                    >
                                        <CompareSlider 
                                            beforeImage={item.before!} 
                                            afterImage={item.after!}
                                            beforeLabel="Lines"
                                            afterLabel="Render"
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Row 3: 2 Sliders Centered */}
                            <div className="flex flex-col md:flex-row justify-center gap-16">
                                {sliderItems.slice(4, 6).map((item, idx) => (
                                    <div 
                                        key={item.id} 
                                        className="group relative glass-panel rounded-[2.5rem] border border-border bg-white shadow-2xl overflow-hidden transition-all duration-700 hover:shadow-[0_40px_80px_rgba(0,0,0,0.15)] hover:-translate-y-4 animate-in fade-in slide-in-from-bottom-12 w-full md:w-[calc(50%-32px)] lg:w-[520px]"
                                        style={{ animationDelay: `${(idx + 4) * 100}ms`, height: '480px' }}
                                    >
                                        <CompareSlider 
                                            beforeImage={item.before!} 
                                            afterImage={item.after!}
                                            beforeLabel="Lines"
                                            afterLabel="Render"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Plain Renders */}
                    <section className="space-y-12">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <h2 className="text-2xl md:text-4xl font-bold text-accent tracking-tight">High-Fidelity Renders</h2>
                            <p className="text-secondary text-sm max-w-xl">A gallery of completed exterior visualisations for premium garden rooms and annexes.</p>
                            <div className="h-px w-24 bg-accent/20"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 py-8">
                            {renderItems.map((item, idx) => (
                                <div 
                                    key={item.id} 
                                    className="group relative glass-panel rounded-[2.5rem] border border-border bg-white shadow-2xl overflow-hidden transition-all duration-700 hover:shadow-[0_40px_80px_rgba(0,0,0,0.15)] hover:-translate-y-4 animate-in fade-in slide-in-from-bottom-12"
                                    style={{ animationDelay: `${idx * 100}ms`, height: '480px' }}
                                >
                                    <div className="relative w-full h-full overflow-hidden">
                                        <div className="absolute inset-0 bg-slate-100 animate-pulse flex items-center justify-center text-slate-300">
                                            <ImageIcon size={48} />
                                        </div>
                                        <img 
                                            src={item.image} 
                                            alt={`Modulr Gallery - Render ${item.id}`}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 relative z-10"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 transform translate-y-4 group-hover:translate-y-0">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <span className="text-white text-[10px] uppercase font-bold tracking-[0.3em] block">Studio Series</span>
                                                    <span className="text-white/80 text-xs font-medium">4K High-Resolution Architecture</span>
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

                    {/* Footer Contact */}
                    <div className="text-center py-12 border-t border-border mt-16">
                        <p className="text-accent/60 text-xs font-bold uppercase tracking-[0.3em]">Built with Modulr Studio v3.2 Intelligence</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
