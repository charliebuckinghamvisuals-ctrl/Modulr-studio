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
/** 'upvc' and 'metal' are kept so older saved designs still load; the
 *  pickers offer EPDM, rubber, aluminium and sedum. */
export type RoofMaterialType = 'epdm' | 'sedum' | 'rubber' | 'aluminium' | 'upvc' | 'metal';
/** What the door and window frames are made of. Colour is separate. */
export type FrameMaterialType = 'upvc' | 'aluminium' | 'timber';
export type FrameColorType = 'anthracite' | 'black' | 'white' | 'silver';
export type ObjectType = 'tree' | 'conifer' | 'hedge' | 'shrub' | 'flowerbed' | 'planter' | 'bench' | 'slab' | 'patio' | 'toilet' | 'sink' | 'shower' | 'shower_corner' | 'shower_small' | 'vanity' | 'interior_wall' | 'interior_door' | 'desk' | 'sofa' | 'sofa_2seater' | 'sofa_l' | 'footstool' | 'armchair' | 'dining_table' | 'rug' | 'tv' | 'bed' | 'bedside_table' | 'bookshelf' | 'dressing_table' | 'wardrobe' | 'exterior_wall_light' | 'drop_light' | 'coffee_table' | 'coffee_table_black' | 'indoor_plant' | 'kitchen_island' | 'kitchen_unit_600' | 'kitchen_unit_1200' | 'kitchen_sink_1200' | 'kitchen_tall_fridge' | 'kitchen_tall_oven_single' | 'kitchen_tall_oven_double' | 'kitchen_tap_straight' | 'kitchen_tap_curved' | 'kitchen_drawer_2' | 'kitchen_drawer_3' | 'kitchen_tall_larder' | 'kitchen_hob_gas' | 'kitchen_hob_induction' | 'kitchen_extractor'
 | 'kitchen_wall_unit_600' | 'kitchen_wall_unit_1200'
 | 'bar_stool' | 'bar_stool_tall' | 'towel_heater' | 'external_extraction_fan'
 | 'spot_light' | 'tv_unit' | 'dining_table_round' | 'pendant_light'
 | 'end_panel_tall' | 'end_panel_base' | 'end_panel_wall'
 | 'basin_tap_mixer' | 'basin_tap_widespread' | 'basin_tap_wall'
 | 'heater_small' | 'heater_large' | 'boiler'
 | 'shelving_unit' | 'chest_of_drawers' | 'desk_single' | 'bed_2' | 'office_chair'
 | 'aircon_indoor' | 'aircon_outdoor'
 // Outdoor section (utils/bay).
 | 'hot_tub'
 // Free garden objects: anywhere on the plot, not clamped to the room or the bay.
 | 'garden_steps' | 'garden_ramp'
 // Exterior wall lights: on the outside faces of the building (utils/placement snapToOutsideWall).
 | 'wall_light_sconce' | 'wall_light_angled' | 'wall_light_box' | 'wall_light_slim'
 // Games room.
 | 'pool_table' | 'arcade_machine'
 // Wall-hung: the TV lifted out of the media unit, and a dart board.
 | 'wall_tv' | 'dart_board'
 // L-shaped corner base unit (10 Sep).
 | 'kitchen_corner_unit';

/** 'solid' is doors-only (entrance door); the window UI never offers it. */
export type GlazingStyle = 'standard' | 'crittall' | 'solid';

/**
 * How an exterior door set opens - see utils/doors for the rules.
 * hinged: one leaf on side hinges. french: a pair, both hinged at the jambs.
 * bifold: leaves hinged to each other, concertina to a jamb. sliding: panes
 * in parallel tracks, gliding behind a fixed pane.
 */
export type DoorKind = 'hinged' | 'french' | 'bifold' | 'sliding';

export interface Door {
  id: string;
  /** 'bay' is the dividing wall between the room and the outdoor section
   *  (utils/bay): the door opens from the room into the section. Hidden
   *  while there is no section. */
  wall: 'front' | 'back' | 'left' | 'right' | 'bay';
  widthMm: number;
  heightMm: number;
  offsetMm: number;
  leaves: number;
  style?: GlazingStyle;
  /** Unset on older designs: worked out from the leaf count (utils/doors). */
  kind?: DoorKind;
  /** Hinged, French and bifold: 1 opens OUT to the garden, -1 opens in. */
  swing?: 1 | -1;
  /** Hinged: which jamb the hinges are on, viewed from outside. */
  hinge?: 'left' | 'right';
  /** Bifold: the jamb the leaves fold back to. Sliding: the side the panes
   *  slide toward (the fixed pane is there). 'split' halves them each way. */
  stack?: 'left' | 'right' | 'split';
}

export type InteriorFloorType = 'oak_plank' | 'light_oak' | 'rustic_pine' | 'smoked_oak' | 'oak_herringbone' | 'walnut_parquet';

export interface WindowData {
  id: string;
  /** 'bay' is the dividing wall between the room and the outdoor section
   *  (utils/bay) - a wall like any other while the section is on. */
  wall: 'front' | 'back' | 'left' | 'right' | 'bay';
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
  /** uPVC, aluminium or painted timber - the finish on every frame member.
   *  Unset on older designs = aluminium, which is what they were drawn as. */
  frameMaterial?: FrameMaterialType;
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
  /** The paint sheen the kitchen had before a veneer was chosen, so picking
   *  a colour brings the doors straight back to that paint - no separate
   *  "Paint" step (Charlie, 11 Sep). */
  unitPaintFinish?: 'matt' | 'satin' | 'gloss';
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
  /** Extra decking beyond the building's side, per side, in mm. The canopy
   *  does not follow: a client wanting a wider deck does not want a wider
   *  roof. Default 0. */
  deckingLeftMm?: number;
  deckingRightMm?: number;
  /** The deck's outline in building-local metres (x across, z front-positive,
   *  building centred on the origin), when the customer has reshaped it. Unset
   *  = the rectangle the three sizes above describe. See utils/deck. */
  deckOutline?: [number, number][];
  deckingMaterial?: DeckingMaterialType;
  overhangLeftMm?: number;
  overhangRightMm?: number;
  overhangBackMm?: number;
  lShapeCutoutWidthMm?: number;
  lShapeCutoutDepthMm?: number;
  /** The covered outdoor section - see utils/bay. Unset = none. */
  bay?: BayData;
}

/**
 * A covered outdoor section at one end of the building: open at the front
 * under the same roof, for a hot tub or an outdoor kitchen.
 */
export interface BayData {
  side: 'left' | 'right';
  /** Clear width, end wall to the dividing wall. */
  widthMm: number;
  /** Clear depth from the building's front face. Unset = the full depth;
   *  set, the bay is a corner and the room wraps round it in an L. */
  depthMm?: number;
  /** 'base' leaves the plinth's own surface showing. */
  floor: 'decking' | 'porcelain' | 'base';
  /** Decking key for the bay's deck (a DeckingMaterialType or a composite
   *  key). Unset = the building's own decking, or its cladding's match. */
  deckingMaterial?: string;
  /** Porcelain colour. */
  floorColour?: string;
  /** The post at the open front corner. */
  post: 'frame' | 'timber' | 'black' | 'white' | 'none';
  /** The end wall of the bay: the building's own wall, a slatted timber
   *  screen, a frameless glass screen, or nothing at all. */
  screen: 'solid' | 'slatted' | 'glass' | 'open';
  /** The back wall, full-depth bays only: the building's own wall, slats,
   *  or open to the garden behind. */
  backWall?: 'solid' | 'slatted' | 'open';
  /** What the bay's wall faces are finished in: the elevation's own cladding,
   *  a different cladding, or painted render. */
  wallFinish?: 'match' | 'cladding' | 'render';
  wallCladding?: CladdingType;
  wallColour?: string;
  /** The ceiling over the bay. Unset = 'roof': the underside of the roof in
   *  its own material - an outdoor section is not a painted room. */
  soffit?: 'roof' | 'white' | 'cladding' | 'slats';
  /** Colour of any timber slats - screen, back or soffit. */
  slatColour?: string;
  /** Soffit downlights, 0-4. Unset = 3. */
  lights?: number;
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
  /** Procedural garden pieces (steps, ramp): the total rise in mm, and the
   *  surface - 'concrete' or a decking material key (see DECK_MATERIALS). */
  riseMm?: number;
  surface?: string;
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
  /** Metal finish (a METAL_FINISHES hex) on a model that ALSO has a painted
   *  body, lamp colour or fabric in `color`. Metal-only models (taps,
   *  showers) keep their finish in `color` - see metalUsesColour. */
  metal?: string;
  /** Worktop overhang beyond the BACK of a kitchen unit, in mm - a breakfast
   *  bar. Applies to the whole run the unit is in. */
  overhangMm?: number;
  /** An island: the run gets a finished back panel in the unit colour and no
   *  upstand, since there is no wall behind it. */
  island?: boolean;
  /** Objects laid out together as one run - a row of downlights. They move as
   *  a unit, because dragging six spots one at a time to shift a row 200mm is
   *  exactly the tedium the layout tool exists to remove. */
  groupId?: string;
}

/**
 * What a boundary run is built of. Timber kinds and hedges are procedural;
 * brick and stone are textured walls; open is a line on the plan and
 * nothing in 3D (a boundary onto a field, or one the client is not
 * fencing). See components/3d/FenceRuns for how each is drawn.
 */
export type BoundaryKind = 'closeboard' | 'featheredge' | 'slatted' | 'hitmiss' | 'brick' | 'stone' | 'hedge' | 'open';

/** The look of a run: kind, height and a colour whose meaning depends on
 *  the kind - a stain hex for timber, a preset id for brick and stone, a
 *  foliage hex for a hedge. */
export interface BoundaryStyle {
  kind: BoundaryKind;
  heightMm: number;
  colour: string;
  /** Walls and hedges only; timber fences are as thick as their boards. */
  thicknessMm?: number;
}

export type PathSurface = 'stone' | 'grey';

/** A garden path: a polyline on the ground in world metres, drawn as a
 *  paved ribbon at widthMm. See components/3d/Paths. */
export interface PathRun {
  id: string;
  points: [number, number][];
  widthMm: number;
  surface: PathSurface;
}

/** A freeform deck: a polygon on the ground in world metres, raised
 *  heightMm above the grass in a decking material (a MATERIAL_DEF decking
 *  key). Several can sit side by side at different heights - a raised
 *  platform off the doors stepping down to a lower one. See
 *  components/3d/Decks. */
export interface DeckArea {
  id: string;
  points: [number, number][];
  heightMm: number;
  material: string;
}

export interface FenceRun extends Partial<BoundaryStyle> {
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
  /** The style a newly drawn run takes; runs drawn before this existed
   *  (no kind of their own) also fall back to it. */
  boundaryStyle?: BoundaryStyle;
  paths: PathRun[];
  /** The width and surface the next path is drawn with. */
  pathStyle?: { widthMm: number; surface: PathSurface };
  decks: DeckArea[];
  /** The height and material the next deck is drawn with. */
  deckStyle?: { heightMm: number; material: string };
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
export type ToolMode = 'select' | 'place' | 'fence' | 'path' | 'deck';

