import React from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Zap, Sparkles, Wand2, TrendingUp, Loader2 } from 'lucide-react';
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

/**
 * Stripe price IDs for the Standard tier.
 *
 * PLACEHOLDERS. No Standard product exists in Stripe yet, so these will not
 * resolve at checkout - which is harmless while BILLING_ENABLED is off, because
 * the button opens the "not open yet" notice and never reaches Stripe. Before
 * billing is switched on, create the products, paste the real IDs here, and add
 * them to PRICE_CATALOGUE in server.js. The server rejects any price ID it does
 * not recognise, so a forgotten one fails closed rather than charging wrongly.
 */
const STANDARD_PRICE_ID: Record<'monthly' | 'yearly', string> = {
    monthly: 'price_standard_monthly_TODO',
    yearly: 'price_standard_yearly_TODO',
};

type PlanKey = 'trial' | 'standard' | 'business';

/**
 * One feature list, three columns.
 *
 * Written as a single matrix rather than three hand-maintained bullet lists,
 * because the previous version had exactly that problem: the trial card and the
 * business card described overlapping features in different words, so it was
 * impossible to see what you actually gained by upgrading. Every row appears on
 * every plan - ticked or struck through - so the difference IS the page.
 */
const PLAN_FEATURES: Array<{ label: string; trial: string | boolean; standard: string | boolean; business: string | boolean }> = [
    /**
     * 100 renders on Standard.
     *
     * Sized against two numbers. A small garden room firm runs about four
     * projects a month, and a project takes somewhere around 15-25 renders once
     * you count angles, material options and weather - so 100 covers the
     * typical customer comfortably while still being a real ceiling for a busy
     * one, which is what makes the upgrade to Business mean something. 200 was
     * above what anyone would ever reach, so it was not a tier boundary at all.
     *
     * It is also the safer half of the cost question. At 49.99 inc VAT roughly
     * 40 pounds survives VAT and Stripe, so 100 renders keeps generation costs
     * near a quarter of revenue at full usage on a 10p render, and still viable
     * at 20p. At 200 the same plan loses money on anyone who uses it properly.
     */
    { label: 'Renders',            trial: '5 (24 hours)', standard: '100 per month', business: 'Unlimited' },
    { label: 'Output quality',     trial: '1080p Full HD', standard: '1080p Full HD', business: '4K Ultra HD' },
    { label: 'Planning Checker',   trial: 'Free to all', standard: 'Free to all', business: 'Free to all' },
    { label: 'Render Engine',      trial: true,  standard: true,  business: true },
    { label: 'Line Converter',     trial: true,  standard: true,  business: true },
    { label: 'Weather Lab',        trial: true,  standard: true,  business: true },
    { label: 'Material Studio',    trial: true,  standard: true,  business: true },
    { label: 'Content Studio',     trial: false, standard: false, business: true },
    { label: '3D Configurator',    trial: false, standard: false, business: true },
    { label: 'Animation Studio',   trial: false, standard: false, business: true },
    { label: 'Projects & clients', trial: false, standard: true,  business: true },
    { label: 'Commercial rights',  trial: false, standard: true,  business: true },
    { label: 'Priority queue',     trial: false, standard: false, business: true },
];

const FeatureList: React.FC<{ plan: PlanKey }> = ({ plan }) => (
    <>
        {PLAN_FEATURES.map((row) => {
            const value = row[plan];
            const included = value !== false;
            return (
                <div key={row.label} className="flex items-start gap-2.5">
                    {included ? (
                        <Check size={16} className="text-accent shrink-0 mt-0.5" strokeWidth={3} />
                    ) : (
                        <X size={16} className="text-slate-300 shrink-0 mt-0.5" strokeWidth={3} />
                    )}
                    <span className={`text-sm leading-tight ${included ? 'text-primary/85' : 'text-slate-400 line-through decoration-slate-300'}`}>
                        {row.label}
                        {typeof value === 'string' && (
                            <span className="block text-[11px] font-bold text-accent/70 mt-0.5">{value}</span>
                        )}
                    </span>
                </div>
            );
        })}
    </>
);

export const PricingView: React.FC<PricingViewProps> = ({ onNavigate }) => {
    const { user } = useAuth();
    const { plan } = useCredits();
    const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');
    const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);
    /**
     * Opens on arrival, not just when a plan is clicked.
     *
     * The numbers on this page are not settled, and a price someone has already
     * read is very hard to move afterwards. Saying so up front is the honest
     * version - letting them study the cards first and only admitting it at the
     * checkout button wastes their time and reads as a bait and switch.
     *
     * Dismissible, because the page behind it is still worth browsing.
     */
    const [showBillingClosed, setShowBillingClosed] = React.useState(true);

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
        /**
         * Billing is closed during the private beta.
         *
         * This is the friendly explanation; the actual enforcement is the
         * BILLING_ENABLED check on /api/create-checkout-session, because a
         * client-side guard alone could be bypassed by calling the endpoint.
         */
        setShowBillingClosed(true);
        return;

        /* eslint-disable no-unreachable */
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

            {/*
              * Billing closed notice.
              *
              * Portalled to <body> rather than rendered in place. The whole app
              * is wrapped in .animate-app-startup, which is transformed for its
              * first second - and a transformed ancestor makes position:fixed
              * resolve against that ancestor instead of the viewport, which
              * centres this dialog in the SCROLL HEIGHT of the pricing page.
              * That put it around a thousand pixels down, so on arrival you saw
              * the pricing page and no notice at all.
              *
              * The transform is gone once the intro finishes, but the dialog
              * opens on mount - inside that window. A portal sidesteps the
              * timing question entirely, and is what a modal wants anyway.
              */}
            {showBillingClosed && createPortal((
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white border border-accent/20 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mx-auto">
                            <Sparkles size={26} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">We are still working on this page</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Modulr Studio is in private beta, and our pricing is not final.
                                The plans below are a work in progress - treat them as an
                                indication rather than a quote, because the numbers may still
                                change before launch.
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Subscriptions are not open yet. Want early access? Request a beta
                                code and use the studio free while we finish building.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 pt-1">
                            <a
                                href="mailto:info@napc.uk?subject=Modulr%20Studio%20beta%20access"
                                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors"
                            >
                                Request Beta Access
                            </a>
                            <button
                                onClick={() => setShowBillingClosed(false)}
                                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-accent font-bold text-sm transition-colors"
                            >
                                Browse the plans anyway
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl items-stretch pb-20 mx-auto">

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

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">The Taster Package</div>
                            <FeatureList plan="trial" />
                        </div>
                    </div>

                    {/* Standard Plan */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6">
                            <h3 className="text-2xl font-bold text-accent mb-2">Standard</h3>
                            <p className="text-sm text-secondary min-h-[40px]">Everything a smaller studio needs to sell a job.</p>
                        </div>
                        <div className="mb-8">
                            <div className="flex items-baseline gap-1">
                                <span className="text-5xl font-bold text-primary drop-shadow-md">
                                    £{billingCycle === 'monthly' ? '49.99' : '449'}
                                </span>
                                <span className="text-xs font-bold text-secondary uppercase tracking-tighter self-end mb-2">inc VAT</span>
                            </div>
                            <span className="text-secondary font-medium"> / {billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                            {billingCycle === 'yearly' && (
                                <div className="text-xs font-bold text-green-500 uppercase mt-2">£37.42 effective monthly</div>
                            )}
                        </div>

                        <Button
                            className="w-full mb-8 shadow-xl"
                            onClick={() => handleUpgrade('standard', STANDARD_PRICE_ID[billingCycle], 0)}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === STANDARD_PRICE_ID[billingCycle] ? <Loader2 className="animate-spin" /> : 'Choose Standard'}
                        </Button>

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">What's Included</div>
                            <FeatureList plan="standard" />
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
                                    £{billingCycle === 'monthly' ? '140.99' : '1,269'}
                                </span>
                                <span className="text-xs font-bold text-secondary uppercase tracking-tighter self-end mb-2">inc VAT</span>
                            </div>
                            <span className="text-secondary font-medium"> / {billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                            {billingCycle === 'yearly' && (
                                <div className="text-xs font-bold text-green-400 uppercase mt-2">
                                    £105.75 effective monthly
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

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-primary dark:text-white mb-2">The Complete Architectural Toolkit:</div>
                            <FeatureList plan="business" />
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
