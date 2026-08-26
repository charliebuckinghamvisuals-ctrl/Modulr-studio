import { auth } from './firebase';
import type { ContentFormat } from './postDesign';

/** Every Content Studio call is authenticated - these sit behind the same lock
 *  as the render endpoints. */
const authedFetch = async (path: string, body: unknown, timeoutMs = 90_000) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in first.');
    const token = await user.getIdToken();

    // Without this a hung request spins the overlay forever with no way back.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // A 404 here means the API is running older code than the browser -
            // it serves the SPA's HTML, so there is no JSON error to report.
            if (res.status === 404) throw new Error('That feature is not on the running server yet — restart it and try again.');
            throw new Error(err?.error || `Request failed (${res.status}). Please try again.`);
        }
        return await res.json();
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('That took too long and was stopped. Please try again.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

/** Strip a data-URL prefix - the API wants bare base64. */
const bare = (img: string) => (img.includes(',') ? img.split(',')[1] : img);

/**
 * Shrink an image before sending it to a model.
 *
 * A 4K render is 3-8MB as base64, and uploading that to Gemini is most of the
 * wait - the request sat on "Reading your render" for a long time purely
 * because of transfer size. Nothing the model does here needs that detail: it
 * is reading composition, materials and light to write four headlines, which a
 * 1024px copy carries perfectly well.
 *
 * Falls back to the original if anything goes wrong; a slow request beats a
 * broken one.
 */
const downscale = (src: string, maxEdge: number, quality = 0.82): Promise<string> =>
    new Promise((resolve) => {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const longest = Math.max(img.width, img.height);
                if (longest <= maxEdge) { resolve(src); return; }
                const scale = maxEdge / longest;
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * scale);
                c.height = Math.round(img.height * scale);
                const ctx = c.getContext('2d');
                if (!ctx) { resolve(src); return; }
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(src);
            img.src = src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')
                ? src : `data:image/jpeg;base64,${src}`;
        } catch { resolve(src); }
    });

/**
 * Extend a render into a new aspect ratio.
 *
 * Costs one render, because the model genuinely generates a new image. The
 * browser-side compositor is the free alternative and stays available.
 */
export const reframeImage = async (base64Image: string, format: ContentFormat): Promise<string> => {
    // Larger than the suggest cap: this one is regenerating the scene, so it
    // wants enough detail to match grain and materials across the join. Still
    // far below a 4K source, which only slows the upload.
    const small = await downscale(base64Image, 1536, 0.9);
    const data = await authedFetch('/api/content/reframe', { base64Image: bare(small), format }, 180_000);
    return data.result as string;
};

export interface TextSuggestion { headline: string; subline: string; }

/**
 * Read the render and propose overlay copy.
 *
 * Free - a short text response rather than an image generation - so it can be
 * offered the moment a render is attached rather than hidden behind a warning.
 */
export const suggestText = async (
    base64Image: string,
    businessName: string,
    details: Record<string, unknown>,
): Promise<{ options: TextSuggestion[]; altText: string }> => {
    const small = await downscale(base64Image, 1024);
    const data = await authedFetch('/api/content/suggest', { base64Image: bare(small), businessName, details }, 60_000);
    return { options: data.options || [], altText: data.altText || '' };
};

export interface CaptionResult {
    caption: string;
    hashtags: string[];
    altText: string;
}

export const writeCaption = async (opts: {
    platform: 'instagram' | 'linkedin';
    tone: string;
    businessName: string;
    details: Record<string, unknown>;
}): Promise<CaptionResult> => {
    const data = await authedFetch('/api/content/captions', opts);
    return { caption: data.caption || '', hashtags: data.hashtags || [], altText: data.altText || '' };
};
