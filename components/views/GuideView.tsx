import React from 'react';
import { BookOpen, HelpCircle, CheckCircle2, Layers, Grid, Palette, ArrowRight, Sparkles, PenTool, Image as ImageIcon } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';

export const GuideView: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="GUIDE" />

            {/* Ambient Lighting */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="flex-1 p-8 md:p-16 relative z-10">
                <div className="max-w-4xl mx-auto space-y-16">
                    
                    {/* Header */}
                    <section className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                            <BookOpen size={14} className="animate-pulse" />
                            User Guide & Handbook
                        </div>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05]">
                            Get the Best Results from <br/>
                            Modulr Studio
                        </h1>
                        <p className="text-lg text-secondary max-w-2xl mx-auto font-medium">
                            Whether you're starting from a hand-drawn sketch or a fully detailed SketchUp model, here is how to achieve studio-level 4K renders.
                        </p>
                    </section>

                    {/* Step by Step Section */}
                    <section className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                                <Layers className="text-accent" size={20} />
                            </div>
                            <h2 className="text-2xl font-extrabold text-accent tracking-tight">Step-by-Step: From Sketch to Studio CGI</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Path A */}
                            <div className="glass-panel p-8 rounded-[2rem] border border-border bg-white/40 backdrop-blur-xl space-y-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <PenTool size={80} />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-accent px-3 py-1 rounded-full bg-accent/10">Path A</span>
                                    <h3 className="text-xl font-bold text-accent">Fresh Canvas (No Materials)</h3>
                                    <p className="text-sm text-secondary leading-relaxed">Best for starting from scratch or turning raw sketches into architectural designs.</p>
                                </div>
                                <ul className="space-y-4">
                                    {[
                                        "Take a screenshot of your black line drawing or sketch.",
                                        "Use the **Line Converter** to clean up the lines or convert to a color line drawing.",
                                        "Tell the AI what materials you want to add during conversion.",
                                        "Import the result via **Black Line Drawing Import** in the Render Engine."
                                    ].map((step, idx) => (
                                        <li key={idx} className="flex gap-3 text-sm text-secondary items-start">
                                            <div className="mt-1 flex-shrink-0 animate-pulse text-accent"><CheckCircle2 size={14} /></div>
                                            <span>{step.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} className="text-primary">{part}</strong> : part)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Path B */}
                            <div className="glass-panel p-8 rounded-[2rem] border border-border bg-white/40 backdrop-blur-xl space-y-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <ImageIcon size={80} />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-accent px-3 py-1 rounded-full bg-accent/10">Path B</span>
                                    <h3 className="text-xl font-bold text-accent">Existing Design (With Materials)</h3>
                                    <p className="text-sm text-secondary leading-relaxed">Best for moving from SketchUp or other 3D software to high-end, realistic CGIs.</p>
                                </div>
                                <ul className="space-y-4">
                                    {[
                                        "Take a screenshot of your model with materials already applied.",
                                        "Import via the **Sketchup Import** method in the Render Engine.",
                                        "The AI analyzes your specific materials and geometry setup.",
                                        "Generate a professional, studio-level 4K CGI instantly."
                                    ].map((step, idx) => (
                                        <li key={idx} className="flex gap-3 text-sm text-secondary items-start">
                                            <div className="mt-1 flex-shrink-0 animate-pulse text-accent"><CheckCircle2 size={14} /></div>
                                            <span>{step.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} className="text-primary">{part}</strong> : part)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* FAQ Section */}
                    <section className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-400">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                                <HelpCircle className="text-accent" size={20} />
                            </div>
                            <h2 className="text-2xl font-extrabold text-accent tracking-tight">Frequently Asked Questions</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {[
                                {
                                    q: "Can I use hand-drawn sketches?",
                                    a: "Yes! Modulr Studio can process hand-drawn drawings. For best results, we recommend converting them to cleaner line drawings using our Line Converter first to give the AI a better structural foundation."
                                },
                                {
                                    q: "Which import method should I use?",
                                    a: "Use 'Black Line Drawing Import' if you want to start fresh or have no materials applied. Use 'Sketchup Import' if you've already applied materials in your modeling software and want the AI to enhance them while keeping your design intent."
                                },
                                {
                                    q: "What does the Line Converter do?",
                                    a: "It takes raw sketches, generic CAD exports, or screenshots and transforms them into cleaner architectural line drawings. It can also add base colors (Smart Coloring) to help the AI understand your material intent better."
                                },
                                {
                                    q: "How does the AI know my materials in SketchUp?",
                                    a: "When using the Sketchup Import, our vision models analyze the textures, colors, and geometry of your screenshot to accurately identify materials like timber cladding, zinc roofing, glass, and composite decking."
                                },
                                {
                                    q: "How can I change the lighting or weather?",
                                    a: "Use the Weather Lab or the Lighting Direction picker in the Render Engine. You can choose from presets like 'Golden Hour', 'Winter Snow', or 'Autumn Rain' to completely shift the mood of your project."
                                },
                                {
                                    q: "What is the Refinement Studio?",
                                    a: "It's an iterative tool that lets you make quick changes to a render without starting over. For example, you can tell it to 'Add a timber pergola' or 'Make the grass greener', and the AI will apply those changes while preserving the rest of the image."
                                },
                                {
                                    q: "How do I get a 4K render?",
                                    a: "Ensure the '4K Ultra HD' toggle is active before rendering. For Business users, this is the standard for final presentations, while standard HD is perfect for quick drafts."
                                },
                                {
                                    q: "How many images can I render at once?",
                                    a: "Using the Batch Render feature, you can upload up to 5 orientation-aware images (Front, Sides, Back). The AI will process them in a sequence to ensure consistent quality across all angles."
                                },
                                {
                                    q: "What is Pro Mode?",
                                    a: "Pro Mode uses our most advanced v3.2 rendering models. It provides higher detail in complex textures like charred timber or metallic roofing and better handling of dramatic lighting effects."
                                }
                            ].map((faq, idx) => (
                                <div key={idx} className="glass-panel p-6 rounded-2xl border border-border bg-white/20 backdrop-blur-md hover:border-accent/30 transition-all">
                                    <h4 className="text-sm font-black text-accent uppercase tracking-tight mb-2">{faq.q}</h4>
                                    <p className="text-sm text-secondary leading-relaxed">{faq.a}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Footer Call to Action */}
                    <section className="text-center py-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
                        <div className="h-px w-64 bg-gradient-to-r from-transparent via-border to-transparent mx-auto mb-12"></div>
                        <h3 className="text-xl font-bold text-accent mb-4">Still need help?</h3>
                        <p className="text-secondary mb-8">Visit our contact page for dedicated support or custom integrations.</p>
                        <button 
                            onClick={() => window.open('https://napc.uk/contact/', '_blank')}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm transition-transform hover:scale-105 active:scale-95"
                        >
                            Contact Support
                            <ArrowRight size={16} />
                        </button>
                    </section>

                    {/* Footer Gap */}
                    <div className="h-20"></div>
                </div>
            </div>
        </div>
    );
};
