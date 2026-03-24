import React, { useEffect, useState } from 'react';
import { getHistory, clearHistory } from '../services/historyService';
import { HistoryItem, AppStage } from '../types';
import { Clock, Trash2, AlertTriangle } from 'lucide-react';

/** Returns a formatted HH:MM:SS string for time remaining until next midnight */
function getTimeUntilMidnight(): string {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const diff = Math.max(0, midnight.getTime() - now.getTime());
    const h = Math.floor(diff / 3_600_000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3_600_000) / 60_000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60_000) / 1_000).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function useMidnightCountdown() {
    const [countdown, setCountdown] = useState(getTimeUntilMidnight);
    useEffect(() => {
        const id = setInterval(() => setCountdown(getTimeUntilMidnight()), 1000);
        return () => clearInterval(id);
    }, []);
    return countdown;
}

interface HistoryFooterProps {
    currentStage: AppStage;
    onLoadHistoryItem: (item: HistoryItem) => void;
}

export const HistoryFooter: React.FC<HistoryFooterProps> = ({ currentStage, onLoadHistoryItem }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
    const countdown = useMidnightCountdown();

    const loadHistory = async () => {
        const data = await getHistory();
        // Only show history for the current stage
        const filteredData = data.filter(item => item.stage === currentStage);
        setHistory(filteredData);

        // Generate Object URLs for history images
        const newUrls: Record<string, string> = {};
        for (const item of filteredData) {
            if (item.image && !item.image.startsWith('blob:')) {
                try {
                    const byteCharacters = atob(item.image);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/jpeg' });
                    newUrls[item.id] = URL.createObjectURL(blob);
                } catch (e) {
                    console.error('Failed to create Object URL for history item', e);
                }
            }
        }
        setBlobUrls(prev => {
            Object.values(prev).forEach(URL.revokeObjectURL);
            return newUrls;
        });
    };

    useEffect(() => {
        loadHistory();
    }, [currentStage]); // Reload when switching stages

    // Cleanup on unmount or URL change
    useEffect(() => {
        return () => {
            Object.values(blobUrls).forEach(URL.revokeObjectURL);
        };
    }, [blobUrls]);

    // Expose a global event listener to refresh history when an item is saved
    useEffect(() => {
        const handleHistoryUpdate = () => {
            loadHistory();
        };
        window.addEventListener('aiarchviz-history-updated', handleHistoryUpdate);
        return () => window.removeEventListener('aiarchviz-history-updated', handleHistoryUpdate);
    }, [currentStage]);

    const handleClear = async () => {
        if (confirm(`Are you sure you want to clear all iterations for ${formatStageName(currentStage)}?`)) {
            // We need to fetch ALL history, remove the ones for currentStage, and save back
            const allHistory = await getHistory();
            const remainingHistory = allHistory.filter(item => item.stage !== currentStage);
            
            // Re-use logic from historyService by directly setting the IDB key, 
            // but since clearHistory only clears EVERYTHING, we'll need to manually set it 
            // or just rely on clearHistory() clearing everything. The user prompt implied just clearing locally.
            // Let's import 'set' from 'idb-keyval' directly to manage partial clearing if needed,
            // or we just clear the local state to fake it for the session.
            // Actually, we can import `set` here to mutate the DB correctly.
            import('idb-keyval').then(({ set }) => {
                set('aiarchviz_history', remainingHistory);
                setHistory([]);
                setBlobUrls(prev => {
                    Object.values(prev).forEach(URL.revokeObjectURL);
                    return {};
                });
            });
        }
    };

    const getImageUrl = (item: HistoryItem) => {
        return blobUrls[item.id] || `data:image/jpeg;base64,${item.image}`;
    };

    if (history.length === 0) {
        return null; // Don't show the footer if there's no history for this tool
    }

    return (
        <div className="w-full mt-6 bg-surface/40 border-t border-border rounded-b-3xl p-4 animate-in slide-in-from-bottom-5 duration-500">
            <div className="flex items-center justify-between mb-3 px-2">
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                    <Clock size={16} className="text-accent" /> Recent Iterations ({history.length})
                </h3>
                <button onClick={handleClear} className="text-xs text-secondary hover:text-red-400 transition-colors flex items-center gap-1">
                    <Trash2 size={12} /> Clear
                </button>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar no-scroll-arrows">
                {history.map((item) => (
                    <div
                        key={item.id}
                        className="flex-shrink-0 w-48 group relative bg-surface-highlight rounded-xl border border-white/5 overflow-hidden shadow-lg hover:border-accent/40 transition-all duration-300 cursor-pointer"
                        onClick={() => onLoadHistoryItem(item)}
                    >
                        <div className="aspect-video relative overflow-hidden bg-black">
                            <img src={getImageUrl(item)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" alt="Iteration" />
                            <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded shadow text-[9px] text-zinc-300 border border-white/10">
                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div className="p-2">
                            <p className="text-[10px] text-secondary line-clamp-2 leading-tight">
                                {item.prompt || 'No prompt provided'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Midnight reset warning */}
            <div className="mt-3 px-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-400/90">
                    <AlertTriangle size={13} className="shrink-0" />
                    <p className="text-[10px] leading-tight">
                        Your renders reset at midnight. Make sure to download anything you need before then.
                    </p>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0 tabular-nums">{countdown}</span>
            </div>
        </div>
    );
};

function formatStageName(stage: AppStage): string {
    switch (stage) {
        case AppStage.RENDER_ENGINE: return 'Render';
        case AppStage.EDITOR: return 'Refinement Studio';
        case AppStage.WEATHER_LAB: return 'Weather';
        case AppStage.LINE_CONVERT: return 'Line Art';
        case AppStage.MATERIAL_STUDIO: return 'Material Studio';
        default: return stage;
    }
}
