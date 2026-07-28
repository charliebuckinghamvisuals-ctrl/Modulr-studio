export type ShapeType = 'Box' | 'LShape' | 'Gable';
export type CladdingType = 'timber' | 'composite_wood' | 'composite_black' | 'composite_grey' | 'composite_brown' | 'oak' | 'cedar' | 'charred_wood' | 'render_white' | 'box_metal_grey' | 'box_metal_black' | 'corrugated_metal' | 'fire_board_grey';
export type BaseMaterialType = 'concrete' | 'timber_decking' | 'composite_decking';
export type DeckingMaterialType = 'timber' | 'composite_grey' | 'composite_oak' | 'composite_cedar' | 'composite_brown' | 'composite_black';
export type RoofMaterialType = 'epdm' | 'sedum' | 'upvc' | 'metal';
export type FrameColorType = 'anthracite' | 'black' | 'white' | 'silver';
export type ObjectType = 'tree' | 'conifer' | 'hedge' | 'shrub' | 'flowerbed' | 'planter' | 'bench' | 'slab' | 'patio' | 'toilet' | 'sink' | 'shower' | 'interior_wall' | 'interior_door' | 'desk' | 'sofa' | 'armchair' | 'dining_table' | 'rug' | 'tv' | 'bed' | 'bookshelf' | 'dressing_table' | 'wardrobe' | 'exterior_wall_light' | 'drop_light' | 'coffee_table' | 'indoor_plant' | 'kitchen_island';

export interface Door {
  id: string;
  wall: 'front' | 'back' | 'left' | 'right';
  widthMm: number;
  heightMm: number;
  offsetMm: number;
  leaves: number;
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

export interface PartitionData {
  id: string;
  xMm: number;
  zMm: number;
  lengthMm: number;
  thicknessMm: number;
  rotation: 0 | 90;
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
  cladding: CladdingType;
  claddingFront?: CladdingType;
  claddingBack?: CladdingType;
  claddingLeft?: CladdingType;
  claddingRight?: CladdingType;
  claddingGable?: CladdingType;
  fasciaMaterial?: 'match_cladding' | 'black' | 'anthracite' | 'white' | 'grey';
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

