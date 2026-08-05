import React, { useState } from 'react';
import { Lock, Sparkles, Layers, ArrowRight, ShieldCheck, Mail, KeyRound, Chrome, X, Loader2, Wand2, Hexagon, CheckCircle2 } from 'lucide-react';
import { auth } from '../../services/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { useAuth, isMasterAccount, MASTER_EMAIL } from '../../hooks/useAuth';

interface ComingSoonViewProps {
    onUnlockSuccess?: () => void;
}

export const ComingSoonView: React.FC<ComingSoonViewProps> = ({ onUnlockSuccess }) => {
    const { user } = useAuth();
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleMasterLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error("Please enter both email and password");
            return;
        }

        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            if (isMasterAccount(userCredential.user.email)) {
                toast.success("Master Account authenticated!");
                setShowLoginModal(false);
                if (onUnlockSuccess) onUnlockSuccess();
            } else {
                toast.error("Access restricted: App is locked to Master Account only during pre-launch.");
                await signOut(auth);
            }
        } catch (error: any) {
            toast.error(error.message || "Authentication failed");
            console.error("Login error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            if (isMasterAccount(result.user.email)) {
                toast.success("Master Account authenticated!");
                setShowLoginModal(false);
                if (onUnlockSuccess) onUnlockSuccess();
            } else {
                toast.error("Access restricted: App is locked to Master Account only during pre-launch.");
                await signOut(auth);
            }
        } catch (error: any) {
            toast.error(error.message || "Google Authentication failed");
            console.error("Google auth error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        await signOut(auth);
        toast.success("Signed out successfully");
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col items-center justify-between relative overflow-hidden canvas-grid py-12 px-4 select-none">
            {/* Ambient Background Lighting */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#405a56]/10 blur-[160px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-[#5c7b77]/20 blur-[140px] rounded-full pointer-events-none"></div>

            {/* Top Navigation Header */}
            <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-20 relative px-4">
                <div className="flex items-center gap-3">
                    <img src="/Logo.png" alt="Modulr Studio Logo" className="h-10 w-auto object-contain drop-shadow-md" />
                </div>

                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#405a56]/10 border border-[#405a56]/20 text-[#405a56] text-xs font-semibold tracking-wide">
                        <span className="w-2 h-2 rounded-full bg-[#405a56] animate-pulse"></span>
                        Pre-Launch Private Access
                    </span>

                    {user && !isMasterAccount(user.email) && (
                        <button
                            onClick={handleSignOut}
                            className="text-xs text-[#5c7b77] hover:text-[#405a56] transition-colors underline underline-offset-4"
                        >
                            Sign Out
                        </button>
                    )}

                    <button
                        onClick={() => setShowLoginModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#405a56]/20 text-[#405a56] text-xs font-bold transition-all shadow-md hover:shadow-lg backdrop-blur-md group active:scale-95"
                    >
                        <Lock size={14} className="text-[#405a56] group-hover:scale-110 transition-transform" />
                        <span>Master Access</span>
                    </button>
                </div>
            </header>

            {/* Main Coming Soon Content */}
            <main className="z-10 flex flex-col items-center text-center max-w-3xl w-full mx-auto my-auto py-12 relative">
                {/* Hero Card */}
                <div className="bg-white/80 backdrop-blur-2xl p-10 md:p-14 rounded-[3rem] border border-[#405a56]/20 shadow-xl flex flex-col items-center text-center w-full relative overflow-hidden">
                    
                    {/* Glowing Logo Accent */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-[#405a56]/10 blur-2xl rounded-full"></div>
                        <img 
                            src="/Logo.png" 
                            alt="Modulr Studio Logo" 
                            className="h-28 md:h-36 w-auto object-contain relative z-10" 
                        />
                    </div>

                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-800 mb-4 leading-none">
                        MODULR <span className="bg-gradient-to-r from-[#405a56] via-[#5c7b77] to-[#405a56] bg-clip-text text-transparent">STUDIO</span>
                    </h1>

                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#405a56]/5 border border-[#405a56]/20 text-[#405a56] text-xs font-bold uppercase tracking-widest mb-6">
                        <Sparkles size={14} className="text-[#405a56]" />
                        Next-Gen AI Architectural Engine
                    </div>

                    <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-xl mx-auto font-normal mb-8">
                        We are putting the final touches on our revolutionary AI-powered exterior rendering & material styling platform. Public launch is coming soon.
                    </p>

                    {/* Animated Progress Bar */}
                    <div className="w-full max-w-md h-1.5 bg-[#f8fafc] rounded-full overflow-hidden relative mb-10 border border-[#405a56]/10">
                        <div className="w-2/3 h-full bg-gradient-to-r from-[#405a56] via-[#5c7b77] to-[#405a56] rounded-full animate-[pulse_2.5s_ease-in-out_infinite] shadow-[0_0_15px_rgba(64,90,86,0.5)]"></div>
                    </div>

                    {/* Feature Highlights Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full text-left pt-6 border-t border-[#405a56]/10">
                        <div className="p-4 rounded-2xl bg-white/60 border border-[#405a56]/10 space-y-1">
                            <div className="flex items-center gap-2 text-[#405a56] text-xs font-bold uppercase tracking-wider">
                                <Sparkles size={12} />
                                <span>4K Renders</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight">Photorealistic architectural visualisations in seconds.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/60 border border-[#405a56]/10 space-y-1">
                            <div className="flex items-center gap-2 text-[#405a56] text-xs font-bold uppercase tracking-wider">
                                <Layers size={12} />
                                <span>Material Studio</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight">AI cladding, timber, brick, and finish swapping.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/60 border border-[#405a56]/10 space-y-1">
                            <div className="flex items-center gap-2 text-[#405a56] text-xs font-bold uppercase tracking-wider">
                                <Wand2 size={12} />
                                <span>Line Convert</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight">Elevate SketchUp, CAD, and line drawings into scenes.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/60 border border-[#405a56]/10 space-y-1 relative">
                            <div className="flex items-center justify-between text-[#405a56] text-xs font-bold uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <Hexagon size={12} />
                                    <span>3D Config</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-tight">In Development - launch date TBD.</p>
                        </div>
                    </div>

                </div>
            </main>

            {/* Footer */}
            <footer className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs text-[#5c7b77] z-20 gap-4 pt-6 border-t border-[#405a56]/10 px-4">
                <p>© {new Date().getFullYear()} Modulr Studio. Created by NAPC Ltd. All rights reserved.</p>
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowLoginModal(true)} className="hover:text-[#405a56] transition-colors flex items-center gap-1">
                        <Lock size={12} />
                        <span>Master Access Login</span>
                    </button>
                    <span>|</span>
                    <a href="mailto:info@napc.uk" className="hover:text-[#405a56] transition-colors">Contact Support</a>
                </div>
            </footer>

            {/* Master Access Login Modal */}
            {showLoginModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white border border-[#405a56]/20 rounded-3xl p-8 max-w-md w-full relative shadow-2xl text-slate-800 space-y-6">
                        
                        <button
                            onClick={() => setShowLoginModal(false)}
                            className="absolute top-5 right-5 p-2 text-slate-400 hover:text-[#405a56] rounded-full bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#405a56]/10 text-[#405a56] text-xs font-bold uppercase tracking-wider">
                                <ShieldCheck size={14} />
                                Restricted Master Login
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Master Account Access</h2>
                            <p className="text-xs text-slate-500">
                                Enter your master credentials ({MASTER_EMAIL}) to unlock the application environment.
                            </p>
                        </div>

                        <form onSubmit={handleMasterLogin} className="space-y-4">
                            <div className="space-y-1 text-left">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5c7b77] pl-1">Email Address</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5c7b77]" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={MASTER_EMAIL}
                                        required
                                        className="w-full bg-[#f8fafc] border border-[#405a56]/20 focus:border-[#405a56] focus:ring-2 focus:ring-[#405a56]/20 rounded-xl pl-10 pr-4 py-3 text-sm text-[#405a56] outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1 text-left">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5c7b77] pl-1">Password</label>
                                <div className="relative">
                                    <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5c7b77]" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full bg-[#f8fafc] border border-[#405a56]/20 focus:border-[#405a56] focus:ring-2 focus:ring-[#405a56]/20 rounded-xl pl-10 pr-4 py-3 text-sm text-[#405a56] outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 rounded-xl bg-[#405a56] hover:bg-[#2d3f3c] text-white font-bold text-sm tracking-wide transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Authenticating...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Unlock Application</span>
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="relative flex items-center justify-center my-2">
                            <div className="absolute inset-x-0 h-px bg-slate-200"></div>
                            <span className="relative z-10 px-3 bg-white text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or authenticate with</span>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isLoading}
                            className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold text-xs tracking-wide transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            <Chrome size={16} className="text-[#405a56]" />
                            <span>Sign In with Google</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
