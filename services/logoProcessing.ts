/**
 * Knock the white background out of a logo.
 *
 * Most small firms have a JPEG or a white-matted PNG, so dropping the file
 * straight onto a photo leaves a white brick around the mark - which is exactly
 * what it did, because the "Remove white background" switch was a checkbox with
 * nothing behind it. The canvas compositor this replaced did have the feature;
 * it was lost in the move to DOM rendering.
 *
 * Results are cached and read synchronously during render, because the editor
 * and the off-screen export surface both draw the same layers and must show the
 * same pixels. An async lookup per paint would let them disagree.
 */

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Long data URLs are expensive to hash, and the tail plus length is plenty to
 *  tell two uploads apart. */
const keyFor = (src: string, strip: boolean) => `${strip ? 's' : 'r'}:${src.length}:${src.slice(-96)}`;

/** The processed logo if it is ready, otherwise undefined. Never blocks. */
export const getProcessedLogo = (src: string, strip: boolean): string | undefined => {
    if (!strip) return src;
    return cache.get(keyFor(src, strip));
};

export const processLogo = (src: string, strip: boolean): Promise<string> => {
    if (!strip) return Promise.resolve(src);
    const key = keyFor(src, strip);

    const done = cache.get(key);
    if (done) return Promise.resolve(done);

    const running = inflight.get(key);
    if (running) return running;

    const job = new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(src);
                ctx.drawImage(img, 0, 0);

                const data = ctx.getImageData(0, 0, c.width, c.height);
                const px = data.data;
                for (let i = 0; i < px.length; i += 4) {
                    const r = px[i], g = px[i + 1], b = px[i + 2];
                    const min = Math.min(r, g, b);
                    // Only near-neutral pixels are candidates. Without the
                    // saturation guard a pale yellow or cream inside the mark
                    // gets eaten along with the background.
                    const neutral = Math.max(r, g, b) - min < 26;
                    if (!neutral) continue;
                    if (min > 236) {
                        px[i + 3] = 0;
                    } else if (min > 208) {
                        // Feather the last stop so the cut is not a hard stencil
                        // edge against the photo.
                        px[i + 3] = Math.round(px[i + 3] * (1 - (min - 208) / 28));
                    }
                }
                ctx.putImageData(data, 0, 0);
                const out = c.toDataURL('image/png');
                cache.set(key, out);
                resolve(out);
            } catch {
                // A tainted canvas (a logo pasted from another origin) cannot be
                // read back. Use it as supplied rather than failing the render.
                resolve(src);
            } finally {
                inflight.delete(key);
            }
        };
        img.onerror = () => { inflight.delete(key); resolve(src); };
        img.src = src;
    });

    inflight.set(key, job);
    return job;
};

/** Warm the cache for every logo in a design. Awaited before export so the
 *  captured DOM never contains an unprocessed logo. */
export const preloadLogos = async (srcs: Array<{ src: string; strip: boolean }>): Promise<void> => {
    await Promise.all(srcs.map(s => processLogo(s.src, s.strip)));
};
