import React, { ReactNode } from 'react';
import { Monitor, Image as ImageIcon, Sparkles, Layers, X, Zap, Hexagon, Grid, Palette, BookOpen, Coins, ChevronDown, User, Settings, Menu, PenTool, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AppStage } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useCredits } from '../hooks/useCredits';

interface AppShellProps {
  children: ReactNode;
  activeStage: AppStage;
  onNavigate: (stage: AppStage) => void;
  onReset?: () => void;
  headerActions?: ReactNode;
}

// Tool pages that require a full desktop - blocked on mobile
const DESKTOP_ONLY_STAGES = new Set([
  AppStage.RENDER_ENGINE,
  AppStage.LINE_CONVERT,
  AppStage.EDITOR,
  AppStage.MATERIAL_STUDIO,
  AppStage.STUDIO,
  AppStage.UPLOAD,
  AppStage.WEATHER_LAB,
  AppStage.ANIMATION_STUDIO,
]);

// ─── Desktop-Only Screen shown on mobile for tool pages ───────────────────────
const DesktopOnlyScreen: React.FC<{ onNavigate: (stage: AppStage) => void }> = ({ onNavigate }) => (
  <div className="flex flex-col items-center justify-center min-h-[80vh] px-8 py-16 text-center">
    <div className="w-24 h-24 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-8 shadow-xl">
      <Monitor size={40} className="text-accent" />
    </div>
    <h1 className="text-2xl font-bold text-accent tracking-tight mb-3 leading-tight">
      Desktop Required
    </h1>
    <p className="text-sm text-secondary leading-relaxed mb-8 max-w-xs">
      Modulr Studio's render tools are built for a full desktop experience. Please open this page on your laptop or PC to access them.
    </p>
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold uppercase tracking-widest mb-10">
      <Sparkles size={14} />
      Mobile version coming soon
    </div>
    <div className="w-full max-w-xs bg-white rounded-2xl border border-border shadow-sm p-5 text-left mb-8">
      <p className="text-[10px] font-bold text-accent/60 uppercase tracking-widest mb-4">Available on mobile now</p>
      <div className="space-y-3">
        {[
          { label: 'Browse the Homepage', stage: AppStage.HOME },
          { label: 'View Pricing Plans', stage: AppStage.PRICING },
          { label: 'Sign Up / Sign In', stage: AppStage.AUTH },
          { label: 'Read the Guide', stage: AppStage.GUIDE },
          { label: 'View Gallery', stage: AppStage.GALLERY },
          { label: 'About Modulr Studio', stage: AppStage.ABOUT },
        ].map(({ label, stage }) => (
          <button
            key={stage}
            onClick={() => onNavigate(stage)}
            className="w-full flex items-center gap-3 text-sm font-semibold text-accent hover:text-accent/70 transition-colors text-left group"
          >
            <span className="w-6 h-6 rounded-lg bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center transition-colors shrink-0">
              <Hexagon size={12} className="text-accent" />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
    <p className="text-[10px] text-secondary/60 font-medium max-w-xs">
      You can still sign up and purchase a plan on mobile - but you'll need a desktop browser to render.
    </p>
  </div>
);

// ─── Main AppShell ─────────────────────────────────────────────────────────────
export const AppShell: React.FC<AppShellProps> = ({ children, activeStage, onNavigate, onReset, headerActions }) => {
  const { user } = useAuth();
  const { credits, plan, loading: creditsLoading, rendersLeft, rendersPerDay, trialDaysLeft, canUseAnimation } = useCredits();
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  // Close mobile menu on navigation
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeStage]);

  const toolItems: Array<{ id: AppStage; label: string; comingSoon?: boolean; locked?: boolean; icon?: React.ReactNode }> = [
    { id: AppStage.DESIGNER, label: '3D Config', comingSoon: true },
    { id: AppStage.RENDER_ENGINE, label: 'Render Engine' },
    { id: AppStage.LINE_CONVERT, label: 'Line Converter' },
    { id: AppStage.WEATHER_LAB, label: 'Weather Lab' },
    { id: AppStage.MATERIAL_STUDIO, label: 'Material Studio' },
    // Shown but badged for accounts without it (beta, tester, free) rather than
    // hidden. It is a headline feature and hiding it entirely would mean beta
    // users never learn the Business plan has it. Clicking through lands on the
    // explanation screen in AnimationStudioView, which is the real gate; the
    // actual enforcement is ANIMATION_PLANS on /api/animation/start.
    // `canUseAnimation` is null until the plan loads - only badge on an explicit
    // false, so a subscriber never sees a lock flash on their own feature.
    { id: AppStage.ANIMATION_STUDIO, label: 'Animation Studio', locked: canUseAnimation === false },
    { id: AppStage.CONTENT_STUDIO, label: 'Content Studio' },
  ];

  // Top-level header items, in display order. Tools is injected between Home
  // and Gallery as a dropdown; everything else is a flat link.
  const navItemsBeforeTools = [
    { id: AppStage.HOME, label: 'Home' },
    { id: AppStage.PROJECTS, label: 'Projects' },
  ];

  const navItemsAfterTools = [
    { id: AppStage.WHY, label: 'Why Modulr' },
    { id: AppStage.GALLERY, label: 'Gallery' },
    { id: AppStage.ANIMATIONS, label: 'Animations' },
    { id: AppStage.PLANNING_CHECKER, label: 'Planning Check' },
    { id: AppStage.GUIDE, label: 'Guide' },
    { id: AppStage.ABOUT, label: 'About' },
    { id: AppStage.PRICING, label: 'Pricing' },
  ];

  // Kept for the mobile menu, which still lists everything in one column.
  const infoItems = [
    ...navItemsBeforeTools,
    ...navItemsAfterTools,
    { id: AppStage.ACCOUNT, label: 'Account Dashboard' },
  ];

  const mobileNavItems = [
    { id: AppStage.HOME, label: 'Home' },
    { id: AppStage.PRICING, label: 'Pricing' },
    { id: AppStage.GUIDE, label: 'Guide' },
    { id: AppStage.GALLERY, label: 'Gallery' },
    { id: AppStage.ANIMATIONS, label: 'Animations' },
    { id: AppStage.ABOUT, label: 'About' },
    ...(user
      ? [{ id: AppStage.ACCOUNT, label: 'Account' }]
      : [{ id: AppStage.AUTH, label: 'Sign In / Sign Up' }]),
  ];

  const isDesktopOnly = DESKTOP_ONLY_STAGES.has(activeStage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#ffffff] to-[#e2e8f0] text-primary flex flex-col font-sans selection:bg-accent selection:text-white">

      {/* ── Header ── */}
      <header className="h-24 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-accent sticky top-0 z-50 text-white gap-4 w-full">

        {/* Logo */}
        <div
          className="flex flex-1 items-center justify-start gap-3 cursor-pointer group"
          onClick={() => onNavigate(AppStage.HOME)}
        >
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-48 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
        </div>

        {/* Desktop Nav - Home · Tools ▾ · Gallery · Guide · About · Pricing.
            Only the tool list is deep enough to need a dropdown; the rest are
            flat so the common destinations are one click away. */}
        <nav className="hidden lg:flex items-center justify-center gap-1 shrink-0">
          {navItemsBeforeTools.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 whitespace-nowrap ${activeStage === item.id ? 'text-slate-900 bg-white/60' : 'text-white hover:bg-white/10'}`}
            >
              {item.label}
            </button>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setIsToolsDropdownOpen(true)}
            onMouseLeave={() => setIsToolsDropdownOpen(false)}
          >
            <button
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 ${toolItems.some(item => activeStage === item.id) ? 'text-slate-900 bg-white/60' : 'text-white hover:bg-white/10'}`}
            >
              <Layers size={16} />
              <span>Tools</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`absolute left-0 top-full pt-2 w-60 transition-all duration-300 z-[60] origin-top-left ${isToolsDropdownOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'}`}>
              <div className="p-2 rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col gap-1">
                {toolItems.map(item => {
                  const isActive = activeStage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        // "Soon" is a label, not a lock. Tools still in
                        // development stay reachable so they can be tested.
                        onNavigate(item.id);
                        setIsToolsDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 transition-colors text-left rounded-lg ${
                        isActive
                          ? 'text-accent bg-slate-50'
                          : 'text-slate-700 hover:text-accent hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.comingSoon && <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">Soon</span>}
                      {item.locked && <Lock size={11} className="text-slate-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {navItemsAfterTools.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 whitespace-nowrap ${activeStage === item.id ? 'text-slate-900 bg-white/60' : 'text-white hover:bg-white/10'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 relative shrink-0">

          {/* Credit Badge - desktop */}
          {user && !creditsLoading && plan === 'free' && rendersLeft !== null && rendersPerDay !== null && (
            <div
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mr-2 cursor-pointer hover:bg-white/20 hover:scale-105 transition-all"
              onClick={() => onNavigate(AppStage.PRICING)}
              title={`Free Trial - ${trialDaysLeft} day(s) remaining`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${rendersLeft === 0 ? 'bg-red-400' : rendersLeft === 1 ? 'bg-amber-400' : 'bg-green-400'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                {rendersLeft}<span className="opacity-50">/{rendersPerDay}</span> <span className="opacity-60">Renders Today</span>
              </span>
            </div>
          )}
          {user && !creditsLoading && plan !== 'free' && credits !== null && (
            <div
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mr-2 cursor-pointer hover:bg-white/20 hover:scale-105 transition-all"
              onClick={() => onNavigate(AppStage.ACCOUNT)}
            >
              <Coins size={14} className="text-yellow-400" />
              {typeof credits === 'number' ? (
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                  {credits.toLocaleString()} <span className="opacity-60">Credits</span>
                </span>
              ) : (
                // Unlimited: the symbol carries the meaning on its own, and the
                // two-line "UNLIMITED CREDITS" pill was the widest thing in an
                // already-crowded header.
                <span className="text-sm font-bold leading-none" title="Unlimited credits" aria-label="Unlimited credits">∞</span>
              )}
            </div>
          )}

          {/* Account / Sign In - desktop */}
          {user ? (
            <button
              onClick={() => onNavigate(AppStage.ACCOUNT)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 relative overflow-hidden whitespace-nowrap hidden lg:flex ${activeStage === AppStage.ACCOUNT ? 'bg-accent text-white' : 'text-slate-900 bg-white/80 hover:bg-white'}`}
            >
              <Settings size={16} />
              <span className="relative z-10 whitespace-nowrap font-bold">{user.displayName || 'Account'}</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate(AppStage.AUTH)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 relative overflow-hidden whitespace-nowrap hidden lg:flex ${activeStage === AppStage.AUTH ? 'text-slate-900 bg-white/60' : 'text-white hover:bg-white/10'}`}
            >
              <User size={16} />
              <span className="relative z-10 whitespace-nowrap underline underline-offset-4 decoration-white/20">Sign In</span>
            </button>
          )}

          {headerActions}

          {onReset && activeStage !== AppStage.HOME && activeStage !== AppStage.PRICING && activeStage !== AppStage.ABOUT && activeStage !== AppStage.GALLERY && (
            <button
              onClick={onReset}
              className="group hidden lg:flex items-center gap-2 text-sm text-white/80 hover:text-white transition-all duration-300 hover:scale-105 ml-2"
            >
              <span className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                <Sparkles size={14} />
              </span>
              Start Over
            </button>
          )}

          {/* ── Mobile Hamburger ── */}
          <button
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all ml-2"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} className="text-white" />
          </button>
        </div>
      </header>

      {/* ── Mobile Floating Menu Button ──
          The header is sticky, but on long pages a reader deep in the content
          reported having to scroll back to the top for the menu. This button
          is fixed to the viewport, so navigation is one thumb-tap away from
          anywhere. Hidden while the drawer is open so it never overlaps it. */}
      {!isMobileMenuOpen && (
        <button
          className="lg:hidden fixed bottom-5 right-5 z-[70] w-12 h-12 rounded-full bg-accent text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] border border-white/20 flex items-center justify-center active:scale-95 transition-transform"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>
      )}

      {/* ── Mobile Drawer Backdrop ── */}
      <div
        className={`lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] transition-all duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* ── Mobile Drawer Panel ── */}
      <div className={`lg:hidden fixed top-0 right-0 h-full w-[80vw] max-w-[320px] bg-white z-[90] shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-6 bg-accent shrink-0">
          <img src="/Logo.png" alt="Modulr Studio" className="h-12 w-auto object-contain" />
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-0.5">Signed in as</p>
            <p className="text-sm font-bold text-accent truncate">{user.displayName || user.email}</p>
            <p className="text-[10px] text-secondary mt-0.5 font-medium capitalize">{plan || 'Free'} Plan</p>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {mobileNavItems.map(item => {
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all ${isActive ? 'text-accent bg-accent/5 rounded-xl' : 'text-slate-600 hover:text-accent hover:bg-slate-50 rounded-xl'}`}
              >
                {item.label}
              </button>
            );
          })}

          {/* Desktop-only tools section */}
          <div className="pt-5 pb-2 px-2">
            <p className="text-[9px] font-bold text-secondary/50 uppercase tracking-[0.2em]">Studio Tools - Desktop Only</p>
          </div>
          {toolItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.comingSoon) {
                  toast('3D Configurator is coming soon!', { icon: '🚀' });
                } else {
                  onNavigate(item.id);
                }
              }}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${item.comingSoon ? 'opacity-50 cursor-not-allowed text-secondary/40' : 'text-secondary/40 hover:bg-slate-50'}`}
            >
              <span className="shrink-0 opacity-40">{item.icon}</span>
              <span className="flex items-center">
                {item.label}
                {item.comingSoon && <span className="text-[8px] font-bold uppercase tracking-wider bg-[#405a56]/10 text-[#405a56] px-1.5 py-0.5 rounded-full ml-2">Soon</span>}
                {item.locked && <Lock size={11} className="text-secondary/40 ml-2 shrink-0" />}
              </span>
              <span className="ml-auto text-[9px] font-bold uppercase bg-slate-100 text-secondary/50 px-2 py-0.5 rounded-full tracking-widest whitespace-nowrap">Desktop</span>
            </button>
          ))}
        </nav>

        {/* Drawer Footer */}
        <div className="px-6 py-5 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-secondary/50 text-center leading-relaxed">
            Render tools require a desktop browser.<br />Sign up &amp; pricing work on mobile.
          </p>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-h-screen">
        {/* Children always render once - no duplicate refs */}
        <div className={`flex-1 flex flex-col ${isDesktopOnly ? 'hidden lg:flex' : 'flex'}`}>
          {children}
        </div>
        {/* On mobile, gate tool pages with the Desktop Required screen */}
        {isDesktopOnly && (
          <div className="block lg:hidden">
            <DesktopOnlyScreen onNavigate={onNavigate} />
          </div>
        )}
      </main>


      {/* ── Footer ── */}
      <footer className="w-full pt-20 md:pt-40 pb-12 px-6 md:px-8 border-t border-border bg-white flex flex-col md:flex-row items-center justify-between text-xs text-secondary shrink-0 z-50 gap-6 md:gap-0">
        <div className="flex-[1] flex items-center justify-center md:justify-start">
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-24 md:h-36 w-auto object-contain" />
        </div>
        <div className="flex-[1] flex flex-col items-center gap-3">
          <p className="text-[10px] text-accent/60 tracking-wide text-center">Created by NAPC Ltd &nbsp;|&nbsp; 01285 283 200 &nbsp;|&nbsp; info@napc.uk</p>
          <img src="/napc-logo.png" alt="NAPC Logo" className="h-16 md:h-20 object-contain" />
        </div>
        <div className="flex-[1] flex justify-center md:justify-end items-center text-accent/60 font-bold uppercase tracking-widest text-[10px]">
          v3.2
        </div>
      </footer>
    </div>
  );
};