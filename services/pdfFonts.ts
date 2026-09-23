/**
 * The typefaces a PDF proposal can be set in. Plain data, shared by the
 * Account page (where a company picks its font) and the configurator's PDF
 * export (which embeds it) - one list, so the two can never offer different
 * fonts.
 *
 * Helvetica is built into every PDF reader. The rest are Google Fonts under
 * the SIL Open Font License, kept as static TTFs in the configurator's
 * public/fonts (served at /3d-config/fonts/<file>-Regular.ttf and -Bold.ttf).
 */
export interface PdfFont {
    id: string;
    label: string;
    note: string;
    /** File stem in /3d-config/fonts; null for Helvetica. */
    file: string | null;
    /** The family name the font is loaded under for on-screen samples. */
    css: string;
}

export const PDF_FONTS: PdfFont[] = [
    { id: 'helvetica', label: 'Helvetica', note: 'Classic, neutral', file: null, css: 'Helvetica, Arial, sans-serif' },
    { id: 'inter', label: 'Inter', note: 'Modern, crisp', file: 'Inter', css: 'PdfInter' },
    { id: 'montserrat', label: 'Montserrat', note: 'Geometric, wide', file: 'Montserrat', css: 'PdfMontserrat' },
    { id: 'jost', label: 'Jost', note: 'Architectural, Futura-like', file: 'Jost', css: 'PdfJost' },
    { id: 'lato', label: 'Lato', note: 'Warm, friendly', file: 'Lato', css: 'PdfLato' },
    { id: 'playfair', label: 'Playfair Display', note: 'Elegant serif', file: 'PlayfairDisplay', css: 'PdfPlayfairDisplay' },
    { id: 'baskerville', label: 'Libre Baskerville', note: 'Traditional serif', file: 'LibreBaskerville', css: 'PdfLibreBaskerville' },
];

export const pdfFontById = (id: string | undefined | null) => PDF_FONTS.find(f => f.id === id) ?? PDF_FONTS[0];

/**
 * Load a font into the current page for a sample. `base` is where the fonts
 * are served from: 'fonts/' inside the configurator, '/3d-config/fonts/' in
 * the app.
 */
export function loadPdfFontSample(font: PdfFont, base: string) {
    if (!font.file || document.getElementById(`pdf-font-${font.id}`)) return;
    const style = document.createElement('style');
    style.id = `pdf-font-${font.id}`;
    style.textContent =
        `@font-face { font-family: '${font.css}'; font-weight: 400; src: url('${base}${font.file}-Regular.ttf') format('truetype'); }\n` +
        `@font-face { font-family: '${font.css}'; font-weight: 700; src: url('${base}${font.file}-Bold.ttf') format('truetype'); }`;
    document.head.appendChild(style);
}
