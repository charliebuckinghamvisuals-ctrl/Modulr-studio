import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Mail, KeyRound, Loader2, ArrowRight, Sparkles, MailCheck, RefreshCw, UserRound } from 'lucide-react';
import { auth } from '../services/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    signOut,
    User,
} from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

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
 *
 * It has three states, because the person in front of it can be in three
 * different situations:
 *
 *   1. Signed out            -> email, password and a code.
 *   2. Signed in, unverified -> nothing to fill in; go and click the link.
 *   3. Signed in, verified   -> the code alone. Asking someone who is already
 *                               authenticated to retype their own address and
 *                               password is pure friction, and it invites them
 *                               to typo their way into a second account.
 */

const redeemBetaCode = async (user: User, code: string): Promise<{ ok: boolean; error?: string }> => {
    try {
        const token = await user.getIdToken();
        const res = await fetch('/api/beta/redeem', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim() }),
        });
        if (res.ok) return { ok: true };
        // Surface the server's wording - it distinguishes "not valid" from
        // "already used", and those need different reactions from the user.
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body?.error || 'That access code is not valid.' };
    } catch (e) {
        console.error('Beta redemption failed', e);
        return { ok: false, error: 'Could not reach the server. Please try again.' };
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

const field =
    'w-full bg-[#f8fafc] border border-accent/20 focus:border-accent focus:ring-2 focus:ring-accent/20 rounded-xl pl-10 pr-4 py-3 text-sm text-accent outline-none transition-all placeholder:text-slate-400';

const primaryButton =
    'w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50';

/** The frosted panel every state renders inside. */
const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
        <div className="bg-white border border-accent/20 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {children}
        </div>
    </div>
);

const BetaBadge = () => (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider">
        <Sparkles size={14} />
        Private Beta
    </div>
);

export const BetaGate: React.FC<BetaGateProps> = ({ onGranted }) => {
    const { user, loading: authLoading } = useAuth();

    const [mode, setMode] = useState<'signup' | 'signin'>('signup');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Mirrored into state rather than read from `user.emailVerified` directly.
     * `user.reload()` mutates the Firebase user object in place, which React
     * has no way to notice - without this, confirming your email would leave
     * the panel sitting there unchanged.
     */
    const [verified, setVerified] = useState(false);
    useEffect(() => { setVerified(user?.emailVerified === true); }, [user]);

    const finish = () => {
        toast.success('Welcome to the beta');
        onGranted?.();
        // The beta flag lives in the ID token, and much of the app reads its
        // entitlements once on mount. A reload is the simplest way to be sure
        // every part of the UI sees the new claim.
        setTimeout(() => window.location.reload(), 600);
    };

    /**
     * Outcome of the last send attempt, shown ON THE PANEL.
     *
     * A silent failure here is indistinguishable from a slow inbox, and that
     * ambiguity costs far more than an ugly error message: you cannot tell
     * "Firebase refused" from "check your spam folder", so you wait for a mail
     * that is never coming. The Firebase error code is deliberately included -
     * auth/unauthorized-continue-uri and auth/too-many-requests need completely
     * different fixes, and the code is the fastest way to tell which you have.
     */
    const [sendState, setSendState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; detail?: string }>({ status: 'idle' });

    /** Send the confirmation mail, tolerating Firebase's rate limit. */
    const sendVerification = async (target: User, quiet = false) => {
        setSendState({ status: 'sending' });
        try {
            await sendEmailVerification(target);
            setSendState({ status: 'sent' });
            if (!quiet) toast.success('Confirmation email sent');
        } catch (e: any) {
            const code = e?.code || 'unknown';
            setSendState({ status: 'error', detail: `${code}${e?.message ? ` - ${e.message}` : ''}` });
            if (code === 'auth/too-many-requests') {
                toast.error('Too many emails requested. Please wait a few minutes.');
            } else if (!quiet) {
                toast.error('Could not send the confirmation email.');
            }
            console.error('Verification email failed', e);
        }
    };

    /**
     * Send the confirmation mail on ARRIVING at the unverified panel, not only
     * on signup.
     *
     * Signing in to an account that already existed lands straight here, and
     * nothing had sent an email - while the panel said "we have sent a
     * confirmation link", which is how someone ends up waiting for a message
     * that was never going to come. Anyone who made an account before email
     * confirmation existed hits exactly this path.
     *
     * The ref guards against React re-runs and StrictMode's double effect;
     * Firebase rate-limits the address anyway, but there is no reason to lean
     * on that.
     */
    const autoSentTo = useRef<string | null>(null);
    useEffect(() => {
        if (!user || verified) return;
        if (autoSentTo.current === user.uid) return;
        autoSentTo.current = user.uid;
        sendVerification(user, true);
    }, [user, verified]);

    // ── State 1: signed out ──────────────────────────────────────────────────
    const handleSignedOutSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Please enter both email and password');
            return;
        }
        if (mode === 'signup' && !name.trim()) {
            toast.error('Please enter your name');
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

                /**
                 * Set the display name BEFORE the verification mail goes out.
                 *
                 * Firebase's template opens "Hello %DISPLAY_NAME%," and that
                 * placeholder reads the account's displayName at SEND time.
                 * Signup only ever collected an email and a password, so the
                 * field was empty and every new tester was greeted "Hello ," -
                 * in a message that already lands in spam, which reads as
                 * broken rather than merely unpersonalised.
                 *
                 * The body of that template is locked by Firebase, so this is
                 * the only end we can fix.
                 */
                if (name.trim()) {
                    try {
                        await updateProfile(cred.user, { displayName: name.trim() });
                    } catch (e) {
                        // Not worth failing a signup over a greeting.
                        console.error('Could not set display name', e);
                    }
                }

                // Validate the code BEFORE sending any mail, so a bad code
                // neither leaves an orphan account nor emails a stranger.
                const result = await redeemBetaCode(cred.user, code);
                if (!result.ok) {
                    try { await cred.user.delete(); } catch { await signOut(auth); }
                    toast.error(result.error!);
                    return;
                }

                await cred.user.getIdToken(true); // pick up the new claim
                // Claim it before sending, so the arrival effect does not fire a
                // second identical email at someone who just signed up.
                autoSentTo.current = cred.user.uid;
                await sendVerification(cred.user, true);
                setVerified(false);
                toast.success('Account created - check your email to confirm it');
            } else {
                const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
                if (await serverGrantsAccess(cred.user)) finish();
                // Otherwise the effect above re-renders this component into
                // state 2 or 3, which is where they can finish getting in.
            }
        } catch (error: any) {
            if (error?.code === 'auth/email-already-in-use') {
                toast.error('That account already exists - switch to Sign In.');
                setMode('signin');
            } else if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
                toast.error('Incorrect email or password.');
            } else if (error?.code === 'auth/invalid-email') {
                toast.error('That does not look like a valid email address.');
            } else {
                toast.error(error?.message || 'Something went wrong. Please try again.');
            }
            console.error('Beta gate error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // ── State 3: signed in and verified, needs a code ────────────────────────
    const handleCodeOnlySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!code.trim()) {
            toast.error('Please enter your beta access code');
            return;
        }
        setIsLoading(true);
        try {
            const result = await redeemBetaCode(user, code);
            if (!result.ok) {
                toast.error(result.error!);
                return;
            }
            await user.getIdToken(true);
            finish();
        } finally {
            setIsLoading(false);
        }
    };

    // ── State 2: signed in, email not confirmed ──────────────────────────────
    const handleCheckVerified = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await user.reload();
            if (!user.emailVerified) {
                toast.error('Not confirmed yet - open the link in your inbox, then try again.');
                return;
            }
            setVerified(true);
            // email_verified lives in the token, so it must be reminted before
            // the server will accept the account.
            await user.getIdToken(true);
            if (await serverGrantsAccess(user)) {
                finish();
            } else {
                toast.success('Email confirmed - enter your access code to finish.');
            }
        } catch (e) {
            console.error('Verification check failed', e);
            toast.error('Could not check your account. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading) {
        return (
            <Panel>
                <div className="flex items-center justify-center gap-3 text-slate-500 py-8">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm">Checking your account…</span>
                </div>
            </Panel>
        );
    }

    if (user && !verified) {
        return (
            <Panel>
                <div className="space-y-2">
                    <BetaBadge />
                    <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                        <MailCheck size={26} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Confirm your email</h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        We have sent a confirmation link to{' '}
                        <span className="font-semibold text-accent">{user.email}</span>. Open it, then
                        come back and press the button below. Beta seats are limited, so we confirm
                        every address is real before opening the studio.
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        It comes from <span className="font-mono text-slate-500">noreply@modulr-studio.firebaseapp.com</span>,
                        which often lands in spam or promotions - search for that address.
                    </p>

                    {sendState.status === 'sending' && (
                        <p className="text-[11px] text-slate-400">Sending…</p>
                    )}
                    {sendState.status === 'sent' && (
                        <p className="text-[11px] text-emerald-600 font-semibold">
                            Firebase accepted the send. If nothing arrives it is a delivery problem, not a sending one.
                        </p>
                    )}
                    {sendState.status === 'error' && (
                        <div className="text-left bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                            <p className="text-[11px] text-red-700 font-bold">The email could not be sent.</p>
                            <p className="text-[10px] text-red-600 font-mono break-all">{sendState.detail}</p>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <button onClick={handleCheckVerified} disabled={isLoading} className={primaryButton}>
                        {isLoading ? (
                            <><Loader2 size={16} className="animate-spin" /><span>Checking…</span></>
                        ) : (
                            <><span>I have confirmed my email</span><ArrowRight size={16} /></>
                        )}
                    </button>
                    <button
                        onClick={() => sendVerification(user)}
                        disabled={isLoading}
                        className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-accent font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw size={14} />
                        Resend the email
                    </button>
                </div>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    Nothing arrived? Check your spam folder, or{' '}
                    <button onClick={() => signOut(auth)} className="text-accent font-semibold underline underline-offset-2">
                        sign out and try another address
                    </button>
                    .
                </p>
            </Panel>
        );
    }

    if (user && verified) {
        return (
            <Panel>
                <div className="space-y-2">
                    <BetaBadge />
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Enter your access code</h2>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        You are signed in as{' '}
                        <span className="font-semibold text-accent">{user.email}</span>. The studio
                        tools are in private beta - add your code to unlock them.
                    </p>
                </div>

                <form onSubmit={handleCodeOnlySubmit} className="space-y-4">
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">
                            Beta Access Code
                        </label>
                        <div className="relative">
                            <ShieldCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                                placeholder="MODULR-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false}
                                autoFocus className={`${field} font-mono tracking-wider`} />
                        </div>
                    </div>

                    <button type="submit" disabled={isLoading} className={primaryButton}>
                        {isLoading ? (
                            <><Loader2 size={16} className="animate-spin" /><span>Please wait…</span></>
                        ) : (
                            <><span>Unlock the Studio</span><ArrowRight size={16} /></>
                        )}
                    </button>
                </form>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    No access code? Email{' '}
                    <a href="mailto:info@napc.uk" className="text-accent font-semibold underline underline-offset-2">
                        info@napc.uk
                    </a>{' '}
                    to request one, or{' '}
                    <button onClick={() => signOut(auth)} className="text-accent font-semibold underline underline-offset-2">
                        sign out
                    </button>
                    .
                </p>
            </Panel>
        );
    }

    return (
        <Panel>
            <div className="space-y-2">
                <BetaBadge />
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

            <form onSubmit={handleSignedOutSubmit} className="space-y-4">
                {mode === 'signup' && (
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">Your Name</label>
                        <div className="relative">
                            <UserRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Jane Smith" autoComplete="name" className={field} />
                        </div>
                    </div>
                )}

                <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">Email</label>
                    <div className="relative">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="you@company.co.uk" required className={field} />
                    </div>
                    {mode === 'signup' && (
                        <p className="text-[10px] text-slate-400 pl-1">
                            Use a real address - we send a confirmation link you must open.
                        </p>
                    )}
                </div>

                <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">Password</label>
                    <div className="relative">
                        <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••" required className={field} />
                    </div>
                </div>

                {mode === 'signup' && (
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-secondary pl-1">
                            Beta Access Code
                        </label>
                        <div className="relative">
                            <ShieldCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
                            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                                placeholder="MODULR-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false}
                                className={`${field} font-mono tracking-wider`} />
                        </div>
                    </div>
                )}

                <button type="submit" disabled={isLoading} className={primaryButton}>
                    {isLoading ? (
                        <><Loader2 size={16} className="animate-spin" /><span>Please wait…</span></>
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
        </Panel>
    );
};
