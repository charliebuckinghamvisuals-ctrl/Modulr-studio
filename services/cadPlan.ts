/**
 * The CAD floor plan, drawn from the design data (21 Sep 2026).
 *
 * The CAD mode of Floor Plan Studio used to be an image-model drawing, and
 * an image model draws dimension strings the way it draws everything else:
 * approximately. Two rooms labelled 3000 came out different depths and the
 * chains did not add up (Charlie: "FIX ISSUE"). A plan is arithmetic, not
 * art, so for a configurator design it is now drawn here as SVG straight
 * from the room spec - every wall, opening, partition, deck and figure
 * computed - and rasterised in the browser. No model, no call, no render
 * spent, and 3000 is 3000.
 *
 * Coordinates follow the configurator: the room is centred on (0, 0), x runs
 * left to right, z runs back to front (the front wall is at +depth/2, and is
 * drawn at the bottom). Door and window offsets are the opening's centre
 * along its wall, as the geometry stores them (x for front/back, z for the
 * sides). Everything is in millimetres.
 */

type Wall = 'front' | 'back' | 'left' | 'right' | 'bay';
interface Opening { wall: Wall; offsetMm: number; widthMm: number }
interface DoorSpec extends Opening { kind?: string; leaves?: number; style?: string; open?: boolean }
interface PartitionDoorSpec { offsetMm: number; swing?: 1 | -1; onLeg?: boolean }
interface PartitionSpec { xMm: number; zMm: number; lengthMm: number; thicknessMm?: number; rotation?: number; doors?: PartitionDoorSpec[]; legLengthMm?: number; legEnd?: 1 | -1; legDir?: 1 | -1 }
interface PlanItem { label: string; xMm: number; zMm: number; rotDeg: number; widthMm?: number; depthMm?: number }

export interface CadPlanSpec {
    widthMm: number; depthMm: number; wallThicknessMm?: number; shape?: string;
    doors?: DoorSpec[]; windows?: Opening[];
    skylights?: { widthMm: number; lengthMm: number; offsetX: number; offsetZ: number }[];
    partitions?: PartitionSpec[];
    interiorDoors?: { xMm: number; zMm: number; rotation: number; widthMm: number }[];
    hasDecking?: boolean; hasPictureFrame?: boolean; deckingSizeMm?: number; deckingLeftMm?: number; deckingRightMm?: number;
    deckOutline?: [number, number][];
    bay?: { side?: 'left' | 'right' | 'none'; widthMm?: number; depthMm?: number };
    planItems?: PlanItem[];
}

const r0 = (v: number) => Math.round(v);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dimension drawing: a run of figures between points, with extension lines and 45° ticks. */
function dimChain(points: number[], axis: 'x' | 'y', at: number, extFrom: number, side: 1 | -1, out: string[], font = 150) {
    const uniq = [...new Set(points.map(r0))].sort((a, b) => a - b);
    if (uniq.length < 2) return;
    const line = (x1: number, y1: number, x2: number, y2: number, cls = 'dim') => out.push(`<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    const P = (a: number, b: number) => (axis === 'x' ? [a, b] : [b, a]);
    // The dimension line.
    const [ax, ay] = P(uniq[0], at), [bx, by] = P(uniq[uniq.length - 1], at);
    line(ax, ay, bx, by);
    for (const p of uniq) {
        // Extension line from the thing measured out to just past the dimension line.
        const [ex1, ey1] = P(p, extFrom), [ex2, ey2] = P(p, at + side * 120);
        line(ex1, ey1, ex2, ey2, 'ext');
        // 45° tick.
        const [tx1, ty1] = P(p - 60, at + 60), [tx2, ty2] = P(p + 60, at - 60);
        line(tx1, ty1, tx2, ty2);
    }
    for (let i = 0; i < uniq.length - 1; i++) {
        const a = uniq[i], b = uniq[i + 1], mid = (a + b) / 2, len = b - a;
        if (len < 1) continue;
        const [tx, ty] = P(mid, at + side * 60);
        const rot = axis === 'y' ? ` transform="rotate(-90 ${tx} ${ty})"` : '';
        out.push(`<text class="fig" x="${tx}" y="${ty}" text-anchor="middle"${rot}>${r0(len)}</text>`);
    }
    void font;
}

/** Build the plan as an SVG string. Returns the SVG and its size in mm. */
export function buildCadPlanSvg(spec: CadPlanSpec, opts: { title?: string; notes?: string } = {}): { svg: string; widthMm: number; heightMm: number } {
    const W = Math.max(1000, Number(spec.widthMm) || 6000), D = Math.max(1000, Number(spec.depthMm) || 4000);
    const T = Math.max(50, Number(spec.wallThicknessMm) || 150);
    const hw = W / 2, hd = D / 2;
    const out: string[] = [];

    // ---- deck (behind everything) ----------------------------------------
    let deckFront = 0, deckLeft = 0, deckRight = 0;
    const outline = Array.isArray(spec.deckOutline) && spec.deckOutline.length >= 3 ? spec.deckOutline.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) : null;
    if ((spec.hasDecking || spec.hasPictureFrame) && outline && outline.length >= 3) {
        const pts = outline.map(([x, z]) => [x * 1000, z * 1000] as [number, number]);
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${r0(p[0])} ${r0(p[1])}`).join(' ') + ' Z';
        out.push(`<clipPath id="deckclip"><path d="${path}"/></clipPath>`);
        out.push(`<path class="deck" d="${path}"/>`);
        const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        for (let x = Math.ceil(minX / 150) * 150; x < maxX; x += 150) out.push(`<line class="board" clip-path="url(#deckclip)" x1="${x}" y1="${r0(minZ)}" x2="${x}" y2="${r0(maxZ)}"/>`);
        deckFront = Math.max(0, maxZ - hd); deckLeft = Math.max(0, -hw - minX); deckRight = Math.max(0, maxX - hw);
    } else if (spec.hasDecking || spec.hasPictureFrame) {
        deckFront = Number(spec.deckingSizeMm) || 1500; deckLeft = Number(spec.deckingLeftMm) || 0; deckRight = Number(spec.deckingRightMm) || 0;
        const x0 = -hw - deckLeft, x1 = hw + deckRight, z0 = hd, z1 = hd + deckFront;
        out.push(`<rect class="deck" x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}"/>`);
        for (let x = Math.ceil(x0 / 150) * 150; x < x1; x += 150) out.push(`<line class="board" x1="${x}" y1="${z0}" x2="${x}" y2="${z1}"/>`);
        // Deck depth, on the left of the deck.
        dimChain([hd, hd + deckFront], 'y', x0 - 500, x0, -1, out);
    }

    // ---- walls: outer rectangle minus inner, even-odd -----------------------
    out.push(`<path class="wall" fill-rule="evenodd" d="M${-hw} ${-hd} H${hw} V${hd} H${-hw} Z M${-hw + T} ${-hd + T} H${hw - T} V${hd - T} H${-hw + T} Z"/>`);

    // The covered outdoor section: its front is open, a dividing wall closes it off from the room.
    const bay = spec.bay && (spec.bay.side === 'left' || spec.bay.side === 'right') && Number(spec.bay.widthMm) > 0 ? spec.bay : null;
    if (bay) {
        const bw = Number(bay.widthMm), bd = Number(bay.depthMm) > 0 ? Number(bay.depthMm) : D;
        const xEdge = bay.side === 'left' ? -hw + bw : hw - bw;
        const x0 = bay.side === 'left' ? -hw : xEdge, x1 = bay.side === 'left' ? xEdge : hw;
        // Open front: cut the front wall across the section.
        out.push(`<rect class="cut" x="${x0 + T}" y="${hd - T - 5}" width="${x1 - x0 - 2 * T}" height="${T + 10}"/>`);
        out.push(`<line class="thin dashed" x1="${x0 + T}" y1="${hd - T / 2}" x2="${x1 - T}" y2="${hd - T / 2}"/>`);
        // Dividing wall.
        out.push(`<rect class="wall" x="${xEdge - T / 2}" y="${hd - bd}" width="${T}" height="${bd - T}"/>`);
        if (bd < D) out.push(`<rect class="wall" x="${Math.min(x0, x1) + T}" y="${hd - bd - T / 2}" width="${Math.abs(x1 - x0) - 2 * T}" height="${T}"/>`);
        out.push(`<text class="label" x="${(x0 + x1) / 2}" y="${hd - Math.min(bd, D) / 2}" text-anchor="middle">COVERED SECTION</text>`);
    }

    // ---- openings in the outer walls ---------------------------------------
    const wallGeom = (w: Wall) => {
        if (w === 'front') return { axis: 'x' as const, at: hd, inward: -1 };
        if (w === 'back') return { axis: 'x' as const, at: -hd, inward: 1 };
        if (w === 'left') return { axis: 'y' as const, at: -hw, inward: 1 };
        return { axis: 'y' as const, at: hw, inward: -1 };
    };
    const cutWall = (w: Wall, centre: number, width: number) => {
        const g = wallGeom(w);
        const a = centre - width / 2;
        // A white rectangle through the full wall thickness, a touch over on both faces.
        if (g.axis === 'x') out.push(`<rect class="cut" x="${a}" y="${w === 'front' ? hd - T - 5 : -hd - 5}" width="${width}" height="${T + 10}"/>`);
        else out.push(`<rect class="cut" x="${w === 'left' ? -hw - 5 : hw - T - 5}" y="${a}" width="${T + 10}" height="${width}"/>`);
    };
    const chains: Record<'front' | 'back' | 'left' | 'right', number[]> = { front: [-hw, -hw + T, hw - T, hw], back: [-hw, -hw + T, hw - T, hw], left: [-hd, -hd + T, hd - T, hd], right: [-hd, -hd + T, hd - T, hd] };

    for (const wn of spec.windows || []) {
        if (wn.wall === 'bay') continue;
        const c = Number(wn.offsetMm) || 0, wd = Number(wn.widthMm) || 1000;
        cutWall(wn.wall, c, wd);
        const g = wallGeom(wn.wall);
        // Glass line through the middle of the wall, with the frame either side.
        const mid = wn.wall === 'front' ? hd - T / 2 : wn.wall === 'back' ? -hd + T / 2 : wn.wall === 'left' ? -hw + T / 2 : hw - T / 2;
        if (g.axis === 'x') { out.push(`<line class="glass" x1="${c - wd / 2}" y1="${mid}" x2="${c + wd / 2}" y2="${mid}"/>`); out.push(`<line class="thin" x1="${c - wd / 2}" y1="${mid - T / 2}" x2="${c + wd / 2}" y2="${mid - T / 2}"/><line class="thin" x1="${c - wd / 2}" y1="${mid + T / 2}" x2="${c + wd / 2}" y2="${mid + T / 2}"/>`); }
        else { out.push(`<line class="glass" x1="${mid}" y1="${c - wd / 2}" x2="${mid}" y2="${c + wd / 2}"/>`); out.push(`<line class="thin" x1="${mid - T / 2}" y1="${c - wd / 2}" x2="${mid - T / 2}" y2="${c + wd / 2}"/><line class="thin" x1="${mid + T / 2}" y1="${c - wd / 2}" x2="${mid + T / 2}" y2="${c + wd / 2}"/>`); }
        chains[wn.wall].push(c - wd / 2, c + wd / 2);
    }

    /** A door leaf and its swing, in a local frame: hinge at (0,0), leaf along +u, swinging to +v. */
    const swing = (hx: number, hy: number, ux: number, uy: number, vx: number, vy: number, len: number) => {
        const lx = hx + vx * len, ly = hy + vy * len; // leaf open at 90°
        const ex = hx + ux * len, ey = hy + uy * len; // where it closes to
        out.push(`<line class="leaf" x1="${hx}" y1="${hy}" x2="${r0(lx)}" y2="${r0(ly)}"/>`);
        // Arc from the open leaf tip to the closed position: SVG sweep chosen from the cross product sign.
        const sweep = (ux * vy - uy * vx) > 0 ? 1 : 0;
        out.push(`<path class="swing" d="M${r0(lx)} ${r0(ly)} A${len} ${len} 0 0 ${sweep} ${r0(ex)} ${r0(ey)}"/>`);
    };

    for (const dr of spec.doors || []) {
        if (dr.wall === 'bay') continue;
        const c = Number(dr.offsetMm) || 0, wd = Number(dr.widthMm) || 900;
        cutWall(dr.wall, c, wd);
        chains[dr.wall].push(c - wd / 2, c + wd / 2);
        const leaves = Math.max(1, parseInt(String(dr.leaves)) || 1);
        const kind = ['hinged', 'french', 'bifold', 'sliding'].includes(String(dr.kind)) ? String(dr.kind) : leaves <= 1 ? 'hinged' : leaves === 2 ? 'french' : 'bifold';
        const g = wallGeom(dr.wall);
        // Wall centre line position and the inward direction.
        const wallMid = dr.wall === 'front' ? hd - T / 2 : dr.wall === 'back' ? -hd + T / 2 : dr.wall === 'left' ? -hw + T / 2 : hw - T / 2;
        const inner = dr.wall === 'front' ? hd - T : dr.wall === 'back' ? -hd + T : dr.wall === 'left' ? -hw + T : hw - T;
        const a = c - wd / 2, b = c + wd / 2;
        // Along-wall unit u, inward unit v, in plan coordinates.
        const U = g.axis === 'x' ? [1, 0] : [0, 1];
        const V = g.axis === 'x' ? [0, g.inward] : [g.inward, 0];
        const pt = (along: number, across: number) => (g.axis === 'x' ? [along, across] : [across, along]);
        if (kind === 'hinged') {
            const [hx, hy] = pt(a, inner);
            swing(hx, hy, U[0], U[1], V[0], V[1], wd);
        } else if (kind === 'french') {
            const [h1x, h1y] = pt(a, inner), [h2x, h2y] = pt(b, inner);
            swing(h1x, h1y, U[0], U[1], V[0], V[1], wd / 2);
            swing(h2x, h2y, -U[0], -U[1], V[0], V[1], wd / 2);
        } else if (kind === 'bifold') {
            // Zigzag of leaves folded at the wall line.
            const n = leaves, seg = wd / n;
            let d = '';
            for (let i = 0; i < n; i++) {
                const s = a + i * seg, e = s + seg, m = s + seg / 2;
                const [sx, sy] = pt(s, wallMid), [mx, my] = pt(m, wallMid + g.inward * seg * 0.45), [ex, ey] = pt(e, wallMid);
                d += `${i ? 'L' : 'M'}${r0(sx)} ${r0(sy)} L${r0(mx)} ${r0(my)} L${r0(ex)} ${r0(ey)} `;
            }
            out.push(`<path class="leaf" d="${d}"/>`);
        } else {
            // Sliding: panes on two tracks, offset across the wall.
            const n = leaves, seg = wd / n;
            for (let i = 0; i < n; i++) {
                const s = a + i * seg, e = s + seg, off = (i % 2 === 0 ? -1 : 1) * T * 0.22;
                const [sx, sy] = pt(s, wallMid + off), [ex, ey] = pt(e, wallMid + off);
                out.push(`<line class="leaf" x1="${r0(sx)}" y1="${r0(sy)}" x2="${r0(ex)}" y2="${r0(ey)}"/>`);
            }
        }
        // The opening's size is in the wall chain outside; no second label.
    }

    // ---- partitions ---------------------------------------------------------
    const partDims: { axis: 'x' | 'y'; at: number; from: number; to: number; ext: number }[] = [];
    for (const pt of spec.partitions || []) {
        if (!pt || typeof pt !== 'object') continue;
        const th = Number(pt.thicknessMm) || 100, len = Number(pt.lengthMm) || 0, x = Number(pt.xMm) || 0, z = Number(pt.zMm) || 0;
        const runX = Number(pt.rotation) !== 90; // local +X runs along world x when rotation 0
        // Clamped to the inside of the shell: a full-depth partition is stored
        // at the room's depth and would otherwise draw through the outer walls.
        const clampX = (v: number) => Math.max(-hw + T, Math.min(hw - T, v));
        const clampZ = (v: number) => Math.max(-hd + T, Math.min(hd - T, v));
        const rect = runX
            ? { x: clampX(x - len / 2), y: z - th / 2, w: clampX(x + len / 2) - clampX(x - len / 2), h: th }
            : { x: x - th / 2, y: clampZ(z - len / 2), w: th, h: clampZ(z + len / 2) - clampZ(z - len / 2) };
        out.push(`<rect class="wall" x="${r0(rect.x)}" y="${r0(rect.y)}" width="${r0(rect.w)}" height="${r0(rect.h)}"/>`);
        // Doors in the run: offset from the wall centre along local +X.
        for (const d of pt.doors || []) {
            if (d.onLeg) continue;
            const dw = 838; const c = Number(d.offsetMm) || 0;
            const sw = d.swing === -1 ? -1 : 1; // +1 = local +Z face
            if (runX) {
                out.push(`<rect class="cut" x="${r0(x + c - dw / 2)}" y="${r0(z - th / 2 - 5)}" width="${dw}" height="${th + 10}"/>`);
                swing(r0(x + c - dw / 2), r0(z + sw * th / 2), 1, 0, 0, sw, dw);
            } else {
                out.push(`<rect class="cut" x="${r0(x - th / 2 - 5)}" y="${r0(z + c - dw / 2)}" width="${th + 10}" height="${dw}"/>`);
                // local +X is world +z here, local +Z face is world -x.
                swing(r0(x - sw * th / 2), r0(z + c - dw / 2), 0, 1, -sw, 0, dw);
            }
        }
        // The leg of an L-shaped partition.
        if (Number(pt.legLengthMm) > 0) {
            const L = Number(pt.legLengthMm), end = pt.legEnd === -1 ? -1 : 1, dir = pt.legDir === -1 ? -1 : 1;
            if (runX) {
                const ex = x + end * len / 2, y0 = dir > 0 ? z : z - L;
                out.push(`<rect class="wall" x="${r0(ex - th / 2)}" y="${r0(y0)}" width="${th}" height="${L}"/>`);
            } else {
                const ez = z + end * len / 2, x0 = dir > 0 ? x - L : x;
                out.push(`<rect class="wall" x="${r0(x0)}" y="${r0(ez - th / 2)}" width="${L}" height="${th}"/>`);
            }
        }
        // Setting-out figure: from the nearest wall's inner face to the partition's near face.
        // Drawn just inside the shell beside the partition's end, never over
        // the outer chains (a full-depth partition's end IS the wall).
        if (runX) {
            const near = z < 0 ? -hd + T : hd - T; const face = z < 0 ? z - th / 2 : z + th / 2;
            const at = Math.max(-hw + T + 350, rect.x - 350);
            partDims.push({ axis: 'y', at, from: Math.min(near, face), to: Math.max(near, face), ext: rect.x });
        } else {
            const near = x < 0 ? -hw + T : hw - T; const face = x < 0 ? x - th / 2 : x + th / 2;
            const at = Math.max(-hd + T + 350, rect.y - 350);
            partDims.push({ axis: 'x', at, from: Math.min(near, face), to: Math.max(near, face), ext: rect.y });
        }
    }
    for (const pd of partDims) dimChain([pd.from, pd.to], pd.axis, pd.at, pd.ext, -1, out);

    // ---- interior doors (free-standing, older designs) -----------------------
    for (const d of spec.interiorDoors || []) {
        const w = Number(d.widthMm) || 838, x = Number(d.xMm) || 0, z = Number(d.zMm) || 0, rot = Number(d.rotation) || 0;
        const ux = Math.cos(rot), uz = Math.sin(rot);
        swing(r0(x - ux * w / 2), r0(z - uz * w / 2), ux, uz, -uz, ux, w);
    }

    // ---- skylights, dashed ----------------------------------------------------
    for (const s of spec.skylights || []) {
        const w = Number(s.widthMm) || 800, l = Number(s.lengthMm) || 1200;
        const ox = Math.abs(Number(s.offsetX) || 0) > 50 ? Number(s.offsetX) : Number(s.offsetX) * 1000;
        const oz = Math.abs(Number(s.offsetZ) || 0) > 50 ? Number(s.offsetZ) : Number(s.offsetZ) * 1000;
        out.push(`<rect class="thin dashed" x="${r0(ox - w / 2)}" y="${r0(oz - l / 2)}" width="${w}" height="${l}"/>`);
        out.push(`<line class="thin dashed" x1="${r0(ox - w / 2)}" y1="${r0(oz - l / 2)}" x2="${r0(ox + w / 2)}" y2="${r0(oz + l / 2)}"/><line class="thin dashed" x1="${r0(ox + w / 2)}" y1="${r0(oz - l / 2)}" x2="${r0(ox - w / 2)}" y2="${r0(oz + l / 2)}"/>`);
    }

    // ---- furniture and fittings, as symbols with a label ----------------------
    for (const it of spec.planItems || []) {
        const w = Number(it.widthMm) || 600, dpt = Number(it.depthMm) || Math.min(w, 600);
        const x = Number(it.xMm) || 0, z = Number(it.zMm) || 0, rot = Number(it.rotDeg) || 0;
        const label = esc(String(it.label || '').toUpperCase());
        out.push(`<g transform="translate(${r0(x)} ${r0(z)}) rotate(${r0(-rot)})"><rect class="item" x="${r0(-w / 2)}" y="${r0(-dpt / 2)}" width="${r0(w)}" height="${r0(dpt)}"/>` +
            (/sofa|armchair|bed/i.test(label) ? `<line class="thin" x1="${r0(-w / 2)}" y1="${r0(-dpt / 2 + Math.min(180, dpt * 0.3))}" x2="${r0(w / 2)}" y2="${r0(-dpt / 2 + Math.min(180, dpt * 0.3))}"/>` : '') +
            (/sink/i.test(label) ? `<rect class="thin" x="${r0(-w * 0.3)}" y="${r0(-dpt * 0.25)}" width="${r0(w * 0.6)}" height="${r0(dpt * 0.5)}" rx="40"/>` : '') +
            (/hob|oven/i.test(label) ? `<circle class="thin" cx="${r0(-w * 0.2)}" cy="0" r="${r0(Math.min(w, dpt) * 0.15)}"/><circle class="thin" cx="${r0(w * 0.2)}" cy="0" r="${r0(Math.min(w, dpt) * 0.15)}"/>` : '') +
            `<text class="tiny" x="0" y="${r0(dpt / 2 + 130)}" text-anchor="middle" transform="rotate(${r0(rot)})">${label}</text></g>`);
    }

    // ---- overall and wall chains ----------------------------------------------
    const deckBottom = hd + deckFront;
    const left = -hw - deckLeft, right = hw + deckRight;
    // Front chain under the deck, overall width above the back wall.
    dimChain(chains.front, 'x', deckBottom + 450, deckBottom, 1, out);
    dimChain([-hw, hw], 'x', -hd - 900, -hd, -1, out);
    dimChain(chains.back, 'x', -hd - 450, -hd, -1, out);
    // Side chains and overall depth.
    dimChain(chains.left, 'y', left - 450, left, -1, out);
    dimChain([-hd, hd], 'y', left - 900, left, -1, out);
    dimChain(chains.right, 'y', right + 450, right, 1, out);

    // ---- title ---------------------------------------------------------------
    const title = esc(opts.title || 'FLOOR PLAN');
    const notes = opts.notes ? esc(opts.notes) : '';

    // ---- frame ---------------------------------------------------------------
    const margin = 1500;
    const x0 = left - margin, y0 = -hd - margin, x1 = right + margin, y1 = deckBottom + margin + 500;
    const widthMm = x1 - x0, heightMm = y1 - y0;
    out.push(`<text class="title" x="${x0 + 200}" y="${y1 - 260}">${title}</text>`);
    out.push(`<text class="tiny" x="${x0 + 200}" y="${y1 - 80}">Drawn from the design data · all dimensions in mm · ${r0(W)} x ${r0(D)} overall, walls ${r0(T)}${notes ? ' · ' + notes : ''}</text>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${widthMm} ${heightMm}" width="${widthMm}" height="${heightMm}">
<style>
  .wall { fill: #1f1f1f; stroke: #1f1f1f; stroke-width: 6; }
  .cut { fill: #ffffff; stroke: none; }
  .glass { stroke: #1f1f1f; stroke-width: 14; fill: none; }
  .thin { stroke: #1f1f1f; stroke-width: 10; fill: none; }
  .dashed { stroke-dasharray: 120 80; }
  .leaf { stroke: #1f1f1f; stroke-width: 22; fill: none; stroke-linecap: round; }
  .swing { stroke: #1f1f1f; stroke-width: 8; fill: none; stroke-dasharray: 60 60; }
  .deck { fill: #f3f3f3; stroke: #1f1f1f; stroke-width: 10; }
  .board { stroke: #c9c9c9; stroke-width: 6; }
  .item { fill: #ffffff; stroke: #1f1f1f; stroke-width: 12; }
  .dim { stroke: #1f1f1f; stroke-width: 8; fill: none; }
  .ext { stroke: #1f1f1f; stroke-width: 6; fill: none; }
  .fig { font: 150px 'Montserrat', Arial, Helvetica, sans-serif; fill: #1f1f1f; }
  .tiny { font: 110px 'Montserrat', Arial, Helvetica, sans-serif; fill: #1f1f1f; letter-spacing: 6px; }
  .label { font: 170px 'Montserrat', Arial, Helvetica, sans-serif; fill: #1f1f1f; letter-spacing: 14px; }
  .title { font: bold 260px 'Montserrat', Arial, Helvetica, sans-serif; fill: #1f1f1f; letter-spacing: 30px; }
</style>
<rect x="${x0}" y="${y0}" width="${widthMm}" height="${heightMm}" fill="#ffffff"/>
${out.join('\n')}
</svg>`;
    return { svg, widthMm, heightMm };
}

/** Rasterise the SVG in the browser to a JPEG data URL, `width` pixels wide. */
export async function rasterizeSvg(svg: string, width = 2400): Promise<string> {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
        const scale = width / img.width;
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.95);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** The CAD plan for a configurator design, as base64 JPEG (no data-URL prefix). */
export async function drawCadPlan(spec: CadPlanSpec, opts: { notes?: string } = {}): Promise<string> {
    const { svg } = buildCadPlanSvg(spec, opts);
    const dataUrl = await rasterizeSvg(svg, 2400);
    return dataUrl.replace(/^data:[^;]+;base64,/, '');
}
