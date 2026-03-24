import React, { ReactNode } from 'react';
import { Moon, Sun, Monitor, Image as ImageIcon, Sparkles, Wand2, Layers, Download, CheckCircle2, History, AlertCircle, Trash2, Maximize2, X, Zap, Hexagon, Grid, Palette, Info, PoundSterling } from 'lucide-react';
import { AppStage } from '../types';

interface AppShellProps {
  children: ReactNode;
  activeStage: AppStage;
  onNavigate: (stage: AppStage) => void;
  onReset?: () => void;
  headerActions?: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeStage, onNavigate, onReset, headerActions }) => {
  React.useEffect(() => {
    // Enforce light mode on mount by explicitly removing any dark class
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  const navItems = [
    { id: AppStage.MATERIAL_STUDIO, icon: <Grid size={16} />, label: 'Material Studio' },
    { id: AppStage.LINE_CONVERT, icon: <Layers size={16} />, label: 'Line Converter' },
    { id: AppStage.RENDER_ENGINE, icon: <ImageIcon size={16} />, label: 'Render Engine' },
    { id: AppStage.EDITOR, icon: <Palette size={16} />, label: 'Refinement Studio' },
    { id: AppStage.ABOUT, icon: <Info size={16} />, label: 'About' },
  ];

  return (
    <div className="min-h-screen bg-background text-primary flex flex-col font-sans selection:bg-accent selection:text-white">

      {/* Premium Header */}
      <header className="h-24 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">

        {/* Logo Area */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => onNavigate(AppStage.HOME)}
        >
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
        </div>

        {/* Desktop Navigation - Absolutely Centered */}
        <nav className="hidden lg:flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          {navItems.map(item => {
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`px-4 py-2 text-sm rounded-xl flex items-center gap-2 transition-all duration-300 relative overflow-hidden ${isActive
                  ? 'text-primary bg-primary/5 border border-primary/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                  : 'text-secondary hover:text-primary hover:bg-primary/5 border border-transparent'
                  }`}
              >
                {isActive && <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent opacity-50 pointer-events-none" />}
                <span className={`relative z-10 ${isActive ? 'text-accent' : ''}`}>{item.icon}</span>
                <span className="relative z-10 font-medium tracking-wide">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-6">


          {headerActions}
          <button
            onClick={() => onNavigate(AppStage.PRICING)}
            className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-accent/10 to-accent/20 border border-accent/20 hover:border-accent hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all cursor-pointer"
          >
            <PoundSterling size={14} className="text-accent" />
            <span className="text-xs font-bold tracking-widest text-primary uppercase">Pricing</span>
          </button>

          {onReset && activeStage !== AppStage.HOME && activeStage !== AppStage.PRICING && activeStage !== AppStage.ABOUT && (
            <button
              onClick={onReset}
              className="group flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
            >
              <span className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center group-hover:border-accent/50 group-hover:bg-accent/10 transition-all">
                <Sparkles size={14} />
              </span>
              Start Over
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {children}
      </main>

      {/* Global Footer */}
      <footer className="w-full py-4 px-8 border-t border-border bg-white flex items-center justify-between text-xs text-secondary shrink-0 z-50">
        <div className="flex-[1] flex items-center">
          <img src="/napc-logo.png" alt="NAPC Logo" className="h-28 object-contain" />
        </div>

        <div className="flex-[2] flex flex-col items-center gap-1">
          <p className="text-[10px] text-slate-400 font-montserrat tracking-wide">Created by NAPC Ltd &nbsp;|&nbsp; 01285 283 200 &nbsp;|&nbsp; info@napc.uk</p>
          <button 
            onClick={() => onNavigate(AppStage.ABOUT)}
            className="text-[10px] font-bold text-accent/80 hover:text-accent uppercase tracking-wider transition-colors"
          >
            About Modulr Studio
          </button>
        </div>

        <div className="flex-[1] flex justify-end items-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
          v3.2
        </div>
      </footer>
    </div>
  );
};