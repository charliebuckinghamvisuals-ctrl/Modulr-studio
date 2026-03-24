export enum AppStage {
  HOME = 'home',
  UPLOAD = 'upload', // Legacy upload, maps to Render Engine Entry
  LINE_CONVERT = 'line_convert',
  RENDER_ENGINE = 'render_engine',
  EDITOR = 'editor',
  WEATHER_LAB = 'weather_lab',
  MATERIAL_STUDIO = 'material_studio',
  PRICING = 'pricing',
  ABOUT = 'about'
}

export interface MaterialConfig {
  walls: string;
  roof: string;
  windows: string;
  doors: string;
  decking: string;
}

export interface WeatherConfig {
  condition: string;
  timeOfDay: string;
  season: string;
}

export interface ProcessingState {
  isLoading: boolean;
  message: string;
}

export interface AnalysisResult {
  detectedMaterials?: MaterialConfig;
  architecturalStyle?: string;
}

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