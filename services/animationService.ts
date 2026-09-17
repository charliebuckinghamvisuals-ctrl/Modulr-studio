import { auth } from './firebase';
import { AnimationPreset, AnimationModifier } from '../types';

/**
 * Animation Studio client.
 *
 * Three calls rather than one because video does not behave like the image
 * endpoints: the start call returns a job handle in seconds, the clip renders
 * on the provider's side over a minute or more, and /status is polled until
 * the file can be fetched. Splitting it means the UI can show honest progress
 * instead of one silent spinner.
 *
 * 17 Sep 2026: the studio picks a MODEL (Seedance 2.5 or Kling 3.0 Pro via
 * Higgsfield), a length, a resolution, audio, and writes a PROMPT (presets
 * fill it in). The server prices the clip, spends an included clip or the
 * video credit balance, and appends the scene lock to the prompt.
 */

const API_BASE_URL = '/api';

const authHeaders = async (base: Record<string, string> = {}) => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { ...base, Authorization: `Bearer ${token}` } : base;
};

const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({} as any));
    const err = new Error(data?.error || fallback) as Error & { needsVideoCredits?: boolean; pricePence?: number };
    err.needsVideoCredits = data?.needsVideoCredits === true;
    err.pricePence = data?.pricePence;
    return err;
};

export type VideoModelKey = 'seedance' | 'kling';

export interface AnimationJob {
    /** Opaque job handle from the server - handed straight back to
     *  /animation/status and /animation/video. Never parsed here. */
    fileName: string;
    /** Included clips left this month after this one (Kling, up to 8s). */
    remaining: number;
    limit: number;
    /** How this clip was paid for. */
    charge?: { kind: 'included' | 'credits'; pence: number; balance?: number };
    seconds?: number;
    resolution?: string;
    model?: VideoModelKey;
}

export interface StartAnimationInput {
    base64Image: string;
    model: VideoModelKey;
    /** The prompt as written or as filled by a preset. */
    prompt: string;
    duration: number;
    resolution: string;
    sound: boolean;
    aspectRatio?: '16:9' | '9:16';
    /** Legacy fields, still accepted by the server when prompt is empty. */
    preset?: AnimationPreset;
    modifiers?: AnimationModifier[];
    extraPrompt?: string;
}

/**
 * Kick off a generation. Returns quickly with a job handle. This is the
 * moment the clip is paid for - an included clip or credits - because it is
 * the moment the provider commits the cost; a failure refunds automatically.
 */
export const startAnimation = async (input: StartAnimationInput): Promise<AnimationJob> => {
    const response = await fetch(`${API_BASE_URL}/animation/start`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            base64Image: input.base64Image,
            model: input.model,
            prompt: input.prompt,
            duration: input.duration,
            resolution: input.resolution,
            sound: input.sound,
            aspectRatio: input.aspectRatio || '16:9',
            preset: input.preset || 'push_in',
            modifiers: input.modifiers || [],
            extraPrompt: input.extraPrompt || '',
        }),
    });

    if (!response.ok) throw await readError(response, 'Could not start the animation.');
    return response.json();
};

/** True once the finished file can be fetched. */
export const isAnimationReady = async (fileName: string): Promise<boolean> => {
    const response = await fetch(
        `${API_BASE_URL}/animation/status?file=${encodeURIComponent(fileName)}`,
        { headers: await authHeaders() }
    );
    if (!response.ok) throw await readError(response, 'Lost track of the animation.');
    const data = await response.json();
    if (data.state === 'FAILED') throw new Error('The model failed to finish this animation.');
    return data.ready === true;
};

/** Poll until ready, then hand back a blob URL the <video> tag can play.
 *
 *  A blob rather than pointing the player straight at the endpoint: the request
 *  needs an Authorization header, and a <video src> cannot carry one. */
export const fetchAnimation = async (
    fileName: string,
    onTick?: (secondsWaited: number) => void,
    signal?: AbortSignal
): Promise<string> => {
    const started = Date.now();
    // Generous ceiling, deliberately: the clip is already paid for by the
    // time polling starts, so giving up early throws money away. This exists
    // only so a stuck job cannot poll forever.
    const deadline = started + 15 * 60 * 1000;

    while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error('Cancelled.');
        if (await isAnimationReady(fileName)) break;
        onTick?.(Math.round((Date.now() - started) / 1000));
        await new Promise(r => setTimeout(r, 3000));
        if (Date.now() >= deadline) throw new Error('The animation took too long to finish.');
    }

    const response = await fetch(
        `${API_BASE_URL}/animation/video?file=${encodeURIComponent(fileName)}`,
        { headers: await authHeaders(), signal }
    );
    if (!response.ok) throw await readError(response, 'Could not download the animation.');

    return URL.createObjectURL(await response.blob());
};
