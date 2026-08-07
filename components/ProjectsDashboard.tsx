import React, { useMemo, useState } from 'react';
import { TrendingUp, Trophy, Target, Timer } from 'lucide-react';
import { Project, ProjectStatus } from '../types';
import {
    RANGE_ORDER, RANGE_SHORT, RangeKey,
    summarise, pipeline, monthlySeries, statusBreakdown,
    formatGBP, formatCompactGBP, niceCeiling,
    MonthPoint,
} from '../services/projectMetrics';

/**
 * Quoted vs won headline for the Projects page.
 *
 * Two series only, both validated against the white card surface for
 * colour-blind separation. Everything else on the page is brand sage, which
 * reads as grey once it becomes a data mark - so the marks get their own two
 * hues and the chrome stays slate.
 */
const SERIES_QUOTED = '#2a78d6';
const SERIES_WON = '#059669';
const GRID = '#e2e8f0';
const AXIS_TEXT = '#94a3b8';

const STATUS_LABELS: Record<ProjectStatus, string> = {
    lead: 'Lead',
    quoted: 'Quoted',
    won: 'Won',
    lost: 'Lost',
    complete: 'Complete',
};

const STATUS_DOT: Record<ProjectStatus, string> = {
    lead: 'bg-slate-400',
    quoted: 'bg-amber-500',
    won: 'bg-emerald-600',
    lost: 'bg-rose-500',
    complete: 'bg-sky-500',
};

/* ── Column chart geometry ─────────────────────────────────────────────── */

const W = 760;
const H = 280;
const PAD_L = 58;
const PAD_R = 12;
const PAD_T = 18;
const PAD_B = 34;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BAR_W = 20;
const BAR_GAP = 2;

/** A column with a 4px rounded cap and square feet on the baseline. Drawn as a
 *  path rather than a rect so only the top corners round - a fully rounded rect
 *  lifts the bar off its own baseline and misstates small values. */
const columnPath = (x: number, y: number, w: number, baseY: number) => {
    const h = baseY - y;
    if (h <= 0) return '';
    const r = Math.min(4, h);
    return [
        `M ${x} ${baseY}`,
        `L ${x} ${y + r}`,
        `Q ${x} ${y} ${x + r} ${y}`,
        `L ${x + w - r} ${y}`,
        `Q ${x + w} ${y} ${x + w} ${y + r}`,
        `L ${x + w} ${baseY}`,
        'Z',
    ].join(' ');
};

const MonthlyChart: React.FC<{ points: MonthPoint[] }> = ({ points }) => {
    const [hovered, setHovered] = useState<number | null>(null);

    const ceiling = niceCeiling(
        Math.max(0, ...points.map(p => Math.max(p.quotedValue, p.wonValue)))
    );
    const baseY = PAD_T + PLOT_H;
    const band = PLOT_W / points.length;
    const groupW = BAR_W * 2 + BAR_GAP;
    const inset = (band - groupW) / 2;
    const y = (v: number) => baseY - (v / ceiling) * PLOT_H;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * ceiling);

    // Label only the biggest column of each series. A value on every cap is
    // noise; the axis and the tooltip carry the rest.
    const peakQuoted = points.reduce((best, p, i) =>
        p.quotedValue > points[best].quotedValue ? i : best, 0);
    const peakWon = points.reduce((best, p, i) =>
        p.wonValue > points[best].wonValue ? i : best, 0);

    const active = hovered === null ? null : points[hovered];

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                 aria-label="Quoted and won value by month">
                {ticks.map(t => (
                    <g key={t}>
                        <line
                            x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)}
                            stroke={t === 0 ? '#cbd5e1' : GRID} strokeWidth={1}
                        />
                        <text
                            x={PAD_L - 10} y={y(t) + 4} textAnchor="end"
                            fontSize={11} fill={AXIS_TEXT}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {formatCompactGBP(t)}
                        </text>
                    </g>
                ))}

                {points.map((p, i) => {
                    const x0 = PAD_L + i * band + inset;
                    const showYear = i === 0 || p.year !== points[i - 1].year;
                    return (
                        <g key={p.key}>
                            {hovered === i && (
                                <rect
                                    x={PAD_L + i * band} y={PAD_T}
                                    width={band} height={PLOT_H}
                                    fill="#0f172a" opacity={0.04}
                                />
                            )}
                            <path d={columnPath(x0, y(p.quotedValue), BAR_W, baseY)} fill={SERIES_QUOTED} />
                            <path
                                d={columnPath(x0 + BAR_W + BAR_GAP, y(p.wonValue), BAR_W, baseY)}
                                fill={SERIES_WON}
                            />

                            {i === peakQuoted && p.quotedValue > 0 && (
                                <text
                                    x={x0 + BAR_W / 2} y={y(p.quotedValue) - 6}
                                    textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155"
                                >
                                    {formatCompactGBP(p.quotedValue)}
                                </text>
                            )}
                            {i === peakWon && p.wonValue > 0 && peakWon !== peakQuoted && (
                                <text
                                    x={x0 + BAR_W + BAR_GAP + BAR_W / 2} y={y(p.wonValue) - 6}
                                    textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155"
                                >
                                    {formatCompactGBP(p.wonValue)}
                                </text>
                            )}

                            <text
                                x={PAD_L + i * band + band / 2} y={baseY + 16}
                                textAnchor="middle" fontSize={11} fill={AXIS_TEXT}
                            >
                                {p.label}
                            </text>
                            {showYear && (
                                <text
                                    x={PAD_L + i * band + band / 2} y={baseY + 28}
                                    textAnchor="middle" fontSize={9} fill="#cbd5e1"
                                >
                                    {p.year}
                                </text>
                            )}

                            {/* Hit target spans the full plot height so the row is
                                hoverable even where a month has no bars. */}
                            <rect
                                x={PAD_L + i * band} y={PAD_T}
                                width={band} height={PLOT_H}
                                fill="transparent"
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        </g>
                    );
                })}
            </svg>

            {active && (
                <div
                    className="absolute z-20 pointer-events-none -translate-y-full rounded-xl bg-slate-900 text-white px-3 py-2 shadow-lg whitespace-nowrap"
                    style={{
                        left: `${((PAD_L + (hovered! + 0.5) * band) / W) * 100}%`,
                        top: `${(PAD_T / H) * 100}%`,
                        transform:
                            hovered! <= 1 ? 'translate(-15%, -8px)'
                            : hovered! >= points.length - 2 ? 'translate(-85%, -8px)'
                            : 'translate(-50%, -8px)',
                    }}
                >
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                        {active.label} {active.year}
                    </p>
                    <p className="text-xs flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: SERIES_QUOTED }} />
                        Quoted {formatGBP(active.quotedValue)}
                        <span className="text-slate-400">({active.quotedCount})</span>
                    </p>
                    <p className="text-xs flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: SERIES_WON }} />
                        Won {formatGBP(active.wonValue)}
                        <span className="text-slate-400">({active.wonCount})</span>
                    </p>
                </div>
            )}
        </div>
    );
};

/* ── Small pieces ──────────────────────────────────────────────────────── */

const StatTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
}> = ({ icon, label, value, hint }) => (
    <div className="p-4 rounded-2xl bg-white border border-slate-200">
        <div className="flex items-center gap-2 text-slate-400 mb-2">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
        </div>
        <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
        {hint && <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>}
    </div>
);

export const ProjectsDashboard: React.FC<{ projects: Project[] }> = ({ projects }) => {
    // One clock for the whole render, so a card and the chart can't disagree
    // about where "last month" ends.
    const now = useMemo(() => Date.now(), [projects]);

    const summaries = useMemo(
        () => RANGE_ORDER.map(r => summarise(projects, r, now)),
        [projects, now]
    );
    const allTime = summaries[summaries.length - 1];
    const live = useMemo(() => pipeline(projects), [projects]);
    const months = useMemo(() => monthlySeries(projects, 12, now), [projects, now]);
    const slices = useMemo(
        () => statusBreakdown(projects).filter(s => s.count > 0),
        [projects]
    );

    const hasQuotes = allTime.quotedCount > 0;
    const widest = Math.max(1, ...slices.map(s => s.value));

    return (
        <div className="space-y-4 mb-10">

            {/* Headline */}
            <div className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                            Quoted, all time
                        </p>
                        <p className="text-5xl md:text-6xl font-bold text-accent leading-none">
                            {formatGBP(allTime.quotedValue)}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            across {allTime.quotedCount} quote{allTime.quotedCount === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div className="pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">
                            Won
                        </p>
                        <p className="text-3xl font-bold leading-none" style={{ color: SERIES_WON }}>
                            {formatGBP(allTime.wonValue)}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            {allTime.wonCount} job{allTime.wonCount === 1 ? '' : 's'} accepted
                        </p>
                    </div>
                </div>
            </div>

            {/* Period totals */}
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {summaries.map(s => (
                    <div key={s.range} className="p-4 rounded-2xl bg-white border border-slate-200">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            {RANGE_SHORT[s.range as RangeKey]}
                        </p>
                        <p className="text-xl font-bold text-slate-800 mt-2 leading-none">
                            {formatGBP(s.quotedValue)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                            {s.quotedCount} quoted
                        </p>
                        <div className="mt-3 pt-3 border-t border-slate-100">
                            <p className="text-base font-bold leading-none" style={{ color: SERIES_WON }}>
                                {formatGBP(s.wonValue)}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {s.wonCount} won
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Supporting numbers */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <StatTile
                    icon={<Trophy size={13} />}
                    label="Win rate"
                    value={allTime.winRate === null ? '—' : `${Math.round(allTime.winRate * 100)}%`}
                    hint={
                        allTime.winRate === null
                            ? 'No decided quotes yet'
                            : `${allTime.wonCount} won of ${allTime.wonCount + allTime.lostCount} decided`
                    }
                />
                <StatTile
                    icon={<Target size={13} />}
                    label="Average quote"
                    value={formatGBP(allTime.averageQuote)}
                    hint="All time"
                />
                <StatTile
                    icon={<Timer size={13} />}
                    label="Live pipeline"
                    value={formatGBP(live.value)}
                    hint={`${live.count} lead${live.count === 1 ? '' : 's'} and open quote${live.count === 1 ? '' : 's'}`}
                />
                <StatTile
                    icon={<TrendingUp size={13} />}
                    label="Lost"
                    value={formatGBP(allTime.lostValue)}
                    hint={`${allTime.lostCount} quote${allTime.lostCount === 1 ? '' : 's'} not taken up`}
                />
            </div>

            {/* Charts */}
            <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                <div className="p-5 md:p-6 rounded-3xl bg-white border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Quoted vs won</h3>
                            <p className="text-[11px] text-slate-400">
                                Last 12 months. A quote counts in the month it went out; a win counts
                                in the month it was accepted.
                            </p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_QUOTED }} />
                                Quoted
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_WON }} />
                                Won
                            </span>
                        </div>
                    </div>

                    {hasQuotes ? (
                        <MonthlyChart points={months} />
                    ) : (
                        <div className="py-20 text-center text-sm text-slate-400">
                            Add a value and move a project past Lead to start the chart.
                        </div>
                    )}
                </div>

                <div className="p-5 md:p-6 rounded-3xl bg-white border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">Where the book stands</h3>
                    <p className="text-[11px] text-slate-400 mb-5">
                        Every project by status, right now.
                    </p>

                    {slices.length === 0 ? (
                        <div className="py-16 text-center text-sm text-slate-400">
                            No projects yet.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {slices.map(s => (
                                <div key={s.status}>
                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s.status]}`} />
                                            {STATUS_LABELS[s.status]}
                                            <span className="text-slate-400 font-normal">({s.count})</span>
                                        </span>
                                        <span
                                            className="text-xs font-bold text-slate-700"
                                            style={{ fontVariantNumeric: 'tabular-nums' }}
                                        >
                                            {formatGBP(s.value)}
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${Math.max(2, (s.value / widest) * 100)}%`,
                                                background: SERIES_QUOTED,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
