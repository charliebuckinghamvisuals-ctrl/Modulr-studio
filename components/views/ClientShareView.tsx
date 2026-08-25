import React, { useEffect, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

/**
 * The page a HOMEOWNER sees when their builder texts them a share link.
 *
 * Completely public: no auth, no app chrome, no nav - just the project's
 * renders presented like a mini proposal. Reached via /share/<token>, which
 * App.tsx routes here before any sign-in or beta gating. The footer credit
 * is deliberate: every shared project puts Modulr in front of a homeowner
 * who is, by definition, buying a garden building right now.
 */
interface ShareData {
    name: string;
    estimateValue: number | null;
    images: { url: string; name: string; kind: string }[];
}

export const ClientShareView: React.FC<{ token: string }> = ({ token }) => {
    const [data, setData] = useState<ShareData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hero, setHero] = useState(0);

    useEffect(() => {
        fetch(`/api/share/${encodeURIComponent(token)}`)
            .then(async r => {
                const body = await r.json();
                if (!r.ok) throw new Error(body?.error || 'This link is not valid.');
                setData(body);
            })
            .catch(e => setError(e.message || 'This link is not valid.'));
    }, [token]);

    if (error) {
        return (
            <div className="min-h-screen bg-[#f7f8f6] flex flex-col items-center justify-center p-8 text-center">
                <ImageOff size={40} className="text-slate-300 mb-4" />
                <h1 className="text-xl font-bold text-slate-700 mb-2">This link isn&rsquo;t available</h1>
                <p className="text-sm text-slate-500 max-w-sm">{error} If you were sent this link, ask the sender to share it again.</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="min-h-screen bg-[#f7f8f6] flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-slate-400" />
            </div>
        );
    }

    const heroImg = data.images[hero];

    return (
        <div className="min-h-screen bg-[#f7f8f6]">
            <div className="max-w-4xl mx-auto px-4 py-10 md:py-16">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Design proposal</p>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight mb-8">{data.name}</h1>

                {heroImg ? (
                    <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm mb-4">
                        <img src={heroImg.url} alt={heroImg.name} className="w-full h-auto" />
                    </div>
                ) : (
                    <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-slate-400 mb-4">
                        No visuals have been added to this proposal yet.
                    </div>
                )}

                {data.images.length > 1 && (
                    <div className="flex gap-3 overflow-x-auto pb-2 mb-8">
                        {data.images.map((img, i) => (
                            <button
                                key={i}
                                onClick={() => setHero(i)}
                                className={`shrink-0 w-28 h-20 rounded-xl overflow-hidden border-2 transition-colors ${i === hero ? 'border-[#405a56]' : 'border-transparent opacity-70 hover:opacity-100'}`}
                            >
                                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                {typeof data.estimateValue === 'number' && data.estimateValue > 0 && (
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 flex items-baseline justify-between gap-4 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Estimated price</span>
                        <span className="text-3xl font-bold text-slate-800">&pound;{data.estimateValue.toLocaleString('en-GB')}</span>
                    </div>
                )}

                <p className="text-center text-[11px] text-slate-400 mt-12">
                    Visuals created with{' '}
                    <a href="https://www.modulrstudio.co.uk" className="font-semibold text-[#405a56] hover:underline" target="_blank" rel="noopener noreferrer">
                        Modulr Studio
                    </a>
                </p>
            </div>
        </div>
    );
};
