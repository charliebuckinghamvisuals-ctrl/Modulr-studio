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

/**
 * The prices on sale come from the server (/api/billing/prices), which reads
 * the Stripe IDs from its environment - created by scripts/stripe-setup.mjs.
 * The figures shown are the decided ones (17 Sep 2026) even before the IDs
 * exist, so the page reads right; a plan with no ID yet cannot be bought.
 */
interface BillingPrice { priceId: string | null; label: string; pence: number; plan: string | null; mode: string }
interface BillingInfo { billingEnabled: boolean; founding: boolean; prices: Record<string, BillingPrice>; videoModels: Record<string, { label: string; pricePence: number; available: boolean }> }
const DECIDED_PENCE: Record<string, number> = { standard_monthly: 5999, standard_yearly: 59990, business_monthly: 19999, business_yearly: 199990, video_25: 2500, video_50: 5000, video_100: 10000 };
const FOUNDING_MONTHLY_PENCE = 14099;
const pounds = (pence: number) => (pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`);

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
    // 17 Sep 2026: every generated image counts as a render - a configurator
    // render, a material close-up sheet, a line drawing, a weather variant.
    { label: 'Renders, any tool',  trial: '40 over 7 days, 10 a day', standard: '100 a month', business: '250 a month' },
    { label: '4K exports',         trial: false, standard: false, business: '50 a month' },
    { label: '3D Configurator',    trial: true,  standard: true,  business: true },
    { label: 'Walk Inside & Walk Outside', trial: true, standard: true, business: true },
    { label: 'Render Engine',      trial: true,  standard: true,  business: true },
    { label: 'Material close-ups', trial: true,  standard: true,  business: true },
    { label: 'Line Converter & Weather Lab', trial: true, standard: true, business: true },
    { label: 'Projects, clients & PDFs', trial: true, standard: true, business: true },
    { label: 'Planning Checker',   trial: 'Free to all', standard: 'Free to all', business: 'Free to all' },
    { label: 'Animation Studio',   trial: false, standard: false, business: '3 clips a month, then pay as you go' },
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
    const [billing, setBilling] = React.useState<BillingInfo | null>(null);
    React.useEffect(() => {
        fetch('/api/public/billing-prices').then(r => r.json()).then((b: BillingInfo) => {
            setBilling(b);
            // Once billing is open the notice has nothing to say.
            if (b?.billingEnabled) setShowBillingClosed(false);
        }).catch(() => { /* the decided figures still show */ });
    }, []);
    const priceOf = (key: string) => billing?.prices?.[key];
    const penceOf = (key: string) => priceOf(key)?.pence ?? DECIDED_PENCE[key];
    const priceIdOf = (key: string, fallback: string) => priceOf(key)?.priceId || fallback;
    const standardId = priceIdOf(`standard_${billingCycle}`, STANDARD_PRICE_ID[billingCycle]);
    const businessId = priceIdOf(`business_${billingCycle}`, billingCycle === 'monthly' ? 'price_1TM28kHtB5liiqHxBZvK7pjm' : 'price_1TM2OGHtB5liiqHx2RQXMxO3');

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
        if (!billing?.billingEnabled) { setShowBillingClosed(true); return; }

        if (!user) {
            toast.error('Please sign in to upgrade your plan');
            onNavigate?.(AppStage.AUTH);
            return;
        }

        setLoadingPlan(priceId);
        trackBeginCheckout(planName, creditsAmount / 100);
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
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Subscriptions are locked for now</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Our main subscriptions are still in progress and are not open yet.
                                The plans below are a work in progress - treat them as an
                                indication rather than a quote, because the numbers may still
                                change before launch.
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                In the meantime the studio is free to try: create an account,
                                confirm your email, and you have 40 renders over 7 days.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 pt-1">
                            <button
                                onClick={() => onNavigate?.(AppStage.RENDER_ENGINE)}
                                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors"
                            >
                                Start free tester access
                            </button>
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
                        Pro-level CGI visuals in under a minute, from a sketch, a photo or the 3D Configurator.
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
                        {/* Same fixed height as the paid cards' price blocks so the three
                            buttons sit on one line. */}
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start">
                            <div className="font-bold text-5xl text-primary dark:text-white drop-shadow-md">7 Days</div>
                            <span className="text-secondary font-medium">40 free renders, no card</span>
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
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start">
                            <div className="text-5xl font-bold text-primary drop-shadow-md">
                                {billingCycle === 'monthly' ? pounds(penceOf('standard_monthly')) : pounds(Math.round(penceOf('standard_yearly') / 12))}
                                <span className="text-lg font-bold text-secondary"> / month</span>
                            </div>
                            <span className="text-secondary font-medium">{billingCycle === 'monthly' ? 'inc VAT, cancel any time' : `${pounds(penceOf('standard_yearly'))} a year inc VAT, 2 months free`}</span>
                        </div>

                        <Button
                            className="w-full mb-8 shadow-xl"
                            onClick={() => handleUpgrade('standard', standardId, penceOf(`standard_${billingCycle}`))}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === standardId ? <Loader2 className="animate-spin" /> : 'Choose Standard'}
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
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start text-white">
                            <div className="text-5xl font-bold text-primary dark:text-white drop-shadow-md">
                                {billingCycle === 'monthly' ? pounds(penceOf('business_monthly')) : pounds(Math.round(penceOf('business_yearly') / 12))}
                                <span className="text-lg font-bold text-secondary"> / month</span>
                            </div>
                            <span className="text-secondary font-medium">{billingCycle === 'monthly' ? 'inc VAT, cancel any time' : `${pounds(penceOf('business_yearly'))} a year inc VAT, 2 months free`}</span>
                            {billing?.founding && billingCycle === 'monthly' && (
                                <span className="mt-2 inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                                    Founding price {pounds(FOUNDING_MONTHLY_PENCE)} a month for your first year, first 5 companies
                                </span>
                            )}
                        </div>

                        <Button
                            className="w-full mb-8 shadow-2xl"
                            onClick={() => handleUpgrade('business', businessId, penceOf(`business_${billingCycle}`))}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === businessId ? <Loader2 className="animate-spin" /> : 'Upgrade Now'}
                        </Button>

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-primary dark:text-white mb-2">The Complete Architectural Toolkit:</div>
                            <FeatureList plan="business" />
                        </div>
                    </div>

                </div>

                {/* Animation Studio: pay as you go, and what it replaces */}
                <div className="w-full max-w-6xl mx-auto mb-20 bg-white dark:bg-slate-900 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-border p-8 md:p-16">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                        <div>
                            <h4 className="text-2xl font-bold text-accent mb-3">Animation, without the animator.</h4>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                A studio animation of a garden room is made by hand: a 3D artist models it, lights it, plots the camera and renders every frame. It is accurate to the millimetre, and it costs £600 to £1,500 for ten seconds and £1,500 to £5,000 for thirty, with one to three weeks' turnaround and a fresh invoice for every change.
                            </p>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                Animation Studio uses Seedance and Kling, the world's leading video models, to turn the design you built in the configurator into a moving visual in about two minutes. It is the next best thing to a hand-made animation, and it costs from {pounds(billing?.videoModels?.kling?.pricePence ?? 150)} a clip.
                            </p>
                            <p className="text-sm text-secondary leading-relaxed">
                                <span className="font-bold text-primary">For a small business:</span> a ten second clip of the client's actual building on every quote, a thirty second walkthrough for the website, a new clip every time the design changes, for less than the price of a coffee.
                            </p>
                        </div>
                        <div className="space-y-5">
                            <div className="overflow-hidden rounded-2xl border border-border">
                                <table className="w-full text-sm">
                                    <thead className="bg-surface/60 text-[11px] uppercase tracking-widest text-secondary">
                                        <tr><th className="text-left p-3 font-bold"></th><th className="text-left p-3 font-bold">3D artist</th><th className="text-left p-3 font-bold text-accent">Animation Studio</th></tr>
                                    </thead>
                                    <tbody className="text-primary/85">
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">Accuracy</td><td className="p-3">Frame-perfect, every time</td><td className="p-3">Held to your drawing, the next best thing</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">10 second clip</td><td className="p-3">£600 to £1,500</td><td className="p-3 font-bold">from {pounds(billing?.videoModels?.kling?.pricePence ?? 150)}</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">30 second clip</td><td className="p-3">£1,500 to £5,000</td><td className="p-3 font-bold">from {pounds((billing?.videoModels?.kling?.pricePence ?? 150) * 4)}</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">Turnaround</td><td className="p-3">1 to 3 weeks</td><td className="p-3">about 2 minutes</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">Design change</td><td className="p-3">New job, new invoice</td><td className="p-3">Send it again</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-2">Video credits, Business plan</div>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['video_25', 'video_50', 'video_100'] as const).map(key => (
                                        <button
                                            key={key}
                                            onClick={() => handleUpgrade('video_credits', priceIdOf(key, key), penceOf(key), true)}
                                            disabled={loadingPlan !== null || plan !== 'business' && plan !== 'master'}
                                            className="rounded-2xl border border-border bg-surface/40 hover:bg-surface/70 disabled:opacity-50 p-4 text-center transition-colors"
                                            title={plan === 'business' || plan === 'master' ? 'Buy video credits' : 'Video credits are part of the Business plan'}
                                        >
                                            <div className="text-2xl font-bold text-primary">{pounds(penceOf(key))}</div>
                                            <div className="text-[11px] text-secondary">{Math.floor(penceOf(key) / (billing?.videoModels?.kling?.pricePence ?? 150))} Kling clips</div>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-secondary mt-2">Kling {pounds(billing?.videoModels?.kling?.pricePence ?? 150)} a clip, Seedance {pounds(billing?.videoModels?.seedance?.pricePence ?? 300)} a clip, 8 seconds. A failed clip is refunded automatically. Credits last 12 months.</p>
                            </div>
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
