import React from 'react';
import {
    FORMATS, FONTS, clampLayer,
    type PostDesign, type Layer, type TextLayer, type ShapeLayer, type LogoLayer, type ImageLayer,
} from '../../services/postDesign';
import { getProcessedLogo, preloadLogos } from '../../services/logoProcessing';

/**
 * The editing surface.
 *
 * Rendered as real DOM rather than drawn to a canvas, for two reasons. Text
 * behaves like text - web fonts, kerning, letter-spacing, wrapping - instead of
 * being hand-measured with measureText. And hit-testing, dragging and resizing
 * come for free from the elements themselves rather than needing a geometry
 * pass on every pointer move.
 *
 * Export re-renders this same DOM through html2canvas, so what is exported is
 * literally what was on screen. That is the property the previous canvas
 * implementation could not offer: preview and output were two code paths that
 * had to be kept in agreement by hand.
 *
 * Everything is positioned in percentages, so one stylesheet serves both the
 * ~380px editor and the 1080px export.
 */

interface PostCanvasProps {
    design: PostDesign;
    /** Rendered width in CSS pixels. The export passes the full format width. */
    width: number;
    selectedId: string | null;
    onSelect?: (id: string | null) => void;
    onChange?: (layers: Layer[]) => void;
    /** Export mode: no chrome, no handles, no guides. */
    stat?: boolean;
    showSafeArea?: boolean;
    innerRef?: React.Ref<HTMLDivElement>;
}

type DragState = {
    id: string;
    mode: 'move' | 'resize';
    startX: number; startY: number;
    origin: Layer;
} | null;

export const PostCanvas: React.FC<PostCanvasProps> = ({
    design, width, selectedId, onSelect, onChange, stat = false, showSafeArea = false, innerRef,
}) => {
    const spec = FORMATS[design.format];
    const height = (width * spec.height) / spec.width;
    const hostRef = React.useRef<HTMLDivElement>(null);
    const [drag, setDrag] = React.useState<DragState>(null);
    /**
     * Which text layer is being typed into.
     *
     * Editing happens ON the canvas, because that is where people try to do it:
     * double-click the words and type. Without this the only way in was a box
     * in the side panel, and pressing Backspace over a selected layer deleted
     * the whole layer instead of a character - which reads as "all my text just
     * vanished".
     */
    const [editingId, setEditingId] = React.useState<string | null>(null);

    /**
     * Logos are processed off-thread and read from a shared cache, so a repaint
     * is needed once one finishes. Both this instance and the off-screen export
     * surface read the same cache, which is what keeps them identical.
     */
    const [, repaint] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        const logos = design.layers.filter(l => l.type === 'logo' && (l as LogoLayer).src) as LogoLayer[];
        if (!logos.length) return;
        let alive = true;
        preloadLogos(logos.map(l => ({ src: l.src!, strip: l.stripWhite })))
            .then(() => { if (alive) repaint(); });
        return () => { alive = false; };
    }, [design.layers]);

    // Dropping the selection, or the layer itself, must not strand the editor.
    React.useEffect(() => {
        if (editingId && editingId !== selectedId) setEditingId(null);
    }, [selectedId, editingId]);
    /** Snap lines currently being honoured, for the guide overlay. */
    const [guides, setGuides] = React.useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

    /** Font size is a fraction of WIDTH, so type scales with the frame instead
     *  of stretching when the format gets taller. */
    const px = (fracOfWidth: number) => fracOfWidth * width;

    React.useEffect(() => {
        if (!drag) return;

        const move = (e: PointerEvent) => {
            const dx = (e.clientX - drag.startX) / width;
            const dy = (e.clientY - drag.startY) / height;
            const o = drag.origin;

            let next: Layer;
            if (drag.mode === 'move') {
                next = { ...o, x: o.x + dx, y: o.y + dy };

                // Snap to canvas centre and to the thirds, which is most of what
                // anyone is reaching for when they nudge something by hand.
                const targets = [0.5, 1 / 3, 2 / 3];
                const vHit: number[] = [], hHit: number[] = [];
                const TOL = 0.012;
                const cx = next.x + next.w / 2;
                for (const t of targets) {
                    if (Math.abs(cx - t) < TOL) { next.x = t - next.w / 2; vHit.push(t); }
                }
                const cy = next.y + next.h / 2;
                for (const t of targets) {
                    if (Math.abs(cy - t) < TOL) { next.y = t - next.h / 2; hHit.push(t); }
                }
                setGuides({ v: vHit, h: hHit });
            } else {
                next = { ...o, w: Math.max(0.04, o.w + dx), h: Math.max(0.015, o.h + dy) };
                // Resizing a text box changes the measure, not the type size -
                // that is what a text box does, and font size has its own control.
            }

            onChange?.(design.layers.map(l => (l.id === drag.id ? clampLayer(next) : l)));
        };

        const up = () => { setDrag(null); setGuides({ v: [], h: [] }); };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [drag, width, height, design.layers, onChange]);

    const startDrag = (e: React.PointerEvent, layer: Layer, mode: 'move' | 'resize') => {
        if (stat || layer.locked) return;
        // A layer being typed into must not also be draggable, or selecting a
        // word with the mouse drags the whole text box across the canvas.
        if (editingId === layer.id) { e.stopPropagation(); return; }
        e.stopPropagation();
        e.preventDefault();
        onSelect?.(layer.id);
        setDrag({ id: layer.id, mode, startX: e.clientX, startY: e.clientY, origin: layer });
    };

    const commitText = (id: string, el: HTMLElement) => {
        const text = el.innerText.replace(/ /g, ' ');
        onChange?.(design.layers.map(l => (l.id === id ? ({ ...l, text } as Layer) : l)));
        setEditingId(null);
    };

    const pct = (n: number) => `${n * 100}%`;

    const renderLayer = (layer: Layer) => {
        const selected = !stat && layer.id === selectedId;
        const base: React.CSSProperties = {
            position: 'absolute',
            left: pct(layer.x), top: pct(layer.y),
            width: pct(layer.w),
            opacity: layer.opacity,
            cursor: stat ? 'default' : layer.locked ? 'not-allowed' : 'move',
            outline: selected ? '2px solid #3b82f6' : 'none',
            outlineOffset: 2,
        };

        let inner: React.ReactNode = null;
        let style = base;

        if (layer.type === 'text') {
            const t = layer as TextLayer;
            style = {
                ...base,
                fontFamily: FONTS[t.font].stack,
                fontWeight: t.weight,
                fontSize: px(t.size),
                lineHeight: t.lineHeight,
                letterSpacing: `${t.letterSpacing}em`,
                color: t.color,
                textAlign: t.align,
                textTransform: t.uppercase ? 'uppercase' : 'none',
                textShadow: t.shadow ? `0 ${px(0.004)}px ${px(0.016)}px rgba(0,0,0,0.45)` : 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                cursor: editingId === t.id ? 'text' : base.cursor,
            };
            inner = editingId === t.id ? (
                <div
                    contentEditable
                    suppressContentEditableWarning
                    autoFocus
                    ref={(el) => {
                        if (!el || el.dataset.primed) return;
                        el.dataset.primed = '1';
                        el.innerText = t.text;
                        // Select the lot, so the first keystroke replaces the
                        // placeholder rather than appending to it.
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }}
                    onBlur={(e) => commitText(t.id, e.currentTarget)}
                    onKeyDown={(e) => {
                        e.stopPropagation(); // never reaches the delete shortcut
                        if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                        // Enter commits; Shift+Enter is a genuine line break.
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(t.id, e.currentTarget); }
                    }}
                    style={{ outline: 'none', minHeight: '1em' }}
                />
            ) : t.text;
        } else if (layer.type === 'shape') {
            const s = layer as ShapeLayer;
            style = {
                ...base,
                height: pct(layer.h),
                background: s.fill,
                borderRadius: s.radius >= 0.5 ? 9999 : px(s.radius),
            };
        } else if (layer.type === 'logo') {
            const l = layer as LogoLayer;
            style = { ...base, height: pct(layer.h) };
            // The processed (white-stripped) copy when it is ready, the raw file
            // until then - a logo that pops in late is better than one that
            // never appears.
            const logoSrc = l.src ? (getProcessedLogo(l.src, l.stripWhite) ?? l.src) : null;
            inner = logoSrc ? (
                <img
                    src={logoSrc}
                    alt="Logo"
                    draggable={false}
                    style={{
                        width: '100%', height: '100%', objectFit: 'contain',
                        filter: l.shadow ? `drop-shadow(0 ${px(0.004)}px ${px(0.012)}px rgba(0,0,0,0.4))` : 'none',
                    }}
                />
            ) : null;
        } else {
            const i = layer as ImageLayer;
            style = { ...base, height: pct(layer.h), borderRadius: px(i.radius), overflow: 'hidden' };
            inner = <img src={i.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: i.fit }} />;
        }

        return (
            <div
                key={layer.id}
                style={style}
                onPointerDown={(e) => startDrag(e, layer, 'move')}
                onDoubleClick={(e) => {
                    if (stat || layer.type !== 'text' || layer.locked) return;
                    e.stopPropagation();
                    onSelect?.(layer.id);
                    setEditingId(layer.id);
                }}
            >
                {inner}
                {selected && !layer.locked && (
                    <span
                        onPointerDown={(e) => startDrag(e, layer, 'resize')}
                        style={{
                            position: 'absolute', right: -7, bottom: -7,
                            width: 14, height: 14, borderRadius: 4,
                            background: '#3b82f6', border: '2px solid #fff',
                            cursor: 'nwse-resize', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                        }}
                    />
                )}
            </div>
        );
    };

    const bg = design.background;

    return (
        <div
            ref={innerRef ?? hostRef}
            onPointerDown={() => !stat && onSelect?.(null)}
            style={{
                position: 'relative',
                width, height,
                overflow: 'hidden',
                background: '#0f172a',
                borderRadius: stat ? 0 : 10,
                userSelect: 'none',
                flexShrink: 0,
            }}
        >
            {/* Blurred backdrop, only when the whole render is being shown and
                would otherwise sit against flat colour. */}
            {bg.src && bg.fit === 'contain' && bg.blurBackdrop && (
                <img
                    src={bg.src}
                    alt=""
                    style={{
                        position: 'absolute', inset: '-12%', width: '124%', height: '124%',
                        objectFit: 'cover', filter: 'blur(42px) brightness(0.7) saturate(1.1)',
                    }}
                />
            )}

            {bg.src ? (
                <img src={bg.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bg.fit }} />
            ) : (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: FONTS.montserrat.stack, fontWeight: 600,
                }}>
                    Add a render
                </div>
            )}

            {bg.overlayOpacity > 0 && (
                <div style={{ position: 'absolute', inset: 0, background: bg.overlay, opacity: bg.overlayOpacity }} />
            )}

            {bg.scrim > 0 && (
                <div style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(to ${bg.scrimFrom === 'bottom' ? 'top' : 'bottom'}, rgba(15,23,42,${0.92 * bg.scrim}) 0%, rgba(15,23,42,0) 62%)`,
                }} />
            )}

            {design.layers.map(renderLayer)}

            {/* Safe-area rules, editor only - these must never reach an export. */}
            {!stat && showSafeArea && (
                <>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: pct(spec.safeTop), borderTop: '1px dashed rgba(255,255,255,0.35)' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: pct(spec.safeBottom), borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
                </>
            )}

            {!stat && guides.v.map(g => (
                <div key={`v${g}`} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(g), width: 1, background: '#3b82f6' }} />
            ))}
            {!stat && guides.h.map(g => (
                <div key={`h${g}`} style={{ position: 'absolute', left: 0, right: 0, top: pct(g), height: 1, background: '#3b82f6' }} />
            ))}
        </div>
    );
};
