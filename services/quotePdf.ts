import { jsPDF } from 'jspdf';
import type { BrandingData } from '../hooks/useBranding';
import { pdfFontById } from './pdfFonts';
import {
    Quote, QuoteLine, quoteTotals, formatGBP, formatQty, lineTotal, categoryLabel,
} from './quoteEngine';

/**
 * The customer's quotation, as an A4 PDF in the company's branding.
 *
 * Laid out the way a UK garden-room quote reads: who it is from and for, the
 * room in one line, the price broken down by category (as much of it as the
 * company chooses to show), optional extras apart from the total, VAT, the
 * payment stages in pounds, the terms and a place to sign. Nothing of ours
 * on it - no logo and no name leaves the space blank, as on the proposal.
 */

export interface QuotePdfInput {
    quote: Quote;
    project: { name: string; clientName: string; clientEmail: string; address: string };
    branding: Partial<BrandingData>;
    /** A render of the design for the top of the first page, if there is one. */
    heroUrl?: string | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CW = PAGE_W - M * 2;
const FOOT = 12;

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const RULE: [number, number, number] = [226, 232, 240];
const TINT: [number, number, number] = [248, 250, 252];

const rgb = (hex: string | undefined, fallback: [number, number, number]): [number, number, number] => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fallback;
};

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Fonts: the proposal's typeface, the same static TTFs the configurator
// embeds, served at /3d-config/fonts. Helvetica if anything goes wrong.
const fontCache = new Map<string, Promise<string>>();
const ttf = (path: string) => {
    let p = fontCache.get(path);
    if (!p) {
        p = fetch(path).then(async r => {
            if (!r.ok) throw new Error(String(r.status));
            const bytes = new Uint8Array(await r.arrayBuffer());
            if (bytes[0] !== 0 || bytes[1] !== 1) throw new Error('not a TrueType font');
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return btoa(bin);
        });
        p.catch(() => fontCache.delete(path));
        fontCache.set(path, p);
    }
    return p;
};

async function embedFont(pdf: jsPDF, id: string | undefined): Promise<string> {
    const font = pdfFontById(id);
    if (!font.file) return 'helvetica';
    try {
        const [regular, bold] = await Promise.all([
            ttf(`/3d-config/fonts/${font.file}-Regular.ttf`),
            ttf(`/3d-config/fonts/${font.file}-Bold.ttf`),
        ]);
        pdf.addFileToVFS(`${font.file}-Regular.ttf`, regular);
        pdf.addFont(`${font.file}-Regular.ttf`, font.file, 'normal');
        pdf.addFileToVFS(`${font.file}-Bold.ttf`, bold);
        pdf.addFont(`${font.file}-Bold.ttf`, font.file, 'bold');
        return font.file;
    } catch {
        return 'helvetica';
    }
}

/** A render cropped to the band it fills, as a JPEG data URL. */
async function heroImage(url: string, aspect: number): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        const srcAspect = bmp.width / bmp.height;
        let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
        if (srcAspect > aspect) { sw = bmp.height * aspect; sx = (bmp.width - sw) / 2; }
        else { sh = bmp.width / aspect; sy = (bmp.height - sh) / 2; }
        const outW = Math.min(2000, Math.round(sw));
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = Math.round(outW / aspect);
        canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return null;
    }
}

const money = (n: number) => formatGBP(n, true);

export async function makeQuotePdf(input: QuotePdfInput): Promise<Blob> {
    const { quote, project, branding } = input;
    const totals = quoteTotals(quote);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const family = await embedFont(pdf, branding.pdfFont);
    const primary = rgb(branding.primaryColor, [59, 77, 74]);
    const accent = rgb(branding.secondaryColor, primary);
    const company = (branding.companyName || '').trim();
    const quoteRef = `${quote.number}${quote.version > 1 ? ` v${quote.version}` : ''}`;
    const issued = quote.sentAt ?? quote.updatedAt ?? Date.now();
    const validUntil = issued + quote.validDays * 86400000;

    const font = (size: number, bold = false, color: [number, number, number] = INK) => {
        pdf.setFont(family, bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
    };
    const wrap = (text: string, width: number) => pdf.splitTextToSize(text, width) as string[];
    /** Line height in mm for a point size. */
    const lh = (size: number) => size * 0.3528 * 1.35;
    const caps = (text: string, x: number, y: number, size: number, color: [number, number, number], align: 'left' | 'right' = 'left') => {
        font(size, true, color);
        pdf.text(text.toUpperCase(), x, y, { align, charSpace: 0.35 });
    };

    let y = M;

    /** Start a new page when the next block will not fit. */
    const ensure = (h: number) => {
        if (y + h <= PAGE_H - FOOT - 6) return;
        pdf.addPage();
        y = M;
        // A slim running head so a loose page is still identifiable.
        caps(company || 'Quotation', M, y + 2, 7, MUTED);
        caps(quoteRef, PAGE_W - M, y + 2, 7, MUTED, 'right');
        pdf.setDrawColor(...RULE);
        pdf.setLineWidth(0.3);
        pdf.line(M, y + 5, PAGE_W - M, y + 5);
        y += 11;
    };

    // ---- Letterhead ----------------------------------------------------
    let headBottom = y;
    if (branding.logo && branding.logo.startsWith('data:image')) {
        try {
            const props = pdf.getImageProperties(branding.logo);
            const maxW = 48, maxH = 20;
            const s = Math.min(maxW / props.width, maxH / props.height);
            const w = props.width * s, h = props.height * s;
            pdf.addImage(branding.logo, props.fileType || 'PNG', M, y, w, h, undefined, 'FAST');
            headBottom = y + h;
        } catch { /* a logo that will not decode is left out */ }
    } else if (company) {
        font(17, true, primary);
        pdf.text(company, M, y + 7);
        headBottom = y + 9;
    }
    // Contact block, right-aligned.
    let cy = y + 3;
    if (company && branding.logo) {
        font(9, true);
        pdf.text(company, PAGE_W - M, cy, { align: 'right' });
        cy += lh(9);
    }
    font(8, false, MUTED);
    for (const line of (branding.contactInfo || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6)) {
        pdf.text(line, PAGE_W - M, cy, { align: 'right' });
        cy += lh(8);
    }
    y = Math.max(headBottom, cy) + 6;
    pdf.setFillColor(...primary);
    pdf.rect(M, y, CW, 0.9, 'F');
    y += 10;

    // ---- Title and who it is for --------------------------------------
    caps('Quotation', M, y, 8, accent);
    y += 8;
    font(21, true);
    const titleLines = wrap(quote.title || 'Garden room', CW * 0.62);
    pdf.text(titleLines, M, y);
    y += lh(21) * titleLines.length;
    if (quote.spec) {
        font(9, false, MUTED);
        const specLines = wrap(quote.spec, CW * 0.62);
        pdf.text(specLines, M, y);
        y += lh(9) * specLines.length;
    }

    // Right column: the reference block, top-aligned with the title.
    const metaX = M + CW * 0.68;
    let my = y - (lh(21) * titleLines.length) - (quote.spec ? lh(9) * wrap(quote.spec, CW * 0.62).length : 0) - 1;
    const meta: [string, string][] = [
        ['Quote', quoteRef],
        ['Date', fmtDate(issued)],
        ['Valid until', fmtDate(validUntil)],
    ];
    for (const [k, v] of meta) {
        caps(k, metaX, my, 6.5, MUTED);
        font(9.5, true);
        pdf.text(v, metaX, my + 4.3);
        my += 10;
    }
    y = Math.max(y, my - 4) + 6;

    // Prepared for.
    const forLines = [project.clientName, ...project.address.split(/\n|,\s*/).map(s => s.trim()).filter(Boolean), project.clientEmail].filter(Boolean);
    if (forLines.length || project.name) {
        pdf.setFillColor(...TINT);
        const boxH = 9 + Math.max(1, forLines.length) * lh(9);
        pdf.rect(M, y, CW, boxH, 'F');
        caps('Prepared for', M + 5, y + 6, 6.5, MUTED);
        font(9, false);
        let fy = y + 6 + lh(9) + 0.5;
        forLines.slice(0, 5).forEach((l, i) => {
            font(9, i === 0);
            pdf.text(l, M + 5, fy);
            fy += lh(9);
        });
        if (project.name) {
            caps('Project', metaX, y + 6, 6.5, MUTED);
            font(9, true);
            pdf.text(wrap(project.name, PAGE_W - M - metaX - 3).slice(0, 2), metaX, y + 6 + lh(9) + 0.5);
        }
        y += boxH + 7;
    }

    // ---- The design -----------------------------------------------------
    if (input.heroUrl) {
        const aspect = CW / 64;
        const img = await heroImage(input.heroUrl, aspect);
        if (img) {
            pdf.addImage(img, 'JPEG', M, y, CW, 64, undefined, 'FAST');
            y += 64 + 7;
        }
    }

    if (quote.intro.trim()) {
        font(9.5, false);
        const intro = wrap(quote.intro.trim(), CW);
        ensure(lh(9.5) * intro.length);
        pdf.text(intro, M, y);
        y += lh(9.5) * intro.length + 5;
    }

    // ---- The price ------------------------------------------------------
    const colQty = M + CW - 66;
    const colRate = M + CW - 34;
    const colAmt = M + CW - 3;
    const descW = quote.detail === 'itemised' ? CW - 78 : CW - 44;

    const tableHead = () => {
        ensure(16);
        pdf.setFillColor(...primary);
        pdf.rect(M, y, CW, 8, 'F');
        const on: [number, number, number] = [255, 255, 255];
        caps(quote.detail === 'total' ? 'Your garden room' : 'Description', M + 3, y + 5.3, 6.8, on);
        if (quote.detail === 'itemised') {
            caps('Qty', colQty, y + 5.3, 6.8, on, 'right');
            caps(totals.gross ? 'Price inc VAT' : 'Unit price', colRate, y + 5.3, 6.8, on, 'right');
        }
        caps('Amount', colAmt, y + 5.3, 6.8, on, 'right');
        y += 8;
    };

    const includedText = (l: QuoteLine) => (l.rate === 0 || l.included ? 'Included' : money(lineTotal(l)));

    const itemRow = (l: QuoteLine, showPrice: boolean) => {
        font(9, false);
        const nameLines = wrap(l.name, descW);
        const descLines = l.description ? (font(7.5), wrap(l.description, descW)) : [];
        const h = lh(9) * nameLines.length + (descLines.length ? lh(7.5) * descLines.length + 0.5 : 0) + 3.2;
        ensure(h);
        const top = y + 4.6;
        font(9, false);
        pdf.text(nameLines, M + 3, top);
        if (showPrice) {
            pdf.text(formatQty(l), colQty, top, { align: 'right' });
            // Covered by the design's price: listed, no unit price.
            if (!l.included) pdf.text(l.rate === 0 ? 'Included' : money(l.rate), colRate, top, { align: 'right' });
            font(9, true);
            pdf.text(includedText(l), colAmt, top, { align: 'right' });
        }
        if (descLines.length) {
            font(7.5, false, MUTED);
            pdf.text(descLines, M + 3, top + lh(9) * nameLines.length + 0.2);
        }
        y += h;
        pdf.setDrawColor(...RULE);
        pdf.setLineWidth(0.2);
        pdf.line(M + 3, y, M + CW - 3, y);
    };

    const categoryRow = (label: string, total: number | null) => {
        ensure(14);
        y += 2.5;
        caps(label, M + 3, y + 4.5, 7.5, accent);
        if (total !== null) {
            font(9.5, true);
            pdf.text(total === 0 ? 'Included' : money(total), colAmt, y + 4.5, { align: 'right' });
        }
        y += 6.5;
        pdf.setDrawColor(...primary);
        pdf.setLineWidth(0.35);
        pdf.line(M + 3, y, M + CW - 3, y);
    };

    const includesNote = () => {
        if (!quote.includes.trim()) return;
        font(7.5, false, MUTED);
        const lines = wrap(`Includes: ${quote.includes.trim()}`, CW - 6);
        ensure(lh(7.5) * lines.length + 3);
        pdf.text(lines, M + 3, y + 3.6);
        y += lh(7.5) * lines.length + 2.5;
    };

    tableHead();
    if (quote.detail === 'itemised') {
        for (const cat of totals.byCategory) {
            if (!cat.lines.length) continue;
            categoryRow(cat.label, cat.lines.length > 1 ? cat.total : null);
            for (const l of cat.lines) itemRow(l, true);
            if (cat.id === 'building') includesNote();
        }
    } else if (quote.detail === 'categories') {
        for (const cat of totals.byCategory) {
            if (!cat.lines.length) continue;
            categoryRow(cat.label, cat.total);
            font(8, false, MUTED);
            const names = wrap(cat.lines.map(l => (l.unit === 'item' || l.unit === 'each' ? (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name) : `${l.name} (${formatQty(l)})`)).join(' · '), CW - 6);
            ensure(lh(8) * names.length + 3);
            pdf.text(names, M + 3, y + 4);
            y += lh(8) * names.length + 2.5;
            if (cat.id === 'building') includesNote();
        }
    } else {
        ensure(14);
        font(10.5, true);
        pdf.text(quote.title || 'Garden room', M + 3, y + 6);
        pdf.text(money(totals.net), colAmt, y + 6, { align: 'right' });
        y += 9;
        for (const cat of totals.byCategory) {
            if (!cat.lines.length) continue;
            font(8, false, MUTED);
            const text = `${cat.label}: ${cat.lines.map(l => l.name).join(', ')}`;
            const lines = wrap(text, CW - 6);
            ensure(lh(8) * lines.length + 1.5);
            pdf.text(lines, M + 3, y + 3.2);
            y += lh(8) * lines.length + 1;
        }
        includesNote();
    }

    // ---- Totals -----------------------------------------------------------
    const tx = M + CW * 0.5;
    const totalRow = (label: string, value: string, strong = false) => {
        ensure(7);
        font(strong ? 10 : 9, strong, strong ? INK : MUTED);
        pdf.text(label, tx + 3, y + 4.6);
        font(strong ? 10 : 9, true);
        pdf.text(value, colAmt, y + 4.6, { align: 'right' });
        y += 6.5;
    };
    y += 4;
    ensure(40);
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.3);
    pdf.line(tx, y, M + CW, y);
    y += 1;
    if (quote.detail !== 'total' || totals.discount > 0) totalRow(totals.gross ? 'Subtotal (inc VAT)' : 'Subtotal', money(totals.subtotal));
    if (totals.discount > 0) {
        totalRow(quote.discount.kind === 'pct' ? `${quote.discount.label || 'Discount'} (${quote.discount.value}%)` : (quote.discount.label || 'Discount'), `- ${money(totals.discount)}`);
    }
    if (quote.vatRegistered) {
        // Inc-VAT prices: the VAT is shown as what the total contains.
        totalRow('Total excluding VAT', money(totals.net), !totals.gross);
        totalRow(totals.gross ? `Includes VAT at ${quote.vatRate}%` : `VAT at ${quote.vatRate}%`, money(totals.vat));
    }
    ensure(13);
    y += 1.5;
    pdf.setFillColor(...primary);
    pdf.rect(tx, y, M + CW - tx, 11, 'F');
    font(8, true, [255, 255, 255]);
    pdf.text((quote.vatRegistered ? 'Total including VAT' : 'Total').toUpperCase(), tx + 3, y + 7, { charSpace: 0.3 });
    font(13, true, [255, 255, 255]);
    pdf.text(money(totals.total), colAmt, y + 7.4, { align: 'right' });
    y += 11;
    if (!quote.vatRegistered) {
        font(7.5, false, MUTED);
        pdf.text('No VAT is charged on this quotation.', colAmt, y + 4, { align: 'right' });
        y += 5;
    }
    y += 6;

    // ---- Optional extras -----------------------------------------------
    const optional = totals.byCategory.flatMap(c => c.optional);
    if (optional.length) {
        ensure(22);
        caps('Optional extras', M, y + 4, 8, accent);
        font(7.5, false, MUTED);
        pdf.text('Not included in the total above - ask us to add any of them.', M, y + 8.5);
        y += 11;
        for (const l of optional) itemRow(l, true);
        y += 6;
    }

    // ---- Payment stages --------------------------------------------------
    if (totals.stages.length) {
        ensure(12 + totals.stages.length * 7);
        caps('Payment stages', M, y + 4, 8, accent);
        y += 7;
        for (const s of totals.stages) {
            ensure(7);
            font(9, false);
            pdf.text(s.label, M + 3, y + 4.6);
            font(9, false, MUTED);
            pdf.text(`${s.pct}%`, colRate, y + 4.6, { align: 'right' });
            font(9, true);
            pdf.text(money(s.amount), colAmt, y + 4.6, { align: 'right' });
            y += 6.5;
            pdf.setDrawColor(...RULE);
            pdf.setLineWidth(0.2);
            pdf.line(M + 3, y, M + CW - 3, y);
        }
        y += 6;
    }

    if (quote.leadTime.trim()) {
        ensure(10);
        caps('Lead time', M, y + 4, 8, accent);
        font(9, false);
        pdf.text(quote.leadTime.trim(), M + 32, y + 4);
        y += 10;
    }

    // ---- Terms and acceptance -------------------------------------------
    if (quote.terms.trim()) {
        font(7.5, false, MUTED);
        const lines = wrap(quote.terms.trim(), CW);
        ensure(10 + Math.min(lines.length, 6) * lh(7.5));
        caps('Terms', M, y + 4, 8, accent);
        y += 7;
        for (const line of lines) {
            ensure(lh(7.5));
            font(7.5, false, MUTED);
            pdf.text(line, M, y + 2.8);
            y += lh(7.5);
        }
        y += 6;
    }

    ensure(34);
    caps('Acceptance', M, y + 4, 8, accent);
    font(8.5, false, MUTED);
    pdf.text(`To go ahead, sign below and return this quotation${company ? ` to ${company}` : ''}, or reply to confirm in writing.`, M, y + 9.5);
    y += 20;
    pdf.setDrawColor(...MUTED);
    pdf.setLineWidth(0.25);
    const sigW = (CW - 16) / 3;
    ['Signed', 'Name', 'Date'].forEach((label, i) => {
        const x = M + i * (sigW + 8);
        pdf.line(x, y, x + sigW, y);
        caps(label, x, y + 4, 6.5, MUTED);
    });

    // ---- Footers ------------------------------------------------------------
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(...RULE);
        pdf.setLineWidth(0.25);
        pdf.line(M, PAGE_H - FOOT, PAGE_W - M, PAGE_H - FOOT);
        font(7, false, MUTED);
        pdf.text([company, `Quotation ${quoteRef}`].filter(Boolean).join('  ·  '), M, PAGE_H - FOOT + 4.5);
        pdf.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - FOOT + 4.5, { align: 'right' });
    }

    pdf.setProperties({
        title: `Quotation ${quoteRef}${project.clientName ? ` - ${project.clientName}` : ''}`,
        subject: quote.title,
        author: company || undefined,
        creator: company || ' ',
    });
    return pdf.output('blob');
}

export const quoteFileName = (q: Pick<Quote, 'number' | 'version'>, clientName: string) =>
    `Quotation ${q.number}${q.version > 1 ? ` v${q.version}` : ''}${clientName ? ` - ${clientName}` : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '');

export { categoryLabel };
