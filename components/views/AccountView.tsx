import React from 'react';
import { User, Shield, CreditCard, Clock, Calendar, ChevronRight, Zap, Sparkles, LogOut, Settings, History, Info, CheckCircle2, Trash2, Grid, Layers, Crown, Lock } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { LibraryMaterialItem } from '../../types';
import { toast } from 'react-hot-toast';
import { PRESET_MATERIALS } from '../../constants';

import { auth } from '../../services/firebase';
import { signOut, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { useBranding } from '../../hooks/useBranding';
import { AppStage } from '../../types';

interface AccountViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onNavigate }) => {
    const { user } = useAuth();
    const { credits, plan, rendersLeft, rendersPerDay, trialDaysLeft, refreshCredits } = useCredits();
    const { branding, setBranding } = useBranding();

    // Editable display name
    const [editableName, setEditableName] = React.useState(user?.displayName || '');
    const [isSavingName, setIsSavingName] = React.useState(false);

    React.useEffect(() => {
        setEditableName(user?.displayName || '');
    }, [user?.displayName]);

    const handleSaveName = async () => {
        if (!user || !editableName.trim()) return;
        setIsSavingName(true);
        try {
            await updateProfile(user, { displayName: editableName.trim() });
            toast.success('Name updated successfully');
        } catch (error) {
            toast.error('Failed to update name');
        } finally {
            setIsSavingName(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!user?.email) return;
        try {
            await sendPasswordResetEmail(auth, user.email);
            toast.success(`Password reset email sent to ${user.email}`);
        } catch (error) {
            toast.error('Failed to send password reset email');
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            toast.success('Signed out securely');
            onNavigate?.(AppStage.HOME);
        } catch (error) {
            toast.error('Failed to sign out');
        }
    };

    const handleManageBilling = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                toast.error(data.error || 'Could not load billing portal');
            }
        } catch (error) {
            toast.error('Unable to access billing portal at this time.');
        }
    };

    const isTester = plan === 'tester';

    const getPlanName = (p: string | null) => {
        if (p === null) return "Free Trial"; // null = loaded but no plan set
        if (!p) return "Free Trial";
        if (p.toLowerCase() === 'master') return 'Modulr Master';
        if (p.toLowerCase() === 'tester') return 'Tester Access';
        if (p.includes('business') || p.includes('price_1TKI8')) return 'Business Plan';
        return 'Free Trial';
    };

    // Business is unlimited - it is no longer metered by a credit balance, so
    // there is no total to show or fill a progress bar against.
    const getCreditTotal = (p: string | null) => {
        if (p?.toLowerCase() === 'master') return '∞';
        if (p?.toLowerCase() === 'tester') return rendersPerDay ?? 40;
        if (p?.includes('business') || p?.includes('price_1TKI8')) return '∞';
        return 5;
    };

    const isUnlimited = credits === 'Unlimited' || getCreditTotal(plan) === '∞';
    const isPaidPlan = plan && (plan.includes('business') || plan.toLowerCase() === 'master');
    const totalCreditsForBar = getCreditTotal(plan);
    // Testers fall through the numeric branch below: credits holds the renders
    // remaining and totalCreditsForBar holds their allowance, so the same
    // calculation applies without a special case.
    const progressPercent = isUnlimited
        ? 100
        : (typeof credits === 'number' && typeof totalCreditsForBar === 'number'
            ? Math.min((credits / totalCreditsForBar) * 100, 100)
            : (rendersLeft !== null ? Math.min((rendersLeft / 5) * 100, 100) : 0));

    const userDisplay = {
        name: user?.displayName || "No Name Set",
        email: user?.email || "No Email",
        plan: getPlanName(plan),
        credits: {
            remaining: isPaidPlan 
                ? (isUnlimited ? 'Unlimited' : (credits !== null ? credits : '...'))
                : (rendersLeft !== null ? rendersLeft : 0),
            total: totalCreditsForBar,
        },
    };

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar pt-20 pb-20">
            <DraftingBackground pageName="USER DASHBOARD" />

            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="flex-1 px-8 md:px-16 relative z-10 w-full max-w-[1200px] mx-auto space-y-12">
                
                {/* Header */}
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                        <Settings size={14} className="animate-spin-slow" />
                        Account Control Center
                    </div>
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                        <div className="space-y-1">
                            <h1 className="text-4xl md:text-5xl font-bold text-accent tracking-tighter leading-none">
                                Account Dashboard
                            </h1>
                            <p className="text-secondary font-medium pl-1">System Version 3.2 Professional Access</p>
                        </div>
                        <button onClick={handleSignOut} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors bg-red-50 px-4 py-2 rounded-xl border border-red-100 self-start md:self-auto">
                            <LogOut size={14} />
                            Terminate Session
                        </button>
                    </div>
                </div>

                {/* Top Row: Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                    {/* Plan Card */}
                    <div className="glass-panel p-8 rounded-[2.5rem] border border-border bg-white shadow-xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                        <div className="space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                                <Zap size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-accent/50 uppercase tracking-[0.2em]">Active Plan</p>
                                <h3 className="text-2xl font-bold text-accent tracking-tight">{userDisplay.plan}</h3>
                            </div>
                        </div>
                        <div className="pt-6 mt-6 border-t border-slate-100 flex items-center gap-4">
                            <button
                                onClick={() => onNavigate?.(AppStage.PRICING)}
                                className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity"
                            >
                                {isPaidPlan ? 'Change Membership' : 'Upgrade Plan'} <ChevronRight size={12} />
                            </button>
                            {isPaidPlan && (
                                <button
                                    onClick={handleManageBilling}
                                    className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity ml-auto"
                                >
                                    Cancel Membership <ChevronRight size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Credits Card - no Refill Balance */}
                    <div className="glass-panel p-8 rounded-[2.5rem] border border-border bg-white shadow-xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                        <div className="space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                                    <Sparkles size={24} />
                                </div>
                                <div className="px-3 py-1 rounded-full bg-accent/10 text-accent text-[9px] font-bold uppercase tracking-widest border border-accent/20">
                                    {isPaidPlan ? 'Monthly Allocation' : 'Trial Credits'}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] font-bold text-accent/50 uppercase tracking-[0.2em]">
                                        {isTester ? 'Tester Renders Remaining' : isPaidPlan ? 'Credits Remaining' : 'Trial Renders Remaining'}
                                    </p>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-3xl font-bold text-accent tracking-tight">{userDisplay.credits.remaining}</h3>
                                        {!isUnlimited && <span className="text-secondary font-medium text-sm">/ {userDisplay.credits.total} {!isPaidPlan || isTester ? 'renders' : 'credits'}</span>}
                                    </div>
                                    {isTester ? (
                                        <p className="text-[10px] text-secondary mt-1">
                                            {trialDaysLeft !== null && trialDaysLeft > 0
                                                ? `Tester access - ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining.`
                                                : 'Your tester access has ended.'}
                                        </p>
                                    ) : !isPaidPlan && (
                                        <p className="text-[10px] text-secondary mt-1">
                                            Free trial limited to 5 renders per day. Upgrade for more.
                                        </p>
                                    )}
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-accent rounded-full relative overflow-hidden" 
                                        style={{ width: `${progressPercent}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 animate-shimmer"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="pt-6 mt-6 border-t border-slate-100">
                            {!isPaidPlan && (
                                <button
                                    onClick={() => onNavigate?.(AppStage.PRICING)}
                                    className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity"
                                >
                                    Get More Credits with a Plan <ChevronRight size={12} />
                                </button>
                            )}
                            {isPaidPlan && (
                                <p className="text-[10px] text-secondary/60 uppercase tracking-widest font-bold">Credits reset on next billing cycle</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Identity Details & System Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-400">
                    {/* Identity Details - editable name */}
                    <div className="space-y-8">
                        <div className="flex items-baseline gap-4">
                            <h2 className="text-2xl font-bold text-accent tracking-tight">Identity Details</h2>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        
                        <div className="space-y-6">
                            {/* Editable Name */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Display Name / Company</label>
                                <div className="relative flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                            <User size={16} />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={editableName}
                                            onChange={(e) => setEditableName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                                            placeholder="Your name or company..."
                                            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border outline-none focus:ring-2 focus:ring-accent/30 transition-all text-sm text-accent font-medium shadow-inner"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSaveName}
                                        disabled={isSavingName || editableName.trim() === (user?.displayName || '')}
                                        className="px-4 py-4 rounded-2xl bg-accent text-white text-[10px] font-bold uppercase tracking-widest hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                                    >
                                        {isSavingName ? '...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                            {/* Email - read only */}
                            <div className="space-y-2 group">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Systems Access Email</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                        <Shield size={16} />
                                    </div>
                                    <input 
                                        type="email" 
                                        defaultValue={userDisplay.email} 
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border outline-none transition-all text-sm text-accent font-medium shadow-inner"
                                        readOnly
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 pl-1 italic">Identity verification managed by Modulr Intelligence Security Layer.</p>
                    </div>

                    {/* System Controls - only Update Password */}
                    <div className="space-y-8">
                        <div className="flex items-baseline gap-4">
                            <h2 className="text-2xl font-bold text-accent tracking-tight">System Controls</h2>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="glass-panel p-6 rounded-3xl border border-border bg-white flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all duration-300"
                                 onClick={handleUpdatePassword}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Update Password</p>
                                        <p className="text-[10px] text-secondary mt-1">Sends a reset link to your registered email</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-accent transition-colors" />
                            </div>

                            {isPaidPlan && (
                                <div 
                                    onClick={handleManageBilling}
                                    className="glass-panel p-6 rounded-3xl border border-border bg-white flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all duration-300"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                                            <CreditCard size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Manage Billing</p>
                                            <p className="text-[10px] text-secondary mt-1">Update payment methods and invoices via Stripe</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 group-hover:text-accent transition-colors" />
                                </div>
                            )}

                            {!isPaidPlan && (
                                <div 
                                    onClick={() => onNavigate?.(AppStage.PRICING)}
                                    className="glass-panel p-6 rounded-3xl border border-dashed border-accent/20 bg-accent/5 flex items-center justify-between group cursor-pointer hover:bg-accent/10 transition-all duration-300"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent transition-all duration-300">
                                            <Zap size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Upgrade Your Plan</p>
                                            <p className="text-[10px] text-secondary mt-1">Unlock 4K rendering, more credits and Pro Mode</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-accent transition-colors" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Company Branding Section */}
                <div className="pt-12 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-600">
                    <div className="space-y-8">
                        <div className="flex items-baseline gap-4">
                            <h2 className="text-2xl font-bold text-accent tracking-tight">Company Branding</h2>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        <p className="text-sm text-secondary font-medium">Customize the branding for your PDF Presentation exports.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            {/* Logo & Color */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Company Logo</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 rounded-2xl bg-slate-50 border border-dashed border-border flex items-center justify-center overflow-hidden">
                                            {branding.logo ? (
                                                <img src={branding.logo} alt="Company Logo" className="w-full h-full object-contain p-2" />
                                            ) : (
                                                <Grid size={24} className="text-slate-300" />
                                            )}
                                        </div>
                                        <label className="px-4 py-2 rounded-xl bg-accent/5 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/10 transition-all cursor-pointer">
                                            Upload Logo
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            if (ev.target?.result) {
                                                                setBranding({ logo: ev.target.result as string });
                                                            }
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }} 
                                            />
                                        </label>
                                        {branding.logo && (
                                            <button 
                                                onClick={() => setBranding({ logo: null })}
                                                className="px-4 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Primary Color</label>
                                    <div className="flex items-center gap-4">
                                        <input 
                                            type="color" 
                                            value={branding.primaryColor}
                                            onChange={(e) => setBranding({ primaryColor: e.target.value })}
                                            className="w-12 h-12 rounded-xl border-none cursor-pointer bg-transparent"
                                        />
                                        <input 
                                            type="text" 
                                            value={branding.primaryColor}
                                            onChange={(e) => setBranding({ primaryColor: e.target.value })}
                                            className="px-4 py-2 rounded-xl bg-slate-50 border border-border outline-none focus:ring-2 focus:ring-accent/30 text-sm font-bold uppercase"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* PDF design template */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">PDF Design</label>
                                <p className="text-xs text-secondary pl-1">How your exported design proposals look.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {([
                                        { id: 'classic', name: 'Classic', desc: 'Colour header band on every page with your logo. The original look.' },
                                        { id: 'minimal', name: 'Minimal', desc: 'Clean white pages, hairline rules. Your colour used sparingly as an accent.' },
                                        { id: 'bold', name: 'Bold', desc: 'Deep colour masthead on the cover with the project title inside it.' },
                                    ] as const).map(t => {
                                        const selected = (branding.pdfTemplate || 'classic') === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => setBranding({ pdfTemplate: t.id })}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${selected ? 'border-accent bg-accent/5 shadow-sm' : 'border-border bg-slate-50 hover:border-accent/40'}`}
                                            >
                                                {/* Tiny page preview drawn with divs, tinted by the user's colour */}
                                                <div className="w-full h-16 rounded-lg bg-white border border-border overflow-hidden mb-3">
                                                    {t.id === 'classic' && (
                                                        <>
                                                            <div className="h-3 w-full" style={{ background: branding.primaryColor }} />
                                                            <div className="p-1.5 space-y-1">
                                                                <div className="h-1.5 w-1/2 rounded bg-slate-300" />
                                                                <div className="h-6 w-full rounded bg-slate-100" />
                                                            </div>
                                                        </>
                                                    )}
                                                    {t.id === 'minimal' && (
                                                        <div className="p-1.5 space-y-1">
                                                            <div className="flex justify-between items-center">
                                                                <div className="h-1.5 w-1/4 rounded" style={{ background: branding.primaryColor }} />
                                                                <div className="h-1 w-1/5 rounded bg-slate-200" />
                                                            </div>
                                                            <div className="h-px w-full bg-slate-200" />
                                                            <div className="h-6 w-full rounded bg-slate-100" />
                                                        </div>
                                                    )}
                                                    {t.id === 'bold' && (
                                                        <>
                                                            <div className="h-8 w-full p-1.5 flex flex-col justify-end" style={{ background: branding.primaryColor }}>
                                                                <div className="h-1.5 w-1/2 rounded bg-white/80" />
                                                            </div>
                                                            <div className="p-1.5">
                                                                <div className="h-4 w-full rounded bg-slate-100" />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <span className={`block text-xs font-bold ${selected ? 'text-accent' : 'text-primary'}`}>{t.name}</span>
                                                <span className="block text-[10px] text-secondary mt-0.5 leading-snug">{t.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Contact Info */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Contact Information (Header)</label>
                                <textarea
                                    value={branding.contactInfo}
                                    onChange={(e) => setBranding({ contactInfo: e.target.value })}
                                    placeholder="e.g. Website: www.yourcompany.com | Phone: 01234 567 890 | Email: hello@yourcompany.com"
                                    className="w-full h-32 p-4 rounded-2xl bg-slate-50 border border-border outline-none focus:ring-2 focus:ring-accent/30 transition-all text-sm text-accent shadow-inner resize-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center py-20 opacity-30 border-t border-border">
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-accent">Modulr Protocol V3.2 Secure Dashboard</p>
                </div>
            </div>
        </div>
    );
};
