import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from './Button';
import { AppStage } from '../types';

/**
 * Plan gate shown over the AI tool pages for the Configurator plan.
 *
 * The Configurator plan (20 Sep 2026) is the 3D configurator, walkthroughs,
 * projects, saved designs, clients and PDFs, with no AI generation at all.
 * Its subscribers can still open the Render Engine, Line Converter, Weather
 * Lab and Material Studio from the menu - the tools stay visible so the
 * upgrade is a thing they can see rather than a thing they never hear of -
 * and this panel sits over the page to say why the render button is not
 * for them yet.
 *
 * Same shape as BetaGate: rendered OVER the tool rather than replacing it,
 * so the interface is visible behind the panel and the gate reads as an
 * invitation rather than a locked door. The server refuses the render
 * regardless (canUseRenderTools in server.js); this is the explanation, not
 * the lock.
 */
interface PlanGateProps {
    onNavigate: (stage: AppStage) => void;
}

export const PlanGate: React.FC<PlanGateProps> = ({ onNavigate }) => (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white border border-accent/20 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-6">
                <Lock size={22} className="text-amber-600" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">The Hub feature</p>
            <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">AI rendering is part of The Hub</h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-8">
                Your Configurator plan covers the full 3D configurator, walkthroughs, projects and PDFs.
                The Render Engine, material close-ups, Line Converter, Weather Lab and 4K enhancement
                come with The Hub, along with 250 renders a month.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => onNavigate(AppStage.PRICING)}>See The Hub</Button>
                <button
                    onClick={() => onNavigate(AppStage.DESIGNER)}
                    className="text-sm text-slate-500 hover:text-accent transition-colors px-3 py-2"
                >
                    Back to the configurator
                </button>
            </div>
        </div>
    </div>
);
