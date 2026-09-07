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
  kitchen_tall_fridge: 'models/kitchen_tall_fridge.glb',
  kitchen_tall_oven_single: 'models/kitchen_tall_oven_single.glb',
  kitchen_tall_oven_double: 'models/kitchen_tall_oven_double.glb',
  kitchen_tap_straight: 'models/kitchen_tap_straight.glb',
  kitchen_tap_curved: 'models/kitchen_tap_curved.glb',
  kitchen_drawer_2: 'models/kitchen_drawer_2.glb',
  kitchen_drawer_3: 'models/kitchen_drawer_3.glb',
  kitchen_tall_larder: 'models/kitchen_tall_larder.glb',
  kitchen_hob_gas: 'models/kitchen_hob_gas.glb',
  kitchen_hob_induction: 'models/kitchen_hob_induction.glb',
  kitchen_extractor: 'models/kitchen_extractor.glb',
  kitchen_wall_unit_600: 'models/kitchen_wall_unit_600.glb',
  kitchen_wall_unit_1200: 'models/kitchen_wall_unit_1200.glb',
  bar_stool: 'models/bar_stool.glb',
  bar_stool_tall: 'models/bar_stool_tall.glb',
  dining_table: 'models/dining_table.glb',
  towel_heater: 'models/towel_heater.glb',
  external_extraction_fan: 'models/external_extraction_fan.glb',
  spot_light: 'models/spot_light.glb',
};

/**
 * Types that fix to the CEILING rather than stand on the floor, with the
 * height of the fitting itself so it can be hung with its top face flush.
 *
 * A downlight cannot use MOUNT_HEIGHT_MM: that measures up from the floor, and
 * the ceiling is not at a fixed height - it moves with the wall height, and
 * under a vaulted gable it is not even level. These are positioned from
 * interiorCeilingHeight() instead.
 */
export const CEILING_MOUNTED: Partial<Record<ObjectType, number>> = {
  spot_light: 0.008,
};

export const isCeilingMounted = (type: ObjectType) => CEILING_MOUNTED[type] !== undefined;

/**
 * The material inside a fitting that is the LIT surface - the lens, not the
 * bezel. It is driven as an emissive so it glows on its own rather than
 * waiting to be lit by something else, which is what a lamp does.
 */
export const EMISSIVE_MATERIAL: Partial<Record<ObjectType, string>> = {
  spot_light: 'M01_Silver_Fog',
};

/** Lamp colours, warmest first - the temperatures people actually specify. */
export const LIGHT_COLOURS: { name: string; hex: string }[] = [
  { name: 'Warm White 2700K', hex: '#ffd6a5' },
  { name: 'Soft White 3000K', hex: '#ffe4c4' },
  { name: 'Neutral 4000K', hex: '#fff4e6' },
  { name: 'Cool White 5000K', hex: '#eaf1ff' },
];

export const isLightFitting = (type: ObjectType) => EMISSIVE_MATERIAL[type] !== undefined;

/**
 * Which run of cabinets a unit belongs to.
 *
 * Nobody specifies a kitchen cabinet by cabinet. A customer picks a door
 * colour for the BASE run, and then either matches the tall units to it or
 * deliberately contrasts them - a sage base with oak tall units is a normal
 * choice, six differently coloured base units is not. Recolouring one at a
 * time made the common case the tedious one and the mistake easy.
 */
export type UnitFamily = 'base' | 'wall' | 'tall';

export const UNIT_FAMILY: Partial<Record<ObjectType, UnitFamily>> = {
  kitchen_unit_600: 'base',
  kitchen_unit_1200: 'base',
  kitchen_sink_1200: 'base',
  kitchen_drawer_2: 'base',
  kitchen_drawer_3: 'base',
  kitchen_wall_unit_600: 'wall',
  kitchen_wall_unit_1200: 'wall',
  kitchen_tall_fridge: 'tall',
  kitchen_tall_oven_single: 'tall',
  kitchen_tall_oven_double: 'tall',
  kitchen_tall_larder: 'tall',
};

export const FAMILY_LABEL: Record<UnitFamily, string> = {
  base: 'Base units',
  wall: 'Wall units',
  tall: 'Tall units',
};

/**
 * Door finish, as a kitchen is actually specified.
 *
 * Matt, satin and gloss are not a slider - they are three products, and the
 * difference between them is how sharply the door returns a highlight. That is
 * roughness plus the clearcoat over the colour: a matt door scatters and shows
 * its own texture, a gloss door mirrors the room and hides it.
 */
export type UnitFinish = 'matt' | 'satin' | 'gloss';

export const UNIT_FINISHES: {
  id: UnitFinish; name: string;
  roughness: number; clearcoat: number; clearcoatRoughness: number;
  /** Relief in the base coat: softens the diffuse highlight. */
  normalScale: number;
  /** Relief in the lacquer itself - what makes a REFLECTION ripple. Orange
   *  peel physically lives in the clearcoat, so this is where most of it
   *  belongs on anything that reflects; the base only carries what shows
   *  through a matt film. */
  coatNormalScale: number;
  env: number;
}[] = [
  // Matt: the lacquer barely reflects, so the relief lives in the base coat,
  // where it breaks up the highlight rather than rippling a reflection.
  { id: 'matt',  name: 'Matt',  roughness: 0.72, clearcoat: 0.10, clearcoatRoughness: 0.60, normalScale: 0.30, coatNormalScale: 0.30, env: 0.8 },
  // Satin: the peel sits in the coat. It is the reflection wobbling across
  // the door that reads as sprayed paint, not the base under it.
  { id: 'satin', name: 'Satin', roughness: 0.40, clearcoat: 0.55, clearcoatRoughness: 0.22, normalScale: 0.15, coatNormalScale: 0.55, env: 1.1 },
  // Gloss: a tight, real reflection, with just enough peel to stop it being
  // a mirror - which is exactly what a gloss door looks like.
  { id: 'gloss', name: 'Gloss', roughness: 0.14, clearcoat: 1.0,  clearcoatRoughness: 0.06, normalScale: 0.06, coatNormalScale: 0.40, env: 1.5 },
];

export const finishSpec = (id?: string) =>
  UNIT_FINISHES.find(f => f.id === id) ?? UNIT_FINISHES[1];

export const unitFamily = (type: ObjectType) => UNIT_FAMILY[type];
export const familyTypes = (f: UnitFamily) =>
  (Object.keys(UNIT_FAMILY) as ObjectType[]).filter(t => UNIT_FAMILY[t] === f);

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
  kitchen_drawer_2: 600,
  kitchen_drawer_3: 600,
  // Wall units stretch along their length like the base units below them, so
  // a run of wall cupboards can be sized to the run of floor cupboards.
  kitchen_wall_unit_600: 600,
  kitchen_wall_unit_1200: 1200,
};

/** Allowed width range per type, in mm. */
export const WIDTH_RANGE_MM: Partial<Record<ObjectType, [number, number]>> = {
  kitchen_unit_600: [400, 900],
  kitchen_drawer_2: [400, 900],
  kitchen_drawer_3: [400, 900],
  kitchen_unit_1200: [900, 1800],
  kitchen_sink_1200: [900, 1800],
  kitchen_wall_unit_600: [400, 900],
  kitchen_wall_unit_1200: [900, 1800],
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
  // Tall units share the base units' body material, so a run of cabinets
  // recolours as one - the appliance fascias keep their own finish.
  kitchen_tall_fridge: 'M03_Pewter_Shine',
  kitchen_tall_oven_single: 'M03_Pewter_Shine',
  kitchen_tall_oven_double: 'M03_Pewter_Shine',
  kitchen_drawer_2: 'M03_Pewter_Shine',
  kitchen_drawer_3: 'M03_Pewter_Shine',
  kitchen_tall_larder: 'M03_Pewter_Shine',
  // The wall units came out of the export carrying ONLY this material, so
  // they recolour cleanly with the run of base units beneath them.
  kitchen_wall_unit_600: 'M03_Pewter_Shine',
  kitchen_wall_unit_1200: 'M03_Pewter_Shine',
  // The cabinet. It was exported with NO material at all, so nothing could
  // reach it by name; vanity.glb was patched to give that mesh this one.
  // The basin, tap and top keep their own finishes.
  vanity: 'VanityBody',
};

/**
 * Objects that mount on top of a worktop rather than standing on the floor,
 * with the height (mm above the finished floor) they sit at. Taps are the
 * only ones today: they belong on the 900mm sink unit, and placed on the
 * floor they read as a garden standpipe.
 *
 * Applied in SceneObjects (the placed object) and PlacementGhost (the
 * preview), so a tap is already at worktop height while you are aiming it.
 */
export const MOUNT_HEIGHT_MM: Partial<Record<ObjectType, number>> = {
  kitchen_tap_straight: 900,
  kitchen_tap_curved: 900,
  // Hobs drop into the worktop, so they sit on its 900mm surface.
  kitchen_hob_gas: 900,
  kitchen_hob_induction: 900,
  // 600mm clearance over the hob is the standard extraction height.
  kitchen_extractor: 1500,
  // Wall cupboards hang at the same height as the hood, so a run of them
  // lines up with it across the wall.
  kitchen_wall_unit_600: 1500,
  kitchen_wall_unit_1200: 1500,
  // A towel rail is fixed clear of the floor.
  towel_heater: 300,
  // The extract terminal goes high on the OUTSIDE wall. Not an interior type,
  // so this is measured from the ground rather than the finished floor.
  external_extraction_fan: 2000,
  // A wall-hung pan hangs clear of the floor - it was sitting on it. 100mm
  // under this pan puts its seat at 477mm, comfort height.
  toilet: 100,
};

/** The extractor's flue is a separate model so it can be stretched to meet
 *  the ceiling whatever the room height - see SceneObjects. */
export const EXTRACTOR_FLUE_URL = 'models/kitchen_extractor_flue.glb';
export const EXTRACTOR_CANOPY_H = 0.07;   // canopy thickness, m
export const EXTRACTOR_FLUE_H = 0.955;    // native flue height, m

/** Height (m) an object sits at above the finished floor - 0 for anything
 *  that stands on it. */
export const mountHeight = (type: ObjectType) => (MOUNT_HEIGHT_MM[type] ?? 0) / 1000;

/**
 * Per-model material corrections, applied when the GLB is instanced.
 *
 * The SketchUp exporter writes nearly every material as roughness 0.5 /
 * metalness 0.5 - halfway between everything, so steel reads as white
 * plastic and the oven door 'glass' as a washed-out grey texture. Each entry
 * here overrides one named material with real PBR values; 'dropMap' also
 * discards the baked texture where it is the thing making the surface muddy.
 */
export type MaterialTweak = {
  color?: string;
  roughness?: number;
  metalness?: number;
  dropMap?: boolean;
  envMapIntensity?: number;
};

const OVEN_TWEAKS: Record<string, MaterialTweak> = {
  // The door front: gloss black glass like the appliance brochures - the
  // baked dot texture is what made it look lilac.
  'PDM Black glass03 Miele_series': { color: '#0a0a0c', roughness: 0.06, metalness: 0.85, dropMap: true, envMapIntensity: 1.3 },
  'PDM Black02 Miele_series': { color: '#111113', roughness: 0.2, metalness: 0.4, dropMap: true },
  // Handles and trim.
  'PDM Stainless steel': { roughness: 0.28, metalness: 1.0, envMapIntensity: 1.1 },
  'PDM Charcoal Miele_series': { roughness: 0.45, metalness: 0.1 },
};

export const MATERIAL_TWEAKS: Partial<Record<ObjectType, Record<string, MaterialTweak>>> = {
  kitchen_tall_oven_single: OVEN_TWEAKS,
  kitchen_tall_oven_double: OVEN_TWEAKS,
};

/**
 * Materials that represent the tap's metalwork, per tap model. These get a
 * user-selectable finish (chrome, stainless, brass...) instead of a paint
 * colour - metalness 1 plus the scene HDR is what makes them read as metal.
 */
export const METAL_MATERIALS: Partial<Record<ObjectType, string[]>> = {
  kitchen_tap_straight: ['[Mirror 01]1'],
  kitchen_tap_curved: ['<auto>', '<auto>1'],
  // A towel rail is all metalwork, so the whole thing takes the finish.
  towel_heater: ['fragranit'],
  // Brushed steel legs under a timber top.
  dining_table: ['[Steel Brushed Stainless]'],
  // The flush plate. Not a material in the export - the whole toilet is one
  // "Porcelain" mesh - so it is cut out by shape at load and given this name;
  // see ISLAND_SPLITS in utils/materialFixes. From here on it is a tap.
  toilet: ['FlushPlate'],
};

/**
 * Types whose imported materials should be forced DIELECTRIC (metalness 0).
 *
 * The SketchUp exporter writes metalness 0.5 on every material it does not
 * know about - a value that exists nowhere in reality. Half-metal darkens the
 * diffuse colour and drinks the light, which is what makes imported furniture
 * look muddy and grey next to the units. Anything genuinely metal is named in
 * METAL_MATERIALS above and is handled before this.
 *
 * Deliberately opt-in per type rather than applied to every model: the older
 * imports have been tuned by eye against the scene lighting and are signed
 * off, and re-basing them now would change models nobody complained about.
 */
/**
 * Types with a MIRRORED component whose normals need turning back.
 *
 * SketchUp places a matching pair - two pillows, two bedside tables - as one
 * component used twice with the second flipped, and transforming a normal by a
 * mirror turns it inward, so that copy is lit as though it faced away.
 *
 * Opt-in per type rather than applied to every mirrored mesh: run globally it
 * turned the fabric thumbnails in the picker black, so whatever it was
 * catching there was not a case that needed fixing. Add a type here only when
 * a mirrored part is visibly wrong on it.
 */
export const UNMIRROR_NORMALS: Partial<Record<ObjectType, true>> = {
  bed: true,
};

export const FORCE_DIELECTRIC: Partial<Record<ObjectType, true>> = {
  bar_stool: true,
  bar_stool_tall: true,
  dining_table: true,
  towel_heater: true,
  external_extraction_fan: true,
  bed: true,
  // Porcelain and a painted cabinet - neither is half metal.
  toilet: true,
  vanity: true,
};

/**
 * Upholstery: which material inside each soft-furniture model is the fabric,
 * and how much to repeat the weave over it.
 *
 * Each repeat is MEASURED from the model, not guessed: total UV area over
 * total world area gives the exporter's UV-units-per-metre, and
 * repeat = 1 / (0.4m * uvPerMetre) makes one tile of the 40cm source fabric
 * cover exactly 40cm of upholstery. Eyeballing this put the weave ~35x
 * oversized - the raw UV min/max is misleading because a handful of stray
 * outlier UVs stretch the range far beyond where the actual surface sits.
 */
export const FABRIC_MATERIAL = 'Material~1';

export const FABRIC_REPEAT: Partial<Record<ObjectType, number>> = {
  sofa: 1.3,
  sofa_l: 1.23,
  armchair: 1.21,
  footstool: 1.24,
};

export const hasFabric = (type: ObjectType) => FABRIC_REPEAT[type] !== undefined;

/**
 * Upholstery colours.
 *
 * The weave photograph is a light natural grey, and a colour MULTIPLIES
 * through it - which keeps the woven detail visible instead of flooding it
 * with flat paint. That also means these can only go darker than the cloth,
 * so the range is mid-to-deep tones an upholsterer would actually offer
 * rather than pastels that would come out muddy.
 */
/**
 * Worktop surfaces. Every kitchen model carries one material for its top -
 * 'Marble_20_1K' from the original SketchUp export - so swapping that
 * material's maps re-surfaces every unit at once.
 *
 * tileMetres is how much real worktop one tile of the photograph covers.
 * Stone is cut from a slab, so a big tile keeps the veining broad rather
 * than repeating into wallpaper; the timber tile is smaller because board
 * widths need to read at the right size.
 */
export const WORKTOP_MATERIAL = 'Marble_20_1K';

export type WorktopDef = { id: string; name: string; prefix: string; tileMetres: number; roughness: number };

export const WORKTOPS: WorktopDef[] = [
  { id: 'carrara', name: 'Carrara Marble', prefix: 'wt_carrara', tileMetres: 2.4, roughness: 0.22 },
  { id: 'onyx', name: 'White Onyx', prefix: 'wt_onyx', tileMetres: 2.4, roughness: 0.2 },
  { id: 'cream', name: 'Cream Marble', prefix: 'wt_cream', tileMetres: 2.4, roughness: 0.2 },
  { id: 'travertine', name: 'Travertine', prefix: 'wt_travertine', tileMetres: 2.4, roughness: 0.26 },
  { id: 'umber', name: 'Umber Marble', prefix: 'wt_umber', tileMetres: 2.4, roughness: 0.24 },
  { id: 'nero', name: 'Nero Marble', prefix: 'wt_nero', tileMetres: 2.4, roughness: 0.24 },
  { id: 'oak', name: 'Oak Timber', prefix: 'wt_oak', tileMetres: 1.6, roughness: 0.45 },
];

export const DEFAULT_WORKTOP = 'carrara';

export const worktopById = (id: string | undefined) =>
  WORKTOPS.find(w => w.id === id) ?? WORKTOPS[0];

/** True for anything that has a worktop to re-surface. */
export const hasWorktop = (type: ObjectType) =>
  type.startsWith('kitchen_unit') || type.startsWith('kitchen_sink') || type.startsWith('kitchen_drawer');

export const FABRIC_COLOURS: { name: string; hex: string }[] = [
  { name: 'Natural', hex: '#ffffff' },
  { name: 'Oatmeal', hex: '#e0d5c2' },
  { name: 'Pebble', hex: '#c2bdb5' },
  { name: 'Dove Grey', hex: '#9aa0a3' },
  { name: 'Sage', hex: '#8e9c88' },
  { name: 'Teal', hex: '#5c8790' },
  { name: 'Navy', hex: '#3d4d69' },
  { name: 'Rust', hex: '#a9603f' },
  { name: 'Mustard', hex: '#c19a4b' },
  { name: 'Charcoal', hex: '#54565a' },
];

export const METAL_FINISHES: { name: string; hex: string; roughness: number }[] = [
  { name: 'Chrome', hex: '#e6e7e9', roughness: 0.05 },
  { name: 'Stainless Steel', hex: '#c8c9c7', roughness: 0.3 },
  { name: 'Brushed Brass', hex: '#c8a35f', roughness: 0.32 },
  { name: 'Polished Brass', hex: '#d9b44a', roughness: 0.1 },
  { name: 'Matte Black', hex: '#26262a', roughness: 0.55 },
];

/** Finish used before the customer picks one - the curved tap was modelled
 *  as a gold design, so it starts on brass. */
export const DEFAULT_FINISH: Partial<Record<ObjectType, string>> = {
  kitchen_tap_straight: '#e6e7e9',
  kitchen_tap_curved: '#c8a35f',
  toilet: '#e6e7e9',
};

export const hasMetalFinish = (type: ObjectType) => METAL_MATERIALS[type] !== undefined;

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
  // Tall kitchen units were modelled 2.208m; the default room is 2.05m
  // internally, so they are squashed on Y only - uniform scaling would
  // narrow them off the 600mm module the base units line up on.
  kitchen_tall_fridge: [1, 2.0 / 2.208, 1],
  kitchen_tall_oven_single: [1, 2.0 / 2.208, 1],
  kitchen_tall_oven_double: [1, 2.0 / 2.208, 1],
  kitchen_tall_larder: [1, 2.0 / 2.208, 1],
  // The bezel was modelled at 60mm. Correct for the real fitting, but on a
  // ceiling two and a half metres away it is a speck - too small to read as a
  // layout and too small to grab. 100mm reads properly and is still a size
  // downlights are actually made in.
  spot_light: [1.7, 1.7, 1.7],
  // A low platform bed: measured mattress top at 0.57m over a 2.46 x 2.22m
  // footprint, which reads as a mattress on the floor. Stretched on Y only
  // to ~0.69m - hotel height - so the footprint the room was laid out around
  // does not change. Fabric and a duvet take a 20% stretch without showing it.
  bed: [1, 1.2, 1],
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
  kitchen_tall_fridge: 'Tall Fridge Unit',
  kitchen_tall_oven_single: 'Tall Single Oven',
  kitchen_tall_oven_double: 'Tall Double Oven',
  kitchen_tap_straight: 'Kitchen Tap',
  kitchen_tap_curved: 'Curved Kitchen Tap',
  kitchen_drawer_2: 'Double Drawer Unit',
  kitchen_drawer_3: 'Three Drawer Unit',
  kitchen_tall_larder: 'Tall Larder Unit',
  kitchen_hob_gas: 'Gas Hob',
  kitchen_hob_induction: 'Induction Hob',
  kitchen_extractor: 'Extractor Hood',
  kitchen_wall_unit_600: 'Wall Unit (Single)',
  kitchen_wall_unit_1200: 'Wall Unit (Double)',
  external_extraction_fan: 'External Extract Fan',
  dining_table: 'Dining Table',
  bar_stool: 'Bar Stool',
  bar_stool_tall: 'Bar Stool (Tall)',
  toilet: 'Toilet',
  vanity: 'Vanity Unit',
  shower: 'Shower (Large)',
  shower_corner: 'Shower (Corner)',
  shower_small: 'Shower (Small)',
  towel_heater: 'Towel Radiator',
  spot_light: 'Spotlight',
};

export const GLB_OBJECT_TYPES = Object.keys(GLB_OBJECT_LABELS).filter(t => (MODEL_URLS as Record<string, string>)[t]) as ObjectType[];
