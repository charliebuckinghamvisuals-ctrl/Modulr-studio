import React from 'react';
import { Building2, Target, PoundSterling, Gem, Phone, Mail, ArrowRight, ExternalLink, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';

export const AboutView: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="ABOUT" />

            {/* Ambient Lighting */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            {/* Main Content Area */}
            <div className="flex-1 p-8 md:p-16 lg:p-24 relative z-10">
                <div className="max-w-4xl mx-auto space-y-20">
                    
                    {/* Hero Section - Centralized */}
                    <section className="flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                            <Sparkles size={14} className="animate-pulse" />
                            Architectural Intelligence
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-accent tracking-tight leading-[1.05] max-w-4xl">
                            The World's First Dedicated <br/>
                            AI Render Engine for Garden Rooms & Annexes
                        </h1>
                        <p className="text-lg md:text-xl text-secondary leading-relaxed max-w-2xl font-medium">
                            We built Modulr Studio to solve a specific problem: making high-end architectural visuals accessible, instant, and affordable for the UK's garden room and annexe specialists.
                        </p>
                    </section>

                    {/* Mission Cards - The Why & How */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
                        <div className="glass-panel p-10 rounded-[2.5rem] space-y-6 border border-border bg-white/40 backdrop-blur-xl shadow-2xl shadow-black/[0.03] hover:shadow-accent/5 transition-all duration-500">
                            <div className="w-14 h-14 rounded-2xl bg-accent/5 flex items-center justify-center">
                                <Target className="text-accent" size={28} />
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-extrabold text-accent tracking-tight">Why We Built It</h3>
                                <p className="text-secondary text-base leading-relaxed">
                                    Traditional rendering is slow and costs hundreds per image. We created this engine to remove that barrier, allowing you to iterate on designs and present to clients without waiting days for a designer.
                                </p>
                            </div>
                        </div>
                        <div className="glass-panel p-10 rounded-[2.5rem] space-y-6 border border-border bg-white/40 backdrop-blur-xl shadow-2xl shadow-black/[0.03] hover:shadow-accent/5 transition-all duration-500">
                            <div className="w-14 h-14 rounded-2xl bg-accent/5 flex items-center justify-center">
                                <Building2 className="text-accent" size={28} />
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-extrabold text-accent tracking-tight">Who It's For</h3>
                                <p className="text-secondary text-base leading-relaxed">
                                    Specifically designed for <strong>garden room and annexe providers</strong>. Whether you're a small bespoke builder or a national provider, this tool is geared to your unique architectural language.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Unique Value Grid */}
                    <section className="flex flex-col items-center space-y-16 py-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-400">
                        <div className="text-center space-y-4">
                            <h2 className="text-3xl font-extrabold text-accent tracking-tight">The AI Edge.</h2>
                            <p className="text-secondary text-base max-w-xl">
                                We are the world's first dedicated AI render engine built specifically for the garden room and annexe sector.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                                    <Gem className="text-accent" size={20} />
                                </div>
                                <h4 className="text-lg font-bold text-primary">Unrivalled Quality</h4>
                                <p className="text-secondary text-sm leading-relaxed">Professional 4K results that rival manual design, generated in seconds.</p>
                            </div>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                                    <PoundSterling className="text-accent" size={20} />
                                </div>
                                <h4 className="text-lg font-bold text-primary">Huge Savings</h4>
                                <p className="text-secondary text-sm leading-relaxed">Dramatically reduce your overheads by moving visualization in-house.</p>
                            </div>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center border border-accent/10">
                                    <ArrowRight className="text-accent" size={20} />
                                </div>
                                <h4 className="text-lg font-bold text-primary">Faster Sales</h4>
                                <p className="text-secondary text-sm leading-relaxed">Impress clients on the spot with instant visuals during your site consultations.</p>
                            </div>
                        </div>
                        
                        {/* Comparison Table Section */}
                        <div className="w-full mt-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
                            <div className="flex items-center gap-2 text-accent font-black uppercase tracking-widest text-xs mb-6 justify-center">
                                <TrendingUp size={14} />
                                Why Modulr Wins
                            </div>
                            
                            <div className="glass-panel overflow-hidden rounded-[2.5rem] border border-border bg-white/30 backdrop-blur-2xl shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border bg-accent/5">
                                                <th className="p-6 md:p-8 text-xs font-black uppercase tracking-widest text-secondary">Metric</th>
                                                <th className="p-6 md:p-8 text-xs font-black uppercase tracking-widest text-secondary">Traditional CGI Studio</th>
                                                <th className="p-6 md:p-8 text-xs font-black uppercase tracking-widest text-accent">Modulr Studio (Business)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            <tr className="hover:bg-accent/5 transition-colors group">
                                                <td className="p-6 md:p-8">
                                                    <span className="text-sm font-bold text-primary block uppercase tracking-tight">Cost per 4K Image</span>
                                                    <span className="text-[10px] text-secondary uppercase tracking-widest font-medium">Production overhead</span>
                                                </td>
                                                <td className="p-6 md:p-8 text-sm font-medium text-secondary">£200 - £300</td>
                                                <td className="p-6 md:p-8 text-sm font-medium text-accent">~£0.40</td>
                                            </tr>
                                            <tr className="hover:bg-accent/5 transition-colors group">
                                                <td className="p-6 md:p-8">
                                                    <span className="text-sm font-bold text-primary block uppercase tracking-tight">Generation Speed</span>
                                                    <span className="text-[10px] text-secondary uppercase tracking-widest font-medium">Time to produce visual</span>
                                                </td>
                                                <td className="p-6 md:p-8 text-sm font-medium text-secondary">2 - 5 Days</td>
                                                <td className="p-6 md:p-8 text-sm font-medium text-accent">&lt; 30 Seconds</td>
                                            </tr>
                                            <tr className="hover:bg-accent/5 transition-colors group bg-accent/5">
                                                <td className="p-6 md:p-8">
                                                    <span className="text-sm font-bold text-primary block uppercase tracking-tight">Monthly Cost</span>
                                                    <span className="text-[10px] text-accent font-bold uppercase tracking-widest">Based on 250 Renders</span>
                                                </td>
                                                <td className="p-6 md:p-8 text-sm font-medium text-red-500/80">£62,500+</td>
                                                <td className="p-6 md:p-8">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-accent uppercase font-black">£99</span>
                                                        <span className="text-[10px] font-medium text-accent uppercase tracking-[0.2em] mt-0.5">600x Value</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Story & NAPC Section - Now beneath the cards and centralized */}
                    <section className="flex flex-col items-center text-center space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500 pt-10">
                        <div className="h-px w-64 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                        
                        <div className="max-w-2xl space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-xs font-black uppercase tracking-[0.4em] text-accent">Exclusively Built by NAPC</h4>
                                <h2 className="text-3xl md:text-4xl font-bold text-accent tracking-tight">Expertise in Planning.</h2>
                            </div>
                            
                            <p className="text-secondary text-base leading-relaxed">
                                Modulr Studio was developed by <strong>NAPC Ltd</strong> (National Annexe Providers Consultancy). We are the UK's first and only dedicated planning and development consultancy specifically for garden rooms, annexes, and mobile homes.
                            </p>
                            
                            <p className="text-secondary text-base leading-relaxed">
                                Our deep understanding of architectural constraints and the planning system allowed us to build an AI that understands the nuances of domestic projects.
                            </p>

                            {/* Contact & Link Group */}
                            <div className="flex flex-col items-center gap-8 pt-6">
                                <div className="flex flex-wrap justify-center gap-8 border-y border-border/50 py-6 w-full max-w-lg">
                                    <div className="flex items-center gap-3 text-sm font-semibold text-primary">
                                        <Phone size={18} className="text-accent" />
                                        01285 283 200
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-semibold text-primary">
                                        <Mail size={18} className="text-accent" />
                                        info@napc.uk
                                    </div>
                                </div>
                                
                                <div className="flex gap-4">
                                    <Button 
                                        onClick={() => window.open('https://napc.uk', '_blank')}
                                        icon={<ExternalLink size={16} />}
                                        className="px-8"
                                    >
                                        Visit NAPC Website
                                    </Button>
                                    <Button 
                                        variant="secondary"
                                        onClick={() => window.open('https://napc.uk/contact/', '_blank')}
                                        icon={<ArrowRight size={16} />}
                                        className="px-8"
                                    >
                                        Work With Us
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Footer Gap */}
                    <div className="h-32"></div>
                </div>
            </div>
        </div>
    );
};
