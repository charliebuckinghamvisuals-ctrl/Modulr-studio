import React from 'react';
import { User, Shield, CreditCard, Clock, Calendar, ChevronRight, Zap, Sparkles, LogOut, Settings, History, Info, CheckCircle2, Trash2, Grid, Layers, Crown, Lock } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { useAppEngine } from '../../hooks/useAppEngine';
import { LibraryMaterialItem } from '../../types';
import { toast } from 'react-hot-toast';
import { PRESET_MATERIALS } from '../../constants';

import { auth } from '../../services/firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { AppStage } from '../../types';

interface AccountViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onNavigate }) => {
    const engine = useAppEngine();
    const { user } = useAuth();
    const { credits, plan, refreshCredits } = useCredits();

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

    const getPlanName = (p: string | null) => {
        if (!p) return "Loading...";
        if (p.toLowerCase() === 'master') return 'Modulr Master';
        if (p.includes('business') || p.includes('price_1TKI8')) return 'Business Plan';
        if (p.includes('standard') || p.includes('price_1TKI6') || p.includes('price_1TKI7')) return 'Standard Plan';
        return 'Free Trial';
    };

    const getCreditTotal = (p: string | null) => {
        if (p?.toLowerCase() === 'master') return '∞';
        if (p?.includes('business') || p?.includes('price_1TKI8')) return 15500;
        if (p?.includes('standard') || p?.includes('price_1TKI6') || p?.includes('price_1TKI7')) return 1500;
        return 30;
    };

    const isUnlimited = credits === 'Unlimited';
    const totalCreditsForBar = getCreditTotal(plan);
    const progressPercent = isUnlimited ? 100 : (typeof credits === 'number' && typeof totalCreditsForBar === 'number' ? Math.min((credits / totalCreditsForBar) * 100, 100) : 0);

    const isPaidPlan = plan && (plan.includes('business') || plan.includes('standard') || plan.toLowerCase() === 'master');

    const userDisplay = {
        name: user?.displayName || "No Name Set",
        email: user?.email || "No Email",
        plan: getPlanName(plan),
        credits: {
            remaining: isUnlimited ? 'Unlimited' : (credits !== null ? credits : '...'),
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

                    {/* Credits Card — no Refill Balance */}
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
                                    <p className="text-[10px] font-bold text-accent/50 uppercase tracking-[0.2em]">Credits Remaining</p>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-3xl font-bold text-accent tracking-tight">{userDisplay.credits.remaining}</h3>
                                        {!isUnlimited && <span className="text-secondary font-medium text-sm">/ {userDisplay.credits.total}</span>}
                                    </div>
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
                            {/* Email — read only */}
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

                    {/* System Controls — only Update Password */}
                    <div className="space-y-8">
                        <div className="flex items-baseline gap-4">
                            <h2 className="text-2xl font-bold text-accent tracking-tight">System Controls</h2>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="glass-panel p-6 rounded-3xl border border-border bg-white flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all duration-300">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                                        <Shield size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Update Password</p>
                                        <p className="text-[10px] text-secondary mt-1">Rotate your secure access credentials</p>
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

                {/* Brand Materials Section — COMING SOON */}
                <div className="pt-12 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-600 relative">
                    {/* Coming Soon overlay */}
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[2.5rem] bg-white/80 backdrop-blur-md border-2 border-dashed border-accent/20">
                        <div className="flex flex-col items-center gap-4 text-center px-6">
                            <div className="w-16 h-16 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                                <Lock size={28} className="text-accent/60" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-accent/50 mb-2">Coming Soon</p>
                                <h3 className="text-3xl font-black text-accent tracking-tight">Brand Materials</h3>
                                <p className="text-secondary text-sm mt-2 max-w-sm">We're building something powerful here. Your custom material library and official presets are in development and will be available in the next Studio update.</p>
                            </div>
                        </div>
                    </div>

                    {/* Blurred content underneath */}
                    <div className="filter blur-sm pointer-events-none select-none opacity-40">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-100 mb-12">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-[0.4em]">
                                    <Sparkles size={12} className="animate-pulse" />
                                    Modulr Studio Pro
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black text-accent tracking-tighter">Brand Materials</h2>
                                <p className="text-sm text-secondary font-medium">Manage your custom architectural specs and official presets.</p>
                            </div>
                        </div>
                        <div className="space-y-6 mb-16">
                            <div className="p-12 rounded-[2.5rem] bg-slate-50 border border-dashed border-slate-200 text-center">
                                <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-[0.2em]">Save materials from the builder to see them here</p>
                            </div>
                        </div>
                        <div className="h-40 bg-slate-50 rounded-3xl border border-slate-100"></div>
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
