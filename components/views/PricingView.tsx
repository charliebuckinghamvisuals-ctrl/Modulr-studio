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
 * Stripe price IDs for the Configurator tier (plan key 'standard').
 *
 * PLACEHOLDERS. No Configurator product exists in Stripe yet, so these will not
 * resolve at checkout - which is harmless while BILLING_ENABLED is off, because
 * the button opens the "not open yet" notice and never reaches Stripe. Before
 * billing is switched on, run scripts/stripe-setup.mjs and set the printed
 * environment variables on the server; the server then serves the real IDs
 * through /api/public/billing-prices and these fallbacks are never used. The
 * server rejects any price ID it does not recognise, so a forgotten one fails
 * closed rather than charging wrongly.
 */
const STANDARD_PRICE_ID: Record<'monthly' | 'yearly', string> = {
    monthly: 'price_standard_monthly_TODO',
    yearly: 'price_standard_yearly_TODO',
};

/**
 * The prices on sale come from the server (/api/public/billing-prices), which
 * reads the Stripe IDs from its environment - created by
 * scripts/stripe-setup.mjs. The figures shown are the decided ones even before
 * the IDs exist, so the page reads right; a plan with no ID yet cannot be
 * bought.
 *
 * PRICING RESTRUCTURED 20 Sep 2026 (Charlie), superseding 17 Sep:
 *   Trial         7 days, no card, 40 renders. No Animation Studio, no 4K.
 *   Configurator  £49.99 a month. The full 3D configurator, walk inside and
 *                 outside, projects and saved designs, clients, and the PDF
 *                 outputs that were already part of the non-AI workflow.
 *                 NO Render Engine, material close-ups, plan or line-converter
 *                 AI tools, Animation Studio or 4K.
 *   The Hub       £199 a month. Everything in Configurator plus 250 renders a
 *                 month and every AI tool.
 *
 * The internal plan keys ('standard' for Configurator, 'business' for The
 * Hub) are unchanged: they live in Stripe metadata, Firestore and the
 * webhook, and renaming them would be a migration for a label.
 */
interface BillingPrice { priceId: string | null; label: string; pence: number; plan: string | null; mode: string }
interface BillingInfo { billingEnabled: boolean; founding: boolean; prices: Record<string, BillingPrice>; videoModels: Record<string, { label: string; pricePence: number; available: boolean; animations8s?: number }>; animationPence?: number }
const DECIDED_PENCE: Record<string, number> = { standard_monthly: 4999, standard_yearly: 49990, business_monthly: 19900, business_yearly: 199000, video_25: 2500, video_50: 5000, video_100: 10000 };
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
     * 20 Sep 2026 structure. The Configurator plan is the design and
     * organisation half of the studio - the full 3D configurator, the
     * walkthroughs, projects, saved designs, clients and the PDFs that were
     * already part of the non-AI workflow - with no AI generation at all. The
     * Hub is everything, with the 250-a-month render allowance. The trial has
     * the AI tools so a prospect can judge the output, but no animation and
     * no 4K.
     */
    { label: '3D Configurator',              trial: 'Full version', standard: 'Full version', business: 'Full version' },
    { label: 'Walk inside & walk outside',   trial: true,  standard: true,  business: true },
    { label: 'Jobs & Quotes: quoting, price book, pipeline',     trial: true,  standard: true,  business: true },
    { label: 'Client organisation',          trial: true,  standard: true,  business: true },
    { label: 'Project & PDF outputs',        trial: true,  standard: true,  business: true },
    // 24 Sep 2026 (Charlie): every paying company gets a session with him.
    { label: '1-to-1 training with Charlie, who built Modulr', trial: false, standard: 'Online, booked when you join', business: 'Online, booked when you join' },
    // Every generated image counts as a render - a configurator render, a
    // material close-up sheet, a line drawing, a weather variant, a floor plan.
    { label: 'Renders, any tool',            trial: '40 renders to use within 7 days (max 10 a day)', standard: false, business: '250 a month' },
    { label: 'Render Engine',                trial: true,  standard: false, business: true },
    { label: 'Material close-ups',           trial: true,  standard: false, business: true },
    // "Coming soon" here matches the Tools menu and the home page: Floor Plan
    // Studio and Animation Studio are parked for launch (QA, 21 Sep 2026).
    { label: 'Plan & line AI tools',         trial: 'Line Converter & Weather Lab', standard: false, business: 'Line Converter, Weather Lab & Floor Plan Studio (coming soon)' },
    { label: '4K enhancement',               trial: false, standard: false, business: '50 a month' },
    { label: 'Animation Studio',             trial: false, standard: false, business: '3 clips a month, then pay as you go (coming soon)' },
    { label: 'Planning Checker',             trial: 'Free to all', standard: 'Free to all', business: 'Free to all' },
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
                            <span className="block text-[11px] font-bold text-accent mt-0.5">{value}</span>
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
     * The prices are confirmed (Charlie, 24 Sep 2026), so nothing opens on
     * arrival any more. Until BILLING_ENABLED is switched on the checkout
     * itself is not open, and this note only appears when a plan is clicked.
     */
    const [showBillingClosed, setShowBillingClosed] = React.useState(false);
    const [billing, setBilling] = React.useState<BillingInfo | null>(null);
    React.useEffect(() => {
        fetch('/api/public/billing-prices').then(r => r.json()).then((b: BillingInfo) => {
            setBilling(b);
            // Once billing is open the notice has nothing to say.
            if (b?.billingEnabled) setShowBillingClosed(false);
        }).catch(() => { /* the decided figures still show */ });
    }, []);
    const priceOf = (key: string) => billing?.prices?.[key];
    /** One animation, in pence - 30 for £100 (24 Sep 2026). */
    const animationPence = billing?.animationPence ?? 333;
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
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">We're not accepting payments at the moment</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Online payment isn't open yet, so plans and animation packs
                                can't be bought today. Email info@modulrstudio.co.uk and we'll
                                let you know as soon as it opens.
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Or try the studio free first: create an account, confirm your
                                email, and you have 40 renders to use within 7 days.
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
                                Back to the plans
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {/* Ambient Background Effects */}

            <div className="max-w-7xl mx-auto w-full flex flex-col items-center relative z-10">

                {/* Header Section */}
                <div className="text-center mb-16 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-accent/10 border border-accent/20 mb-6 group cursor-default">
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
                                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-[10px] text-white rounded-none font-bold animate-bounce shadow-lg whitespace-nowrap">
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

                {/* Payments closed (Charlie, 24 Sep 2026): Stripe is not set up
                    yet, so the page says so before anyone picks a plan. Gone
                    the moment BILLING_ENABLED is switched on. */}
                {billing && !billing.billingEnabled && (
                    <div className="w-full max-w-3xl mx-auto -mt-6 mb-12 border border-accent/25 bg-accent/5 px-5 py-4 text-center">
                        <p className="text-sm font-bold text-accent">We're not accepting payments at the moment.</p>
                        <p className="text-xs text-secondary mt-1">Online payment opens soon. Until then, the studio is free to try for 7 days.</p>
                    </div>
                )}

                {/* Pricing Cards */}
                {/* Three across from lg only (QA 21 Sep 2026): at tablet width
                    the cards were 217px wide and the plan names overflowed. */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-6xl items-stretch pb-20 mx-auto">

                    {/* Free Trial Entry */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6 text-white">
                            <h3 className="text-2xl font-bold text-accent mb-2 flex items-center gap-2">Trial</h3>
                            <p className="text-sm text-secondary min-h-[40px]">The studio for a week, renders included. No card required.</p>
                        </div>
                        {/* Same fixed height as the paid cards' price blocks so the three
                            buttons sit on one line. */}
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start">
                            <div className="font-bold text-5xl text-primary drop-shadow-md">7 Days</div>
                            <span className="text-secondary font-medium">40 free renders, no card</span>
                        </div>

                        <Button 
                            className="w-full mb-8 shadow-xl" 
                            onClick={handleStartTrial}
                        >
                            {user ? 'Go to Studio →' : 'Sign In to Start Trial'}
                        </Button>

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">What's in the trial</div>
                            <FeatureList plan="trial" />
                        </div>
                    </div>

                    {/* Configurator plan (plan key 'standard') */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-surface/40 hover:bg-surface/60 transition-all duration-300 relative group shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
                        <div className="mb-6">
                            <h3 className="text-2xl font-bold text-accent mb-2">Configurator</h3>
                            <p className="text-sm text-secondary min-h-[40px]">The full 3D configurator, projects and PDFs. No AI tools.</p>
                        </div>
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start">
                            <div className="text-5xl font-bold text-primary drop-shadow-md">
                                {billingCycle === 'monthly' ? pounds(penceOf('standard_monthly')) : pounds(Math.round(penceOf('standard_yearly') / 12))}
                                <span className="text-lg font-bold text-secondary"> / month</span>
                            </div>
                            <span className="text-secondary font-medium">{billingCycle === 'monthly' ? '+ VAT, cancel any time' : `${pounds(penceOf('standard_yearly'))} a year + VAT, 2 months free`}</span>
                        </div>

                        <Button
                            className="w-full mb-8 shadow-xl"
                            onClick={() => handleUpgrade('standard', standardId, penceOf(`standard_${billingCycle}`))}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === standardId ? <Loader2 className="animate-spin" /> : 'Choose Configurator'}
                        </Button>

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-secondary mb-2">What's Included</div>
                            <FeatureList plan="standard" />
                        </div>
                    </div>


                    {/* The Hub (plan key 'business', highlighted) */}
                    {/* QA 21 Sep 2026: the shadow was still the old purple theme's
                        rgba(139,92,246) and the badge a gradient; both are the
                        brand green now, matching the other two cards. */}
                    <div className="glass-panel border-2 border-transparent hover:border-accent rounded-3xl p-8 flex flex-col h-full bg-gradient-to-b from-surface/80 to-accent/5 relative transition-all duration-500 shadow-[0_20px_50px_rgba(64,90,86,0.15)] group">

                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent rounded-none flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Most Popular</span>
                        </div>

                        {/* No extra top margin: it pushed this card's button 6px below
                            the other two (QA 21 Sep 2026); the badge hangs outside the card. */}
                        <div className="mb-6">
                            <h3 className="text-2xl font-bold text-accent mb-2 flex items-center gap-2">The Hub</h3>
                            <p className="text-sm text-secondary min-h-[40px]">Everything in Configurator, plus 250 renders a month and every studio tool.</p>
                        </div>
                        <div className="mb-8 min-h-[96px] flex flex-col justify-start text-white">
                            <div className="text-5xl font-bold text-primary drop-shadow-md">
                                {billingCycle === 'monthly' ? pounds(penceOf('business_monthly')) : pounds(Math.round(penceOf('business_yearly') / 12))}
                                <span className="text-lg font-bold text-secondary"> / month</span>
                            </div>
                            <span className="text-secondary font-medium">{billingCycle === 'monthly' ? '+ VAT, cancel any time' : `${pounds(penceOf('business_yearly'))} a year + VAT, 2 months free`}</span>
                        </div>

                        <Button
                            className="w-full mb-8 shadow-2xl"
                            onClick={() => handleUpgrade('business', businessId, penceOf(`business_${billingCycle}`))}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === businessId ? <Loader2 className="animate-spin" /> : 'Choose The Hub'}
                        </Button>

                        <div className="space-y-3 flex-1">
                            <div className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Everything in Configurator, plus:</div>
                            <FeatureList plan="business" />
                        </div>
                    </div>

                </div>

                {/* Animation Studio: pay as you go, and what it replaces */}
                <div className="w-full max-w-6xl mx-auto mb-20 bg-white rounded-xl shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-border p-8 md:p-16">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                        <div>
                            <h4 className="text-2xl font-bold text-accent mb-3">Animation, without the animator.</h4>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                A studio animation of a garden room is made by hand: a 3D artist models it, lights it, plots the camera and renders every frame. It is accurate to the millimetre, and it costs £600 to £1,500 for ten seconds and £1,500 to £5,000 for thirty, with one to three weeks' turnaround and a fresh invoice for every change.
                            </p>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                Animation Studio uses Seedance and Kling, the world's leading video models, to turn the design you built in the configurator into a moving visual in about two minutes. It is the next best thing to a hand-made animation, and it costs {pounds(animationPence)} an animation: 30 for £100 + VAT.
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
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">10 second clip</td><td className="p-3">£600 to £1,500</td><td className="p-3 font-bold">from {pounds(animationPence)}</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">30 second clip</td><td className="p-3">£1,500 to £5,000</td><td className="p-3 font-bold">from {pounds(animationPence * 3)}</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">Turnaround</td><td className="p-3">1 to 3 weeks</td><td className="p-3">about 2 minutes</td></tr>
                                        <tr className="border-t border-border"><td className="p-3 text-secondary">Design change</td><td className="p-3">New job, new invoice</td><td className="p-3">Send it again</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-2">Animations, The Hub</div>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['video_25', 'video_50', 'video_100'] as const).map(key => (
                                        <button
                                            key={key}
                                            onClick={() => handleUpgrade('video_credits', priceIdOf(key, key), penceOf(key), true)}
                                            disabled={loadingPlan !== null || plan !== 'business' && plan !== 'master'}
                                            className="rounded-2xl border border-border bg-surface/40 hover:bg-surface/70 disabled:opacity-50 p-4 text-center transition-colors"
                                            title={plan === 'business' || plan === 'master' ? 'Buy animations' : 'Animations are part of The Hub'}
                                        >
                                            <div className="text-2xl font-bold text-primary">{Math.floor(penceOf(key) / animationPence)}</div>
                                            <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider">animations</div>
                                            <div className="text-sm font-bold text-accent mt-1">{pounds(penceOf(key))} <span className="text-[10px] font-semibold text-secondary">+ VAT</span></div>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-secondary mt-2">
                                    One animation is one clip: Kling up to 10 seconds at 1080p, or Seedance up to 5 seconds at 720p (10 seconds at 480p). Longer Seedance clips at 720p count as two or three, and Animation Studio shows the count before you generate. A failed clip is refunded automatically. Credits last 12 months.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/*
                  * Modulr Managed Service (Charlie, 24 Sep 2026): one offer, no
                  * plan needed. Send us the brief and we build it, £149.99 +
                  * VAT a project. Replaces the 20 Sep two routes (a Design
                  * Package from £300, or from £200 for Hub members), which
                  * meant paying for a subscription as well. Still a request,
                  * not a checkout: each project is invoiced. The
                  * managed_service subscription price stays in PRICE_CATALOG
                  * so the server keeps honouring anyone who already holds it.
                  */}
                <div className="w-full max-w-6xl mx-auto mb-20 bg-white rounded-xl shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-border p-8 md:p-16">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                        <div>
                            <h4 className="text-2xl font-bold text-accent mb-3">Modulr Managed Service</h4>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                Short on time, or don't want the software at all? Send us the client's brief, drawings or sketch and a Modulr designer builds the scheme in the 3D Configurator for you: the building, the interior, the garden and the finishes.
                            </p>
                            <p className="text-sm text-secondary leading-relaxed mb-5">
                                Every project comes with a set of renders, a material specification and a client PDF. One round of changes is included. Two working days from brief to delivery. No subscription needed.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                                {[
                                    'Full 3D Configurator build, interior included',
                                    'Walk inside and walk outside',
                                    'Render set: several angles, day and dusk',
                                    'Material specification sheet',
                                    'Project PDF for the client',
                                    'One round of changes',
                                ].map(item => (
                                    <div key={item} className="flex items-start gap-2.5">
                                        <Check size={16} className="text-accent shrink-0 mt-0.5" strokeWidth={3} />
                                        <span className="text-sm leading-tight text-primary/85">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-accent/30 bg-gradient-to-b from-surface/80 to-accent/5 p-6 flex flex-col">
                            <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] mb-2">Per project, no subscription</div>
                            <div className="text-4xl font-bold text-primary drop-shadow-md mb-1">£149.99 <span className="text-xs font-bold text-secondary uppercase">+ VAT</span></div>
                            <p className="text-sm text-secondary leading-relaxed mb-5">You send the brief, we do the rest. The renders, PDF and spec come to you as files, plus a link your client can open on their phone and walk through.</p>
                            <a className="mt-auto" href={`mailto:info@napc.uk?subject=${encodeURIComponent('Managed Service project')}&body=${encodeURIComponent('Hi Modulr,\n\nI would like a Managed Service project.\n\nCompany:\nClient / project name:\nBuilding size and type:\nBrief, drawings or sketch attached:\nDeadline:\n')}`}>
                                <Button className="px-10 py-4 text-xs font-bold uppercase tracking-wider w-full">Talk to us</Button>
                            </a>
                            <p className="text-[11px] text-secondary mt-3">Invoiced per project. Larger or unusual schemes are quoted before any work starts.</p>
                        </div>
                    </div>
                </div>

                {/*
                  * Website Configurator (Charlie, 24 Sep 2026): a configurator
                  * on the PROVIDER'S own website, for their customers - only
                  * their set designs, finishes and prices. Fixed prices, all
                  * + VAT: £995 setup with four set designs, £200 for each set
                  * design beyond that, £99 a month to host it and £50 for each
                  * later update, support request or fix. Anyone can buy it -
                  * no Modulr plan needed. Leads arrive by email, and in Jobs &
                  * Quotes as well for a company that is on a plan.
                  */}
                <div id="website-configurator" className="w-full max-w-6xl mx-auto mb-20 bg-white rounded-xl shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-border p-8 md:p-16">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                        <div>
                            <div className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-accent border border-accent/25 px-2 py-1 mb-4">New · built for you</div>
                            <h4 className="text-2xl font-bold text-accent mb-3">Website Configurator</h4>
                            <p className="text-sm text-secondary leading-relaxed mb-4">
                                A 3D configurator on your own website, for your customers. Only your set designs, your finishes and your prices: a homeowner picks a design, changes it within the options you offer, sees what it costs and sends it straight to you.
                            </p>
                            <p className="text-sm text-secondary leading-relaxed mb-5">
                                We build it from your range, in your branding, and you add it to your site with one line of code. You don't need a Modulr plan: every design a homeowner sends reaches you by email with the specification and the price, and on a Modulr plan it lands in your Jobs & Quotes too.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                                {[
                                    'Your set designs and options only',
                                    'Your prices, live as they design',
                                    'Your logo and colours, on your site',
                                    'Every design arrives as a lead',
                                    'Works on phones and tablets',
                                    'Hosted and kept running for you',
                                ].map(item => (
                                    <div key={item} className="flex items-start gap-2.5">
                                        <Check size={16} className="text-accent shrink-0 mt-0.5" strokeWidth={3} />
                                        <span className="text-sm leading-tight text-primary/85">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-accent/30 bg-gradient-to-b from-surface/80 to-accent/5 p-6 flex flex-col">
                            <div className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] mb-2">Four set designs, no plan needed</div>
                            <div className="text-4xl font-bold text-primary drop-shadow-md mb-1">£995 <span className="text-xs font-bold text-secondary uppercase">setup + VAT</span></div>
                            <p className="text-sm text-secondary leading-relaxed mb-4">Your configurator built with four of your set designs. Need more? Each extra set design is £200.</p>
                            <div className="overflow-hidden rounded-xl border border-border mb-5">
                                <table className="w-full text-sm">
                                    <tbody className="text-primary/85">
                                        <tr><td className="p-2.5 text-secondary">Setup with four set designs</td><td className="p-2.5 font-bold text-right">£995</td></tr>
                                        <tr className="border-t border-border"><td className="p-2.5 text-secondary">Each extra set design</td><td className="p-2.5 font-bold text-right">£200</td></tr>
                                        <tr className="border-t border-border"><td className="p-2.5 text-secondary">Hosting, monthly</td><td className="p-2.5 font-bold text-right">£99</td></tr>
                                        <tr className="border-t border-border"><td className="p-2.5 text-secondary">Further updates, support and fixes</td><td className="p-2.5 font-bold text-right">£50 each</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <a className="mt-auto" href={`mailto:info@napc.uk?subject=${encodeURIComponent('Website Configurator enquiry')}&body=${encodeURIComponent('Hi Modulr,\n\nI would like a Website Configurator for my site.\n\nCompany:\nWebsite:\nModulr account email (if you have one):\nHow many set designs:\nAnything else we should know:\n')}`}>
                                <Button className="px-10 py-4 text-xs font-bold uppercase tracking-wider w-full">Talk to us</Button>
                            </a>
                            <p className="text-[11px] text-secondary mt-3">All prices + VAT.</p>
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
