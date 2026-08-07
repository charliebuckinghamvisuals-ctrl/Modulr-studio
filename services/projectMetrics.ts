import { Project, ProjectStatus } from '../types';

/**
 * Quote and revenue maths for the Projects dashboard.
 *
 * Kept out of the view deliberately: these are the definitions the numbers on
 * screen mean, and they need to be readable in one place. If "quoted" ever
 * stops meaning what it means here, this is the file to argue with.
 */

export type RangeKey = '1m' | '3m' | '6m' | '1y' | 'all';

export const RANGE_ORDER: RangeKey[] = ['1m', '3m', '6m', '1y', 'all'];

export const RANGE_LABELS: Record<RangeKey, string> = {
    '1m': 'Last month',
    '3m': 'Last 3 months',
    '6m': 'Last 6 months',
    '1y': 'Last 12 months',
    all: 'All time',
};

/** Column headings for the period strip, where "Last" is already implied. */
export const RANGE_SHORT: Record<RangeKey, string> = {
    '1m': '1 month',
    '3m': '3 months',
    '6m': '6 months',
    '1y': '1 year',
    all: 'All time',
};

const RANGE_MONTHS: Record<Exclude<RangeKey, 'all'>, number> = {
    '1m': 1,
    '3m': 3,
    '6m': 6,
    '1y': 12,
};

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/**
 * Start of a window, counted back in whole calendar months.
 *
 * The day is clamped rather than allowed to overflow: plain setMonth() turns
 * "31 March minus one month" into 3 March, which would quietly pull three extra
 * days of quotes into a "last month" total.
 */
export const rangeStart = (range: RangeKey, now = Date.now()): number => {
    if (range === 'all') return 0;
    const d = new Date(now);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - RANGE_MONTHS[range]);
    d.setDate(Math.min(day, daysInMonth(d)));
    return d.getTime();
};

/**
 * A project counts as quoted once it carries a value AND has moved past Lead.
 *
 * A lead with a number against it is a guess, not a quote - counting it would
 * inflate the headline with work that was never priced to a client.
 */
export const isQuoted = (p: Project) => (p.estimateValue ?? 0) > 0 && p.status !== 'lead';

/** Complete counts as won: the job was accepted and then finished. */
export const isWon = (p: Project) => p.status === 'won' || p.status === 'complete';

export const isLost = (p: Project) => p.status === 'lost';

/** Still live - no decision either way yet. */
export const isOpen = (p: Project) => p.status === 'lead' || p.status === 'quoted';

/** The date a quote counts against. Falls back to creation for projects saved
 *  before quote dates were recorded, so old work still appears in totals. */
export const quotedOn = (p: Project) => p.quotedAt ?? p.createdAt;

/** The date a win counts against - when the client accepted, not when the
 *  quote went out, so a January quote won in March lands in March. */
export const wonOn = (p: Project) => p.wonAt ?? p.quotedAt ?? p.createdAt;

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const value = (p: Project) => p.estimateValue ?? 0;

export interface RangeSummary {
    range: RangeKey;
    quotedCount: number;
    quotedValue: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    /** Won as a share of decided work (won + lost). Null while nothing has been
     *  decided - an open quote is not a loss, and dividing by every quote would
     *  read as a falling win rate every time new work goes out. */
    winRate: number | null;
    averageQuote: number | null;
}

export const summarise = (
    projects: Project[],
    range: RangeKey,
    now = Date.now()
): RangeSummary => {
    const from = rangeStart(range, now);

    const quoted = projects.filter(p => isQuoted(p) && quotedOn(p) >= from);
    const won = projects.filter(p => isWon(p) && wonOn(p) >= from);
    const lost = projects.filter(p => isLost(p) && wonOn(p) >= from);

    const decided = won.length + lost.length;
    const quotedValue = sum(quoted.map(value));

    return {
        range,
        quotedCount: quoted.length,
        quotedValue,
        wonCount: won.length,
        wonValue: sum(won.map(value)),
        lostCount: lost.length,
        lostValue: sum(lost.map(value)),
        winRate: decided === 0 ? null : won.length / decided,
        averageQuote: quoted.length === 0 ? null : quotedValue / quoted.length,
    };
};

export interface PipelineSummary {
    count: number;
    value: number;
}

/** Work still in play. A snapshot of now, not a windowed total - a lead from
 *  two years ago that is still open is still money on the table. */
export const pipeline = (projects: Project[]): PipelineSummary => {
    const live = projects.filter(p => isOpen(p));
    return { count: live.length, value: sum(live.map(value)) };
};

export interface MonthPoint {
    key: string;
    /** Short month name, e.g. "Mar". */
    label: string;
    /** Four-digit year, shown on the axis only where it changes. */
    year: number;
    start: number;
    quotedValue: number;
    quotedCount: number;
    wonValue: number;
    wonCount: number;
}

/** Quoted and won value per calendar month, oldest first. */
export const monthlySeries = (
    projects: Project[],
    months = 12,
    now = Date.now()
): MonthPoint[] => {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    base.setDate(1);

    const points: MonthPoint[] = [];

    for (let i = months - 1; i >= 0; i--) {
        const start = new Date(base);
        start.setMonth(start.getMonth() - i);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);

        const from = start.getTime();
        const to = end.getTime();

        const quoted = projects.filter(p => isQuoted(p) && quotedOn(p) >= from && quotedOn(p) < to);
        const won = projects.filter(p => isWon(p) && wonOn(p) >= from && wonOn(p) < to);

        points.push({
            key: `${start.getFullYear()}-${start.getMonth()}`,
            label: start.toLocaleDateString('en-GB', { month: 'short' }),
            year: start.getFullYear(),
            start: from,
            quotedValue: sum(quoted.map(value)),
            quotedCount: quoted.length,
            wonValue: sum(won.map(value)),
            wonCount: won.length,
        });
    }

    return points;
};

export interface StatusSlice {
    status: ProjectStatus;
    count: number;
    value: number;
}

/** Every project by status - a current snapshot of where the book stands. */
export const statusBreakdown = (projects: Project[]): StatusSlice[] => {
    const statuses: ProjectStatus[] = ['lead', 'quoted', 'won', 'complete', 'lost'];
    return statuses.map(status => {
        const inStatus = projects.filter(p => p.status === status);
        return { status, count: inStatus.length, value: sum(inStatus.map(value)) };
    });
};

/** Full pounds - no pence. Job values are five figures; pence are noise. */
export const formatGBP = (value: number | null) =>
    value === null || Number.isNaN(value)
        ? '—'
        : new Intl.NumberFormat('en-GB', {
              style: 'currency',
              currency: 'GBP',
              maximumFractionDigits: 0,
          }).format(value);

/** Axis-sized currency: £48k, £1.2m. Keeps tick labels from crowding. */
export const formatCompactGBP = (value: number) => {
    if (value === 0) return '£0';
    if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
    if (Math.abs(value) >= 1_000) return `£${Math.round(value / 1_000)}k`;
    return `£${Math.round(value)}`;
};

/**
 * Round a maximum up to a clean axis top (1, 2, 2.5 or 5 x a power of ten) so
 * ticks land on numbers a person would say out loud.
 */
export const niceCeiling = (max: number): number => {
    if (max <= 0) return 1000;
    const magnitude = 10 ** Math.floor(Math.log10(max));
    const normalised = max / magnitude;
    const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
    return step * magnitude;
};
