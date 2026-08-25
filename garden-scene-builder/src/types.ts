export type ShapeType = 'Box' | 'LShape' | 'Gable';
export type CladdingType =
  // Composite range offered in the sidebar picker. These must match the keys in
  // MATERIAL_DEF, or the swatch applies a value that falls back to 'default'.
  | 'cedar_composite' | 'oak_composite' | 'light_oak_composite' | 'black_composite'
  | 'dark_grey_composite' | 'light_grey_composite' | 'white_composite'
  | 'slate_blue_composite' | 'sage_composite' | 'clay_composite'
  | 'grey_composite'
  // Legacy values retained so previously saved scenes still resolve.
  | 'timber' | 'composite_wood' | 'composite_black' | 'composite_grey'
  | 'composite_brown' | 'oak' | 'cedar' | 'charred_wood' | 'render_white'
  | 'box_metal_grey' | 'box_metal_black' | 'corrugated_metal' | 'fire_board_grey';
export type BaseMaterialType = 'concrete' | 'timber_decking' | 'composite_decking';
export type DeckingMaterialType = 'timber' | 'composite_grey' | 'composite_oak' | 'composite_cedar' | 'composite_brown' | 'composite_black';
export type RoofMaterialType = 'epdm' | 'sedum' | 'upvc' | 'metal';
export type FrameColorType = 'anthracite' | 'black' | 'white' | 'silver';
export type ObjectType = 'tree' | 'conifer' | 'hedge' | 'shrub' | 'flowerbed' | 'planter' | 'bench' | 'slab' | 'patio' | 'toilet' | 'sink' | 'shower' | 'interior_wall' | 'interior_door' | 'desk' | 'sofa' | 'armchair' | 'dining_table' | 'rug' | 'tv' | 'bed' | 'bookshelf' | 'dressing_table' | 'wardrobe' | 'exterior_wall_light' | 'drop_light' | 'coffee_table' | 'indoor_plant' | 'kitchen_island';

export type GlazingStyle = 'standard' | 'crittall';

export interface Door {
  id: string;
  wall: 'front' | 'back' | 'left' | 'right';
  widthMm: number;
  heightMm: number;
  offsetMm: number;
  leaves: number;
  style?: GlazingStyle;
}

export type InteriorFloorType = 'oak' | 'pine' | 'walnut' | 'cherry' | 'tiles' | 'concrete' | 'carpet';

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
export interface PartitionDoor {
  id: string;
  offsetMm: number;
  widthMm: number;
  heightMm: number;
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
  cladding: CladdingType;
  claddingFront?: CladdingType;
  claddingBack?: CladdingType;
  claddingLeft?: CladdingType;
  claddingRight?: CladdingType;
  claddingGable?: CladdingType;
  fasciaMaterial?: 'match_cladding' | 'black' | 'anthracite' | 'white' | 'grey';
  /** Explicit roof colour. Undefined means follow the roof material's own colour. */
  roofColor?: string;
  claddingOrientation?: 'horizontal' | 'vertical';
  claddingWidthMm?: number;
  baseMaterial: BaseMaterialType;
  roofMaterial: RoofMaterialType;
  frameColor: FrameColorType;
  frameStyle?: FrameStyleType;
  interiorColor: string;
  interiorFloorType: InteriorFloorType;
  x: number;
  z: number;
  rot: number;
  doors: Door[];
  hasDoorHandles?: boolean;
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
  doorGapOffsetMm?: number;
  doorGapWidthMm?: number;
  returnLengthMm?: number;
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

export type ViewMode = '3d' | 'plan' | 'capture' | 'render' | 'walking';
export type ToolMode = 'select' | 'place' | 'fence';

