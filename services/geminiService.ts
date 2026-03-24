import { MaterialConfig, WeatherConfig } from "../types";

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.result as MaterialConfig;

  } catch (error) {
    console.error("Analysis error:", error);
    throw error;
  }
};

/**
 * Renders the building with specific materials.
 */
export const renderBuilding = async (
  base64Image: string, // Can be the line drawing or original
  materials: MaterialConfig,
  additionalPrompt?: string,
  isHighQuality: boolean = false,
  isProMode: boolean = false
): Promise<string> => {
  try {
    const { ratio } = await getImageDimensions(base64Image);

    const response = await fetch(`${API_BASE_URL}/renderBuilding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, materials, additionalPrompt, isHighQuality, ratio, isProMode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Render error:", error);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, maskImage, editPrompt, isHighQuality, ratio, isProMode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, weather, isHighQuality, ratio, isProMode })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
export const generatePresentationBoard = async (base64Image: string, focusPoints: string[], isProMode: boolean = false): Promise<string> => {
  try {
    if (focusPoints.length !== 4) {
      throw new Error("Must select exactly 4 focus points");
    }

    const response = await fetch(`${API_BASE_URL}/generatePresentationBoard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, focusPoints, isProMode })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.result;

  } catch (error) {
    console.error("Scene Studio error:", error);
    throw error;
  }
};