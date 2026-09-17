/**
 * The image models, behind one call shape.
 *
 *   GEOMETRY model  gemini-3.1-flash-image  faithful to its input, flatter surfaces
 *   FINISH model    gemini-3-pro-image      the better materials; re-composes a
 *                                           shaded screenshot, but given a LINE
 *                                           DRAWING plus an inventory it held
 *                                           geometry 2/2 on 17 Sep
 *
 * Default path: one FINISH pass on the drawing. Fallback (a failed
 * verification): GEOMETRY pass, then FINISH as a materials-only pass.
 * Sunburst (OpenAI) is not in the render path; see the 17 Sep test set in
 * test-designs/dark-box for why.
 */
export const GEOMETRY_MODEL = 'gemini-3.1-flash-image';
export const FINISH_MODEL = 'gemini-3-pro-image';

const SUPPORTED_RATIOS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9']);
export const safeRatio = (r) => (SUPPORTED_RATIOS.has(r) ? r : '16:9');

const part = (b64, mime) => ({ inlineData: { data: b64, mimeType: mime } });
const toB64 = (d) => (Buffer.isBuffer(d) ? d.toString('base64') : (d instanceof Uint8Array || d instanceof ArrayBuffer) ? Buffer.from(d).toString('base64') : d);

/**
 * One image call. images: [{ b64, mime }], in order (image 1 first).
 * Returns base64 JPEG or null when the model produced no image.
 */
export async function drawImage(ai, { model, images, prompt, ratio, seed, label = 'draw' }) {
    const t0 = Date.now();
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [...images.map(i => part(i.b64, i.mime || 'image/jpeg')), { text: prompt }] },
        config: {
            outputMimeType: 'image/jpeg',
            imageConfig: { aspectRatio: safeRatio(ratio), imageSize: '2K', ...(Number.isFinite(seed) ? { seed } : {}) },
            temperature: 0.2,
            ...(Number.isFinite(seed) ? { seed } : {}),
        },
    });
    for (const p of response.candidates?.[0]?.content?.parts || []) {
        if (p.inlineData) {
            console.log(`[RENDER] ${label} ${model} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
            return toB64(p.inlineData.data);
        }
    }
    console.warn(`[RENDER] ${label} ${model} produced no image`, JSON.stringify(response?.candidates?.[0]?.finishReason || response?.promptFeedback || '').slice(0, 200));
    return null;
}
