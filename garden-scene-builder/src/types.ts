export type ShapeType = 'Box' | 'LShape' | 'Gable';
export type CladdingType =
  // Composite range offered in the sidebar picker. These must match the keys in
  // MATERIAL_DEF, or the swatch applies a value that falls back to 'default'.
  | 'cedar_composite' | 'oak_composite' | 'light_oak_composite' | 'black_composite'
  | 'dark_grey_composite' | 'light_grey_composite' | 'white_composite'
  | 'slate_blue_composite' | 'sage_composite' | 'clay_composite'
  | 'grey_composite'
  // Poly Haven sets added 8 Sep 2026: a corrugated steel sheet, and painted
  // vertical boards whose colour is the room's claddingTint.
  | 'corrugated_iron' | 'painted_planks'
  // Legacy values retained so previously saved scenes still resolve.
  | 'timber' | 'composite_wood' | 'composite_black' | 'composite_grey'
  | 'composite_brown' | 'oak' | 'cedar' | 'charred_wood' | 'render_white'
  | 'box_metal_grey' | 'box_metal_black' | 'corrugated_metal' | 'fire_board_grey';
export type BaseMaterialType = 'concrete' | 'timber_decking' | 'composite_decking';
export type DeckingMaterialType = 'timber' | 'composite_grey' | 'composite_oak' | 'composite_cedar' | 'composite_brown' | 'composite_black';
export type RoofMaterialType = 'epdm' | 'sedum' | 'upvc' | 'metal';
export type FrameColorType = 'anthracite' | 'black' | 'white' | 'silver';
export type ObjectType = 'tree' | 'conifer' | 'hedge' | 'shrub' | 'flowerbed' | 'planter' | 'bench' | 'slab' | 'patio' | 'toilet' | 'sink' | 'shower' | 'shower_corner' | 'shower_small' | 'vanity' | 'interior_wall' | 'interior_door' | 'desk' | 'sofa' | 'sofa_2seater' | 'sofa_l' | 'footstool' | 'armchair' | 'dining_table' | 'rug' | 'tv' | 'bed' | 'bedside_table' | 'bookshelf' | 'dressing_table' | 'wardrobe' | 'exterior_wall_light' | 'drop_light' | 'coffee_table' | 'coffee_table_black' | 'indoor_plant' | 'kitchen_island' | 'kitchen_unit_600' | 'kitchen_unit_1200' | 'kitchen_sink_1200' | 'kitchen_tall_fridge' | 'kitchen_tall_oven_single' | 'kitchen_tall_oven_double' | 'kitchen_tap_straight' | 'kitchen_tap_curved' | 'kitchen_drawer_2' | 'kitchen_drawer_3' | 'kitchen_tall_larder' | 'kitchen_hob_gas' | 'kitchen_hob_induction' | 'kitchen_extractor'
 | 'kitchen_wall_unit_600' | 'kitchen_wall_unit_1200'
 | 'bar_stool' | 'bar_stool_tall' | 'towel_heater' | 'external_extraction_fan'
 | 'spot_light' | 'tv_unit' | 'dining_table_round' | 'pendant_light'
 | 'end_panel_tall' | 'end_panel_base' | 'end_panel_wall';

/** 'solid' is doors-only (entrance door); the window UI never offers it. */
export type GlazingStyle = 'standard' | 'crittall' | 'solid';

export interface Door {
  id: string;
  wall: 'front' | 'back' | 'left' | 'right';
  widthMm: number;
  heightMm: number;
  offsetMm: number;
  leaves: number;
  style?: GlazingStyle;
}

export type InteriorFloorType = 'oak_plank' | 'light_oak' | 'rustic_pine' | 'smoked_oak' | 'oak_herringbone' | 'walnut_parquet';

export interface WindowData {
  id: string;
  wall: 'front' | 'back' | 'left' | 'right';
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  leaves?: number;
  fullHeight?: boolean;
  style?: GlazingStyle;
}

export type FrameStyleType = 'default' | 'slim' | 'ultra-slim';

export interface SkylightData {
  id: string;
  widthMm: number;
  lengthMm: number;
  offsetX: number;
  offsetZ: number;
  type: 'flat' | 'lantern';
}

export interface InteriorDoorData {
  id: string;
  xMm: number;
  zMm: number;
  rotation: number;
  widthMm: number;
  heightMm: number;
}

/** A doorway belonging to an internal wall. Offset is measured along the
 *  wall from its CENTRE, so doors travel with the wall when it moves -
 *  the old world-positioned interior doors got left behind. */
/** What fills an internal wall's doorway. Undefined = a plain opening with
 *  a painted frame; the others are modelled door sets (see
 *  INTERIOR_DOOR_STYLES in modelRegistry). */
export type InteriorDoorStyle = 'oak_country' | 'white_country';

export interface PartitionDoor {
  id: string;
  style?: InteriorDoorStyle;
  /** Hinge and handle finish - a METAL_FINISHES hex. Undefined = chrome. */
  ironmongery?: string;
  /** Which side of the wall the leaf swings into: +1 (default) is the
   *  wall's local +Z face, -1 the other. The set is turned round with it,
   *  so the hinges are always on the face the door opens towards. */
  swing?: 1 | -1;
  /** On the main run: from the wall's centre along its local +X. On the leg
   *  (onLeg): the distance from the corner along the leg to the door's near
   *  edge - the number a person actually sets out with. */
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  /** The door is in the L-shape's leg rather than the main run. */
  onLeg?: boolean;
}

export interface PartitionData {
  id: string;
  xMm: number;
  zMm: number;
  lengthMm: number;
  thicknessMm: number;
  rotation: 0 | 90;
  doors?: PartitionDoor[];
  /** L-shape: a perpendicular leg welded to one end of the main run.
   *  0/undefined = straight wall. */
  legLengthMm?: number;
  /** Which end of the main run the leg sits on (+1 = the local +X end). */
  legEnd?: 1 | -1;
  /** Which side the leg turns towards (+1 = local +Z). */
  legDir?: 1 | -1;
}

export interface Room {
  shape: ShapeType;
  widthMm: number;
  depthMm: number;
  wallThicknessMm?: number;
  heightMm: number;
  backHeightMm?: number;
  baseHeightMm: number;
  roofHeightMm: number;
  /** Gable bargeboard/fascia depth in mm (the visible edge of the sloped roof
   *  slabs). 100mm default; clamped 50-400 in the geometry. */
  gableFasciaMm?: number;
  /** Gable ridge direction. 'front' (default): ridge runs front-to-back,
   *  apex triangles on the front/back walls. 'side': ridge runs left-to-right,
   *  apex triangles on the side walls - the annexe look, eaves facing front. */
  gableOrientation?: 'front' | 'side';
  /** Gable only: glaze the front apex triangle instead of cladding it.
   *  Front-orientation gables only. */
  hasApexGlazing?: boolean;
  /** 'framed' (default): rake rails + mullions. 'plain': frameless glass. */
  apexGlazingStyle?: 'framed' | 'plain';
  /** Gable only. Off (default): the ceiling follows the roof pitch, vaulted to
   *  the ridge. On: a flat ceiling is boarded across at gableCeilingHeightMm,
   *  with the roof void above it. */
  gableFlatCeiling?: boolean;
  /** Gable only. Flat ceiling height in mm, measured from the FINISHED FLOOR -
   *  which is what a customer means by "how high is the ceiling", and is not
   *  the same as heightMm (that one is the whole building, ground to ridge).
   *  Clamped in the geometry between the wall head and the ridge; set it at or
   *  below the wall head for a plain flat ceiling, or part way up for a flat
   *  centre with the pitch still showing at the eaves. */
  gableCeilingHeightMm?: number;
  cladding: CladdingType;
  claddingFront?: CladdingType;
  claddingBack?: CladdingType;
  claddingLeft?: CladdingType;
  claddingRight?: CladdingType;
  claddingGable?: CladdingType;
  /** Paint colour for the 'painted_planks' cladding - any hex. */
  claddingTint?: string;
  fasciaMaterial?: 'match_cladding' | 'black' | 'anthracite' | 'white' | 'grey';
  /** Explicit roof colour. Undefined means follow the roof material's own colour. */
  roofColor?: string;
  claddingOrientation?: 'horizontal' | 'vertical';
  claddingWidthMm?: number;
  baseMaterial: BaseMaterialType;
  roofMaterial: RoofMaterialType;
  frameColor: FrameColorType;
  /** Colour of the INSIDE face of every window and door frame. Dual-colour
   *  systems - black out, white in - are a normal spec. Unset means the same
   *  as outside, so every design saved before this existed is unchanged. */
  frameColorInner?: FrameColorType;
  frameStyle?: FrameStyleType;
  interiorColor: string;
  interiorFloorType: InteriorFloorType;
  /** Worktop surface id (see WORKTOPS). One kitchen has one worktop, so this
   *  lives on the room rather than per unit. */
  worktopMaterial?: string;
  /** Cabinet door finish - matt, satin or gloss. Kitchen-wide, like the
   *  worktop: mixing finishes across one run is not a thing people spec. */
  unitFinish?: 'matt' | 'satin' | 'gloss' | 'oak_veneer' | 'walnut_veneer' | 'silver_oak_veneer';
  /** Board-size multiplier for the interior floor: 1 = the material's real
   *  scale, 2 = planks twice as wide. */
  floorScale?: number;
  x: number;
  z: number;
  rot: number;
  doors: Door[];
  hasDoorHandles?: boolean;
  hasDoorSteps?: boolean;
  hasGuttering?: boolean;
  windows: WindowData[];
  skylights: SkylightData[];
  partitions: PartitionData[];
  interiorDoors?: InteriorDoorData[];
  showDimensions: boolean;
  hasCanopy?: boolean;
  canopySizeMm?: number;
  hasPictureFrame?: boolean;
  hasDecking?: boolean;
  deckingSizeMm?: number;
  deckingMaterial?: DeckingMaterialType;
  overhangLeftMm?: number;
  overhangRightMm?: number;
  overhangBackMm?: number;
  lShapeCutoutWidthMm?: number;
  lShapeCutoutDepthMm?: number;
}

export interface SceneObject {
  id: string;
  type: ObjectType;
  x: number;
  z: number;
  rot: number;
  scale: number;
  widthMm?: number;
  depthMm?: number;
  color?: string;
  hasDoorGap?: boolean;
  /** Gap centre, measured from the wall's midpoint (legacy). The editor now
   *  shows and edits it as a distance from the wall's start end. */
  doorGapOffsetMm?: number;
  doorGapWidthMm?: number;
  returnLengthMm?: number;
  /** Put the door gap in the L-shape's return leg instead of the main run. */
  doorGapOnReturn?: boolean;
  /** Gap start, measured along the return from the outside corner. */
  doorGapReturnMm?: number;
  /** Interior door leaf. Procedural placeholders until the modelled doors
   *  arrive; each style will then map to a GLB. */
  doorStyle?: 'flush' | 'panelled' | 'glazed';
  /** A BESPOKE unit: detached from its kitchen run, so changing the run's
   *  colour leaves it alone. For the island in a contrasting colour, which is
   *  a normal thing to specify and was impossible while a family recolour
   *  overwrote every unit in it. */
  independent?: boolean;
  /** Worktop override for a bespoke unit. Falls back to the room's. */
  worktopMaterial?: string;
  /** Wood veneer on a timber piece (a VENEERS id). Unset = the model's own
   *  finish, or its default oak dressing. */
  veneer?: string;
  /** Objects laid out together as one run - a row of downlights. They move as
   *  a unit, because dragging six spots one at a time to shift a row 200mm is
   *  exactly the tedium the layout tool exists to remove. */
  groupId?: string;
}

export interface FenceRun {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface PricingConfig {
  basePricePerSqm: number;
  canopyPricePerSqm: number;
  deckingPricePerSqm: number;
  doorLeafPrice: number;
  windowPricePerSqm: number;
  skylightPrice: number;
  partitionLmPrice: number;
  claddingPrices: Record<string, number>;
  roofPrices: Record<string, number>;
  basePrices: Record<string, number>;
}

export interface SceneState {
  room: Room;
  objects: SceneObject[];
  fences: FenceRun[];
  pricing: PricingConfig;
  env: {
    time: 'day' | 'night';
    grass: boolean;
  };
  garden: {
    width: number;
    depth: number;
  };
}

/** 'lighting' is a reflected ceiling plan - the drawing the trade actually
 *  uses to set out downlights. Top-down like 'plan', but with the roof and
 *  ceiling stripped away so the fittings are the subject. */
export type ViewMode = '3d' | 'plan' | 'capture' | 'render' | 'walking' | 'lighting';
export type ToolMode = 'select' | 'place' | 'fence';

