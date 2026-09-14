/**
 * The sun, from the time of day.
 *
 * One number drives the whole look - the slider on the canvas - so morning,
 * afternoon, evening and night are all the same scene under a moving sun,
 * the way Enscape does it, rather than a day look and a night look.
 *
 * Up at half five, down at half seven, highest at half twelve: the sun is
 * low from late afternoon, so five o'clock onward already has the long
 * light and the colour of a sunset rather than a flat mid-afternoon. Compass is in the
 * SCENE's terms - the building's front is +z, so the morning sun comes from
 * the right (+x), stands over the front at midday and sets on the left.
 */
export const SUNRISE = 5.5;
export const SUNSET = 19.5;
export const DAY_START = 6;   // slider range
export const DAY_END = 24;    // midnight

export interface SunState {
  /** Elevation above the horizon, degrees; negative after dark. */
  elevation: number;
  /** Where to put the sun (unit direction), in scene axes. */
  dir: [number, number, number];
  /** 0 = full night, 1 = full day, with dusk and dawn in between. */
  daylight: number;
  /** Warmth of the light: 0 at noon, 1 at the horizon. */
  warmth: number;
  night: boolean;
  /** Sunlight colour and strength for the directional light. */
  colour: string;
  intensity: number;
  /** Sky tuning for the atmosphere shader. */
  turbidity: number;
  rayleigh: number;
  mie: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return hex(lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t));
};

export function sunState(hours: number): SunState {
  const h = Math.max(0, Math.min(24, hours));
  // Fraction of the day arc, 0 at sunrise, 1 at sunset; outside that the
  // sun is below the horizon.
  const f = (h - SUNRISE) / (SUNSET - SUNRISE);
  const elevation = Math.sin(f * Math.PI) * 60; // peaks at 60 degrees
  // Morning from the right (+x), evening from the left (-x), over the front (+z) at noon.
  const az = (0.5 - f) * Math.PI * 0.9;
  const e = (elevation * Math.PI) / 180;
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e)];
  // Daylight: full with the sun well up, fading through the last 25
  // degrees so the evening actually dims, and a little afterglow below.
  const daylight = clamp01((elevation + 3) / 38);
  const night = elevation < -4;
  // Warmth starts creeping in from 40 degrees up, so late afternoon has
  // the golden cast before the sky itself goes orange.
  const warmth = clamp01((40 - elevation) / 40);
  const colour = mixHex('#fffcf2', '#ff8a38', Math.pow(warmth, 1.2));
  const intensity = night ? 0 : lerp(0.2, 2.0, clamp01(elevation / 35)) * clamp01((elevation + 4) / 10);
  return {
    elevation, dir, daylight, warmth, night, colour, intensity,
    turbidity: lerp(4, 14, warmth),
    rayleigh: lerp(1.2, 5.0, warmth),
    mie: lerp(0.005, 0.1, warmth),
  };
}

/** Moon: opposite the sun's arc, fixed high in the sky for the night. */
export const MOON_DIR: [number, number, number] = [-0.45, 0.55, -0.7];

export function formatHour(hours: number): string {
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, '0')} ${h >= 12 && h < 24 ? 'pm' : 'am'}`;
}
