import { Canvas } from '@react-three/fiber';
import { MainScene } from './3d/MainScene';
import { useStore } from '../store';
import { ViewModeToggle } from './UI/ViewModeToggle';
import { PricePill } from './UI/PricePill';
import { ObjectEditorPanel } from './UI/ObjectEditorPanel';
import { ElementEditorPanel } from './UI/ElementEditorPanel';
import { HistoryButtons } from './UI/HistoryButtons';
import { ActionButtons } from './UI/ActionButtons';
import { CameraWidget } from './UI/CameraWidget';
import { WalkHud } from './UI/WalkHud';
import { WalkFloorPanel } from './UI/WalkFloorPanel';
import { WalkWallPanel } from './UI/WalkWallPanel';
import { useRef, useState, useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import * as THREE from 'three';

function LoadingScreen() {
  const { active, progress } = useProgress();
  const [show, setShow] = useState(true);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const progressRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    /**
     * A floor, not a countdown - and a SHORT one, because this loader is the
     * second in a queue.
     *
     * The configurator runs in an iframe inside the app, and the app already
     * holds its own branded splash for 4 seconds. Padding this one to 4.2s on
     * top meant roughly nine seconds from click to a usable scene, most of it
     * invented: the bar sat at 99% waiting out a timer with nothing left to
     * load. That is the "black screen / keeps flashing then eventually works".
     *
     * 1.2s still covers the real work - the loader also waits on useProgress,
     * so a genuinely slow model load holds it open for as long as it takes.
     */
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 1200);
    return () => clearTimeout(minTimer);
  }, []);

  const isComplete = !active && (progress === 100 || progress === 0) && minTimeElapsed;

  /**
   * Going away is a ONE-WAY decision.
   *
   * 18 models are warmed in the background after startup, one at a time, and
   * each one flips useProgress back to active. The old effect called
   * setShow(true) on every one of those flips and cleared the pending fade,
   * so the loader was thrown back over the scene again and again - the screen
   * flashing ten times. Nothing was actually wrong; it was the same loader
   * dismissing and being re-shown.
   *
   * Now the first completion latches: `fading` drives the opacity so a later
   * flip cannot snap it back to full, and `dismissed` means the effect never
   * runs a second time.
   */
  const dismissed = useRef(false);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (dismissed.current || !isComplete) return;
    dismissed.current = true;
    setFading(true);
    const timeout = setTimeout(() => setShow(false), 800);
    return () => clearTimeout(timeout);
  }, [isComplete]);

  useEffect(() => {
    let frame: number;
    const update = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const fakeTarget = Math.min(99, (elapsed / 1200) * 100);
      const realTarget = (!minTimeElapsed && progress === 100) ? 99 : progress;
      const target = Math.max(fakeTarget, realTarget);
      
      if (progressRef.current < target) {
        progressRef.current += (target - progressRef.current) * 0.05 + 0.1;
        if (progressRef.current > target) progressRef.current = target;
        setDisplayProgress(progressRef.current);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [progress, minTimeElapsed]);

  if (!show) return null;

  return (
    <div 
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#fafaf9] transition-opacity duration-700 ease-in-out" 
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}
    >
      <div className="text-2xl font-bold tracking-[0.2em] text-[#3b4d4a] mb-8">MODULR 3D</div>
      <div className="w-64 max-w-sm">
        <div className="flex justify-between text-[10px] font-bold text-[#3b4d4a] mb-3 uppercase tracking-widest">
          <span>Loading Studio</span>
          <span>{Math.round(displayProgress)}%</span>
        </div>
        <div className="h-[2px] bg-gray-200 overflow-hidden">
          <div 
            className="h-full bg-[#3b4d4a] transition-none" 
            style={{ width: `${displayProgress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}

export function CanvasArea() {
  const { viewMode, uploadedBgImage, activePlacementType } = useStore();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('type');
    if (!type || !wrapperRef.current) return;

    // Hand off to the scene, which raycasts the drop point onto the ground
    // through the real camera (the old x10 NDC guess dropped objects outside
    // the room). Interior objects are clamped inside the walls by addObject.
    const rect = wrapperRef.current.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    window.dispatchEvent(new CustomEvent('place-object-at', { detail: { type, ndcX, ndcY } }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div 
      className="absolute inset-0 w-full h-full" 
      ref={wrapperRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {viewMode === 'render' && uploadedBgImage ? (
         <img src={uploadedBgImage} className="absolute inset-0 w-full h-full object-cover z-0" alt="Background" />
      ) : (
         <div className="absolute inset-0 opacity-20 pointer-events-none z-0" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      )}
      
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Canvas 
          className="pointer-events-auto"
          shadows 
          camera={{ position: [10, 10, 15], fov: 50 }}
          gl={{ 
            preserveDrawingBuffer: true, 
            antialias: true, 
            alpha: true, 
            toneMapping: THREE.ACESFilmicToneMapping, 
            toneMappingExposure: 1.2,
            outputColorSpace: THREE.SRGBColorSpace 
          }}
          dpr={window.devicePixelRatio ? Math.min(1.5, window.devicePixelRatio) : 1.5}
        >
          <MainScene />
        </Canvas>
      </div>
      {activePlacementType && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-[#3b4d4a] text-white px-5 py-2.5 rounded-full shadow-xl text-xs font-semibold flex items-center gap-3 pointer-events-none">
          <span>Click in the scene to place</span>
          <span className="opacity-60">R rotate · Esc cancel</span>
        </div>
      )}
      <ViewModeToggle />
      <CameraWidget />
      <HistoryButtons />
      <PricePill />
      <WalkHud />
      <WalkFloorPanel />
      <WalkWallPanel />
      <ObjectEditorPanel />
      <ElementEditorPanel />
      <ActionButtons />
      <LoadingScreen />
    </div>
  );
}
