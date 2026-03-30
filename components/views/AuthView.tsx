import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Github, Chrome, Sparkles, Wand2, Hexagon, ShieldCheck } from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';

export const AuthView: React.FC = () => {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const toggleMode = () => setMode(prev => prev === 'signin' ? 'signup' : 'signin');

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
                        src="/demo-render.png" 
                        alt="Background Render" 
                        className="absolute inset-0 w-full h-full object-cover opacity-100"
                    />
                    
                    {/* Subtle Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-transparent"></div>
                    
                    <div className="absolute inset-0 bg-accent/5 opacity-40"></div>
                    <div className="absolute inset-0 canvas-grid opacity-10 scale-150"></div>
                    
                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-2 text-accent">
                            <Hexagon size={28} className="fill-accent/10" />
                            <span className="font-bold tracking-[0.3em] text-xs uppercase italic">Modulr Render Engine</span>
                        </div>
                        <h2 className="text-4xl font-bold text-accent leading-tight tracking-tight">
                            Unlock the <br/>
                            Future of <br/>
                            Visualisation.
                        </h2>
                        <div className="h-1 w-12 bg-accent/20 rounded-full"></div>
                        <p className="text-secondary text-sm leading-relaxed max-w-[240px]">
                            Access 4K Ultra HD rendering, batch processing, and your complete architectural project history.
                        </p>
                    </div>

                    <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-border shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-accent uppercase tracking-wider">Architectural Intelligence</p>
                                <p className="text-[9px] text-secondary">Neural Render Engine x48</p>
                            </div>
                        </div>
                        <div className="text-[10px] text-secondary/60 flex items-center gap-2 pl-2">
                            <ShieldCheck size={14} className="text-accent" />
                            Secure Professional Workspace
                        </div>
                    </div>

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

                    <form className="space-y-6 pt-2" onSubmit={(e) => e.preventDefault()}>
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
                                        placeholder="architect@napc.uk" 
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-border focus:border-accent/40 focus:ring-4 focus:ring-accent/5 focus:bg-white outline-none transition-all text-sm text-accent font-medium placeholder-slate-400"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/50 group-focus-within:text-accent transition-colors">Password</label>
                                    {mode === 'signin' && (
                                        <button className="text-[10px] font-bold text-accent hover:opacity-70 transition-opacity">Forgot Password?</button>
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
                            <Button className="w-full py-4 text-sm font-bold uppercase tracking-[0.1em]" borderless icon={<ArrowRight size={18} />}>
                                {mode === 'signin' ? 'Access Studio' : 'Build Profile'}
                            </Button>
                        </div>
                    </form>

                    <div className="space-y-6">
                        <div className="relative flex items-center justify-center">
                            <div className="absolute inset-x-0 h-px bg-border"></div>
                            <span className="relative z-10 px-4 bg-white text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Or Continue With</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-border hover:bg-slate-50 transition-all group active:scale-95 shadow-sm">
                                <Chrome size={18} className="text-secondary group-hover:text-accent transition-colors" />
                                <span className="text-[11px] font-bold text-accent uppercase tracking-wider">Google</span>
                            </button>
                            <button className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-border hover:bg-slate-50 transition-all group active:scale-95 shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-secondary group-hover:text-accent transition-colors"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.223-4.857-.026-3.039 2.48-4.5 2.597-4.571-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/></svg>
                                <span className="text-[11px] font-bold text-accent uppercase tracking-wider">Apple ID</span>
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
