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
  kitchen_unit_600: 'models/kitchen_unit_600.glb',
  kitchen_unit_1200: 'models/kitchen_unit_1200.glb',
  kitchen_sink_1200: 'models/kitchen_sink_1200.glb',
};

/**
 * Objects whose WIDTH can be changed, with the width the model was built at.
 *
 * Only the X axis is scaled, so the carcass keeps its true 600mm depth and
 * 900mm worktop height at any width - uniform scaling would give you a
 * 1200mm-high worktop on a wide unit. The doors and sink do stretch, so the
 * slider is deliberately bounded rather than open-ended.
 */
export const NATIVE_WIDTH_MM: Partial<Record<ObjectType, number>> = {
  kitchen_unit_600: 600,
  kitchen_unit_1200: 1203,
  kitchen_sink_1200: 1203,
};

/** Allowed width range per type, in mm. */
export const WIDTH_RANGE_MM: Partial<Record<ObjectType, [number, number]>> = {
  kitchen_unit_600: [400, 900],
  kitchen_unit_1200: [900, 1800],
  kitchen_sink_1200: [900, 1800],
};

export const isWidthAdjustable = (type: ObjectType) => NATIVE_WIDTH_MM[type] !== undefined;

/**
 * Name of the material inside the model that represents the "body" - the part
 * a customer picks a colour for. Only this material is recoloured, so the
 * marble worktop, stainless sink and steel handles keep their own finish.
 *
 * These cabinets came out of SketchUp with roughness 0, which reads as wet
 * plastic under the scene lights; the body material is also forced matte.
 */
export const TINT_MATERIAL: Partial<Record<ObjectType, string>> = {
  kitchen_unit_600: 'M03_Pewter_Shine',
  kitchen_unit_1200: 'M03_Pewter_Shine',
  kitchen_sink_1200: 'M03_Pewter_Shine',
};

export const UNIT_COLOURS: { name: string; hex: string }[] = [
  { name: 'Light Grey', hex: '#d4d4d4' },
  { name: 'White', hex: '#f2f2f0' },
  { name: 'Cashmere', hex: '#d8cfc0' },
  { name: 'Sage', hex: '#8d9a86' },
  { name: 'Slate Blue', hex: '#6d7f92' },
  { name: 'Anthracite', hex: '#4a4e52' },
  { name: 'Graphite', hex: '#2c2f31' },
  { name: 'Oak', hex: '#b08a5c' },
];

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
  kitchen_unit_600: 'Single Door Unit',
  kitchen_unit_1200: 'Double Door Unit',
  kitchen_sink_1200: 'Sink Unit',
  toilet: 'Toilet',
  vanity: 'Vanity Unit',
  shower: 'Shower (Large)',
  shower_corner: 'Shower (Corner)',
  shower_small: 'Shower (Small)',
};

export const GLB_OBJECT_TYPES = Object.keys(GLB_OBJECT_LABELS).filter(t => (MODEL_URLS as Record<string, string>)[t]) as ObjectType[];
