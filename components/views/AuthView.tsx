import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Github, Chrome, Sparkles, Wand2, Hexagon, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';
import { auth } from '../../services/firebase';
import { trackSignUp, trackLogin } from '../../services/analytics';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';

import { toast } from 'react-hot-toast';
import { AppStage } from '../../types';

interface AuthViewProps {
    onNavigate: (stage: AppStage) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onNavigate }) => {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const toggleMode = () => setMode(prev => prev === 'signin' ? 'signup' : 'signin');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!email || !password) {
            toast.error("Please enter email and password");
            return;
        }

        setIsLoading(true);

        try {
            if (mode === 'signup') {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                if (name) {
                    await updateProfile(userCredential.user, { displayName: name });
                }
                toast.success('Account created successfully!');
                trackSignUp('email');
                onNavigate(AppStage.HOME);

            } else {
                await signInWithEmailAndPassword(auth, email, password);
                toast.success('Welcome back!');
                trackLogin('email');
                onNavigate(AppStage.HOME);

            }
        } catch (error: any) {
            toast.error(error.message || 'Authentication failed');
            console.error("Auth error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            toast.success('Signed in with Google!');
            trackLogin('google');
            onNavigate(AppStage.HOME);

        } catch (error: any) {
            toast.error(error.message || 'Google Auth failed');
            console.error("Google auth error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar items-center justify-center min-h-[800px] py-20 px-4 md:px-0">
            {/* Pro Drafting Grid Background */}
            <DraftingBackground pageName="AUTHENTICATION" />

            {/* Ambient Lighting */}
            <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px] pointer-events-none"></div>

            {/* Auth Container */}
            <div className="w-full max-w-[1000px] relative z-10 glass-panel rounded-[3rem] border border-border bg-white shadow-[0_50px_100px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col md:flex-row min-h-[600px] animate-in fade-in zoom-in-95 duration-700">
                
                {/* Left Side: Architectural Showcase (Desktop Only) */}
                <div className="hidden md:flex md:w-[45%] bg-slate-50 relative overflow-hidden flex-col justify-between p-12 border-r border-border">
                    {/* Background Render - Full Opacity */}
                    <img 
                        src="/demo-render.jpg" 
                        alt="Background Render" 
                        className="absolute inset-0 w-full h-full object-cover opacity-100"
                    />
                    
                    {/* Subtle Gradient Overlay for Text Readability - Balanced for full render */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-transparent"></div>
                    
                    <div className="absolute inset-0 bg-accent/5 opacity-40"></div>
                    <div className="absolute inset-0 canvas-grid opacity-10 scale-150"></div>
                    
                    {/* Top Bubble Section: Brand & Title */}
                    <div className="relative z-10 p-6 rounded-[2.5rem] bg-white/90 backdrop-blur-md border border-border shadow-xl space-y-4 max-w-[340px] animate-in slide-in-from-left duration-700 delay-150">
                        <div className="flex items-center gap-2 text-accent">
                            <Hexagon size={24} className="fill-accent/10" />
                            <span className="font-bold tracking-[0.3em] text-[10px] uppercase italic">Modulr Render Engine</span>
                        </div>
                        <h2 className="text-3xl font-bold text-accent leading-[1.1] tracking-tight">
                            Unlock the <br/>
                            Future of <br/>
                            Visualisation.
                        </h2>
                    </div>

                    {/* Bottom Area: Empty - focusing on the render and top title */}
                    <div className="relative z-10 opacity-0"></div>

                    {/* Background Graphic */}
                    <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-accent/20 rounded-full blur-[80px]"></div>
                </div>

                {/* Right Side: Auth Form */}
                <div className="flex-1 p-8 md:p-16 flex flex-col justify-center space-y-10">
                    <div className="space-y-2">
                        <h3 className="text-3xl font-bold text-accent tracking-tighter">
                            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
                        </h3>
                        <p className="text-sm text-secondary font-medium">
                            {mode === 'signin' ? 'Sign in to continue your projects.' : 'Join the elite architectural render platform.'}
                        </p>
                    </div>

                    <form className="space-y-6 pt-2" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            {mode === 'signup' && (
                                <div className="space-y-2 group">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/50 group-focus-within:text-accent transition-colors pl-1">Full Name</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                            <User size={16} />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Charlie Buckingham" 
                                            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border focus:border-accent/40 focus:ring-4 focus:ring-accent/5 focus:bg-white outline-none transition-all text-sm text-accent font-medium placeholder-slate-400"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 group">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/50 group-focus-within:text-accent transition-colors pl-1">Email Address</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                        <Mail size={16} />
                                    </div>
                                    <input 
                                        type="email" 
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="yourname@modulr.uk" 
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border focus:border-accent/40 focus:ring-4 focus:ring-accent/5 focus:bg-white outline-none transition-all text-sm text-accent font-medium placeholder-slate-400"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/50 group-focus-within:text-accent transition-colors">Password</label>
                                    {/* type="button" is load-bearing: inside the form the
                                        default type is submit, so this used to fire a failed
                                        login attempt instead of a password reset. */}
                                    {mode === 'signin' && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!email.trim()) {
                                                    toast.error('Enter your email above first, then click Forgot Password.');
                                                    return;
                                                }
                                                try {
                                                    await sendPasswordResetEmail(auth, email.trim());
                                                    toast.success('Password reset email sent — check your inbox.');
                                                } catch {
                                                    // Deliberately the same message: confirming which
                                                    // addresses exist would leak account presence.
                                                    toast.success('Password reset email sent — check your inbox.');
                                                }
                                            }}
                                            className="text-[10px] font-bold text-accent hover:opacity-70 transition-opacity"
                                        >Forgot Password?</button>
                                    )}
                                </div>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                        <Lock size={16} />
                                    </div>
                                    <input 
                                        type="password" 
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••" 
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border focus:border-accent/40 focus:ring-4 focus:ring-accent/5 focus:bg-white outline-none transition-all text-sm text-accent font-medium placeholder-slate-400"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button type="submit" disabled={isLoading} className="w-full py-4 text-sm font-bold uppercase tracking-[0.1em]" borderless icon={isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}>
                                {isLoading ? 'Authenticating...' : (mode === 'signin' ? 'Access Studio' : 'Build Profile')}
                            </Button>
                        </div>
                    </form>

                    <div className="space-y-6">
                        <div className="relative flex items-center justify-center">
                            <div className="absolute inset-x-0 h-px bg-border"></div>
                            <span className="relative z-10 px-4 bg-white text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Or Continue With</span>
                        </div>

                        {/* Apple sign-in was a styled button with no onClick and no
                            provider configured — a dead control that swallowed clicks.
                            Removed until Apple auth actually exists. */}
                        <div className="grid grid-cols-1 gap-4">
                            <button type="button" onClick={handleGoogleSignIn} className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-border hover:bg-slate-50 transition-all group active:scale-95 shadow-sm">
                                <Chrome size={18} className="text-secondary group-hover:text-accent transition-colors" />
                                <span className="text-[11px] font-bold text-accent uppercase tracking-wider">Google</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 text-center">
                        <button onClick={toggleMode} className="text-xs font-medium text-secondary">
                            {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                            <span className="text-accent font-bold underline underline-offset-4 decoration-accent/20 hover:decoration-accent transition-all px-1">
                                {mode === 'signin' ? 'Sign up free' : 'Sign in instead'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Legal */}
            <div className="mt-12 text-center relative z-10">
                <p className="text-[10px] text-slate-400 font-medium tracking-wide">
                    By continuing, you agree to the <span className="underline underline-offset-2">Terms of Protocol</span> and <span className="underline underline-offset-2">Privacy Encryption</span>.
                </p>
            </div>
        </div>
    );
};
