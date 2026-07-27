import React, { useState } from 'react';
import { useStore } from '../../store';
import { Html } from '@react-three/drei';
import { useDrag3D } from './useDrag3D';

type Axis = 'x' | 'y' | 'z';

interface DragHandleProps {
  position: [number, number, number];
  axis: Axis;
  visualAxis?: Axis;
  onChange: (deltaWorld: number) => void;
  color?: string;
  label?: string;
  snapInterval?: number;
  elementId?: string;
}

export function DragHandle({ position, axis, visualAxis, onChange, color = '#10b981', label, snapInterval = 0.1, elementId = 'room' }: DragHandleProps) {
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, isDragging } = useDrag3D(axis, onChange, snapInterval);
  const [hovered, setHovered] = useState(false);
  const { viewMode, isExporting } = useStore();

  if (viewMode === 'walking' || isExporting) return null;

  const baseColor = color || '#10b981';
  // active colour could just be the base colour or slightly darker if we computed it, but let's just make it fully opaque
  const opacity = isDragging ? 1 : (hovered ? 0.9 : 0.6);

  const vAxis = visualAxis || axis;
  // Orient arrows along the dragging axis
  const rotation: [number, number, number] = 
    vAxis === 'x' ? [0, 0, -Math.PI / 2] :
    vAxis === 'y' ? [0, 0, 0] :
    [Math.PI / 2, 0, 0];

  return (
    <group position={position}>
      {/* Invisible hitbox for easy grabbing */}
      <mesh 
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onPointerMove(e);
        }}
        onPointerUp={(e) => {
          onPointerUp(e);
          document.body.style.cursor = 'auto';
        }}
        onPointerCancel={(e) => {
          onPointerCancel(e);
          document.body.style.cursor = 'auto';
        }}
        onPointerOver={(e) => { 
          e.stopPropagation(); 
          setHovered(true); 
          if (elementId) useStore.getState().setHoveredElementId(elementId);
          let cursor = 'move';
          if (vAxis === 'x') cursor = 'ew-resize';
          if (vAxis === 'z') cursor = 'ns-resize';
          if (vAxis === 'y') cursor = 'ns-resize';
          document.body.style.cursor = cursor; 
        }}
        onPointerOut={(e) => { 
          setHovered(false); 
          if (elementId && !isDragging) useStore.getState().setHoveredElementId(null);
          if (!isDragging) document.body.style.cursor = 'auto'; 
        }}
        visible={true}
      >
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial transparent opacity={0.0} depthTest={false} />
      </mesh>

      {/* Visual Indicator (Subtle Handle) */}
      <group 
        scale={isDragging ? 1.5 : (hovered ? 1.3 : 1.0)}
      >
        <mesh>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color={baseColor} depthTest={false} transparent opacity={opacity} />
        </mesh>
        <mesh rotation={rotation}>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
          <meshBasicMaterial color={baseColor} depthTest={false} transparent opacity={opacity} />
        </mesh>
      </group>

      {false && label && (
        <Html position={[0, 0.2, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-sm select-none border border-gray-200 text-gray-800 tracking-wider">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

