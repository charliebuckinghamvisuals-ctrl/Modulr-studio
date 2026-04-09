import React from 'react';
import { User, Shield, CreditCard, Clock, Calendar, ChevronRight, Zap, Sparkles, LogOut, Settings, History, Info, CheckCircle2, Trash2, Grid, Layers, Crown } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { useAppEngine } from '../../hooks/useAppEngine';
import { LibraryMaterialItem } from '../../types';
import { toast } from 'react-hot-toast';
import { PRESET_MATERIALS } from '../../constants';

import { auth } from '../../services/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { AppStage } from '../../types';

interface AccountViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onNavigate }) => {
    const engine = useAppEngine();

    // Local state for "Add New" forms (one per category)
    const [newItemForm, setNewItemForm] = React.useState<Record<string, { name: string, text: string, image: string | null }>>({
        walls: { name: '', text: '', image: null },
        roof: { name: '', text: '', image: null },
        windows: { name: '', text: '', image: null },
        doors: { name: '', text: '', image: null },
        decking: { name: '', text: '', image: null }
    });

    const handleAddMaterial = (category: string) => {
        const form = newItemForm[category];
        if (!form.name.trim()) {
            toast.error("Please provide at least a name for the material");
            return;
        }

        const materialName = form.name.trim();
        const materialDescription = form.text.trim() || materialName; // Use name if description is blank

        engine.addToLibrary(category as any, {
            name: materialName,
            text: materialDescription,
            image: form.image
        });

        // Reset only this category's form
        setNewItemForm(prev => ({
            ...prev,
            [category]: { name: '', text: '', image: null }
        }));
        
        toast.success(`Successfully added ${materialName} to Brand Materials`);
    };

    const { user } = useAuth();
    const { credits, plan } = useCredits();

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
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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
        return 30; // 3 Days trial assumption
    };

    const isUnlimited = credits === 'Unlimited';
    const totalCreditsForBar = getCreditTotal(plan);
    const progressPercent = isUnlimited ? 100 : (typeof credits === 'number' && typeof totalCreditsForBar === 'number' ? Math.min((credits / totalCreditsForBar) * 100, 100) : 0);

    const userDisplay = {
        name: user?.displayName || "No Name Set",
        email: user?.email || "No Email",
        plan: getPlanName(plan),
        credits: {
            remaining: isUnlimited ? 'Unlimited' : (credits !== null ? credits : '...'),
            total: totalCreditsForBar,
        },
        nextRenewal: plan === 'master' ? 'Never' : "Manage in Stripe"
    };

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar pt-20 pb-20">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="USER DASHBOARD" />

            {/* Ambient Lighting */}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
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
                        <div className="pt-6 mt-6 border-t border-slate-100">
                            <button className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity">
                                Change Membership <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Credits Card */}
                    <div className="glass-panel p-8 rounded-[2.5rem] border border-border bg-white shadow-xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                        <div className="space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                                    <Sparkles size={24} />
                                </div>
                                <div className="px-3 py-1 rounded-full bg-accent/10 text-accent text-[9px] font-bold uppercase tracking-widest border border-accent/20">
                                    4K Renders
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
                                {/* Progress Bar */}
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
                            <button className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity">
                                Refill Balance <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Renewal Card */}
                    <div className="glass-panel p-8 rounded-[2.5rem] border border-border bg-white shadow-xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl font-montserrat">
                        <div className="space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                                <Calendar size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-accent/50 uppercase tracking-[0.2em]">Next Renewal</p>
                                <h3 className="text-2xl font-bold text-accent tracking-tighter">{userDisplay.nextRenewal}</h3>
                            </div>
                        </div>
                        <div className="pt-6 mt-6 border-t border-slate-100">
                            <button 
                                onClick={handleManageBilling}
                                className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity"
                            >
                                Update Billing <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Primary Row: Details & Security */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-400">
                    {/* User Details */}
                    <div className="space-y-8">
                        <div className="flex items-baseline gap-4">
                            <h2 className="text-2xl font-bold text-accent tracking-tight">Identity Details</h2>
                            <div className="flex-1 h-px bg-border"></div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2 group">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">Full Commercial Name</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                        <User size={16} />
                                    </div>
                                    <input 
                                        type="text" 
                                        defaultValue={userDisplay.name} 
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border outline-none transition-all text-sm text-accent font-medium shadow-inner"
                                        readOnly
                                    />
                                </div>
                            </div>
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

                    {/* Security & Subscription Actions */}
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

                            <div 
                                onClick={handleManageBilling}
                                className="glass-panel p-6 rounded-3xl border border-border bg-white flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all duration-300"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                                        <CreditCard size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Update Billing Details</p>
                                        <p className="text-[10px] text-secondary mt-1">Manage payment methods and history</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-accent transition-colors" />
                            </div>

                            <div 
                                onClick={handleManageBilling}
                                className="glass-panel p-6 rounded-3xl border border-border bg-white flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all duration-300"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-accent tracking-tighter leading-none uppercase">Update Plan</p>
                                        <p className="text-[10px] text-secondary mt-1">Modify your studio membership tier</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-accent transition-colors" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Brand Materials Section */}
                <div className="pt-12 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-600">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-100 mb-12">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-[0.4em]">
                                <Sparkles size={12} className="animate-pulse" />
                                Modulr Studio Pro
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black text-accent tracking-tighter">
                                Brand Materials
                            </h2>
                            <p className="text-sm text-secondary font-medium">Manage your custom architectural specs and official presets.</p>
                        </div>
                    </div>

                    {/* NEW: Master Brand Materials List */}
                    <div className="space-y-6 mb-16">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-accent/60 flex items-center gap-2">
                                <Grid size={16} />
                                Master Materials List
                            </h3>
                            <span className="text-[10px] font-bold px-3 py-1 bg-accent/5 text-accent rounded-full border border-accent/10 whitespace-nowrap">
                                {(Object.values(engine.materialLibrary) as LibraryMaterialItem[][]).flat().length} Total Items
                            </span>
                        </div>

                        {(Object.values(engine.materialLibrary) as LibraryMaterialItem[][]).flat().length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {(Object.entries(engine.materialLibrary) as [string, LibraryMaterialItem[]][]).flatMap(([catId, items]) => 
                                    items.map(item => (
                                        <div key={item.id} className="relative group aspect-square rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden cursor-pointer hover:-translate-y-1">
                                            <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="p-4 h-full flex flex-col justify-between">
                                                <div className="w-8 h-8 rounded-full bg-accent/5 flex items-center justify-center">
                                                    <Layers size={14} className="text-accent/40" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black text-accent uppercase tracking-tighter truncate">{item.name}</p>
                                                    <p className="text-[9px] text-secondary font-bold uppercase tracking-widest opacity-60">
                                                        {catId}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Delete Action */}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    engine.removeFromLibrary(catId as any, item.id);
                                                }}
                                                className="absolute top-2 right-2 p-2 rounded-full bg-white/80 backdrop-blur-sm text-secondary opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-500 shadow-sm"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="p-12 rounded-[2.5rem] bg-slate-50 border border-dashed border-slate-200 text-center">
                                <p className="text-[11px] font-bold text-secondary/50 uppercase tracking-[0.2em]">Save materials from the builder to see them here</p>
                            </div>
                        )}
                    </div>

                    {/* NEW: Official Modulr Presets Gallery */}
                    <div className="space-y-6 mb-16">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-2">
                                <Crown size={16} className="text-accent" />
                                Modulr Official Presets
                            </h3>
                            {userDisplay.plan.includes('Business') || userDisplay.plan.includes('Master') ? (
                                <span className="text-[9px] font-black px-2 py-0.5 bg-green-500 text-white rounded-md uppercase tracking-widest">Unlocked</span>
                            ) : (
                                <span className="text-[9px] font-black px-2 py-0.5 bg-accent/10 text-accent rounded-md uppercase tracking-widest">Upgrade to Business</span>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {(Object.entries(PRESET_MATERIALS) as [string, string[]][]).slice(0, 1).map(([cat, presets]) => 
                                presets.slice(0, 5).map((presetName, i) => (
                                    <div key={i} className="group relative p-4 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden backdrop-blur-xl">
                                        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="relative z-10 flex flex-col gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                                                <Sparkles size={16} className="text-accent/30 group-hover:text-accent transition-colors" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-accent uppercase tracking-tighter leading-tight">{presetName}</p>
                                                <p className="text-[8px] font-bold text-secondary/60 uppercase tracking-widest">{cat}</p>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    engine.addToLibrary(cat as any, { name: presetName, text: presetName, image: null });
                                                    toast.success(`Copied ${presetName} to your Brand Materials`);
                                                }}
                                                className="w-full py-1.5 rounded-xl bg-accent text-white text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-lg active:scale-95"
                                            >
                                                Quick Save
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                            {/* More presets indicator */}
                            <div className="rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center p-6 bg-slate-50/30 opacity-60">
                                <p className="text-[10px] font-bold text-accent/40 uppercase tracking-widest text-center">+ 50 More <br/> Presets</p>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 w-full my-16" />

                    <div className="space-y-12">
                        {[
                            { id: 'walls', label: 'Walls / Cladding', color: 'accent' },
                            { id: 'roof', label: 'Roofing', color: 'secondary' },
                            { id: 'windows', label: 'Windows', color: 'emerald-600' },
                            { id: 'doors', label: 'External Doors', color: 'orange-600' },
                            { id: 'decking', label: 'Decking / Hardscaping', color: 'slate-600' }
                        ].map((category) => (
                                <div key={category.id} className="glass-panel p-8 rounded-[2.5rem] border border-border bg-white shadow-xl">
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <h3 className="text-xl font-bold text-accent tracking-tight mb-1">{category.label} Library</h3>
                                            <p className="text-xs text-secondary">Manage your saved {category.label.toLowerCase()} presets.</p>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-accent uppercase tracking-wider">
                                            {engine.materialLibrary[category.id as keyof typeof engine.materialLibrary].length} Items
                                        </div>
                                    </div>

                                    {/* Existing Items in this Category */}
                                    {engine.materialLibrary[category.id as keyof typeof engine.materialLibrary].length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                            {engine.materialLibrary[category.id as keyof typeof engine.materialLibrary].map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-4 rounded-3xl bg-slate-50 border border-slate-100 group">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <div className="w-12 h-12 shrink-0 rounded-xl bg-white border border-border flex items-center justify-center overflow-hidden relative">
                                                            {item.image ? (
                                                                <img src={item.image} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                                                            ) : (
                                                                <Sparkles size={16} className="text-accent/20" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-accent truncate">{item.name}</p>
                                                            <p className="text-[10px] text-secondary truncate italic leading-tight">"{item.text}"</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => engine.removeFromLibrary(category.id as any, item.id)}
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 ml-2"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 text-center mb-8">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-secondary/60">No {category.label.toLowerCase()} saved yet</p>
                                        </div>
                                    )}

                                    {/* Add New Item to this Category */}
                                    <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-6">
                                        <div className="flex flex-col gap-6">
                                            <div className="flex-1 space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 pl-1">Preset Name</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="e.g. Vertical Cedar"
                                                            value={newItemForm[category.id].name}
                                                            onChange={(e) => setNewItemForm(prev => ({
                                                                ...prev,
                                                                [category.id]: { ...prev[category.id], name: e.target.value }
                                                            }))}
                                                            className="w-full px-4 py-3 rounded-2xl bg-white border border-border outline-none transition-all text-xs text-accent placeholder-accent/30 shadow-inner focus:ring-2 focus:ring-accent/50"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 pl-1">Material Description</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="e.g. Anthracite grey aluminum..."
                                                            value={newItemForm[category.id].text}
                                                            onChange={(e) => setNewItemForm(prev => ({
                                                                ...prev,
                                                                [category.id]: { ...prev[category.id], text: e.target.value }
                                                            }))}
                                                            className="w-full px-4 py-3 rounded-2xl bg-white border border-border outline-none transition-all text-xs text-accent placeholder-accent/30 shadow-inner focus:ring-2 focus:ring-accent/50"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end">
                                                    <Button 
                                                        onClick={() => handleAddMaterial(category.id)}
                                                        className="px-6 py-2 h-10 text-[10px] uppercase font-bold tracking-widest shadow-md hover:shadow-accent/25" 
                                                        icon={<CheckCircle2 size={14} />}
                                                    >
                                                        Add to {category.label.split(' ')[0]} Library
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Disclaimer */}
                <div className="text-center py-20 opacity-30 border-t border-border">
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-accent">Modulr Protocol V3.2 Secure Dashboard</p>
                </div>
            </div>
    );
};
