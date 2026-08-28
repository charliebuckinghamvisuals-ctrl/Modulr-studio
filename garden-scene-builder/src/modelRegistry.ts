import type { ObjectType } from './types';

/**
 * GLB-backed placeable objects - the single place new SketchUp models get
 * wired in. To add one:
 *   1. Drop the exported .glb into public/models/
 *   2. Add one line here mapping the object type to its file
 *   3. Rebuild + copy into public/3d-config (models/ folder included)
 * The Objects picker (Sidebar) and the 3D renderer (SceneObjects) both read
 * this registry, so one line makes the object placeable and rendered.
 *
 * The old procedural furniture builders still exist in SceneObjects for any
 * type NOT listed here, so previously saved designs keep rendering - but the
 * picker only offers types from this registry.
 */
export const MODEL_URLS: Partial<Record<ObjectType, string>> = {
  bed: 'models/bed.glb',
  bedside_table: 'models/bedside_table.glb',
  coffee_table: 'models/coffee_table_round.glb',
  coffee_table_black: 'models/coffee_table_black.glb',
  desk: 'models/desk_chair.glb',
  wardrobe: 'models/wardrobe.glb',
  armchair: 'models/armchair.glb',
  sofa: 'models/sofa.glb',
  sofa_l: 'models/sofa_l.glb',
  footstool: 'models/footstool.glb',
  toilet: 'models/toilet.glb',
  vanity: 'models/vanity.glb',
  shower: 'models/shower_large.glb',
  shower_corner: 'models/shower_corner.glb',
  shower_small: 'models/shower_small.glb',
};

/** Per-model render scale [x, y, z], applied on top of the GLB's own size.
 *  The wardrobe was modelled 2.44m tall - squashed to 2.0m so it clears the
 *  ceiling of a standard-height room. */
export const MODEL_SCALES: Partial<Record<ObjectType, [number, number, number]>> = {
  wardrobe: [1, 2.0 / 2.44, 1],
  // Shower enclosures modelled taller than a standard room - capped to 2.0m.
  shower: [1, 2.0 / 2.515, 1],
  shower_small: [1, 2.0 / 2.335, 1],
};

/** Picker labels for GLB-backed objects, in display order. */
export const GLB_OBJECT_LABELS: Partial<Record<ObjectType, string>> = {
  bed: 'Bed',
  bedside_table: 'Bedside Table',
  wardrobe: 'Wardrobe',
  desk: 'Desk & Chair',
  sofa: 'Sofa',
  sofa_l: 'L-Shape Sofa',
  armchair: 'Armchair',
  footstool: 'Footstool',
  coffee_table: 'Coffee Table (Oak)',
  coffee_table_black: 'Coffee Table (Black)',
  toilet: 'Toilet',
  vanity: 'Vanity Unit',
  shower: 'Shower (Large)',
  shower_corner: 'Shower (Corner)',
  shower_small: 'Shower (Small)',
};

export const GLB_OBJECT_TYPES = Object.keys(GLB_OBJECT_LABELS).filter(t => (MODEL_URLS as Record<string, string>)[t]) as ObjectType[];
