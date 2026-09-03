import { useMemo } from 'react';
import { Text, Line } from '@react-three/drei';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';

/**
 * The dimensions and guides drawn over the reflected ceiling plan.
 *
 * A lighting layout is not finished when the lights look right - it is
 * finished when somebody can set it out on site. That means the numbers a
 * sparky measures: wall to first light, light to light, last light to wall,
 * on both axes. Reading them off a side panel is not the same as seeing them
 * on the drawing, because on the drawing you can see AT A GLANCE that one gap
 * is not like the others.
 *
 * Drawn only in the lighting view, above everything, and only for the unique
 * lines fittings sit on - a grid of twelve produces four vertical dimensions
 * and three horizontal ones, not twelve of each.
 */

const INK = '#3b4d4a';
const FAINT = '#9bb0aa';

/** Distinct coordinates, to the nearest millimetre, sorted. */
function lines(values: number[]): number[] {
  const seen = new Map<number, number>();
  for (const v of values) seen.set(Math.round(v * 1000), v);
  return [...seen.values()].sort((a, b) => a - b);
}

export function LightingPlan() {
  const { viewMode, room, objects, alignGuide } = useStore(useShallow(s => ({
    viewMode: s.viewMode,
    room: s.scene.room,
    objects: s.scene.objects,
    alignGuide: s.alignGuide,
  })));

  const spots = useMemo(() => objects.filter(o => o.type === 'spot_light'), [objects]);

  if (viewMode !== 'lighting') return null;

  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = room.widthMm / 2000 - wt;
  const hz = room.depthMm / 2000 - wt;
  const y = 0.9; // above the floor, below nothing - the plan camera looks down

  const xs = lines(spots.map(s => s.x));
  const zs = lines(spots.map(s => s.z));
  const mm = (v: number) => Math.round(v * 1000);

  /** One dimension run: ticks, a witness line and a label per gap. */
  const run = (
    at: number[], from: number, to: number, along: 'x' | 'z', offset: number,
  ) => {
    const stops = [from, ...at, to];
    const el: React.ReactNode[] = [];
    const pt = (v: number, o: number): [number, number, number] =>
      along === 'x' ? [v, y, o] : [o, y, v];

    el.push(
      <Line key="axis" points={[pt(from, offset), pt(to, offset)]} color={FAINT} lineWidth={1} />,
    );
    stops.forEach((v, i) => {
      el.push(
        <Line
          key={`t${i}`}
          points={[pt(v, offset - 0.09), pt(v, offset + 0.09)]}
          color={FAINT}
          lineWidth={1}
        />,
      );
      if (i === 0) return;
      const gap = v - stops[i - 1];
      if (gap < 0.02) return;
      const mid = (v + stops[i - 1]) / 2;
      el.push(
        <Text
          key={`d${i}`}
          position={pt(mid, offset + (along === 'x' ? -0.26 : 0.26))}
          rotation={[-Math.PI / 2, 0, along === 'x' ? 0 : Math.PI / 2]}
          fontSize={0.24}
          color={INK}
          anchorX="center"
          anchorY="middle"
          // A white halo, because these sit over a floor texture and a plain
          // dark number on oak boards is unreadable at plan zoom.
          outlineWidth={0.035}
          outlineColor="#ffffff"
        >
          {mm(gap)}
        </Text>,
      );
    });
    return el;
  };

  return (
    <group renderOrder={1000}>
      {/* Across the top, and down the RIGHT - the panel sits over the left of
          the canvas, and a dimension you cannot see is worse than none. */}
      {xs.length > 0 && run(xs, -hx, hx, 'x', -hz - 0.55)}
      {zs.length > 0 && run(zs, -hz, hz, 'z', hx + 0.55)}

      {/* Live alignment guide while dragging: proof that this row lines
          through with that one, rather than nearly doing. */}
      {alignGuide?.x !== undefined && (
        <Line
          points={[[alignGuide.x, y, -hz], [alignGuide.x, y, hz]]}
          color="#10b981" lineWidth={1.5} dashed dashSize={0.12} gapSize={0.08}
        />
      )}
      {alignGuide?.z !== undefined && (
        <Line
          points={[[-hx, y, alignGuide.z], [hx, y, alignGuide.z]]}
          color="#10b981" lineWidth={1.5} dashed dashSize={0.12} gapSize={0.08}
        />
      )}
    </group>
  );
}
