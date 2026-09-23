/**
 * The company branding a proposal is printed in.
 *
 * The app keeps each user's branding in Firestore and mirrors it into
 * localStorage under 'modulr_branding' (hooks/useBranding.ts in the app),
 * which is how this same-origin iframe reads it. Edits made here are written
 * to that mirror straight away and handed up to the app (SAVE_BRANDING) to
 * persist against the account - on the standalone configurator there is no
 * app, and the mirror is all there is.
 */
export interface PdfBrand {
  /** A data URL, PNG or JPEG. */
  logo: string | null;
  /** Bands, the price panel, the cover. */
  primary: string;
  /** Rules, accents, the sheet number. */
  secondary: string;
  companyName: string;
  /** Free text, one item per line: address, phone, email, web. */
  contactInfo: string;
  /** A PDF_FONTS id (fonts.ts). */
  font: string;
}

const KEY = 'modulr_branding';

export const DEFAULT_BRAND: PdfBrand = {
  logo: null,
  primary: '#3b4d4a',
  secondary: '#b89b72',
  // Never our name on a customer's proposal (Charlie: "GET RID OF MODULR
  // STUDIO TEXT ON PDFS"). No logo and no name leaves the space empty.
  companyName: '',
  contactInfo: '',
  font: 'helvetica',
};

const hexOk = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());

export function readBrand(): PdfBrand {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_BRAND };
    const b = JSON.parse(raw);
    return {
      logo: typeof b.logo === 'string' && b.logo.startsWith('data:image') ? b.logo : null,
      primary: hexOk(b.primaryColor) ? b.primaryColor : DEFAULT_BRAND.primary,
      secondary: hexOk(b.secondaryColor) ? b.secondaryColor : DEFAULT_BRAND.secondary,
      companyName: typeof b.companyName === 'string' && b.companyName.trim() ? b.companyName : DEFAULT_BRAND.companyName,
      contactInfo: typeof b.contactInfo === 'string' ? b.contactInfo : '',
      font: typeof b.pdfFont === 'string' && b.pdfFont ? b.pdfFont : DEFAULT_BRAND.font,
    };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export function saveBrand(brand: PdfBrand) {
  const fields = {
    logo: brand.logo,
    primaryColor: brand.primary,
    secondaryColor: brand.secondary,
    companyName: brand.companyName,
    contactInfo: brand.contactInfo,
    pdfFont: brand.font,
  };
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || '{}');
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...fields }));
  } catch { /* quota or private mode: the PDF still uses what is in memory */ }
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SAVE_BRANDING', branding: fields }, window.location.origin);
    }
  } catch { /* standalone */ }
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [59, 77, 74];
};

/** Black or white, whichever reads on this colour. */
export const inkOn = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? [28, 30, 32] : [255, 255, 255];
};
