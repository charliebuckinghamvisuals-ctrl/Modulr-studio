import { SunState, MOON_DIR } from './sun';

/**
 * The photographed skies: Day, Evening and Night (ambientCG, CC0, 2K) -
 * "add a switch or three buttons at the top so you can switch" (Charlie,
 * 23 Sep 2026).
 *
 * They replace the generated sky as the backdrop, and in the 3D view they
 * light the building too, so what the walls and glass reflect is the sky
 * you can see. They are horizon-cleared open skies with no buildings or
 * trees in them, which was the reason the generated sky was used in the
 * first place. Walk mode keeps its own lighting - the garden HDR with the
 * eight panels (see MainScene) - and only takes the backdrop.
 *
 * The sky FOLLOWS the time of day rather than being a separate setting:
 * the buttons set the time, the Lighting slider still works, and the sky
 * changes as the sun goes down. One source of truth, so the light and the
 * sky can never disagree.
 *
 * Numbers measured from the files (23 Sep 2026):
 *  - photoPsi: the bearing of the photo's sun or moon, as atan2(x, z) in
 *    three's equirect convention. All three sit at ~90 degrees.
 *  - envScale: lights the building to the same overall level as the HDR
 *    it replaces (mean luminance: garden_nook 0.749, night 0.167; these
 *    photos 0.542 / 0.197 / 0.077), so the tuned time-of-day brightness
 *    carries over and only the colour and structure change.
 *  - bgScale: how bright the backdrop is drawn, tuned against the
 *    photographs' own tonemapped previews.
 */
export type SkyKey = 'day' | 'evening' | 'night';

export interface SkyDef {
  label: string;
  file: string;
  /** The time of day the button sets. */
  hour: number;
  photoPsi: number;
  envScale: number;
  bgScale: number;
  /** Softens the photo when it is drawn as the backdrop (0 = sharp). */
  bgBlur?: number;
  /** Draw the stars as crisp points over the softened photo - see night. */
  pointStars?: boolean;
}

export const SKIES: Record<SkyKey, SkyDef> = {
  // The photo's sun is 32 degrees up; Day keeps the configurator's own
  // 1pm light, which everything else has been tuned under, and turns the
  // photo so the sun is on the side the shadows fall from.
  day: { label: 'Day', file: 'textures/sky_day.exr', hour: 13, photoPsi: 89.0, envScale: 1.38, bgScale: 2.8 },
  // The photo's sun sits on the horizon; 6:45pm puts the scene's sun 11
  // degrees up - golden, but the building still lit.
  evening: { label: 'Evening', file: 'textures/sky_evening.exr', hour: 18.75, photoPsi: 90.1, envScale: 3.8, bgScale: 1.9 },
  // The photo's moon is turned onto MOON_DIR, where the night key light
  // comes from. Its STARS are not used: at 2K each one covers several
  // screen pixels however the photo is drawn, so they read as blurred
  // blobs - "just make scale not as zoomed in" (Charlie, 23 Sep 2026). The
  // photo is softened (bgBlur) into the night sky's colour, horizon glow
  // and moon glow, and the stars are drawn as crisp points over it
  // (pointStars), with a moon disc on the photo's moon.
  night: { label: 'Night', file: 'textures/sky_night.exr', hour: 22, photoPsi: 90.3, envScale: 2.16, bgScale: 0.9, bgBlur: 0.5, pointStars: true },
};

/** Which sky goes with this sun: night once it is down (the same line the
 *  store's nightPreview uses), the evening sky while it is low, day above. */
export function skyForSun(sun: SunState): SkyKey {
  if (sun.elevation < 0) return 'night';
  if (sun.elevation < 15) return 'evening';
  return 'day';
}

/**
 * The Y rotation, in radians, that puts the photo's sun (or, at night, its
 * moon) on the bearing the scene's light comes from. three turns the
 * environment's CONTENT by +y under environmentRotation /
 * backgroundRotation, and a Y turn adds straight onto atan2(x, z).
 */
export function skyRotation(key: SkyKey, sun: SunState): number {
  const light = key === 'night' ? MOON_DIR : sun.dir;
  const lightPsi = Math.atan2(light[0], light[2]);
  return lightPsi - (SKIES[key].photoPsi * Math.PI) / 180;
}
