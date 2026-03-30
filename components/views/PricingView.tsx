import React from 'react';
import { Check, Zap, Sparkles, Building2, Crown, Gem, Wand2, TrendingUp } from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';

export const PricingView: React.FC = () => {
    const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');

    return (
        <div className="min-h-full bg-background relative overflow-y-auto w-full py-20 px-6 sm:px-12 flex flex-col items-center">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="PRICING" />

            {/* Ambient Background Effects */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse-slow"></div>
            <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none -z-10"></div>

            <div className="max-w-7xl mx-auto w-full flex flex-col items-center relative z-10">

                {/* Header Section */}
                <div className="text-center mb-16 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6 group cursor-default">
                        <Sparkles size={16} className="text-accent group-hover:animate-spin-slow transition-transform" />
                        <span className="text-sm font-semibold tracking-wide text-primary">Simple, transparent pricing</span>
                    </div>

                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-accent mb-6 drop-shadow-sm pb-2 leading-[1.05]">
                        Professional rendering,<br />scaled to your studio.
                    </h1>

                    <p className="text-lg text-secondary leading-relaxed mb-12">
                        Stop paying thousands for outsourced 3D visualizations.
                        Generate photorealistic concepts instantly, directly from your sketches.
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4 bg-surface/50 p-1.5 rounded-2xl border border-border shadow-inner">
                            <button
                                onClick={() => setBillingCycle('monthly')}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${billingCycle === 'monthly'
                                    ? 'bg-white shadow-lg text-primary transform scale-105'
                                    : 'text-secondary hover:text-primary'
                                    }`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setBillingCycle('yearly')}
                                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 relative group ${billingCycle === 'yearly'
                                    ? 'bg-accent text-white shadow-lg transform scale-105'
                                    : 'text-secondary hover:text-primary'
                                    }`}
                            >
                                Yearly
                                {billingCycle !== 'yearly' && (
                                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-[10px] text-white rounded-full font-black animate-bounce shadow-lg whitespace-nowrap">
                                        Save ~20% 🔥
                                    </span>
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-secondary uppercase tracking-widest mt-2">
                            <TrendingUp size={12} className="text-green-500" />
                            Annual billing includes <span className="text-accent underline decoration-accent/30 decoration-2 underline-offset-4">2 Months FREE</span>
                        </div>
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl items-center pb-20 mx-auto">

                    {/* Free Trial Entry */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6 text-white">
                            <h3 className="text-xl font-extrabold text-accent mb-2 flex items-center gap-2">Free Trial</h3>
                            <p className="text-sm text-secondary min-h-[40px]">Test the full engine with every feature included.</p>
                        </div>
                        <div className="mb-8 font-black text-4xl text-primary dark:text-white">
                            3 Days
                        </div>

                        <Button className="w-full mb-8 shadow-xl" onClick={() => {}}>
                            Start My Trial
                        </Button>

                        <div className="space-y-4 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">What's included</div>
                            {[
                                '10 Free Renders / Day',
                                'Full Feature Access',
                                'Standard 1080p & 4K',
                                'Line Converter & Material Studio',
                                'Refinement Studio'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Sparkles size={18} className="text-accent shrink-0 mt-0.5" />
                                    <span className="text-sm text-primary/80 leading-tight">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Standard Plan */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6">
                            <h3 className="text-xl font-extrabold text-primary mb-2 flex items-center gap-2">Standard</h3>
                            <p className="text-sm text-secondary min-h-[40px]">Perfect for smaller projects and high-volume basic visuals.</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl font-black text-primary dark:text-white">
                                £{billingCycle === 'monthly' ? '29' : '290'}
                            </span>
                            <span className="text-secondary font-medium"> / {billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                            {billingCycle === 'yearly' && (
                                <div className="text-[10px] font-bold text-green-500 uppercase mt-1">
                                    £24.16 effective monthly
                                </div>
                            )}
                        </div>

                        <Button className="w-full mb-8 shadow-xl" onClick={() => {}}>
                            Upgrade Now
                        </Button>

                        <div className="space-y-4 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">Everything in Free, plus:</div>
                            {[
                                '1,500 High-Speed Credits / mo',
                                'Standard 1080p Resolution',
                                'Line Converter Tool Access',
                                'Refinement Studio',
                                'Full Environment Control'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Check size={18} className="text-accent shrink-0 mt-0.5" />
                                    <span className="text-sm text-primary/80 leading-tight">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Business Plan (Highlighted) */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-gradient-to-b from-surface/80 to-accent/5 relative transition-all duration-500 shadow-[0_30px_60px_rgba(139,92,246,0.15)] group">

                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-accent to-accent/80 rounded-full flex items-center gap-1.5 shadow-lg">
                            <Zap size={14} className="text-white fill-white" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Most Popular</span>
                        </div>

                        <div className="mb-6 mt-2">
                            <h3 className="text-2xl font-black text-accent dark:text-accent mb-2 flex items-center gap-2">Business</h3>
                            <p className="text-sm text-secondary">The complete toolkit for scaling manufacturers.</p>
                        </div>
                        <div className="mb-8 text-white">
                            <span className="text-5xl font-black text-primary dark:text-white drop-shadow-md">
                                £{billingCycle === 'monthly' ? '99' : '990'}
                            </span>
                            <span className="text-secondary font-medium"> / {billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                            {billingCycle === 'yearly' && (
                                <div className="text-xs font-bold text-green-400 uppercase mt-2">
                                    £82.50 effective monthly
                                </div>
                            )}
                        </div>

                        <Button className="w-full mb-8 shadow-2xl" onClick={() => {}}>
                            Upgrade Now
                        </Button>

                        <div className="space-y-4 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-primary dark:text-white mb-2">Everything in Standard, plus:</div>
                            {[
                                '15,000 Premium Credits / mo',
                                'Unlimited 4K Ultra HD Resolution',
                                'Full Material Studio Access',
                                'Commercial Usage Rights',
                                'Priority White-Labeling',
                                'Priority Chat Support'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Check size={18} className="text-accent shrink-0 mt-0.5" strokeWidth={3} />
                                    <span className="text-sm font-medium text-accent dark:text-white leading-tight">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* ROI Comparison Section */}
                <div className="w-full max-w-6xl mx-auto mb-12">
                    <div className="bg-primary/5 dark:bg-white/5 rounded-3xl p-10 border border-primary/10 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <TrendingUp size={160} />
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 text-accent font-black uppercase tracking-widest text-xs mb-4">
                                    <TrendingUp size={14} />
                                    The Modulr Advantage
                                </div>
                                <h4 className="text-3xl font-black text-accent mb-4 leading-tight">
                                    An Investment that Pays for Itself, <span className="text-accent underline decoration-accent/30 underline-offset-8">Every Single Month.</span>
                                </h4>
                                <p className="text-secondary text-sm leading-relaxed max-w-xl">
                                    Traditional CGI studios charge between <span className="font-bold text-primary">£200 - £300 per 4K render</span>, with a 3-5 day wait.
                                    With the Modulr Studio Business Plan, you get <span className="font-bold text-primary text-lg">250 renders included</span> instantly—giving you
                                    a total monthly value of over <span className="font-black text-accent text-xl italic underline transform transition-transform group-hover:scale-110 inline-block px-1">£62,500+</span>.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 w-full md:w-auto shrink-0">
                                <div className="p-6 rounded-2xl bg-white border border-border shadow-sm flex flex-col items-center justify-center text-center group-hover:shadow-md transition-all">
                                    <span className="text-xs font-bold text-secondary uppercase mb-1">Traditional Cost</span>
                                    <span className="text-2xl font-black text-red-500 line-through">
                                        £{billingCycle === 'monthly' ? '62.5k' : '750k'}
                                    </span>
                                    <span className="text-[10px] text-secondary/60">
                                        {billingCycle === 'monthly' ? '250 Renders' : '3,000 Renders'}
                                    </span>
                                </div>
                                <div className="p-6 rounded-2xl bg-accent text-white shadow-xl flex flex-col items-center justify-center text-center transform scale-110 group-hover:scale-115 transition-all">
                                    <span className="text-xs font-bold opacity-80 uppercase mb-1">Modulr Price</span>
                                    <span className="text-3xl font-black">
                                        £{billingCycle === 'monthly' ? '99' : '990'}
                                    </span>
                                    <span className="text-[10px] opacity-80 uppercase font-black">
                                        {billingCycle === 'monthly' ? '600x Value' : '750x Value'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Managed Service Section */}
                <div className="w-full max-w-6xl mx-auto mb-12">
                    <div className="glass-panel p-8 rounded-3xl border border-border bg-gradient-to-r from-surface to-accent/5 shadow-[0_20px_50px_rgba(0,0,0,0.08)] flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 rounded-xl bg-accent/10">
                                    <Wand2 size={24} className="text-accent" />
                                </div>
                                <h4 className="text-xl font-black text-accent">Modulr Managed Service</h4>
                            </div>
                            <p className="text-sm text-secondary leading-relaxed max-w-2xl">
                                Short on time? Even though our engine is incredibly fast, we at Modulr Studio can handle the entire creative process for you. We'll generate your high-end visuals and material specs to your exact requirements.
                            </p>
                        </div>
                        <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
                            <div className="flex flex-col items-end">
                                <span className="text-3xl font-black text-primary">£50</span>
                                <span className="text-xs font-bold text-secondary uppercase tracking-widest">Extra / month</span>
                            </div>
                            <Button className="px-8" onClick={() => {}}>
                                Add to Plan
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Credit Cost Key */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 w-full mx-auto">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-accent/5 border border-accent/10 h-full justify-center">
                        <div className="flex items-center gap-2 text-primary font-bold">
                            <Zap size={20} className="text-accent" />
                            Usage Guide
                        </div>
                        <div className="flex flex-wrap justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2 py-1.5 px-3 rounded-full bg-white/50 border border-border">
                                <span className="font-black text-accent">30 Credits</span>
                                <span className="text-secondary">Standard (1080p)</span>
                            </div>
                            <div className="flex items-center gap-2 py-1.5 px-3 rounded-full bg-white/50 border border-border">
                                <span className="font-black text-accent">60 Credits</span>
                                <span className="text-secondary">Ultra HD (4K)</span>
                            </div>
                        </div>
                        <p className="text-[11px] text-secondary uppercase tracking-widest font-bold mt-2">100% Transparency • No Hidden Fees</p>
                    </div>

                    <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-accent/5 border border-accent/10">
                        <div className="flex items-center gap-2 text-primary font-bold">
                            <Gem size={20} className="text-accent" />
                            Buy Extra Credits
                        </div>
                        <div className="grid grid-cols-3 gap-3 w-full">
                            {[
                                { amount: '1,000', price: '£5' },
                                { amount: '5,000', price: '£25' },
                                { amount: '10,000', price: '£45' }
                            ].map((pack, i) => (
                                <button key={i} className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/40 border border-border hover:border-accent/30 hover:bg-white/60 transition-all group">
                                    <span className="text-sm font-black text-accent group-hover:text-accent font-bold">{pack.amount}</span>
                                    <span className="text-[11px] font-black text-accent uppercase">{pack.price}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-secondary/60 italic mt-1 font-medium">Instant top-ups that never expire.</p>
                    </div>
                </div>

                {/* Footer FAQ Teaser */}
                <div className="text-center pt-20 pb-20">
                    <p className="text-secondary text-sm">
                        Curious about custom node-based deployments? <a href="mailto:info@napc.uk" className="text-accent hover:underline font-medium ml-1 transition-colors">Send us an email at info@napc.uk</a>
                    </p>
                </div>

            </div>
        </div>
    );
};
