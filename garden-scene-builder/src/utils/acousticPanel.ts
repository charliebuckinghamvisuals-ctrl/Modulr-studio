/**
 * The slatted acoustic wall panel (Charlie, 24 Sep 2026): 50mm oak slats on a
 * 60mm pitch over black acoustic felt, as exported - 21 slats, 1250mm wide,
 * 2000mm tall.
 *
 * It is sized in whole slats. A wider panel has MORE slats at the same
 * spacing, never fatter ones, so the width is always n slats plus the gaps
 * between them: 60n - 10 mm. Height is free - the slats just run longer.
 */
export const SLAT_W_MM = 50;
export const SLAT_PITCH_MM = 60;
export const ACOUSTIC_NATIVE = { widthMm: 1250, heightMm: 2000 };
export const ACOUSTIC_MIN_SLATS = 6;
export const ACOUSTIC_MAX_SLATS = 60;
export const ACOUSTIC_HEIGHT_RANGE: [number, number] = [600, 3000];

export const widthForSlats = (n: number) => n * SLAT_PITCH_MM - (SLAT_PITCH_MM - SLAT_W_MM);

/** How many slats a width holds, rounded to the nearest whole slat. */
export const slatCount = (widthMm: number) =>
  Math.max(ACOUSTIC_MIN_SLATS, Math.min(ACOUSTIC_MAX_SLATS, Math.round((widthMm + SLAT_PITCH_MM - SLAT_W_MM) / SLAT_PITCH_MM)));

export const snapAcousticWidth = (widthMm: number) => widthForSlats(slatCount(widthMm));

export const ACOUSTIC_WIDTH_RANGE: [number, number] = [widthForSlats(ACOUSTIC_MIN_SLATS), widthForSlats(ACOUSTIC_MAX_SLATS)];
