import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, PenTool, RefreshCcw } from 'lucide-react';

interface CanvasMaskProps {
    baseImage: string;
    onMaskComplete: (maskBase64: string | null) => void;
}

export const CanvasMask: React.FC<CanvasMaskProps> = ({ baseImage, onMaskComplete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgImgRef = useRef<HTMLImageElement | null>(null);
    // Keep a stable ref to onMaskComplete so it never causes initCanvas to re-run
    const onMaskCompleteRef = useRef(onMaskComplete);
    useEffect(() => { onMaskCompleteRef.current = onMaskComplete; }, [onMaskComplete]);

    const [isDrawing, setIsDrawing] = useState(false);
    const [mode, setMode] = useState<'draw' | 'erase'>('draw');
    const [brushSize, setBrushSize] = useState(30);

    // Stable object URL for the background image — avoids embedding giant base64 in the DOM
    const [bgObjectUrl, setBgObjectUrl] = useState<string>('');

    useEffect(() => {
        // If it's already a blob or data URL, use it directly
        if (baseImage.startsWith('blob:') || baseImage.startsWith('data:') || baseImage.startsWith('http')) {
            setBgObjectUrl(baseImage);
            return;
        }

        // Otherwise convert base64 to a Blob URL
        try {
            const byteCharacters = atob(baseImage);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            setBgObjectUrl(url);
            return () => URL.revokeObjectURL(url);
        } catch (e) {
            console.error('CanvasMask: Failed to create Object URL', e);
            setBgObjectUrl(`data:image/jpeg;base64,${baseImage}`);
        }
    }, [baseImage]);

    // Initialize canvas — only depends on baseImage (not onMaskComplete)
    const initCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Revoke previous image reference if any
        if (bgImgRef.current) {
            bgImgRef.current.onload = null;
            bgImgRef.current.onerror = null;
        }

        const img = new Image();
        bgImgRef.current = img;

        img.onload = () => {
            // Limit canvas to a maximum of 1920px to prevent OOM on very large images
            const MAX_DIM = 1920;
            const containerRatio = container.clientWidth / container.clientHeight;
            const imgRatio = img.width / img.height;

            let drawWidth = Math.min(container.clientWidth, MAX_DIM);
            let drawHeight = Math.min(container.clientHeight, MAX_DIM);

            if (containerRatio > imgRatio) {
                drawWidth = drawHeight * imgRatio;
            } else {
                drawHeight = drawWidth / imgRatio;
            }

            canvas.width = Math.round(drawWidth);
            canvas.height = Math.round(drawHeight);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            onMaskCompleteRef.current(null);
        };

        img.onerror = () => {
            console.error('CanvasMask: failed to load base image');
        };

        // Use a simple data URI just for size calculation — we don't draw the bg here
        img.src = `data:image/png;base64,${baseImage}`;
    }, [baseImage]); // onMaskComplete intentionally omitted — use ref instead

    useEffect(() => {
        initCanvas();
        window.addEventListener('resize', initCanvas);

        // Cleanup: null out the image ref and listener when unmounting
        return () => {
            window.removeEventListener('resize', initCanvas);
            if (bgImgRef.current) {
                bgImgRef.current.onload = null;
                bgImgRef.current.onerror = null;
                bgImgRef.current = null;
            }
        };
    }, [initCanvas]);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        drawOnCanvas(e);
    };

    // Export the mask — called only on pointer-up, not during every draw stroke
    const exportMask = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
            tempCtx.fillStyle = 'black';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(canvas, 0, 0);

            const dataUrl = tempCanvas.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            onMaskCompleteRef.current(base64);
        }

        // Release the temporary canvas memory immediately
        tempCanvas.width = 0;
        tempCanvas.height = 0;
    }, []);

    const stopDrawing = () => {
        setIsDrawing(false);
        exportMask();
    };

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const drawOnCanvas = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const coords = getCoordinates(e);
        if (!coords) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;

        if (mode === 'draw') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        } else {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        }

        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    };

    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) ctx.beginPath();
        startDrawing(e);
    };

    return (
        <div className="flex flex-col gap-4 w-full h-full">
            <div className="flex justify-between items-center bg-surface/50 p-2 rounded-xl border border-white/5">
                <div className="flex gap-2">
                    <button
                        onClick={() => setMode('draw')}
                        className={`p-2 rounded-lg transition-colors ${mode === 'draw' ? 'bg-accent/20 text-accent border border-accent/30' : 'text-secondary hover:text-white'}`}
                        title="Draw Mask (White)"
                    >
                        <PenTool size={16} />
                    </button>
                    <button
                        onClick={() => setMode('erase')}
                        className={`p-2 rounded-lg transition-colors ${mode === 'erase' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'text-secondary hover:text-white'}`}
                        title="Erase Mask"
                    >
                        <Eraser size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase font-bold text-secondary">Size: {brushSize}px</span>
                    <input
                        type="range"
                        min="5"
                        max="100"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-24 accent-accent"
                    />
                </div>

                <button
                    onClick={initCanvas}
                    className="p-2 text-secondary hover:text-indigo-400 transition-colors"
                    title="Clear Mask"
                >
                    <RefreshCcw size={16} />
                </button>
            </div>

            <div
                ref={containerRef}
                className="flex-1 w-full bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-white/10"
                style={{
                    // Use the object URL instead of embedding the raw base64 directly
                    backgroundImage: bgObjectUrl ? `url(${bgObjectUrl})` : 'none',
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                <canvas
                    ref={canvasRef}
                    onMouseDown={onMouseDown}
                    onMouseMove={drawOnCanvas}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={onMouseDown}
                    onTouchMove={drawOnCanvas}
                    onTouchEnd={stopDrawing}
                    className="cursor-crosshair mix-blend-screen opacity-60 hover:opacity-80 transition-opacity"
                    style={{ touchAction: 'none' }}
                />
            </div>
            <p className="text-[10px] text-center text-secondary/70">Draw over the areas you want the AI to modify.</p>
        </div>
    );
};
