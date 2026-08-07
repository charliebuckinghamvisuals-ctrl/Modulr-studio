import React from 'react';
import { Check, Zap, Sparkles, Wand2, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { trackBeginCheckout, trackFeatureUsage } from '../../services/analytics';
import { toast } from 'react-hot-toast';

import { AppStage } from '../../types';

interface PricingViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const PricingView: React.FC<PricingViewProps> = ({ onNavigate }) => {
    const { user } = useAuth();
    const { plan } = useCredits();
    const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');
    const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);

    const handleStartTrial = () => {
        if (user) {
            // Already signed in - they already have their free trial credits
            toast.success('Your free trial is active! Start rendering.');
            trackFeatureUsage('start_trial');
            onNavigate?.(AppStage.RENDER_ENGINE);

        } else {
            toast('Please sign in to start your free trial', { icon: '🔐' });
            onNavigate?.(AppStage.AUTH);
        }
    };

    const handleUpgrade = async (planName: string, priceId: string, creditsAmount: number, isOneTime = false) => {
        if (!user) {
            toast.error('Please sign in to upgrade your plan');
            onNavigate?.(AppStage.AUTH);
            return;
        }

        setLoadingPlan(priceId);
        trackBeginCheckout(planName, isOneTime ? creditsAmount / 100 : 189.99);
        try {

            const token = await user.getIdToken();
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    priceId,
                    planName,
                    creditsAmount,
                    isOneTime
                })
            });

            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to create checkout session');
            }
        } catch (error: any) {
            console.error('Checkout error:', error);
            toast.error(error.message || 'Something went wrong. Please try again.');
        } finally {
            setLoadingPlan(null);
        }
    };

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
                                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-[10px] text-white rounded-full font-bold animate-bounce shadow-lg whitespace-nowrap">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl items-stretch pb-20 mx-auto">

                    {/* Free Trial Entry */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6 text-white">
                            <h3 className="text-xl font-bold text-accent mb-2 flex items-center gap-2">Try Before You Buy</h3>
                            <p className="text-sm text-secondary min-h-[40px]">Experience the full power of our engine. No card required.</p>
                        </div>
                        <div className="mb-8 font-bold text-4xl text-primary dark:text-white">
                            24 Hours
                        </div>

                        <Button 
                            className="w-full mb-8 shadow-xl" 
                            onClick={handleStartTrial}
                        >
                            {user ? 'Go to Studio →' : 'Sign In to Start Trial'}
                        </Button>

                        <div className="space-y-4 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">The Taster Package</div>
                            {[
                                '5 Renders (24-Hour Window)',
                                '1080p High Definition Output',
                                'Standard & Pro Modes Included',
                                'Access All Core Tools',
                                'Weather Lab Access'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Sparkles size={18} className="text-accent shrink-0 mt-0.5" />
                                    <span className="text-sm text-primary/80 leading-tight">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>


                    {/* Business Plan (Highlighted) */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-gradient-to-b from-surface/80 to-accent/5 relative transition-all duration-500 shadow-[0_30px_60px_rgba(139,92,246,0.15)] group">

                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-accent to-accent/80 rounded-full flex items-center gap-1.5 shadow-lg">
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Most Popular</span>
                        </div>

                        <div className="mb-6 mt-2">
                            <h3 className="text-2xl font-bold text-accent dark:text-accent mb-2 flex items-center gap-2">Business</h3>
                            <p className="text-sm text-secondary">The absolute peak of visualization performance.</p>
                        </div>
                        <div className="mb-8 text-white">
                            <div className="flex items-baseline gap-1">
                                <span className="text-5xl font-bold text-primary dark:text-white drop-shadow-md">
                                    £{billingCycle === 'monthly' ? '189.99' : '1,710'}
                                </span>
                                <span className="text-xs font-bold text-secondary uppercase tracking-tighter self-end mb-2">inc VAT</span>
                            </div>
                            <span className="text-secondary font-medium"> / {billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                            {billingCycle === 'yearly' && (
                                <div className="text-xs font-bold text-green-400 uppercase mt-2">
                                    £142.50 effective monthly
                                </div>
                            )}
                        </div>

                        <Button 
                            className="w-full mb-8 shadow-2xl" 
                            onClick={() => handleUpgrade(
                                'business', 
                                billingCycle === 'monthly' ? 'price_1TM28kHtB5liiqHxBZvK7pjm' : 'price_1TM2OGHtB5liiqHx2RQXMxO3',
                                // Business is unlimited - no credit grant. The server
                                // ignores this value anyway and reads its own catalogue.
                                0
                            )}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === (billingCycle === 'monthly' ? 'price_1TM28kHtB5liiqHxBZvK7pjm' : 'price_1TM2OGHtB5liiqHx2RQXMxO3') ? <Loader2 className="animate-spin" /> : 'Upgrade Now'}
                        </Button>

                        <div className="space-y-4 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-primary dark:text-white mb-2">The Complete Architectural Toolkit:</div>
                            {[
                                'Unlimited Renders',
                                '4K Ultra HD - Every Render',
                                'All Tools (Material Studio + Refinement)',
                                'Primary Brand Material Presets',
                                'Full Commercial Rights',
                                'Priority Rendering Queue'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Check size={18} className="text-accent shrink-0 mt-0.5" strokeWidth={3} />
                                    <span className="text-sm font-medium text-accent dark:text-white leading-tight">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Managed Service */}
                <div className="w-full max-w-6xl mx-auto mb-20 bg-white dark:bg-slate-900 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-border p-8 md:p-16">

                    <div className="pt-0 pb-0 border-none">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-3">
                                    <h4 className="text-xl font-bold text-accent">Modulr Managed Service</h4>
                                </div>
                                <p className="text-sm text-secondary leading-relaxed max-w-2xl">
                                    Short on time? Even though our engine is incredibly fast, we at Modulr Studio can handle the entire creative process for you. We'll generate your high-end visuals and material specs to your exact requirements.
                                </p>
                            </div>
                            <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
                                <div className="flex flex-col items-end">
                                    <span className="text-4xl font-bold text-primary">£100 <span className="text-xs font-bold text-secondary uppercase">inc VAT</span></span>
                                    <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">Extra / Month</span>
                                </div>
                                <Button 
                                    className="px-10 py-4 text-xs font-bold uppercase tracking-wider" 
                                    onClick={() => handleUpgrade('managed_service', 'price_1TMS40HtB5liiqHxq6XkJGK4', 0)}
                                    disabled={loadingPlan !== null}
                                >
                                    {loadingPlan === 'price_1TMS40HtB5liiqHxq6XkJGK4' ? <Loader2 className="animate-spin" /> : 'Add to Plan'}
                                </Button>
                            </div>
                        </div>
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
