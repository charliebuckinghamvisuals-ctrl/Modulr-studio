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
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05] max-w-4xl">
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
                                <p className="text-secondary text-sm leading-relaxed">Professional 4K results that rival manual design, generated in seconds—with all showcase images created using Modulr Studio.</p>
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
                                                        <span className="text-sm font-medium text-accent uppercase font-black">£189.99</span>
                                                        <span className="text-[10px] font-medium text-accent uppercase tracking-[0.2em] mt-0.5">320x Value</span>
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

                    {/* Legal Section */}
                    <section className="flex flex-col space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-600">
                        <div className="h-px w-64 mx-auto bg-gradient-to-r from-transparent via-border to-transparent" />

                        <div className="text-center space-y-3">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/15 text-accent text-[10px] font-bold uppercase tracking-[0.2em]">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                Legal &amp; Compliance
                            </div>
                            <h2 className="text-3xl font-extrabold text-accent tracking-tight">Terms, Privacy &amp; GDPR</h2>
                            <p className="text-secondary text-sm max-w-xl mx-auto">
                                Modulr Studio is operated by <strong>NAPC Ltd</strong> (Company No. 12849395), registered in England &amp; Wales. By using this service you agree to the following terms. Last updated: April 2026.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                            {/* Terms of Service */}
                            <div className="glass-panel p-8 rounded-[2rem] space-y-5 border border-border bg-white/30 backdrop-blur-xl shadow-xl hover:shadow-accent/5 transition-all duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-center flex-shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
                                    </div>
                                    <h3 className="text-base font-extrabold text-accent tracking-tight">Terms of Service</h3>
                                </div>
                                <div className="space-y-3 text-secondary text-sm leading-relaxed">
                                    <p><strong className="text-primary">Eligibility.</strong> You must be 18 or older and acting on behalf of a legitimate business to use Modulr Studio.</p>
                                    <p><strong className="text-primary">Licence.</strong> We grant you a limited, non-exclusive, non-transferable licence to use the platform for your own commercial rendering purposes. You may not resell, sublicence, or redistribute the service.</p>
                                    <p><strong className="text-primary">Acceptable Use.</strong> You must not upload images you do not own the rights to, attempt to circumvent our credit or rate-limiting systems, reverse-engineer the AI pipeline, or use the service to generate illegal content.</p>
                                    <p><strong className="text-primary">Credits &amp; Billing.</strong> Credits are non-refundable once consumed. Monthly subscription credits do not roll over. Prices are in GBP and inclusive of applicable VAT. We reserve the right to change pricing with 30 days' notice.</p>
                                    <p><strong className="text-primary">Service Availability.</strong> We target 99% uptime but do not guarantee uninterrupted access. Maintenance windows or third-party AI provider outages may cause temporary unavailability.</p>
                                    <p><strong className="text-primary">Termination.</strong> We reserve the right to suspend or terminate accounts that violate these terms without prior notice or refund.</p>
                                    <p><strong className="text-primary">Liability.</strong> To the maximum extent permitted by law, NAPC Ltd's total liability to you shall not exceed the amounts paid by you in the 12 months preceding any claim. We are not liable for indirect or consequential losses.</p>
                                    <p><strong className="text-primary">Governing Law.</strong> These terms are governed by the laws of England &amp; Wales. Disputes shall be subject to the exclusive jurisdiction of the courts of England &amp; Wales.</p>
                                </div>
                            </div>

                            {/* Privacy Policy */}
                            <div className="glass-panel p-8 rounded-[2rem] space-y-5 border border-border bg-white/30 backdrop-blur-xl shadow-xl hover:shadow-accent/5 transition-all duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-center flex-shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </div>
                                    <h3 className="text-base font-extrabold text-accent tracking-tight">Privacy Policy</h3>
                                </div>
                                <div className="space-y-3 text-secondary text-sm leading-relaxed">
                                    <p><strong className="text-primary">Data Controller.</strong> NAPC Ltd is the data controller for all personal data collected through Modulr Studio (info@napc.uk).</p>
                                    <p><strong className="text-primary">What We Collect.</strong> We collect your email address and password (via Firebase Authentication, hashed), billing information (processed by Stripe — we never see your full card details), usage data (render counts, credit balance, plan), and images you upload for processing.</p>
                                    <p><strong className="text-primary">How We Use It.</strong> Your data is used to provide and improve the service, process payments, send essential service communications (e.g. billing receipts), and prevent abuse. We do not sell your data to third parties.</p>
                                    <p><strong className="text-primary">Image Data.</strong> Images you upload are transmitted securely to Google's Gemini AI API for processing and are not stored on our servers beyond the duration of a single request. Google's data processing terms apply to the AI inference step.</p>
                                    <p><strong className="text-primary">Retention.</strong> Account data is retained for the duration of your subscription plus 6 years (for tax/accounting purposes). You may request deletion at any time.</p>
                                    <p><strong className="text-primary">Cookies.</strong> We use only essential session cookies required for authentication. We do not use tracking or advertising cookies.</p>
                                    <p><strong className="text-primary">Third Parties.</strong> We use Firebase (Google LLC) for auth/database, Stripe Inc. for payments, and Render Inc. for hosting. All are GDPR-compliant processors with appropriate DPAs in place.</p>
                                    <p><strong className="text-primary">Contact.</strong> Privacy enquiries: <a href="mailto:info@napc.uk" className="text-accent underline underline-offset-2">info@napc.uk</a></p>
                                </div>
                            </div>

                            {/* GDPR / UK GDPR */}
                            <div className="glass-panel p-8 rounded-[2rem] space-y-5 border border-border bg-white/30 backdrop-blur-xl shadow-xl hover:shadow-accent/5 transition-all duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-center flex-shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                    </div>
                                    <h3 className="text-base font-extrabold text-accent tracking-tight">GDPR &amp; UK GDPR</h3>
                                </div>
                                <div className="space-y-3 text-secondary text-sm leading-relaxed">
                                    <p><strong className="text-primary">Compliance.</strong> Modulr Studio is operated in compliance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. We process personal data only on lawful bases.</p>
                                    <p><strong className="text-primary">Lawful Bases.</strong> <em>Contract</em> — processing necessary to deliver the service you signed up for. <em>Legitimate Interests</em> — fraud prevention and abuse detection. <em>Legal Obligation</em> — retaining billing records.</p>
                                    <p><strong className="text-primary">Your Rights.</strong> Under UK GDPR you have the right to: access your personal data, correct inaccurate data, erasure ("right to be forgotten"), restrict or object to processing, and data portability.</p>
                                    <p><strong className="text-primary">Exercising Rights.</strong> Submit requests to <a href="mailto:info@napc.uk" className="text-accent underline underline-offset-2">info@napc.uk</a>. We will respond within 30 days. No fee is charged for standard requests.</p>
                                    <p><strong className="text-primary">International Transfers.</strong> Some data may be processed outside the UK (e.g. by Google/Firebase in the US). All such transfers are covered by UK IDTA Standard Contractual Clauses or equivalent adequacy decisions.</p>
                                    <p><strong className="text-primary">Data Security.</strong> We implement appropriate technical and organisational measures including Firebase Authentication, HTTPS-only transport, server-side API key storage, and rate-limiting to protect your data.</p>
                                    <p><strong className="text-primary">Complaints.</strong> You have the right to lodge a complaint with the ICO (Information Commissioner's Office) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">ico.org.uk</a> if you believe we have mishandled your data.</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer note */}
                        <p className="text-center text-xs text-secondary/60 max-w-2xl mx-auto pt-2">
                            For any legal enquiries, contact NAPC Ltd at <a href="mailto:info@napc.uk" className="text-accent/70 underline underline-offset-2">info@napc.uk</a> or 01285 283 200. These documents do not constitute formal legal advice. We recommend consulting a qualified solicitor for specific legal matters.
                        </p>
                    </section>

                    {/* Footer Gap */}
                    <div className="h-32"></div>

                </div>
            </div>
        </div>
    );
};
