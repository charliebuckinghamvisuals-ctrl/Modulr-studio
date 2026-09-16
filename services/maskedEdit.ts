import { inpaintMasked, SegmentRegion } from './geminiService';

/**
 * Pixel-level masked editing for the Material Studio.
 *
 * The rule: when the user changes the cladding, ONLY the cladding pixels
 * change. Nothing else is re-synthesised, resampled or re-encoded. So the
 * model is never handed the whole photograph to redraw. Instead:
 *
 *   1. a mask for the surface (from Gemini's segmentation, or the subject of
 *      a typed instruction) is rasterised at the photograph's full size;
 *   2. the photograph is CROPPED to the mask's bounding box (plus a margin so
 *      the model sees the surroundings it must match), and that crop plus a
 *      PNG mask go to the inpainting engine - which only paints inside the
 *      transparent region;
 *   3. the painted crop comes back, is scaled to the crop's exact size, and
 *      is composited over the ORIGINAL through the mask, feathered a few
 *      pixels INWARD so every blended pixel is still inside the mask;
 *   4. the result is kept as PNG - lossless - so the untouched pixels stay
 *      byte-identical to the source.
 *
 * Everything runs in the browser with Canvas 2D; the server never holds the
 * full-resolution composite.
 */

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('The image could not be loaded for editing. Try uploading it again.'));
  if (src.startsWith('http')) img.crossOrigin = 'anonymous';
  img.src = src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:') ? src : `data:image/jpeg;base64,${src}`;
});

const toDataUrl = (b64: string, mime = 'image/png') => b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;

/** A full-size binary mask (alpha 255 inside, 0 outside) as an offscreen canvas. */
export type MaskCanvas = HTMLCanvasElement;

/**
 * Rasterise every region with this label into one full-size mask. Each
 * region's PNG is a probability map that fills its box; scaled into place
 * and thresholded at 50%.
 */
export async function buildMask(regions: SegmentRegion[], label: string, width: number, height: number): Promise<MaskCanvas | null> {
  const mine = regions.filter(r => r.label.toLowerCase() === label.toLowerCase());
  if (!mine.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  for (const r of mine) {
    // A full-frame SAM mask covers the whole image; a boxed one fills its box.
    const [y0, x0, y1, x1] = r.full ? [0, 0, 1000, 1000] : r.box_2d;
    const bx = Math.round(x0 / 1000 * width), by = Math.round(y0 / 1000 * height);
    const bw = Math.max(1, Math.round((x1 - x0) / 1000 * width)), bh = Math.max(1, Math.round((y1 - y0) / 1000 * height));
    let img: HTMLImageElement;
    try { img = await loadImage(toDataUrl(r.mask)); } catch { continue; }
    // Threshold in a scratch canvas at box size, then stamp it.
    const scratch = document.createElement('canvas');
    scratch.width = bw; scratch.height = bh;
    const sctx = scratch.getContext('2d')!;
    sctx.drawImage(img, 0, 0, bw, bh);
    const d = sctx.getImageData(0, 0, bw, bh);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      // Probability lives in luminance (and alpha, on some outputs).
      const p = px[i + 3] < 255 ? px[i + 3] : (px[i] + px[i + 1] + px[i + 2]) / 3;
      const on = p > 127;
      px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = on ? 255 : 0;
    }
    sctx.putImageData(d, 0, 0);
    ctx.drawImage(scratch, bx, by);
  }
  return cleanMask(canvas);
}

/**
 * Tidy a raw segmenter mask: the SAM output comes back at low resolution
 * with stair-stepped edges and small holes (a knot in a board, a shadow),
 * and each hole left a pale patch of the old cladding inside the new. A
 * morphological CLOSE (dilate then erode, both by r) fills holes up to ~2r
 * across without moving the outer edge, then a light blur-and-threshold
 * rounds the stair-steps. Done with canvas blur + threshold, which is fast
 * at 2.5K.
 */
function cleanMask(mask: MaskCanvas): MaskCanvas {
  const W = mask.width, H = mask.height;
  const r = Math.max(4, Math.round(W / 250));
  const pass = (src: HTMLCanvasElement, radius: number, cutoff: number) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.filter = `blur(${radius}px)`; ctx.drawImage(src, 0, 0); ctx.filter = 'none';
    const d = ctx.getImageData(0, 0, W, H);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > cutoff ? 255 : 0;
    ctx.putImageData(d, 0, 0);
    return c;
  };
  const dilated = pass(mask, r, 20);       // grow by ~r: holes up to 2r close
  const closed = pass(dilated, r, 235);    // shrink back by ~r: edge returns
  return pass(closed, 1.5, 127);           // round the stair-steps
}

/** Union of several masks, for a change that spans surfaces. */
export function unionMasks(masks: MaskCanvas[], width: number, height: number): MaskCanvas | null {
  const real = masks.filter(Boolean);
  if (!real.length) return null;
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  real.forEach(m => ctx.drawImage(m, 0, 0));
  return c;
}

/** How much of the frame a mask covers, 0..1 - to refuse an empty or absurd mask. */
export function maskCoverage(mask: MaskCanvas): number {
  const d = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
  let on = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 127) on++;
  return on / (mask.width * mask.height);
}

/** A translucent tint of the mask over the photograph, for the preview. */
export async function maskPreview(source: string, mask: MaskCanvas, colour = 'rgba(16,185,129,0.55)'): Promise<string> {
  const img = await loadImage(source);
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const tint = document.createElement('canvas'); tint.width = c.width; tint.height = c.height;
  const tctx = tint.getContext('2d')!;
  tctx.drawImage(mask, 0, 0, c.width, c.height);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = colour; tctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(tint, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}

const snap16 = (v: number) => Math.max(256, Math.floor(v / 16) * 16);

/**
 * Apply one instruction inside one mask and return the edited photograph as
 * a lossless PNG data URL. Throws if the mask is empty.
 */
export async function applyMaskedEdit(source: string, mask: MaskCanvas, instruction: string, onStatus?: (s: string) => void): Promise<string> {
  const img = await loadImage(source);
  const W = img.naturalWidth, H = img.naturalHeight;
  const mctx = mask.getContext('2d')!;
  const md = mctx.getImageData(0, 0, W, H).data;

  // Bounding box of the mask.
  let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (md[(y * W + x) * 4 + 3] > 127) { count++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (count < 64) throw new Error('That surface could not be found in the image, so nothing was changed.');

  /*
   * The crop: the box plus a 15% margin (at least 96px) so the model sees
   * what the new surface has to meet, clamped to the frame, then sized to
   * multiples of 16 for the engine. At least 256 a side; on a small region
   * the crop grows around it rather than the region being upscaled.
   */
  const marginX = Math.max(96, Math.round((maxX - minX) * 0.15)), marginY = Math.max(96, Math.round((maxY - minY) * 0.15));
  let cx0 = Math.max(0, minX - marginX), cy0 = Math.max(0, minY - marginY);
  let cw = snap16(Math.min(W - cx0, maxX - minX + 2 * marginX)), ch = snap16(Math.min(H - cy0, maxY - minY + 2 * marginY));
  if (cx0 + cw > W) cx0 = Math.max(0, W - cw); if (cy0 + ch > H) cy0 = Math.max(0, H - ch);
  cw = Math.min(cw, Math.floor(W / 16) * 16); ch = Math.min(ch, Math.floor(H / 16) * 16);

  /*
   * The engine refuses anything under roughly 0.8 megapixels ("below the
   * current minimum pixel budget" - 768x768 fails, 1024x768 passes). A small
   * surface therefore gets MORE of the photograph around it, grown about
   * the mask's centre and clamped to the frame; only if the whole
   * photograph is itself below the budget is the crop scaled up for the
   * engine and scaled back after, which touches nothing outside the mask.
   */
  const MIN_AREA = 800_000;
  if (cw * ch < MIN_AREA) {
    const k = Math.sqrt(MIN_AREA / (cw * ch)) * 1.02;
    const midX = cx0 + cw / 2, midY = cy0 + ch / 2;
    cw = Math.min(Math.floor(W / 16) * 16, snap16(cw * k)); ch = Math.min(Math.floor(H / 16) * 16, snap16(ch * k));
    cx0 = Math.round(Math.max(0, Math.min(W - cw, midX - cw / 2))); cy0 = Math.round(Math.max(0, Math.min(H - ch, midY - ch / 2)));
  }
  let apiW = cw, apiH = ch;
  if (apiW * apiH < MIN_AREA) { const k = Math.sqrt(MIN_AREA / (apiW * apiH)) * 1.02; apiW = snap16(apiW * k); apiH = snap16(apiH * k); }

  // The crop as JPEG (what the model paints on) and the API mask: opaque
  // everywhere except the region to paint, which is fully transparent.
  const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
  crop.getContext('2d')!.drawImage(img, cx0, cy0, cw, ch, 0, 0, cw, ch);
  const apiCrop = document.createElement('canvas'); apiCrop.width = apiW; apiCrop.height = apiH;
  apiCrop.getContext('2d')!.drawImage(crop, 0, 0, apiW, apiH);
  const apiMask = document.createElement('canvas'); apiMask.width = apiW; apiMask.height = apiH;
  const actx = apiMask.getContext('2d')!;
  actx.fillStyle = '#000'; actx.fillRect(0, 0, apiW, apiH);
  // Slightly DILATED for the model (it may paint 2px past the edge to blend);
  // the composite below uses the true mask, so nothing outside it survives.
  actx.globalCompositeOperation = 'destination-out';
  actx.filter = 'blur(1px)';
  actx.drawImage(mask, cx0, cy0, cw, ch, 0, 0, apiW, apiH);
  actx.filter = 'none';
  // Harden the transparency to 0/255 - a half-transparent pixel is ambiguous to the engine.
  const ad = actx.getImageData(0, 0, apiW, apiH); for (let i = 3; i < ad.data.length; i += 4) ad.data[i] = ad.data[i] < 200 ? 0 : 255; actx.putImageData(ad, 0, 0);

  onStatus?.('Repainting the selected surface…');
  const painted = await inpaintMasked(apiCrop.toDataURL('image/jpeg', 0.95).split(',')[1], apiMask.toDataURL('image/png').split(',')[1], instruction, apiW, apiH);
  const paintedImg = await loadImage(toDataUrl(painted, 'image/jpeg'));

  /*
   * Composite. The blend weight is the mask eroded by 2px then blurred by
   * 2px: soft at the edge, but every pixel with any weight at all lies
   * INSIDE the original mask, so the untouched photograph is exactly that.
   */
  onStatus?.('Blending into the original pixels…');
  const weight = document.createElement('canvas'); weight.width = cw; weight.height = ch;
  const wctx = weight.getContext('2d')!;
  wctx.drawImage(mask, cx0, cy0, cw, ch, 0, 0, cw, ch);
  // Erode: keep a pixel only if its 3x3 neighbourhood is fully inside.
  const wd = wctx.getImageData(0, 0, cw, ch); const src = new Uint8ClampedArray(wd.data);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && src[(y * cw + x) * 4 + 3] > 127;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let keep = inside(x, y);
    for (let dy = -2; keep && dy <= 2; dy++) for (let dx = -2; keep && dx <= 2; dx++) if (!inside(x + dx, y + dy)) keep = false;
    wd.data[(y * cw + x) * 4 + 3] = keep ? 255 : 0;
  }
  wctx.putImageData(wd, 0, 0);
  const soft = document.createElement('canvas'); soft.width = cw; soft.height = ch;
  const sctx = soft.getContext('2d')!; sctx.filter = 'blur(2px)'; sctx.drawImage(weight, 0, 0); sctx.filter = 'none';
  const w = sctx.getImageData(0, 0, cw, ch).data;

  const paintedC = document.createElement('canvas'); paintedC.width = cw; paintedC.height = ch;
  paintedC.getContext('2d')!.drawImage(paintedImg, 0, 0, cw, ch);
  const p = paintedC.getContext('2d')!.getImageData(0, 0, cw, ch).data;
  const o = crop.getContext('2d')!.getImageData(0, 0, cw, ch);
  const od = o.data;
  for (let i = 0; i < od.length; i += 4) {
    // Only where the (eroded, blurred) weight is non-zero - i.e. inside the mask.
    const a = md[((cy0 + Math.floor(i / 4 / cw)) * W + (cx0 + (i / 4) % cw)) * 4 + 3] > 127 ? w[i + 3] / 255 : 0;
    if (a <= 0) continue;
    od[i]     = Math.round(od[i]     * (1 - a) + p[i]     * a);
    od[i + 1] = Math.round(od[i + 1] * (1 - a) + p[i + 1] * a);
    od[i + 2] = Math.round(od[i + 2] * (1 - a) + p[i + 2] * a);
  }

  // Back into a full-size copy of the original - lossless.
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d')!;
  octx.drawImage(img, 0, 0);
  octx.putImageData(o, cx0, cy0);
  return out.toDataURL('image/png');
}
