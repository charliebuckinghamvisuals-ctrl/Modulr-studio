import { jsPDF } from 'jspdf';
import type { Room, SceneObject } from '../types';
import { buildCadPlanSvg } from '../../../services/cadPlan';
import { describePlanItems } from '../utils/placement';
import { toRoomLocal } from '../utils/walkCollide';
import { lShapeNotch } from '../utils/lshape';
import { DOOR_KIND_NAME, doorKind } from '../utils/doors';
import { hexToRgb, inkOn, type PdfBrand } from './brand';
import { embedPdfFont } from './fonts';
import type { CaptureResult, ElevationDrawing } from './capture';

/**
 * The design proposal: a set of A3 landscape drawing sheets, or A4.
 *
 * A4 is the same sheet reduced (the document's unit is 297/420 of a mm, so
 * every layout figure below stays in A3 terms), with two corrections: type
 * shrinks less than the page, so it still reads in print, and the drawings'
 * scale is chosen for the real paper size, so an A4 plan is still a true
 * 1:50 or 1:100 - not a 1:70.7 nobody can scale from.
 *
 * "Proper premium... it needs to feel architectural" (Charlie, 23 Sep 2026).
 * So it is laid out as an architect's drawing set rather than a brochure:
 * every sheet has a border and a title block (the company's logo and
 * colours, project, client, drawing, scale, date, sheet number), the
 * elevations and plan are printed at a TRUE scale (1:50 where the building
 * fits) with vector dimension lines and a scale bar, and the renders are the
 * company's own - attached in the export dialog, not generated here.
 */

type RGB = [number, number, number];

export interface ProposalVisual {
  dataUrl: string; caption: string; width: number; height: number;
  /** Which Visuals page it goes on, from 1; 0 leaves it out. "We need to be
   *  able to say what visuals are on what page" (Charlie, 23 Sep 2026). */
  page: number;
}

export interface ProposalInput {
  brand: PdfBrand;
  project: { name: string; client: string; address: string; notes: string; date: Date; reference: string };
  price: { mode: 'estimate' | 'actual' | 'none'; value: number | null };
  room: Room;
  objects: SceneObject[];
  drawings: CaptureResult;
  visuals: ProposalVisual[];
  /** Index into visuals for the cover; null = the first visual, else a 3D view. */
  coverIndex: number | null;
  sections: { cover: boolean; visuals: boolean; elevations: boolean; perspectives: boolean; plan: boolean; spec: boolean; planning: boolean };
  planning: any | null;
  planningText: string;
  /** The company's own plan, used in place of the drawn one. */
  planImage: ProposalVisual | null;
  paper: 'A3' | 'A4';
}

// ---- the sheet ------------------------------------------------------------
const PAGE_W = 420, PAGE_H = 297;
const BORDER = 10, TB_W = 84, PAD = 9;
const DRAW = { x0: BORDER + PAD, y0: BORDER + PAD, x1: PAGE_W - BORDER - TB_W - PAD, y1: PAGE_H - BORDER - PAD };
const DRAW_W = DRAW.x1 - DRAW.x0, DRAW_H = DRAW.y1 - DRAW.y0;
const TB_X = PAGE_W - BORDER - TB_W;

const INK: RGB = [28, 31, 33];
const MUTED: RGB = [118, 124, 128];
const HAIR: RGB = [205, 209, 212];
const SOFT: RGB = [246, 246, 244];

/** Architectural scales, largest drawing first. */
const SCALES = [20, 25, 50, 100, 200, 500];

const titleCase = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const mm = (v: number) => `${Math.round(v).toLocaleString('en-GB')}`;

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src;
});
const fmtOf = (dataUrl: string) => (/^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG');

/** Crop an image to an aspect ratio, centred - a full-bleed cover. */
async function cropTo(dataUrl: string, aspect: number, maxW = 3000): Promise<string> {
  const img = await loadImage(dataUrl);
  const ia = img.width / img.height;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ia > aspect) { sw = img.height * aspect; sx = (img.width - sw) / 2; } else { sh = img.width / aspect; sy = (img.height - sh) / 2; }
  const w = Math.min(maxW, Math.round(sw)), h = Math.round(w / aspect);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.9);
}

/** Rasterise an SVG to PNG at a given pixel width. */
async function svgToPng(svg: string, widthPx: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = Math.round(widthPx); c.height = Math.round(widthPx * img.height / img.width);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

interface Ctx {
  pdf: jsPDF;
  brand: PdfBrand;
  BRAND: RGB;
  ACCENT: RGB;
  logo: { data: string; fmt: string; ratio: number } | null;
  input: ProposalInput;
  total: number;
  /** The font family for setFont. */
  font: string;
  /** Real paper mm per layout unit: 1 on A3, 297/420 on A4. */
  U: number;
  /** Type size multiplier: 1 on A3. */
  T: number;
  paper: 'A3' | 'A4';
}

// ---- text helpers ---------------------------------------------------------
function caps(ctx: Ctx, text: string, x: number, y: number, size: number, colour: RGB, opts: { bold?: boolean; align?: 'left' | 'right' | 'center'; space?: number } = {}) {
  const { pdf } = ctx;
  pdf.setFont(ctx.font, opts.bold ? 'bold' : 'normal');
  pdf.setFontSize((size) * ctx.T);
  pdf.setTextColor(...colour);
  pdf.text(text.toUpperCase(), x, y, { align: opts.align, charSpace: opts.space ?? size * 0.09 });
}

function body(ctx: Ctx, text: string, x: number, y: number, size: number, colour: RGB, opts: { bold?: boolean; width?: number; align?: 'left' | 'right' | 'center'; leading?: number } = {}): number {
  const { pdf } = ctx;
  pdf.setFont(ctx.font, opts.bold ? 'bold' : 'normal');
  pdf.setFontSize((size) * ctx.T);
  pdf.setTextColor(...colour);
  const lines: string[] = opts.width ? pdf.splitTextToSize(text, opts.width) : [text];
  const lead = opts.leading ?? size * 0.42;
  lines.forEach((l, i) => pdf.text(l, x, y + i * lead, { align: opts.align }));
  return y + lines.length * lead;
}

// ---- the frame and title block ---------------------------------------------
function frame(ctx: Ctx, sheetNo: number, drawing: string, scale: string) {
  const { pdf, input, brand } = ctx;
  // Border and the title block's divider.
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(0.5);
  pdf.rect(BORDER, BORDER, PAGE_W - BORDER * 2, PAGE_H - BORDER * 2);
  pdf.setLineWidth(0.3);
  pdf.line(TB_X, BORDER, TB_X, PAGE_H - BORDER);

  const x = TB_X + 6, w = TB_W - 12;
  let y = BORDER + 6;

  // Logo, or the company's name set in type.
  const LOGO_H = 30;
  if (ctx.logo) {
    const maxW = w, maxH = LOGO_H;
    let lw = maxW, lh = lw / ctx.logo.ratio;
    if (lh > maxH) { lh = maxH; lw = lh * ctx.logo.ratio; }
    try { pdf.addImage(ctx.logo.data, ctx.logo.fmt, x + (w - lw) / 2, y + (LOGO_H - lh) / 2, lw, lh, 'brand-logo'); } catch { /* bad logo: leave the space */ }
  } else if (brand.companyName) {
    body(ctx, brand.companyName, x + w / 2, y + LOGO_H / 2 + 2, 15, ctx.BRAND, { bold: true, align: 'center' });
  }
  y += LOGO_H + 5;

  // Company details.
  if (ctx.logo && brand.companyName) { body(ctx, brand.companyName, x, y, 8.5, INK, { bold: true }); y += 4.2; }
  const contact = brand.contactInfo.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  for (const line of contact) y = body(ctx, line, x, y, 7, MUTED, { width: w, leading: 3.3 });
  y += 3;

  const rule = () => { pdf.setDrawColor(...HAIR); pdf.setLineWidth(0.25); pdf.line(TB_X, y, PAGE_W - BORDER, y); y += 6; };
  rule();

  const field = (label: string, value: string, size = 9, bold = false, maxLines = 3) => {
    caps(ctx, label, x, y, 5.6, MUTED);
    y += 4.4;
    pdf.setFont(ctx.font, bold ? 'bold' : 'normal'); pdf.setFontSize((size) * ctx.T);
    const lines: string[] = pdf.splitTextToSize(value || '-', w).slice(0, maxLines);
    y = body(ctx, lines.join('\n'), x, y, size, INK, { bold, leading: size * 0.44 });
    y += 3.2;
  };
  field('Project', input.project.name || 'Garden room', 11, true, 2);
  field('Client', input.project.client);
  field('Site', input.project.address);
  rule();
  field('Drawing', drawing, 12, true, 2);

  // Scale, date, sheet, revision: a two-by-two grid.
  const cellW = w / 2;
  const cell = (label: string, value: string, cx: number, cy: number) => {
    caps(ctx, label, cx, cy, 5.6, MUTED);
    body(ctx, value, cx, cy + 4.6, 9, INK, { bold: true });
  };
  cell('Scale', scale, x, y);
  cell('Date', input.project.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), x + cellW, y);
  y += 12;
  cell('Reference', input.project.reference || '-', x, y);
  cell('Revision', 'A', x + cellW, y);
  y += 13;
  rule();

  // Standing notes, as on any drawing.
  const notes = [
    'All dimensions in millimetres.',
    'Do not scale from this drawing.',
    'Drawings are indicative and subject to a site survey.',
  ];
  for (const n of notes) y = body(ctx, n, x, y, 6.5, MUTED, { width: w, leading: 3.1 }) + 0.6;

  // The brand band: sheet number.
  const BAND_H = 30;
  const by = PAGE_H - BORDER - BAND_H;
  pdf.setFillColor(...ctx.BRAND);
  pdf.rect(TB_X, by, TB_W, BAND_H, 'F');
  const on = inkOn(brand.primary);
  caps(ctx, 'Design proposal', x, by + 8, 6.2, on, { bold: true, space: 0.9 });
  pdf.setFont(ctx.font, 'bold'); pdf.setFontSize((30) * ctx.T); pdf.setTextColor(...on);
  const num = String(sheetNo).padStart(2, '0');
  pdf.text(num, x, by + BAND_H - 6);
  const numW = pdf.getTextWidth(num);
  body(ctx, `/ ${String(ctx.total).padStart(2, '0')}`, x + numW + 2, by + BAND_H - 6, 10, on);
  // Accent tick above the band.
  pdf.setFillColor(...ctx.ACCENT);
  pdf.rect(TB_X, by - 1.4, TB_W, 1.4, 'F');
}

/** The drawing title under a view: a short accent rule, the name, the scale. */
function viewTitle(ctx: Ctx, title: string, scale: string | null, x: number, y: number) {
  const { pdf } = ctx;
  pdf.setFillColor(...ctx.ACCENT);
  pdf.rect(x, y - 3.2, 1.2, 4.4, 'F');
  caps(ctx, title, x + 3.6, y, 8.5, INK, { bold: true, space: 0.7 });
  if (scale) {
    pdf.setFont(ctx.font, 'bold'); pdf.setFontSize((8.5) * ctx.T);
    const tw = pdf.getTextWidth(title.toUpperCase()) + title.length * 0.7;
    caps(ctx, scale, x + 3.6 + tw + 5, y, 7.5, MUTED);
  }
}

// ---- dimensions -------------------------------------------------------------
function tick(ctx: Ctx, x: number, y: number) {
  ctx.pdf.line(x - 1.1, y + 1.1, x + 1.1, y - 1.1);
}

/** A horizontal dimension at height y between x1 and x2, extension lines up to yFrom. */
function dimH(ctx: Ctx, x1: number, x2: number, y: number, yFrom: number, label: string) {
  const { pdf } = ctx;
  pdf.setDrawColor(...INK); pdf.setLineWidth(0.18);
  pdf.line(x1 - 1.5, y, x2 + 1.5, y);
  pdf.line(x1, yFrom + 1, x1, y + 1.5);
  pdf.line(x2, yFrom + 1, x2, y + 1.5);
  pdf.setLineWidth(0.35);
  tick(ctx, x1, y); tick(ctx, x2, y);
  body(ctx, label, (x1 + x2) / 2, y - 1.2, 7, INK, { align: 'center' });
}

/** A vertical dimension at x between y1 (top) and y2 (bottom), extension lines across to xFrom. */
function dimV(ctx: Ctx, x: number, y1: number, y2: number, xFrom: number, label: string) {
  const { pdf } = ctx;
  pdf.setDrawColor(...INK); pdf.setLineWidth(0.18);
  pdf.line(x, y1 - 1.5, x, y2 + 1.5);
  const dir = xFrom > x ? 1 : -1;
  pdf.line(x - dir * 1.5, y1, xFrom - dir * 1, y1);
  pdf.line(x - dir * 1.5, y2, xFrom - dir * 1, y2);
  pdf.setLineWidth(0.35);
  tick(ctx, x, y1); tick(ctx, x, y2);
  pdf.setFont(ctx.font, 'normal'); pdf.setFontSize((7) * ctx.T); pdf.setTextColor(...INK);
  pdf.text(label, x - 1.2, (y1 + y2) / 2, { angle: 90, align: 'center' });
}

/** A scale bar: 0 to `metres` in alternating blocks. */
function scaleBar(ctx: Ctx, x: number, y: number, scale: number, metres = 5) {
  const { pdf } = ctx;
  const seg = 1000 / scale / ctx.U; // one metre on paper
  for (let i = 0; i < metres; i++) {
    if (i % 2 === 0) pdf.setFillColor(...INK); else pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...INK); pdf.setLineWidth(0.2);
    pdf.rect(x + i * seg, y, seg, 1.8, 'FD');
  }
  for (let i = 0; i <= metres; i++) body(ctx, `${i}`, x + i * seg, y + 5, 6, MUTED, { align: 'center' });
  caps(ctx, 'metres', x + metres * seg + 3, y + 1.6, 5.6, MUTED);
}

// ---- sheets -------------------------------------------------------------------
type Sheet = (ctx: Ctx, sheetNo: number) => Promise<void>;

async function sheetCover(ctx: Ctx, heroSrc: string | null) {
  const { pdf, input, brand } = ctx;
  const PANEL_W = 128;
  const heroW = PAGE_W - PANEL_W;
  if (heroSrc) {
    const hero = await cropTo(heroSrc, heroW / PAGE_H);
    pdf.addImage(hero, 'JPEG', 0, 0, heroW, PAGE_H);
  } else {
    pdf.setFillColor(...SOFT); pdf.rect(0, 0, heroW, PAGE_H, 'F');
  }
  // The panel in the brand colour.
  pdf.setFillColor(...ctx.BRAND);
  pdf.rect(heroW, 0, PANEL_W, PAGE_H, 'F');
  pdf.setFillColor(...ctx.ACCENT);
  pdf.rect(heroW, 0, 2.2, PAGE_H, 'F');
  const on = inkOn(brand.primary);
  const x = heroW + 16, w = PANEL_W - 30;

  // Logo on a white card, so any logo reads on any brand colour.
  let y = 22;
  const CARD_H = 38;
  if (ctx.logo || brand.companyName) { pdf.setFillColor(255, 255, 255); pdf.rect(x, y, w, CARD_H, 'F'); }
  if (ctx.logo) {
    let lw = w - 12, lh = lw / ctx.logo.ratio;
    if (lh > CARD_H - 12) { lh = CARD_H - 12; lw = lh * ctx.logo.ratio; }
    try { pdf.addImage(ctx.logo.data, ctx.logo.fmt, x + (w - lw) / 2, y + (CARD_H - lh) / 2, lw, lh, 'brand-logo'); } catch { /* skip */ }
  } else if (brand.companyName) {
    body(ctx, brand.companyName, x + w / 2, y + CARD_H / 2 + 2.5, 15, ctx.BRAND, { bold: true, align: 'center' });
  }
  y += CARD_H + 34;

  caps(ctx, 'Design proposal', x, y, 8, ctx.ACCENT, { bold: true, space: 1.4 });
  y += 11;
  pdf.setFont(ctx.font, 'bold'); pdf.setFontSize((26) * ctx.T);
  const titleLines: string[] = pdf.splitTextToSize(input.project.name || 'Garden room', w);
  y = body(ctx, titleLines.slice(0, 3).join('\n'), x, y, 26, on, { bold: true, leading: 10.5 });
  y += 8;
  pdf.setDrawColor(...on); pdf.setLineWidth(0.3); pdf.line(x, y, x + 18, y);
  y += 10;

  const detail = (label: string, value: string) => {
    if (!value) return;
    caps(ctx, label, x, y, 6, on, { space: 1 });
    y = body(ctx, value, x, y + 5.2, 10, on, { width: w, leading: 4.6 }) + 5;
  };
  detail('Prepared for', input.project.client);
  detail('Site', input.project.address);
  detail('Date', input.project.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  if (input.project.reference) detail('Reference', input.project.reference);

  // Company details at the foot of the panel.
  const contact = brand.contactInfo.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  let fy = PAGE_H - 18 - contact.length * 4.2;
  if (brand.companyName) { body(ctx, brand.companyName, x, fy - 5, 9, on, { bold: true }); }
  for (const c of contact) { body(ctx, c, x, fy, 7.5, on); fy += 4.2; }
}

function placeContain(w: number, h: number, boxW: number, boxH: number) {
  const k = Math.min(boxW / w, boxH / h);
  return { w: w * k, h: h * k };
}

async function sheetImages(ctx: Ctx, sheetNo: number, title: string, items: { dataUrl: string; caption: string; width: number; height: number }[]) {
  const { pdf } = ctx;
  frame(ctx, sheetNo, title, 'Not to scale');
  const CAP = 0; // images only, no captions
  const gap = 8;
  // Slots by count: one big; two side by side; three as one large and two stacked; four as a grid.
  const X = DRAW.x0, Y = DRAW.y0, W = DRAW_W, H = DRAW_H;
  let slots: { x: number; y: number; w: number; h: number }[];
  // Landscape images (renders nearly always are) stack: side by side, two
  // wide pictures came out as short strips in a field of white.
  const wide = items.every(it => it.width >= it.height * 1.15);
  if (items.length === 1) slots = [{ x: X, y: Y, w: W, h: H - CAP }];
  else if (items.length === 2 && wide) slots = [{ x: X, y: Y, w: W, h: (H - gap) / 2 - CAP }, { x: X, y: Y + (H + gap) / 2, w: W, h: (H - gap) / 2 - CAP }];
  else if (items.length === 2) slots = [{ x: X, y: Y, w: (W - gap) / 2, h: H - CAP }, { x: X + (W + gap) / 2, y: Y, w: (W - gap) / 2, h: H - CAP }];
  else if (items.length === 3 && wide) {
    const topH = H * 0.56;
    slots = [
      { x: X, y: Y, w: W, h: topH - CAP },
      { x: X, y: Y + topH + gap, w: (W - gap) / 2, h: H - topH - gap - CAP },
      { x: X + (W + gap) / 2, y: Y + topH + gap, w: (W - gap) / 2, h: H - topH - gap - CAP },
    ];
  } else if (items.length === 3) {
    const bigW = W * 0.62;
    slots = [
      { x: X, y: Y, w: bigW, h: H - CAP },
      { x: X + bigW + gap, y: Y, w: W - bigW - gap, h: (H - gap) / 2 - CAP },
      { x: X + bigW + gap, y: Y + (H + gap) / 2, w: W - bigW - gap, h: (H - gap) / 2 - CAP },
    ];
  } else {
    const cw = (W - gap) / 2, ch = (H - gap) / 2 - CAP;
    slots = [0, 1, 2, 3].map(i => ({ x: X + (i % 2) * (cw + gap), y: Y + Math.floor(i / 2) * (ch + CAP + gap), w: cw, h: ch }));
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i], s = slots[i];
    const fit = placeContain(it.width, it.height, s.w, s.h);
    const ix = s.x + (s.w - fit.w) / 2, iy = s.y + (s.h - fit.h) / 2;
    // Just the image - no title under it ("get rid of the titles of the
    // images too so just images").
    pdf.addImage(it.dataUrl, fmtOf(it.dataUrl), ix, iy, fit.w, fit.h, undefined, 'FAST');
  }
}

/** The common scale for all four elevations: two per sheet, stacked. */
function elevationScale(els: ElevationDrawing[], U: number) {
  const slotW = (DRAW_W - 22) * U, slotH = ((DRAW_H - 10) / 2 - 22) * U;
  for (const s of SCALES) {
    if (els.every(e => (e.u1 - e.u0) * 1000 / s <= slotW && (e.y1 - e.y0) * 1000 / s <= slotH)) return s;
  }
  return SCALES[SCALES.length - 1];
}

function drawElevation(ctx: Ctx, el: ElevationDrawing, scale: number, slot: { x: number; y: number; w: number; h: number }) {
  const { pdf } = ctx;
  const k = 1000 / scale / ctx.U; // layout units per metre
  const iw = (el.u1 - el.u0) * k, ih = (el.y1 - el.y0) * k;
  // Centred across the slot, sat so the width figure and title fit below.
  // The drawing, its width figure below ground and its title, as one group
  // centred in the slot, the title directly under the drawing.
  const groupH = ih + 22;
  const ix = slot.x + (slot.w - iw) / 2 + 6;
  const iy = slot.y + (slot.h - groupH) / 2;
  pdf.addImage(el.image, 'JPEG', ix, iy, iw, ih, undefined, 'FAST');
  const px = (u: number) => ix + (u - el.u0) * k;
  const py = (y: number) => iy + (el.y1 - y) * k;
  // Ground line, heavy, run out past the drawing.
  const gy = py(0);
  pdf.setDrawColor(...INK); pdf.setLineWidth(0.7);
  pdf.line(ix - 6, gy, ix + iw + 6, gy);
  // Overall width of the walls, below ground.
  dimH(ctx, px(Math.min(...el.wallU)), px(Math.max(...el.wallU)), gy + 8, gy, mm((el.wallU[1] - el.wallU[0]) * 1000));
  // Overall height, ground to the top of the roof, left of the drawing.
  const leftX = px(Math.min(...el.wallU));
  dimV(ctx, ix - 5, py(el.topY), gy, leftX, mm(el.topY * 1000));
  viewTitle(ctx, el.title, `1:${scale}`, px(Math.min(...el.wallU)), gy + 19);
}

async function sheetElevations(ctx: Ctx, sheetNo: number, pair: ElevationDrawing[], scale: number, title: string) {
  frame(ctx, sheetNo, title, `1:${scale} @ ${ctx.paper}`);
  const slotH = (DRAW_H - 10) / 2;
  pair.forEach((el, i) => drawElevation(ctx, el, scale, { x: DRAW.x0, y: DRAW.y0 + i * (slotH + 10), w: DRAW_W, h: slotH }));
  scaleBar(ctx, DRAW.x1 - 5 * 1000 / scale / ctx.U - 16, DRAW.y1 - 3, scale);
}

async function sheetPlan(ctx: Ctx, sheetNo: number) {
  const { pdf, input } = ctx;
  if (input.planImage) {
    // The company's own plan, as supplied - its scale is its own.
    frame(ctx, sheetNo, 'Ground floor plan', 'As supplied');
    const p = input.planImage;
    const fit = placeContain(p.width, p.height, DRAW_W, DRAW_H - 12);
    const x = DRAW.x0 + (DRAW_W - fit.w) / 2, y = DRAW.y0 + (DRAW_H - 12 - fit.h) / 2;
    pdf.addImage(p.dataUrl, fmtOf(p.dataUrl), x, y, fit.w, fit.h, undefined, 'FAST');
    viewTitle(ctx, 'Ground floor plan', null, x, Math.min(DRAW.y1 - 3, y + fit.h + 7));
    return;
  }
  // Item labels in the building's own frame, so they sit on the drawing
  // however the building has been moved or turned.
  const items = describePlanItems(input.objects || []).map(it => {
    const l = toRoomLocal(input.room, it.xMm / 1000, it.zMm / 1000);
    return { ...it, xMm: Math.round(l.x * 1000), zMm: Math.round(l.z * 1000) };
  });
  const spec: any = { ...input.room, planItems: items };
  const f = input.drawings.furniture;
  const { svg, widthMm, heightMm } = buildCadPlanSvg(spec, {
    bare: true,
    furniture: f ? { href: f.image, x0: f.x0 * 1000, z0: f.z0 * 1000, w: f.w * 1000, d: f.d * 1000 } : undefined,
  });
  const availW = DRAW_W, availH = DRAW_H - 16;
  const scale = SCALES.find(s => widthMm / s <= availW * ctx.U && heightMm / s <= availH * ctx.U) ?? SCALES[SCALES.length - 1];
  const pw = widthMm / scale / ctx.U, ph = heightMm / scale / ctx.U;
  frame(ctx, sheetNo, 'Ground floor plan', `1:${scale} @ ${ctx.paper}`);
  // ~280 dpi at the printed size, as PNG so the linework stays clean.
  const png = await svgToPng(svg, Math.min(6000, pw * 11));
  const x = DRAW.x0 + (availW - pw) / 2, y = DRAW.y0 + (availH - ph) / 2;
  pdf.addImage(png, 'PNG', x, y, pw, ph, undefined, 'FAST');
  viewTitle(ctx, 'Ground floor plan', `1:${scale}`, x + 4, Math.min(DRAW.y1 - 3, y + ph + 4));
  scaleBar(ctx, DRAW.x1 - 5 * 1000 / scale / ctx.U - 16, DRAW.y1 - 3, scale);
}

/** Openings, one line each with a reference, for the schedule. */
function openingsSchedule(room: Room) {
  const notch = lShapeNotch(room, room.widthMm / 1000, room.depthMm / 1000);
  const face = (wall: string, offsetMm: number) => {
    const c = offsetMm / 1000;
    const onRecess = !!notch && (
      (wall === (notch.sz > 0 ? 'front' : 'back') && c > notch.x0 && c < notch.x1) ||
      (wall === (notch.sx > 0 ? 'right' : 'left') && c > notch.z0 && c < notch.z1));
    return titleCase(wall === 'bay' ? 'divider' : wall) + (onRecess ? ' (recess)' : '');
  };
  const rows: { ref: string; item: string; size: string; where: string }[] = [];
  (room.doors || []).forEach((d, i) => rows.push({
    ref: `D${i + 1}`,
    item: `${d.style === 'crittall' ? 'Crittall ' : ''}${DOOR_KIND_NAME[doorKind(d)]}${d.leaves > 1 ? `, ${d.leaves} leaves` : ''}`,
    size: `${mm(d.widthMm)} x ${mm(d.heightMm)}`,
    where: face(d.wall, d.offsetMm),
  }));
  (room.windows || []).forEach((w, i) => rows.push({
    ref: `W${i + 1}`,
    item: `${w.style === 'crittall' ? 'Crittall ' : ''}Window`,
    size: `${mm(w.widthMm)} x ${mm(w.heightMm)}`,
    where: face(w.wall, w.offsetMm ?? 0),
  }));
  (room.skylights || []).forEach((s: any, i: number) => rows.push({ ref: `S${i + 1}`, item: `${titleCase(s.type || '')} Skylight`, size: `${mm(s.widthMm)} x ${mm(s.lengthMm)}`, where: 'Roof' }));
  return rows;
}

async function sheetSpec(ctx: Ctx, sheetNo: number) {
  const { pdf, input } = ctx;
  const room = input.room;
  frame(ctx, sheetNo, 'Specification & schedule', 'Not to scale');
  const colGap = 12;
  const colW = (DRAW_W - colGap * 2) / 3;
  const cols = [DRAW.x0, DRAW.x0 + colW + colGap, DRAW.x0 + (colW + colGap) * 2];

  const heading = (x: number, y: number, t: string) => {
    caps(ctx, t, x, y, 8.5, INK, { bold: true, space: 0.8 });
    pdf.setFillColor(...ctx.ACCENT); pdf.rect(x, y + 2.2, 12, 0.8, 'F');
    return y + 10;
  };
  const row = (x: number, y: number, label: string, value: string) => {
    body(ctx, label, x, y, 8, MUTED);
    pdf.setFont(ctx.font, 'bold'); pdf.setFontSize((8.5) * ctx.T);
    const lines: string[] = pdf.splitTextToSize(value, colW * 0.58);
    body(ctx, lines.join('\n'), x + colW, y, 8.5, INK, { bold: true, align: 'right', leading: 3.8 });
    const bottom = y + Math.max(1, lines.length) * 3.8 + 1.4;
    pdf.setDrawColor(...HAIR); pdf.setLineWidth(0.15); pdf.line(x, bottom, x + colW, bottom);
    return bottom + 4.6;
  };

  // The building.
  const isGable = room.shape === 'Gable';
  const extra = isGable ? 0 : (room.baseHeightMm || 100) + (room.roofHeightMm || 200);
  const front = room.heightMm + extra;
  const back = isGable ? front : (room.backHeightMm ?? room.heightMm) + extra;
  const notch = lShapeNotch(room, room.widthMm / 1000, room.depthMm / 1000);
  const area = (room.widthMm * room.depthMm - (notch ? notch.cutW * notch.cutD * 1e6 : 0)) / 1e6;
  let y = heading(cols[0], DRAW.y0 + 4, 'The building');
  y = row(cols[0], y, 'Footprint', notch ? 'L-shape' : 'Rectangle');
  y = row(cols[0], y, 'Overall width', `${mm(room.widthMm)} mm`);
  y = row(cols[0], y, 'Overall depth', `${mm(room.depthMm)} mm`);
  if (notch) {
    y = row(cols[0], y, 'Cut-out', `${mm(notch.cutW * 1000)} x ${mm(notch.cutD * 1000)} mm`);
    y = row(cols[0], y, 'Cut-out corner', titleCase((room.lShapeCutoutCorner ?? 'front-right').replace('-', ' ')));
  }
  y = row(cols[0], y, 'Footprint area', `${area.toFixed(1)} m²`);
  y = row(cols[0], y, 'Roof', isGable ? `Gable, apex ${room.gableOrientation === 'side' ? 'at the sides' : 'at the front'}` : front !== back ? 'Flat, falling to the rear' : 'Flat');
  if (isGable) {
    y = row(cols[0], y, 'Eaves height', `${mm(room.heightMm - (room.roofHeightMm || 200))} mm`);
    y = row(cols[0], y, 'Ridge height', `${mm(room.heightMm)} mm`);
  } else {
    y = row(cols[0], y, front !== back ? 'Height at the front' : 'Overall height', `${mm(front)} mm`);
    if (front !== back) y = row(cols[0], y, 'Height at the rear', `${mm(back)} mm`);
  }
  y = row(cols[0], y, 'Wall thickness', `${mm(room.wallThicknessMm ?? 150)} mm`);
  if (room.hasDecking) y = row(cols[0], y, 'Decking', `${mm(room.deckingSizeMm ?? 1500)} mm to the front`);

  // Finishes.
  let fy = heading(cols[1], DRAW.y0 + 4, 'Finishes');
  const cladding = titleCase(String(room.cladding)) + ((room as any).claddingTint ? ` (${String((room as any).claddingTint).toUpperCase()})` : '');
  fy = row(cols[1], fy, 'Cladding', cladding);
  fy = row(cols[1], fy, 'Roof covering', titleCase(String(room.roofMaterial || 'EPDM')));
  fy = row(cols[1], fy, 'Fascia', titleCase(String((room as any).fasciaMaterial || 'Anthracite')));
  fy = row(cols[1], fy, 'Frames', titleCase(String(room.frameColor)) + (room.frameColorInner && room.frameColorInner !== room.frameColor ? `, ${titleCase(String(room.frameColorInner))} inside` : ''));
  fy = row(cols[1], fy, 'Base', titleCase(String(room.baseMaterial || '')));
  fy = row(cols[1], fy, 'Internal walls', String(room.interiorColor || '#FFFFFF').toUpperCase() === '#FFFFFF' ? 'White' : String(room.interiorColor).toUpperCase());
  fy = row(cols[1], fy, 'Floor', titleCase(String(room.interiorFloorType || 'Oak plank')));

  // Openings schedule, as a table.
  let oy = heading(cols[2], DRAW.y0 + 4, 'Openings schedule');
  const sched = openingsSchedule(room);
  if (!sched.length) body(ctx, 'None specified.', cols[2], oy, 8, MUTED);
  else {
    const c1 = cols[2], c2 = c1 + 11, c4 = c1 + colW;
    caps(ctx, 'Ref', c1, oy, 5.6, MUTED); caps(ctx, 'Item', c2, oy, 5.6, MUTED); caps(ctx, 'Size / wall', c4, oy, 5.6, MUTED, { align: 'right' });
    oy += 5;
    for (const r of sched.slice(0, 18)) {
      body(ctx, r.ref, c1, oy, 8, ctx.BRAND, { bold: true });
      body(ctx, r.item, c2, oy, 8, INK, { width: colW * 0.5 });
      body(ctx, r.size, c4, oy, 8, INK, { bold: true, align: 'right' });
      body(ctx, r.where, c4, oy + 3.6, 6.8, MUTED, { align: 'right' });
      oy += 8.4;
      pdf.setDrawColor(...HAIR); pdf.setLineWidth(0.15); pdf.line(c1, oy - 4, c4, oy - 4);
    }
  }

  // Price and notes across the foot of the sheet.
  const footY = DRAW.y1 - 46;
  const priceW = colW;
  if (input.price.value !== null && input.price.mode !== 'none') {
    const px = cols[2];
    pdf.setFillColor(...ctx.BRAND);
    pdf.rect(px, footY, priceW, 46, 'F');
    const on = inkOn(ctx.brand.primary);
    caps(ctx, input.price.mode === 'actual' ? 'Your investment' : 'Estimated investment', px + 7, footY + 10, 7, on, { bold: true, space: 1 });
    body(ctx, `£${Math.round(input.price.value).toLocaleString('en-GB')}`, px + 7, footY + 24, 24, on, { bold: true });
    body(ctx, input.price.mode === 'actual'
      ? 'For the design as specified. Variations are quoted separately.'
      : 'Indicative, from the design, size and materials selected. Not a formal quotation.', px + 7, footY + 32, 7, on, { width: priceW - 14, leading: 3.2 });
  }
  if (input.project.notes) {
    const nx = cols[0], nw = colW * 2 + colGap;
    pdf.setFillColor(...SOFT); pdf.rect(nx, footY, nw, 46, 'F');
    caps(ctx, 'Notes', nx + 7, footY + 10, 7, MUTED, { bold: true, space: 1 });
    body(ctx, input.project.notes, nx + 7, footY + 17, 8.5, INK, { width: nw - 14, leading: 4 });
  }
}

async function sheetPlanning(ctx: Ctx, sheetNo: number) {
  const { pdf, input } = ctx;
  const planning = input.planning;
  frame(ctx, sheetNo, 'Planning guidance', 'Not to scale');
  const X = DRAW.x0, W = DRAW_W * 0.64;
  let y = DRAW.y0 + 4;
  if (planning?.verdict) {
    const LIGHT: Record<string, { rgb: RGB; label: string }> = {
      green: { rgb: [22, 130, 70], label: 'Likely permitted development' },
      amber: { rgb: [200, 130, 20], label: 'Permitted with conditions - get advice' },
      red: { rgb: [190, 50, 45], label: 'Planning permission likely required' },
    };
    const L = LIGHT[planning.verdict] || LIGHT.amber;
    pdf.setFillColor(...L.rgb); pdf.rect(X, y, W, 20, 'F');
    (['green', 'amber', 'red'] as const).forEach((k, i) => {
      pdf.setFillColor(255, 255, 255);
      if (k === planning.verdict) pdf.circle(X + 8 + i * 8, y + 10, 2.8, 'F');
      else { pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.4); pdf.circle(X + 8 + i * 8, y + 10, 1.8, 'S'); }
    });
    caps(ctx, L.label, X + 36, y + 9, 10, [255, 255, 255], { bold: true, space: 0.5 });
    body(ctx, `Overall ${planning.totalHeightMm} mm   ·   eaves ${planning.eavesHeightMm} mm`, X + 36, y + 15, 8, [255, 255, 255]);
    y += 30;
    if (planning.headline) y = body(ctx, planning.headline, X, y, 10, INK, { bold: true, width: W, leading: 4.6 }) + 6;
    if (Array.isArray(planning.checks)) {
      caps(ctx, 'Permitted development checklist', X, y, 7, MUTED, { bold: true, space: 0.8 });
      y += 7;
      for (const chk of planning.checks) {
        const col: RGB = chk.status === 'pass' ? [22, 130, 70] : chk.status === 'fail' ? [190, 50, 45] : [200, 130, 20];
        pdf.setFillColor(...col); pdf.circle(X + 3, y - 1, 2.6, 'F');
        pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.55);
        if (chk.status === 'pass') { pdf.line(X + 1.9, y - 0.9, X + 2.7, y); pdf.line(X + 2.7, y, X + 4.2, y - 1.9); }
        else if (chk.status === 'fail') { pdf.line(X + 2.1, y - 1.9, X + 3.9, y - 0.1); pdf.line(X + 2.1, y - 0.1, X + 3.9, y - 1.9); }
        else body(ctx, '?', X + 3, y + 0.4, 8, [255, 255, 255], { bold: true, align: 'center' });
        body(ctx, String(chk.label), X + 9, y, 9, INK, { bold: true });
        y = body(ctx, String(chk.detail || ''), X + 9, y + 4.2, 7.5, MUTED, { width: W - 9, leading: 3.4 }) + 3.4;
      }
    }
  }
  // Worth knowing, building regulations and the NAPC route, in the right-hand column.
  const RX = X + W + 12, RW = DRAW.x1 - RX;
  let ry = DRAW.y0 + 4;
  const text = planning?.verdict
    ? [...(planning.caveats || []).map((c: string) => `• ${c}`), '', `Building Regulations: ${planning.buildingRegs || ''}`, '', planning.napcNote || ''].join('\n')
    : input.planningText;
  caps(ctx, 'Worth knowing', RX, ry, 7, MUTED, { bold: true, space: 0.8 });
  ry += 7;
  ry = body(ctx, text || 'No planning guidance was available for this design.', RX, ry, 8, INK, { width: RW, leading: 3.8 });
  // The disclaimer, boxed at the foot.
  const disc = 'This assessment is based on the current national Permitted Development rules (Class E) and the exact measurements of this design. Final confirmation depends on your specific site and local authority - NAPC (www.napc.uk) will confirm it formally.';
  pdf.setFillColor(...SOFT); pdf.rect(X, DRAW.y1 - 18, DRAW_W, 18, 'F');
  body(ctx, disc, X + 6, DRAW.y1 - 11, 7.5, MUTED, { width: DRAW_W - 12, leading: 3.4 });
}

/** Build the whole proposal. onStep reports progress for the dialog. */
export async function buildProposalPdf(input: ProposalInput, onStep: (s: string) => void = () => {}): Promise<jsPDF> {
  const paper = input.paper === 'A4' ? 'A4' : 'A3';
  const U = paper === 'A4' ? 297 / 420 : 1;
  // A4 is 297 x 210 mm; in A3 units that is 420 x 296.98.
  const format = [420, paper === 'A4' ? 210 / U : 297];
  // jsPDF takes a number as the unit (points per unit); its types do not say so.
  const unit = ((72 / 25.4) * U) as unknown as 'mm';
  const pdf = new jsPDF({ orientation: 'landscape', unit, format, compress: true });
  const font = await embedPdfFont(pdf, input.brand.font);
  let logo: Ctx['logo'] = null;
  if (input.brand.logo) {
    try {
      const im = await loadImage(input.brand.logo);
      logo = { data: input.brand.logo, fmt: fmtOf(input.brand.logo), ratio: im.naturalWidth / Math.max(1, im.naturalHeight) };
    } catch { logo = null; }
  }
  const ctx: Ctx = { pdf, brand: input.brand, BRAND: hexToRgb(input.brand.primary), ACCENT: hexToRgb(input.brand.secondary), logo, input, total: 0, font, U, T: paper === 'A4' ? 0.78 : 1, paper };
  const S = input.sections;
  const els = input.drawings.elevations;
  const elScale = els.length ? elevationScale(els, U) : 50;

  // The running order. The cover is not numbered.
  const sheets: Sheet[] = [];
  if (S.visuals && input.visuals.length) {
    // One sheet per chosen page, in page order; four at most to a sheet.
    const pages = [...new Set(input.visuals.map(v => v.page).filter(p => p > 0))].sort((a, b) => a - b);
    for (const p of pages) {
      const onPage = input.visuals.filter(v => v.page === p);
      for (let i = 0; i < onPage.length; i += 4) {
        const chunk = onPage.slice(i, i + 4);
        sheets.push((c, n) => sheetImages(c, n, 'Visuals', chunk));
      }
    }
  }
  if (S.elevations && els.length) {
    const front = els.filter(e => e.key === 'front' || e.key === 'rear');
    const sides = els.filter(e => e.key === 'left' || e.key === 'right');
    sheets.push((c, n) => sheetElevations(c, n, front, elScale, 'Front & rear elevations'));
    sheets.push((c, n) => sheetElevations(c, n, sides, elScale, 'Side elevations'));
  }
  if (S.plan) sheets.push((c, n) => sheetPlan(c, n));
  if (S.perspectives && input.drawings.perspectives.length) {
    sheets.push((c, n) => sheetImages(c, n, '3D views', input.drawings.perspectives.map(p => ({ dataUrl: p.image, caption: p.title, width: p.widthPx, height: p.heightPx, page: 1 }))));
  }
  if (S.spec) sheets.push((c, n) => sheetSpec(c, n));
  if (S.planning && (input.planning || input.planningText)) sheets.push((c, n) => sheetPlanning(c, n));
  ctx.total = sheets.length;

  let first = true;
  if (S.cover) {
    onStep('Laying out the cover');
    const hero = input.coverIndex !== null && input.visuals[input.coverIndex] ? input.visuals[input.coverIndex].dataUrl
      : input.visuals.find(v => v.page > 0)?.dataUrl ?? input.visuals[0]?.dataUrl ?? input.drawings.perspectives[0]?.image ?? null;
    await sheetCover(ctx, hero);
    first = false;
  }
  for (let i = 0; i < sheets.length; i++) {
    onStep(`Laying out sheet ${i + 1} of ${sheets.length}`);
    if (!first) pdf.addPage(format, 'landscape');
    first = false;
    await sheets[i](ctx, i + 1);
  }
  return pdf;
}
