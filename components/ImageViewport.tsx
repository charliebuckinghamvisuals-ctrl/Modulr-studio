import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * The render viewer: scroll to zoom, drag to pan.
 *
 * Renders sit at 4K and were previously shown letterboxed with no way to look
 * closer - which is the one thing a person actually wants to do with an
 * architectural render, since the detail that sells the job (board joints,
 * glazing bars, reflections) is invisible at fit-to-window.
 *
 * Behaves like every professional viewer people already know: the point under
 * the cursor stays under the cursor while zooming, panning only engages once
 * there is something to pan to, and double-click toggles fit and 100%.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 8;

interface ImageViewportProps {
    src: string;
    alt?: string;
    /** Rendered under the image at native position - watermarks, badges. */
    children?: React.ReactNode;
}

export const ImageViewport: React.FC<ImageViewportProps> = ({ src, alt = 'Render', children }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

    // A new render is a new subject - keeping the previous pan would drop the
    // viewer into a corner of an image they have not seen yet.
    useEffect(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, [src]);

    /** Stop the image being dragged so far it leaves the frame. At scale 1
     *  there is no slack, so this pins it to centre. */
    const clamp = useCallback((next: { x: number; y: number }, s: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return next;
        const slackX = Math.max(0, (rect.width * s - rect.width) / 2);
        const slackY = Math.max(0, (rect.height * s - rect.height) / 2);
        return {
            x: Math.min(slackX, Math.max(-slackX, next.x)),
            y: Math.min(slackY, Math.max(-slackY, next.y)),
        };
    }, []);

    const zoomAt = useCallback((clientX: number, clientY: number, nextScale: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));

        setScale(prev => {
            // Keep whatever sits under the cursor pinned there: the offset has
            // to move by the same proportion the scale did, measured from the
            // centre of the frame.
            const cx = clientX - rect.left - rect.width / 2;
            const cy = clientY - rect.top - rect.height / 2;
            const ratio = target / prev;
            setOffset(o => clamp({ x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio }, target));
            return target;
        });
    }, [clamp]);

    // Bound natively rather than via onWheel: React attaches wheel listeners as
    // passive, so preventDefault is ignored there and the whole page scrolls
    // behind the zoom.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            zoomAt(e.clientX, e.clientY, scale * factor);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [scale, zoomAt]);

    const onMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        e.preventDefault();
        setDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    };

    // Tracked on window, not the element: releasing the button outside the
    // frame would otherwise leave it stuck in a drag.
    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const d = dragStart.current;
            setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, scale));
        };
        const onUp = () => setDragging(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragging, scale, clamp]);

    const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

    const step = (dir: 1 | -1) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, dir === 1 ? scale * 1.4 : scale / 1.4);
    };

    const zoomed = scale > 1.001;

    return (
        <div
            ref={containerRef}
            onMouseDown={onMouseDown}
            onDoubleClick={e => (zoomed ? reset() : zoomAt(e.clientX, e.clientY, 2.5))}
            className="absolute inset-0 overflow-hidden select-none"
            style={{ cursor: dragging ? 'grabbing' : zoomed ? 'grab' : 'zoom-in' }}
        >
            <img
                src={src}
                alt={alt}
                draggable={false}
                className="w-full h-full object-contain will-change-transform"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    // No easing mid-drag or the image lags behind the cursor.
                    transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
            />

            {children}

            <div className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-xl bg-white/90 backdrop-blur border border-slate-200 shadow-sm">
                <button
                    onClick={() => step(-1)}
                    disabled={scale <= MIN_SCALE}
                    aria-label="Zoom out"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ZoomOut size={15} />
                </button>
                <button
                    onClick={reset}
                    aria-label="Reset zoom"
                    title="Fit to window"
                    className="min-w-[3.25rem] h-8 px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {Math.round(scale * 100)}%
                </button>
                <button
                    onClick={() => step(1)}
                    disabled={scale >= MAX_SCALE}
                    aria-label="Zoom in"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ZoomIn size={15} />
                </button>
                {zoomed && (
                    <button
                        onClick={reset}
                        aria-label="Fit to window"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors border-l border-slate-200 ml-0.5"
                    >
                        <Maximize2 size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};
