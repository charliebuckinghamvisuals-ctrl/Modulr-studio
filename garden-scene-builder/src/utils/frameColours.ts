import type { FrameColorType } from '../types';

/**
 * The four frame finishes, in one place. RoomGeometry used to keep this map
 * inline; the walkthrough frame panel needs the same hexes for its swatches,
 * and two copies of a colour table is how they drift apart.
 */
export const FRAME_COLOURS: { id: FrameColorType; name: string; hex: string }[] = [
  { id: 'anthracite', name: 'Anthracite', hex: '#2d3032' },
  { id: 'black',      name: 'Black',      hex: '#1a1a1a' },
  { id: 'white',      name: 'White',      hex: '#f0f0f0' },
  { id: 'silver',     name: 'Silver',     hex: '#a0a4a8' },
];

/** Hex for a frame colour id, anthracite for anything unknown. */
export const frameColourHex = (id?: string) =>
  (FRAME_COLOURS.find(c => c.id === id) ?? FRAME_COLOURS[0]).hex;
