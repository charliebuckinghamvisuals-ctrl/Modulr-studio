import React, { ReactNode } from 'react';
import { Moon, Sun, Monitor, Image as ImageIcon, Sparkles, Wand2, Layers, Download, CheckCircle2, History, AlertCircle, Trash2, Maximize2, X, Zap, Hexagon, Grid, Palette, Info, PoundSterling, BookOpen, Coins, ChevronDown, User, Settings } from 'lucide-react';
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

export const AppShell: React.FC<AppShellProps> = ({ children, activeStage, onNavigate, onReset, headerActions }) => {
  const { user } = useAuth();
  const { credits, plan, loading: creditsLoading } = useCredits();
  const [isAboutDropdownOpen, setIsAboutDropdownOpen] = React.useState(false);
  React.useEffect(() => {
    // Enforce light mode on mount by explicitly removing any dark class
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  const toolItems = [
    { id: AppStage.LINE_CONVERT, icon: <Layers size={16} />, label: 'Line Converter' },
    { id: AppStage.RENDER_ENGINE, icon: <ImageIcon size={16} />, label: 'Render Engine' },
    { id: AppStage.EDITOR, icon: <Palette size={16} />, label: 'Refinement Studio' },
    { id: AppStage.MATERIAL_STUDIO, icon: <Grid size={16} />, label: 'Material Studio' },
  ];

  const infoItems = [
    { id: AppStage.HOME, icon: <Hexagon size={16} />, label: 'Home' },
    { id: AppStage.GALLERY, icon: <ImageIcon size={16} />, label: 'Gallery' },
    { id: AppStage.GUIDE, icon: <BookOpen size={16} />, label: 'Guide' },
    { id: AppStage.PRICING, icon: <Coins size={16} />, label: 'Pricing' },
    { id: AppStage.ABOUT, icon: <Info size={16} />, label: 'About' },
    { id: AppStage.ACCOUNT, icon: <Settings size={16} />, label: 'Account Dashboard' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#ffffff] to-[#e2e8f0] text-primary flex flex-col font-sans selection:bg-accent selection:text-white">

      {/* Premium Header */}
      <header className="h-24 border-b border-white/5 flex items-center justify-between px-8 bg-accent sticky top-0 z-50 text-white">

        {/* Logo Area */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => onNavigate(AppStage.HOME)}
        >
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-48 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
        </div>

        {/* Desktop Tools Navigation - Absolutely Centered */}
        <nav className="hidden lg:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2 p-1.5 rounded-full border-none">
          {toolItems.map(item => {
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 relative overflow-hidden whitespace-nowrap ${isActive
                  ? 'text-slate-900 bg-white/60'
                  : 'text-white hover:bg-white/10'
                  }`}
              >
                <span className="relative z-10 shrink-0">{item.icon}</span>
                <span className="relative z-10 whitespace-nowrap">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 relative">
          {/* Desktop Info Dropdown */}
          <div 
            className="hidden lg:block relative"
            onMouseEnter={() => setIsAboutDropdownOpen(true)}
            onMouseLeave={() => setIsAboutDropdownOpen(false)}
          >
            <button
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 ${
                infoItems.some(item => activeStage === item.id)
                  ? 'text-slate-900 bg-white/60'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <Info size={16} />
              <span>About</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${isAboutDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <div className={`absolute right-0 top-full pt-2 w-56 transition-all duration-300 z-[60] origin-top-right ${
              isAboutDropdownOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'
            }`}>
              <div className="p-2 rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col gap-1">
                {infoItems.map(item => {
                const isActive = activeStage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      setIsAboutDropdownOpen(false);
                    }}
                    className={`px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] rounded-xl flex items-center gap-3 transition-all duration-300 text-left ${
                      isActive
                        ? 'bg-accent text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
              </div>
            </div>
          </div>
          
          {/* Credit Balance Badge */}
          {user && !creditsLoading && credits !== null && (
            <div 
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mr-2 cursor-pointer hover:bg-white/20 transition-all"
              onClick={() => onNavigate(AppStage.ACCOUNT)}
            >
              <Coins size={14} className="text-yellow-400" />
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                {credits.toLocaleString()} <span className="opacity-60">Credits</span>
              </span>
            </div>
          )}
          
          {/* Sign In / Account Button */}
          {user ? (
            <button
              onClick={() => onNavigate(AppStage.ACCOUNT)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 relative overflow-hidden whitespace-nowrap hidden lg:flex ${activeStage === AppStage.ACCOUNT
                ? 'bg-accent text-white'
                : 'text-slate-900 bg-white/80 hover:bg-white'
                }`}
            >
              <Settings size={16} />
              <span className="relative z-10 whitespace-nowrap font-bold">{user.displayName || 'Account'}</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate(AppStage.AUTH)}
              className={`px-4 py-2.5 text-xs font-light uppercase tracking-[0.2em] rounded-full flex items-center gap-2 transition-all duration-300 relative overflow-hidden whitespace-nowrap hidden lg:flex ${activeStage === AppStage.AUTH
                ? 'text-slate-900 bg-white/60'
                : 'text-white hover:bg-white/10'
                }`}
            >
              <User size={16} />
              <span className="relative z-10 whitespace-nowrap underline underline-offset-4 decoration-white/20">Sign In</span>
            </button>
          )}

          {headerActions}
          

          {onReset && activeStage !== AppStage.HOME && activeStage !== AppStage.PRICING && activeStage !== AppStage.ABOUT && activeStage !== AppStage.GALLERY && (
            <button
              onClick={onReset}
              className="group flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors ml-2"
            >
              <span className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                <Sparkles size={14} />
              </span>
              Start Over
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-h-screen">
        {children}
      </main>

      {/* Global Footer */}
      <footer className="w-full pt-40 pb-12 px-8 border-t border-border bg-white flex items-center justify-between text-xs text-secondary shrink-0 z-50">
        <div className="flex-[1] flex items-center gap-4">
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-36 w-auto object-contain" />
        </div>

        <div className="flex-[1] flex flex-col items-center gap-3">
          <p className="text-[10px] text-accent/60 font-montserrat tracking-wide">Created by NAPC Ltd &nbsp;|&nbsp; 01285 283 200 &nbsp;|&nbsp; info@napc.uk</p>
          <img src="/napc-logo.png" alt="NAPC Logo" className="h-20 object-contain" />
        </div>

        <div className="flex-[1] flex justify-end items-center text-accent/60 font-bold uppercase tracking-widest text-[10px]">
          v3.2
        </div>
      </footer>
    </div>
  );
};