import type { jsPDF } from 'jspdf';
import { PDF_FONTS, pdfFontById, loadPdfFontSample, type PdfFont } from '../../../services/pdfFonts';

/**
 * Embedding the proposal's typeface - "please let user change font"
 * (Charlie, 23 Sep 2026). The list itself is shared with the app's Account
 * page (services/pdfFonts.ts). jsPDF embeds TrueType only, not WOFF or
 * variable fonts, so the files are static TTFs; each is fetched the first
 * time it is used and embedded in the PDF.
 */
export { PDF_FONTS, type PdfFont };
export const fontById = pdfFontById;
export const loadFontSample = (font: PdfFont) => loadPdfFontSample(font, 'fonts/');

const cache = new Map<string, Promise<string>>();

function ttfBase64(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(path).then(async r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      // A real TrueType file, not an HTML fallback page.
      if (bytes[0] !== 0 || bytes[1] !== 1) throw new Error(`${path} is not a TrueType font`);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/**
 * Embed a font in this PDF and return the family name for setFont. Anything
 * that goes wrong falls back to Helvetica - the proposal still comes out.
 */
export async function embedPdfFont(pdf: jsPDF, id: string | undefined): Promise<string> {
  const font = fontById(id);
  if (!font.file) return 'helvetica';
  try {
    const [regular, bold] = await Promise.all([
      ttfBase64(`fonts/${font.file}-Regular.ttf`),
      ttfBase64(`fonts/${font.file}-Bold.ttf`),
    ]);
    pdf.addFileToVFS(`${font.file}-Regular.ttf`, regular);
    pdf.addFont(`${font.file}-Regular.ttf`, font.file, 'normal');
    pdf.addFileToVFS(`${font.file}-Bold.ttf`, bold);
    pdf.addFont(`${font.file}-Bold.ttf`, font.file, 'bold');
    return font.file;
  } catch (e) {
    console.warn('PDF font unavailable, using Helvetica', e);
    return 'helvetica';
  }
}
