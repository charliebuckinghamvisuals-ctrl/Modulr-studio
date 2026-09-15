import type { BoundaryKind, BoundaryStyle, FenceRun } from '../types';

/**
 * The boundary catalogue: what each kind is called, how tall it usually is,
 * and the colours it comes in. Shared by the sidebar (chips) and the 3D
 * renderer (materials) so the two can never disagree. No three.js here -
 * the sidebar imports this without pulling the scene in.
 *
 * Colour is one string per run, read by kind:
 *   timber kinds - a stain hex, multiplied over the board texture
 *   brick        - 'red' | 'buff'        (which texture set)
 *   stone        - 'dry' | 'cotswold'    (which texture set)
 *   hedge        - a foliage hex
 *   open         - unused
 */
export interface ColourOption { id: string; name: string; swatch: string }

export interface BoundaryKindMeta {
  kind: BoundaryKind;
  name: string;
  /** One line for the tooltip. */
  hint: string;
  /** Any height in this range, in 50 mm steps. */
  minHeight: number;
  maxHeight: number;
  defaultHeight: number;
  colours: ColourOption[];
  defaultColour: string;
}

const TIMBER_STAINS: ColourOption[] = [
  { id: '#c9b08a', name: 'Natural', swatch: '#c9b08a' },
  { id: '#b8894f', name: 'Golden', swatch: '#b8894f' },
  { id: '#7a5a3a', name: 'Dark brown', swatch: '#7a5a3a' },
  { id: '#8c8c88', name: 'Silver grey', swatch: '#8c8c88' },
  { id: '#2b2b2b', name: 'Black', swatch: '#2b2b2b' },
  { id: '#e9e6df', name: 'Painted white', swatch: '#e9e6df' },
];

const HEDGE_GREENS: ColourOption[] = [
  { id: '#3f6b2f', name: 'Laurel', swatch: '#3f6b2f' },
  { id: '#2f5a2a', name: 'Yew', swatch: '#2f5a2a' },
  { id: '#5a7d3a', name: 'Privet', swatch: '#5a7d3a' },
  { id: '#7a5f3a', name: 'Beech (copper)', swatch: '#7a5f3a' },
];


export const BOUNDARY_KINDS: BoundaryKindMeta[] = [
  { kind: 'closeboard', name: 'Close-board', hint: 'Vertical boards on rails - the standard panel fence', minHeight: 600, maxHeight: 2500, defaultHeight: 1800, colours: TIMBER_STAINS, defaultColour: '#c9b08a' },
  { kind: 'featheredge', name: 'Feather-edge', hint: 'Overlapping vertical boards, no gaps', minHeight: 600, maxHeight: 2500, defaultHeight: 1800, colours: TIMBER_STAINS, defaultColour: '#b8894f' },
  { kind: 'slatted', name: 'Slatted', hint: 'Horizontal slats with a gap - the contemporary screen', minHeight: 600, maxHeight: 2500, defaultHeight: 1800, colours: TIMBER_STAINS, defaultColour: '#2b2b2b' },
  { kind: 'hitmiss', name: 'Hit & miss', hint: 'Horizontal boards alternating front and back', minHeight: 600, maxHeight: 2500, defaultHeight: 1800, colours: TIMBER_STAINS, defaultColour: '#7a5a3a' },
  { kind: 'brick', name: 'Brick wall', hint: 'Half-brick wall with a coping course', minHeight: 300, maxHeight: 3000, defaultHeight: 1200, colours: [
    { id: 'red', name: 'Red', swatch: '#8e5a4a' },
    { id: 'buff', name: 'Buff', swatch: '#c9a878' },
  ], defaultColour: 'red' },
  { kind: 'stone', name: 'Stone wall', hint: 'Coursed or dry stone with a rough cope', minHeight: 300, maxHeight: 3000, defaultHeight: 900, colours: [
    { id: 'dry', name: 'Dry stone', swatch: '#6b5a4a' },
    { id: 'cotswold', name: 'Cotswold', swatch: '#c8b892' },
  ], defaultColour: 'cotswold' },
  { kind: 'hedge', name: 'Hedge', hint: 'A clipped hedge on the line', minHeight: 400, maxHeight: 4000, defaultHeight: 1800, colours: HEDGE_GREENS, defaultColour: '#3f6b2f' },
  { kind: 'open', name: 'Open', hint: 'No boundary here - a line on the plan only', minHeight: 0, maxHeight: 0, defaultHeight: 0, colours: [], defaultColour: '' },
];

export const boundaryMeta = (kind: BoundaryKind): BoundaryKindMeta =>
  BOUNDARY_KINDS.find(k => k.kind === kind) ?? BOUNDARY_KINDS[0];

export const DEFAULT_BOUNDARY_STYLE: BoundaryStyle = { kind: 'closeboard', heightMm: 1800, colour: '#c9b08a' };

/** The style a run is actually drawn with: its own, else the scene default,
 *  else close-board - so runs drawn before styles existed still render. */
export const runStyle = (run: FenceRun, fallback?: BoundaryStyle): BoundaryStyle => {
  const base = fallback ?? DEFAULT_BOUNDARY_STYLE;
  const kind = run.kind ?? base.kind;
  const meta = boundaryMeta(kind);
  // A height or colour saved for a different kind is nonsense for this one.
  const heightMm = run.heightMm ?? (run.kind && run.kind !== base.kind ? meta.defaultHeight : base.heightMm);
  const colourOk = (c: string | undefined) => !!c && (meta.colours.length === 0 || meta.colours.some(o => o.id === c) || /^#[0-9a-f]{6}$/i.test(c) && meta.colours.some(o => o.id.startsWith('#')));
  const colour = colourOk(run.colour) ? run.colour! : (run.kind === undefined && colourOk(base.colour) ? base.colour : meta.defaultColour);
  const clampedH = Math.min(meta.maxHeight, Math.max(meta.minHeight, Math.round(heightMm / 50) * 50));
  return { kind, heightMm: Number.isFinite(heightMm) ? clampedH : meta.defaultHeight, colour };
};

/** What the render prompt is told about a run. */
export const describeBoundary = (style: BoundaryStyle): string => {
  const m = boundaryMeta(style.kind);
  const h = style.heightMm ? `${(style.heightMm / 1000).toFixed(1)} m ` : '';
  const c = m.colours.find(o => o.id === style.colour)?.name;
  switch (style.kind) {
    case 'open': return 'open, no fence or wall';
    case 'brick': return `${h}${c ?? 'red'} brick wall`;
    case 'stone': return `${h}${c === 'Dry stone' ? 'dry stone' : 'Cotswold coursed stone'} wall`;
    case 'hedge': return `${h}clipped ${(c ?? 'green').toLowerCase()} hedge`;
    default: return `${h}${m.name.toLowerCase()} timber fence${c ? `, ${c.toLowerCase()} finish` : ''}`;
  }
};
