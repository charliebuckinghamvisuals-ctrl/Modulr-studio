import React, { useState } from 'react';
import { ShieldCheck, Mail, KeyRound, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { auth } from '../services/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    User,
} from 'firebase/auth';
import { toast } from 'react-hot-toast';

/**
 * Beta gate shown over the tool pages.
 *
 * The whole app used to sit behind a single lock screen, which meant nobody
 * could see what Modulr Studio actually was without an account. Now the
 * marketing pages are open and only the tools - the things that cost money to
 * run - are gated.
 *
 * The gate renders OVER the tool page rather than replacing it, so the
 * interface is visible behind the panel and the beta reads as an invitation
 * rather than a locked door.
 */

const redeemBetaCode = async (user: User, code: string): Promise<boolean> => {
    try {
        const token = await user.getIdToken();
        const res = await fetch('/api/beta/redeem', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim() }),
        });
        return res.ok;
    } catch (e) {
        console.error('Beta redemption failed', e);
        return false;
    }
};

/** The server is the only thing that knows who is allowed in. */
const serverGrantsAccess = async (user: User): Promise<boolean> => {
    try {
        const token = await user.getIdToken();
        const res = await fetch('/api/user/credits', { headers: { Authorization: `Bearer ${token}` } });
        return res.ok;
    } catch {
        return false;
    }
};

interface BetaGateProps {
    /** Called once the account is confirmed to have access. */
    onGranted?: () => void;
}

export const BetaGate: React.FC<BetaGateProps> = ({ onGranted }) => {
    const [mode, setMode] = useState<'signup' | 'signin'>('signup');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const finish = () => {
        toast.success('Welcome to the beta');
        onGranted?.();
        // The beta flag lives in the ID token, and much of the app reads its
        // entitlements once on mount. A reload is the simplest way to be sure
        // every part of the UI sees the new claim.
        setTimeout(() => window.location.reload(), 600);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Please enter both email and password');
            return;
        }
        if (mode === 'signup' && !code.trim()) {
            toast.error('Please enter your beta access code');
            return;
        }
        if (mode === 'signup' && password.length < 8) {
            toast.error('Please choose a password of at least 8 characters');
            return;
        }

        setIsLoading(true);
        try {
            if (mode === 'signup') {
                const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
                const ok = await redeemBetaCode(cred.user, code);
                if (!ok) {
                    // Leave no half-made account behind on a bad code.
                    try { await cred.user.delete(); } catch { await signOut(auth); }
                    toast.error('That access code is not valid.');
                    return;
                }
                await cred.user.getIdToken(true); // pick up the new claim
                finish();
            } else {
                const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

                if (await serverGrantsAccess(cred.user)) {
                    finish();
                    return;
                }

                // An existing account can redeem a code too. Without this an
                // early tester whose email was allowlisted with a typo had no
                // way to fix it themselves.
                if (code.trim()) {
                    const ok = await redeemBetaCode(cred.user, code);
                    if (ok) {
                        await cred.user.getIdToken(true);
                        finish();
                        return;
                    }
                    toast.error('That access code is not valid.');
                } else {
                    toast.error('This account does not have beta access yet. Enter your access code below.');
                }
                await signOut(auth);
            }
        } catch (error: any) {
            if (error?.code === 'auth/email-already-in-use') {
                toast.error('That account already exists - switch to Sign In.');
                setMode('signin');
            } else if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
                toast.error('Incorrect email or password.');
            } else {
                toast.error(error?.message || 'Something went wrong. Please try again.');
            }
            console.error('Beta gate error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const field =
        'w-full bg-[#f8fafc] border border-accent/20 focus:border-accent focus:ring-2 focus:ring-accent/20 rounded-xl pl-10 pr-4 py-3 text-sm text-accent outline-none transition-all placeholder:text-slate-400';

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
            <div className="bg-white border border-accent/20 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">

                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider">
                        <Sparkles size={14} />
                        Private Beta
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                        {mode === 'signup' ? 'Join the Modulr Studio beta' : 'Welcome back'}
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        {mode === 'signup'
                            ? 'The studio tools are in private beta. Enter your access code to start rendering. Everything else on the site is free to browse.'
                            : 'Sign in to your Modulr Studio account.'}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
                    {(['signup', 'signin'] as const).map(m => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                                mode === m ? 'bg-white text-accent shadow-sm' : 'text-slate-500 hover:text-accent'
                            }`}
                        >
                            {m === 'signup' ? 'Join Beta' : 'Sign In'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">Email</label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="you@company.co.uk" required className={field} />
                        </div>
                    </div>

                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">Password</label>
                        <div className="relative">
                            <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••" required className={field} />
                        </div>
                    </div>

                    {/* Shown in both modes. On sign-in it is optional and only
                        used if the account does not already have access, which
                        is how an existing user fixes their own access without
                        anyone editing an allowlist. */}
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">
                            Beta Access Code {mode === 'signin' && <span className="text-slate-400 normal-case">(only if prompted)</span>}
                        </label>
                        <div className="relative">
                            <ShieldCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                                placeholder="MODULR-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false}
                                className={`${field} font-mono tracking-wider`} />
                        </div>
                    </div>

                    <button type="submit" disabled={isLoading}
                        className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                        {isLoading ? (
                            <><Loader2 size={16} className="animate-spin" /><span>Please wait...</span></>
                        ) : (
                            <><span>{mode === 'signup' ? 'Join the Beta' : 'Sign In'}</span><ArrowRight size={16} /></>
                        )}
                    </button>
                </form>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    No access code? Email{' '}
                    <a href="mailto:info@napc.uk" className="text-accent font-semibold underline underline-offset-2">
                        info@napc.uk
                    </a>{' '}
                    to request one.
                </p>
            </div>
        </div>
    );
};
