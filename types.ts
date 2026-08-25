export enum AppStage {
  HOME = 'home',
  UPLOAD = 'upload', // Legacy upload, maps to Render Engine Entry
  LINE_CONVERT = 'line_convert',
  RENDER_ENGINE = 'render_engine',
  STUDIO = 'studio',
  EDITOR = 'editor',
  WEATHER_LAB = 'weather_lab',
  MATERIAL_STUDIO = 'material_studio',
  PRICING = 'pricing',
  ABOUT = 'about',
  GUIDE = 'guide',
  GALLERY = 'gallery',
  AUTH = 'auth',
  ACCOUNT = 'account',
  DESIGNER = 'designer',
  PROJECTS = 'projects',
  ANIMATION_STUDIO = 'animation_studio',
  /** Public showcase of finished animation clips — the moving Gallery. */
  ANIMATIONS = 'animations',
  WHY = 'why'
}

/** Camera move for an animation. The wording each of these maps to lives on the
 *  server so it cannot be edited from the browser. */
export type AnimationPreset = 'push_in' | 'pan' | 'orbit' | 'still';

/** Optional atmosphere layered on top of the camera move. */
export type AnimationModifier = 'motion_blur' | 'breeze' | 'golden_hour' | 'people';

export interface MaterialConfig {
  walls: string;
  roof: string;
  windows: string;
  doors: string;
  decking: string;
  orientation?: string;
}

export interface PresetMaterial {
  text: string;
  image: string | null;
}

export interface LibraryMaterialItem {
  id: string;
  name: string;
  text: string;
  image: string | null;
}

export interface MaterialLibrary {
  walls: LibraryMaterialItem[];
  roof: LibraryMaterialItem[];
  windows: LibraryMaterialItem[];
  doors: LibraryMaterialItem[];
  decking: LibraryMaterialItem[];
}

export interface WeatherConfig {
  condition: string;
  season: string;
  /** 0-1. Strength of the weather effect. */
  intensity?: number;
  timeOfDay?: string;
}

export interface ProcessingState {
  isLoading: boolean;
  message: string;
}

export interface AnalysisResult {
  detectedMaterials?: MaterialConfig;
  architecturalStyle?: string;
}

/** A file attached to a project. Stored in Firebase Storage; only the
 *  reference lives in Firestore - never the bytes. Firestore caps documents at
 *  1 MB, so embedding base64 would break the project after a few renders. */
export interface ProjectAsset {
  id: string;
  /** Storage path, e.g. projects/{uid}/{projectId}/{assetId}-name.png */
  storagePath: string;
  downloadUrl: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  kind: ProjectAssetKind;
  createdAt: number;
}

export type ProjectAssetKind =
  | 'exterior_render'
  | 'interior_render'
  | 'line_drawing'
  | 'floor_plan'
  | 'document'
  | 'other';

export type ProjectStatus = 'lead' | 'quoted' | 'won' | 'lost' | 'complete';

export interface Project {
  id: string;
  /** Firebase uid of the owner. Enforced by Firestore rules - a client cannot
   *  create or move a project into someone else's ownership. */
  ownerUid: string;
  name: string;
  clientName: string;
  clientEmail: string;
  address: string;
  /** Estimate or agreed value, in pounds. */
  estimateValue: number | null;
  status: ProjectStatus;
  /** When the quote went out to the client, in ms. Stamped automatically the
   *  first time the project leaves Lead, and editable afterwards.
   *
   *  Deliberately not derived from createdAt: a job is usually logged as a lead
   *  well before it is priced, so dating quotes by creation would push the money
   *  into the wrong month on every report. */
  quotedAt: number | null;
  /** When the client accepted, in ms. Stamped when the status becomes Won or
   *  Complete. A January quote won in March counts as March revenue. */
  wonAt: number | null;
  notes: string;
  /** JSON-serialised 3D configurator scene (the room spec), when this project
   *  was saved from the configurator. Stored as a string so Firestore never
   *  has to validate its nested shape, and parsed only on load. */
  scene3d?: string | null;
  /** Random token that makes the client share page live. Null/absent = not
   *  shared. Possession of the token is the authorisation, so it is generated
   *  client-side with crypto randomness and revoked by clearing the field. */
  shareToken?: string | null;
  assets: ProjectAsset[];
  createdAt: number;
  updatedAt: number;
}

/** Fields a user may edit. Deliberately excludes ownerUid, id and timestamps. */
export type ProjectDraft = Pick<
  Project,
  'name' | 'clientName' | 'clientEmail' | 'address' | 'estimateValue' | 'status'
  | 'quotedAt' | 'wonAt' | 'notes' | 'scene3d' | 'shareToken'
>;

export interface HistoryItem {
  id: string;
  timestamp: number;
  stage: AppStage;
  image: string | null;
  originalImage: string | null;
  prompt: string;
  settings?: any;
  referenceImage?: string | null;
} // Could be weather, materials, etc. depending on stage