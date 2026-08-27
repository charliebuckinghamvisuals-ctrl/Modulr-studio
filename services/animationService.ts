import { auth } from './firebase';
import { AnimationPreset, AnimationModifier } from '../types';

/**
 * Animation Studio client.
 *
 * Three calls rather than one because video does not behave like the image
 * endpoints. Measured against the real model: the generate call takes about 45
 * seconds and returns a file that is still processing, which then needs a few
 * more seconds before it can be read. Splitting it means the UI can show honest
 * progress across the minute instead of one silent spinner.
 */

const API_BASE_URL = '/api';

const authHeaders = async (base: Record<string, string> = {}) => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { ...base, Authorization: `Bearer ${token}` } : base;
};

const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({} as any));
    return new Error(data?.error || fallback);
};

export interface AnimationJob {
    /** Opaque job handle from the server - currently a Veo long-running
     *  operation name. Never parsed here; handed straight back to
     *  /animation/status and /animation/video. */
    fileName: string;
    /** Animations left this month after this one. */
    remaining: number;
    limit: number;
}

export interface StartAnimationInput {
    base64Image: string;
    preset: AnimationPreset;
    modifiers: AnimationModifier[];
    extraPrompt: string;
    aspectRatio?: '16:9' | '9:16';
}

/**
 * Kick off a generation.
 *
 * Returns quickly with a job handle - the rendering itself happens on Google's
 * side and is watched by fetchAnimation. It is the point at which one of the
 * month's animations is spent, whether or not the caller waits for the answer,
 * because that is the moment the cost is committed at Google's end.
 */
export const startAnimation = async (input: StartAnimationInput): Promise<AnimationJob> => {
    const response = await fetch(`${API_BASE_URL}/animation/start`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            base64Image: input.base64Image,
            preset: input.preset,
            modifiers: input.modifiers,
            extraPrompt: input.extraPrompt,
            aspectRatio: input.aspectRatio || '16:9',
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
    // Generous ceiling, and deliberately generous: the clip is ALREADY PAID FOR
    // by the time polling starts, so giving up early throws away real money as
    // well as one of the month's ten. Veo renders the video after the start
    // call returns, which takes minutes rather than the previous model's
    // seconds. This exists only so a stuck job cannot poll forever.
    const deadline = started + 10 * 60 * 1000;

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
