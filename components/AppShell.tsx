import React, { ReactNode } from 'react';
import { Moon, Sun, Monitor, Image as ImageIcon, Sparkles, Wand2, Layers, Download, CheckCircle2, History, AlertCircle, Trash2, Maximize2, X, Zap, Hexagon, Grid, Palette, Info, PoundSterling, BookOpen } from 'lucide-react';
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
    { id: AppStage.LINE_CONVERT, icon: <Layers size={16} />, label: 'Line Converter' },
    { id: AppStage.RENDER_ENGINE, icon: <ImageIcon size={16} />, label: 'Render Engine' },
    { id: AppStage.EDITOR, icon: <Palette size={16} />, label: 'Refinement Studio' },
    { id: AppStage.MATERIAL_STUDIO, icon: <Grid size={16} />, label: 'Material Studio' },
    { id: AppStage.GUIDE, icon: <BookOpen size={16} />, label: 'Guide' },
    { id: AppStage.ABOUT, icon: <Info size={16} />, label: 'About' },
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
          <img src="/Logo.png" alt="Modulr Studio Logo" className="h-36 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
        </div>

        {/* Desktop Navigation - Absolutely Centered */}
        <nav className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2 p-1.5 rounded-full border-none">
          {navItems.map(item => {
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-tight rounded-full flex items-center gap-2 transition-all duration-300 relative overflow-hidden shadow-sm ${isActive
                  ? 'text-slate-900 bg-white/60 shadow-white/10 border border-white/20'
                  : 'text-white hover:bg-white/10'
                  }`}
              >
                <span className="relative z-10">{item.icon}</span>
                <span className="relative z-10">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-6">


          {headerActions}
          <button
            onClick={() => onNavigate(AppStage.PRICING)}
            className="hidden lg:flex items-center justify-center gap-2 px-5 py-2.5 rounded-full hover:bg-white/10 transition-all cursor-pointer min-w-[120px] border-none"
          >
            <span className="text-xs font-bold tracking-widest text-white uppercase mt-[2px]">Pricing</span>
          </button>

          {onReset && activeStage !== AppStage.HOME && activeStage !== AppStage.PRICING && activeStage !== AppStage.ABOUT && (
            <button
              onClick={onReset}
              className="group flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
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