import { MaterialConfig, WeatherConfig } from "../types";
import { auth } from "./firebase";

const getAuthHeaders = async (baseHeaders: Record<string, string> = {}) => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      return { ...baseHeaders, 'Authorization': `Bearer ${token}` };
    }
  } catch (e) {
    console.error("Token error", e);
  }
  return baseHeaders;
};

const formatErrorMessage = (errorStr: string | undefined, status: number): string => {
  if (!errorStr) return `HTTP error! status: ${status}`;
  try {
     const parsed = JSON.parse(errorStr);
     if (parsed.error && parsed.error.message) {
         errorStr = parsed.error.message;
     }
  } catch (e) {}
  if (errorStr.includes('limit: 0') || (errorStr.includes('quota') && errorStr.includes('pro-image'))) {
      return "Google API Quota Error: Google is rejecting this API key for 'Pro Mode' because it detects it as a Free-Tier key with 0 limit. Ensure your API Key is generated inside a Google Cloud Project that is explicitly linked to your paid Billing Account.";
  }
  
  if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('quota')) {
      return "Studio Rate Limit Exceeded: Please wait a moment before trying again, or check your Google API quota.";
  }
  if (errorStr.length > 200) {
      return errorStr.substring(0, 197) + "..."; // Prevent massive toast boxes
  }
  return errorStr;
};

// Use relative API path for production and development
const API_BASE_URL = '/api';

/**
 * Helper to get the closest supported aspect ratio for Gemini.
 * Supported: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
const getBestAspectRatio = (width: number, height: number): string => {
  const ratio = width / height;
  const supported = [
    { s: "1:1", r: 1 },
    { s: "3:4", r: 3 / 4 },
    { s: "4:3", r: 4 / 3 },
    { s: "9:16", r: 9 / 16 },
    { s: "16:9", r: 16 / 9 },
  ];
  // Find closest
  const best = supported.reduce((prev, curr) =>
    Math.abs(curr.r - ratio) < Math.abs(prev.r - ratio) ? curr : prev
  );
  return best.s;
};

const getImageDimensions = (base64: string): Promise<{ ratio: string }> => {
  return new Promise((resolve, reject) => {
    // In a browser environment, we can use the Image object
    if (typeof window !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        resolve({
          ratio: getBestAspectRatio(img.width, img.height)
        });
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        console.error("Failed to load image for aspect ratio calculation.");
        resolve({ ratio: "1:1" }); // Fallback on error
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      };

      try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        img.src = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Failed to create Object URL for dimension calculation', e);
        img.src = `data:image/png;base64,${base64}`;
      }
    } else {
      // Fallback for non-browser env (unlikely here)
      resolve({ ratio: "1:1" });
    }
  });
};

/**
 * Converts an image to a line drawing, optionally with modifications.
 */
export const generateLineDrawing = async (base64Image: string | null | undefined, additionalPrompt?: string, isHighQuality: boolean = false, hasColor: boolean = false, environmentImage?: string | null, isProMode: boolean = false): Promise<string> => {
  try {
    const ratio = base64Image ? (await getImageDimensions(base64Image)).ratio : undefined;

    const body: Record<string, unknown> = { additionalPrompt, isHighQuality, ratio, hasColor, isProMode };
    if (base64Image) body.base64Image = base64Image;
    if (environmentImage) body.environmentImage = environmentImage;

    const response = await fetch(`${API_BASE_URL}/generateLineDrawing`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Line drawing error:", error);
    throw error;
  }
};

/**
 * Analyzes the image to detect current materials.
 */
export const analyzeComponents = async (base64Image: string): Promise<MaterialConfig> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyzeComponents`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result as MaterialConfig;

  } catch (error) {
    console.error("Analysis error:", error);
    throw error;
  }
};

/**
 * Analyzes multiple images simultaneously to detect orientation and side-specific materials.
 */
export const analyzeBatchMaterials = async (base64Images: string[]): Promise<Array<MaterialConfig & { orientation?: string }>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyzeBatchMaterials`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Images })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Batch Analysis error:", error);
    throw error;
  }
};

/**
 * Renders the building with specific materials.
 */
/**
 * The 3D configurator's scene spec, when the current source image came from
 * "Send to Render Engine". Rides along with every render request so the
 * server can write hard constraints (exact door/window counts, styles,
 * cladding, roof) into the prompt instead of letting the model guess from
 * the screenshot. Cleared whenever the user uploads their own image.
 */
let currentConfigSpec: Record<string, unknown> | null = null;
export const setConfigSpec = (spec: Record<string, unknown> | null) => {
    currentConfigSpec = spec;
};

/**
 * Result of the server's automatic quality check on the most recent render -
 * counts of doors/windows/roof compared against the configurator spec (or the
 * source image). Surfaced in the UI as the "checked" badge.
 */
export interface RenderVerification {
    checked: boolean;
    passed?: boolean;
    retried?: boolean;
}
let lastVerification: RenderVerification | null = null;
export const getLastVerification = (): RenderVerification | null => lastVerification;

/**
 * The client's garden, as a written brief rather than a photograph.
 *
 * Set from the Garden panel and sent with every render, so a whole job's worth
 * of angles, seasons and weather variants share one setting. Module state for
 * the same reason as configSpec: it has to reach renderBuilding from a panel
 * that does not own the render call.
 */
export interface SceneContext {
    boundary?: string;
    levels?: string;
    hardLandscaping?: string;
    planting?: string;
    context?: string;
    aspect?: string;
    character?: string;
    summary?: string;
}

let currentSceneContext: SceneContext | null = null;
export const setSceneContext = (ctx: SceneContext | null) => {
    currentSceneContext = ctx;
};
export const getSceneContext = (): SceneContext | null => currentSceneContext;

/**
 * Turn a client's garden into a buildable description.
 *
 * Takes a photo, a written note, or both - and where both are given the note
 * wins, because it is the correction someone made after seeing what the photo
 * produced. The photo is read once here and never travels with a render.
 */
export const describeGarden = async (base64Image?: string, notes?: string): Promise<SceneContext> => {
    const res = await fetch(`${API_BASE_URL}/scene/describe`, {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            base64Image: base64Image ? (base64Image.includes(',') ? base64Image.split(',')[1] : base64Image) : undefined,
            notes,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Could not read that photo.');
    }
    return res.json();
};

export const renderBuilding = async (
  base64Image: string,
  materials: MaterialConfig,
  additionalPrompt?: string,
  isHighQuality: boolean = false,
  isProMode: boolean = false,
  orientation?: string,
  isSketchUpMode: boolean = false,
  studioBackground?: string,
  isBatchSequence: boolean = false,
  seed?: number,
  cameraEffects: boolean = false
): Promise<string> => {
  try {
    const { ratio } = await getImageDimensions(base64Image);

    const response = await fetch(`${API_BASE_URL}/renderBuilding`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image, materials, additionalPrompt, isHighQuality, ratio, isProMode, orientation, isSketchUpMode, studioBackground, isBatchSequence, seed, cameraEffects, configSpec: currentConfigSpec || undefined, sceneContext: currentSceneContext || undefined })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    lastVerification = data.verification || null;
    return data.result;

  } catch (error) {
    console.error("Render error:", error);
    throw error;
  }
};

/**
 * 4K export: reproduce a finished 2K image at 4K on the server.
 *
 * The only route to 4K pixels - every tool generates at 2K. Metered
 * server-side (100 per calendar month on Business), so callers should surface
 * the error message verbatim when the allowance runs out.
 */
export const export4K = async (base64Image: string): Promise<string> => {
  try {
    const { ratio } = await getImageDimensions(base64Image);

    const response = await fetch(`${API_BASE_URL}/export4k`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image, ratio })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("4K export error:", error);
    throw error;
  }
};

/**
 * Edits the image to add elements or refine details.
 */
export const editImage = async (
  base64Image: string,
  editPrompt: string,
  maskImage?: string | null,
  isHighQuality: boolean = false,
  isProMode: boolean = false
): Promise<string> => {
  try {
    const { ratio } = await getImageDimensions(base64Image);

    const response = await fetch(`${API_BASE_URL}/editImage`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image, maskImage, editPrompt, isHighQuality, ratio, isProMode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Edit error:", error);
    throw error;
  }
};

/**
 * Analyzes the scene to provide a description and contextual entourage suggestions.
 */
export const analyzeSceneForEditor = async (base64Image: string): Promise<{ description: string, peopleSuggestions: string[] }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyzeScene`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Scene analysis error:", error);
    throw error;
  }
};

/**
 * Modifies the weather/environment.
 */
export const applyWeather = async (
  base64Image: string,
  weather: WeatherConfig,
  isHighQuality: boolean = false,
  isProMode: boolean = false
): Promise<string> => {
  let retries = 2;
  while (retries >= 0) {
    try {
      const { ratio } = await getImageDimensions(base64Image);

      const response = await fetch(`${API_BASE_URL}/applyWeather`, {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ base64Image, weather, isHighQuality, ratio, isProMode })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(formatErrorMessage(errorData.error, response.status));
      }

      const data = await response.json();
      return data.result;

    } catch (error: any) {
      if (retries === 0 || error.message.includes('HTTP error! status: 4')) {
        console.error("Weather error:", error);
        throw new Error(error.message === 'Failed to fetch' ? 'Server connection lost or timeout. Please wait a moment and try again.' : error.message);
      }
      console.warn(`Weather application failed, retrying... (${retries} attempts left)`);
      retries--;
      await new Promise(res => setTimeout(res, 2000)); // wait 2s before retry
    }
  }
  throw new Error("Failed to apply weather after multiple attempts.");
};

/**
 * Analyzes the image to detect 16 high-quality details suitable for macro shots.
 */
export const analyzeExteriorDetails = async (base64Image: string): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyzeExteriorDetails`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result as string[];
  } catch (error) {
    console.error("Detail analysis error:", error);
    return [
      "Cladding Texture", "Roof Detail", "Window Frame Corner", "Garden Feature",
      "External Lighting", "Paving Texture", "Door Handle", "Glass Reflection",
      "Gutter Detail", "Timber Grain", "Brickwork Texture", "Threshold Detail",
      "Fascia Board", "Planting Texture", "Fence Panel", "Step Detail"
    ];
  }
};

/**
 * Generates a Scene Studio presentation board (2x2 grid) based on SELECTED focus points.
 */
export const generatePresentationBoard = async (base64Image: string, focusPoints: string[], isHighQuality: boolean = false, isProMode: boolean = false): Promise<string> => {
  try {
    if (focusPoints.length !== 4) {
      throw new Error("Must select exactly 4 focus points");
    }

    const response = await fetch(`${API_BASE_URL}/generatePresentationBoard`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Image, focusPoints, isHighQuality, isProMode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Scene Studio error:", error);
    throw error;
  }
};

/**
 * Analyzes the scene and suggests unique cinematic motion prompts for video generation.
 */
export const analyzeSceneForVideo = async (base64Images: string[], mode: 'zoom' | 'walkthrough'): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyzeSceneForVideo`, {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ base64Images, mode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(formatErrorMessage(errorData.error, response.status));
    }

    const data = await response.json();
    return data.result as string[];

  } catch (error) {
    console.error("Video scene analysis error:", error);
    // Fallback to presets if analysis fails
    if (mode === 'zoom') {
      return [
        "Smooth cinematic zoom-in focusing on the main architectural features.",
        "Slow majestic pan across the facade to reveal the site context.",
        "Gentle approach toward the primary entrance with soft lighting.",
        "Dynamic low-angle tracking shot along the building base."
      ];
    } else {
      return [
        "Seamless 360-degree orbital walkthrough around the structure.",
        "Smooth transition between the uploaded perspective points.",
        "Cinematic rotation highlighting the overall form and materials."
      ];
    }
  }
};