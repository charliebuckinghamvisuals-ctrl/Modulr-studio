import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';

export function useDrag3D(axis: 'x' | 'y' | 'z', onDragDelta: (delta: number) => void, snapInterval: number = 0.1) {
  const { camera } = useThree();
  const { setControlsEnabled } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  
  const startPosRef = useRef<THREE.Vector3 | null>(null);
  const isDraggingRef = useRef(false);
  const lastUpdateRef = useRef(0);

  const plane = new THREE.Plane();

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch(err) {}
    useStore.getState().saveState();
    setControlsEnabled(false);
    setIsDragging(true);
    isDraggingRef.current = true;

    startPosRef.current = e.point.clone();
  };

  const onPointerMove = (e: any) => {
    if (!isDraggingRef.current || !startPosRef.current) return;
    e.stopPropagation();

    // Reconstruct plane with camera direction if Y axis, to keep it facing camera
    const planeNormal = axis === 'x' ? new THREE.Vector3(0, 1, 0) : 
                        axis === 'y' ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1) : 
                        new THREE.Vector3(0, 1, 0); 

    plane.setFromNormalAndCoplanarPoint(planeNormal, startPosRef.current);

    const now = performance.now();
    if (now - lastUpdateRef.current < 32) return; // ~30fps throttle
    lastUpdateRef.current = now;
    const target = new THREE.Vector3();
    const intersection = e.ray.intersectPlane(plane, target);

    if (intersection) {
      let delta = 0;
      if (axis === 'x') delta = intersection.x - startPosRef.current.x;
      if (axis === 'y') delta = intersection.y - startPosRef.current.y;
      if (axis === 'z') delta = intersection.z - startPosRef.current.z;

      if (snapInterval > 0) {
        if (Math.abs(delta) >= snapInterval) {
            const snappedDelta = Math.round(delta / snapInterval) * snapInterval;
            
            onDragDelta(snappedDelta);
            if (axis === 'x') startPosRef.current.x += snappedDelta;
            if (axis === 'y') startPosRef.current.y += snappedDelta;
            if (axis === 'z') startPosRef.current.z += snappedDelta;
        }
      } else {
        if (Math.abs(delta) > 0.001) {
            onDragDelta(delta);
            startPosRef.current.copy(intersection);
        }
      }
    }
  };

  const onPointerUp = (e: any) => {
    e.stopPropagation();
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch(err) {}
    setControlsEnabled(true);
    setIsDragging(false);
    isDraggingRef.current = false;
    startPosRef.current = null;
  };

  useEffect(() => {
    return () => {
      // Re-enable orbit controls if the handle is unmounted while dragging
      if (isDraggingRef.current) {
        setControlsEnabled(true);
      }
    };
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, isDragging };
}
