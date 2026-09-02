import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { CameraControls, Environment, ContactShadows, Plane, Text, Grid as DreiGrid, SoftShadows, PerspectiveCamera, OrthographicCamera, Sky, Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { RoomGeometry } from './RoomGeometry';
import { SceneObjects } from './SceneObjects';
import { PlacementGhost } from './PlacementGhost';
import { ObjectType } from '../../types';
import { clampToRoomInterior } from '../../utils/placement';


/**
 * First-person walkthrough, built the way a game does it.
 *
 * The old version was drei's CameraControls with minDistance ===
 * maxDistance, i.e. an ORBIT controller pinned at zero radius pretending to
 * be a head. That is why it felt wrong: you had to press and drag to turn,
 * turning swung you around a pivot instead of rotating your head, and there
 * was nothing stopping you walking out through a wall.
 *
 * This is a real FPS rig:
 *   - click to capture the pointer; mouse then turns the head directly,
 *     yaw/pitch accumulated in radians with pitch clamped just short of
 *     straight up/down so the view can never roll over
 *   - WASD relative to where you are looking, Shift to jog
 *   - acceleration and damping, so starting and stopping ease instead of
 *     snapping between full speed and dead stop
 *   - eye height fixed at 1.6m above the finished floor, and the walker is
 *     clamped inside the room so you cannot drift through the cladding
 *   - Esc releases the pointer (the browser does this for us) and the
 *     cursor comes back for the sidebar and the finish swatches
 */
function WalkingControls({ controlsEnabled }: { controlsEnabled: boolean }) {
  const { camera, gl, scene } = useThree();
  const room = useStore(s => s.scene.room);
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3());

  // Eye height above the FINISHED floor. 1.6m puts the camera behind the
  // eyes of a 1.87m person, which is why the first version felt like
  // looking down on the room; 1.5m is eye level for someone around 1.62m
  // and matches how the space actually reads standing in it.
  const eyeY = ((room.baseHeightMm ?? 100) / 1000) + 1.5;

  // Enter the room looking at it, rather than wherever the orbit camera was.
  useEffect(() => {
    const startZ = Math.max(1.2, room.depthMm / 2000 - 1.0);
    position.current.set(0, eyeY, startZ);
    // A camera with rotation.y = 0 looks down -Z, which is the back of the
    // room; PI would spawn you facing out through the front doors.
    yaw.current = 0;
    pitch.current = 0;
    camera.position.copy(position.current);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!controlsEnabled) return;
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      keys.current[e.code] = true;
      // The page must not scroll under the walker.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const onBlur = () => { keys.current = {}; };

    /**
     * One click captures the mouse. Once captured, a click is a CROSSHAIR
     * PICK: whatever is under the centre dot gets selected and the pointer is
     * released, so the finish swatches are immediately clickable without ever
     * pressing Esc. Clicking the scene again re-captures and you walk on.
     */
    const picker = new THREE.Raycaster();
    const onCanvasDown = (e: PointerEvent) => {
      const locked = document.pointerLockElement === canvas;
      // Locked, the crosshair IS the pointer. Unlocked - which is how you are
      // left right after picking something - aim from the real cursor, so
      // moving from one item to the next is ONE click each. The old
      // behaviour spent the first click just re-capturing the mouse, which
      // meant every colour change cost an extra click.
      let ndc = new THREE.Vector2(0, 0);
      if (!locked) {
        const r = canvas.getBoundingClientRect();
        ndc = new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        );
      }
      picker.setFromCamera(ndc, camera);
      const hits = picker.intersectObjects(scene.children, true);
      let handled = false;
      for (const hit of hits) {
        // Ignore the invisible helpers and the placement catcher plane.
        if (!hit.object.visible) continue;

        /**
         * Take the NEAREST marker on this hit and act on it - never search
         * past a surface you actually hit.
         *
         * The old loop only knew about objects and the floor. A wall matched
         * neither, so it fell through to the next intersection along the ray
         * and opened whatever stood behind it: aim at a wall, get the floor;
         * aim at the floor across a cabinet, get the cabinet. Walls now carry
         * isShell (see RoomGeometry), so every surface in the room resolves to
         * exactly one panel - the one you were looking at.
         *
         * Order matters within a single hit: an object sitting against a wall
         * is a child of neither, but the floor mesh is a descendant of the
         * shell group, so isFloor must be checked before isShell or every
         * floor click would open the wall panel.
         */
        let node: THREE.Object3D | null = hit.object;
        let target: 'object' | 'floor' | 'shell' | null = null;
        let objectId: string | null = null;
        while (node) {
          if (node.userData?.objectId) { target = 'object'; objectId = node.userData.objectId as string; break; }
          if (node.userData?.isFloor) { target = 'floor'; break; }
          if (node.userData?.isShell) { target = 'shell'; break; }
          node = node.parent;
        }
        if (!target) continue; // genuinely nothing of ours - keep looking

        const st = useStore.getState();
        if (target === 'object') {
          st.setWalkFloorOpen(false);
          st.setWalkWallOpen(false);
          st.setSelectedObjectId(objectId);
        } else if (target === 'floor') {
          st.setSelectedObjectId(null);
          st.setWalkWallOpen(false);
          st.setWalkFloorOpen(true);
        } else {
          st.setSelectedObjectId(null);
          st.setWalkFloorOpen(false);
          st.setWalkWallOpen(true);
        }
        if (locked) document.exitPointerLock();
        handled = true;
        break;
      }
      // Clicked past everything selectable while the cursor was out - that
      // means carry on walking.
      if (!handled && !locked) canvas.requestPointerLock();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const sens = 0.0022;
      yaw.current -= e.movementX * sens;
      // Stop just short of vertical - at exactly +/-90 degrees the view
      // gimbals and the horizon spins.
      const limit = Math.PI / 2 - 0.05;
      pitch.current = Math.max(-limit, Math.min(limit, pitch.current - e.movementY * sens));
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      const st = useStore.getState();
      st.setWalkPointerLocked(locked);
      if (locked) {
        // Walking again - put the finish panels away rather than leaving them
        // parked over the bottom of the room.
        st.setSelectedObjectId(null);
        st.setWalkFloorOpen(false);
        st.setWalkWallOpen(false);
      } else {
        keys.current = {};
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onCanvasDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      useStore.getState().setWalkPointerLocked(false);
      keys.current = {};
    };
  }, [controlsEnabled, gl]);

  useFrame((_, rawDelta) => {
    if (!controlsEnabled) return;
    // A tab that has been in the background hands back a huge delta, which
    // would teleport the walker across the room on the first frame.
    const delta = Math.min(rawDelta, 0.1);

    const k = keys.current;
    const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    const strafe = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    const sprint = k['ShiftLeft'] || k['ShiftRight'];

    // Walking pace, not a stroll: 1.5 m/s, 3.0 with Shift.
    const target = new THREE.Vector3();
    if (fwd || strafe) {
      const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
      // Forward is -Z rotated by yaw, which is what the camera looks down.
      target.set(-sin * fwd + cos * strafe, 0, -cos * fwd - sin * strafe);
      target.normalize().multiplyScalar(sprint ? 3.0 : 1.5);
    }

    // Ease toward the target speed instead of snapping to it - this is what
    // makes the movement feel like a person rather than a slide projector.
    const accel = 1 - Math.exp(-12 * delta);
    velocity.current.lerp(target, accel);
    if (velocity.current.lengthSq() < 1e-6) velocity.current.set(0, 0, 0);

    position.current.addScaledVector(velocity.current, delta);

    // Stay inside the building. The margin keeps the near clip plane off the
    // wall face, so you never see through the cladding.
    const clamped = clampToRoomInterior(room, position.current.x, position.current.z, 0.35);
    if (clamped.x !== position.current.x || clamped.z !== position.current.z) {
      position.current.x = clamped.x;
      position.current.z = clamped.z;
      velocity.current.multiplyScalar(0.5); // scrub speed on contact
    }
    position.current.y = eyeY;

    camera.position.copy(position.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z = 0;
  });

  return null;
}

function ScreenshotHelper() {
  const { gl, scene, camera, advance } = useThree();

  // Debug handles alongside __modulrStore: let DevTools raycast the live
  // scene, and let a headless check STEP THE FRAME LOOP. The second one
  // matters because a browser tab that is not being displayed throttles
  // requestAnimationFrame to nothing, so useFrame work - the walkthrough
  // camera above, most obviously - never runs and cannot be verified.
  // Harmless in production; nothing in the app reads either.
  useEffect(() => {
    (window as any).__modulrScene = scene;
    (window as any).__modulrCamera = camera;
    (window as any).__modulrAdvance = advance;
  }, [scene, camera, advance]);

  useEffect(() => {
    const handleCapture = () => {
      const bg = scene.getObjectByName('environment-background');
      if (bg) bg.visible = false;
      const oldBg = scene.background;
      scene.background = null;

      gl.render(scene, camera);
      const img = gl.domElement.toDataURL('image/png');

      if (bg) bg.visible = true;
      scene.background = oldBg;

      window.dispatchEvent(new CustomEvent('screenshot-taken', { detail: img }));
    };

    window.addEventListener('take-screenshot', handleCapture);
    return () => window.removeEventListener('take-screenshot', handleCapture);
  }, [gl, scene, camera]);

  return null;
}

export function MainScene() {
  const { viewMode, addObject, setSelectedObjectId, setSelectedElementId, controlsEnabled, renderTransform, isExporting, cameraFov } = useStore(useShallow(s => ({
    viewMode: s.viewMode,
    addObject: s.addObject,
    setSelectedObjectId: s.setSelectedObjectId,
    setSelectedElementId: s.setSelectedElementId,
    controlsEnabled: s.controlsEnabled,
    renderTransform: s.renderTransform,
    isExporting: s.isExporting,
    cameraFov: s.cameraFov
  })));
  const controlsRef = useRef<any>(null);
  const { camera, raycaster, pointer, gl } = useThree();
  const [isOrthographic, setIsOrthographic] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const isPlanView = viewMode === 'plan';

  useEffect(() => {
    if (controlsRef.current) {
      if (isPlanView) {
        controlsRef.current.rotateTo(0, 0, false);
        controlsRef.current.setLookAt(0, 30, 0, 0, 0, 0, true);
        controlsRef.current.minPolarAngle = 0;
        controlsRef.current.maxPolarAngle = 0;
        controlsRef.current.minAzimuthAngle = 0;
        controlsRef.current.maxAzimuthAngle = 0;
        // Every input that could rotate or drag the view is switched off.
        // Left-drag was panning the map whenever it missed an object, and
        // touch/middle drags could still orbit out of plan entirely.
        // Remaining: wheel zoom, and right-drag to pan deliberately.
        const mb = controlsRef.current.mouseButtons;
        mb.left = 0;    // NONE
        mb.middle = 0;  // NONE
        mb.wheel = 8;   // ZOOM
        mb.right = 2;   // TRUCK (deliberate pan)
        const t = controlsRef.current.touches;
        t.one = 0;      // NONE - one finger must never move the camera
        t.two = 64;     // TOUCH_ZOOM_TRUCK
        t.three = 0;    // NONE
      } else {
        controlsRef.current.setLookAt(10, 10, 15, 0, 0, 0, true);
        controlsRef.current.minPolarAngle = 0;
        controlsRef.current.maxPolarAngle = Math.PI / 2 - 0.02;
        controlsRef.current.minAzimuthAngle = -Infinity;
        controlsRef.current.maxAzimuthAngle = Infinity;
        const mb = controlsRef.current.mouseButtons;
        mb.left = 1;    // ORBIT
        mb.middle = 4;  // DOLLY
        mb.right = 2;   // TRUCK
        mb.wheel = 8;   // ZOOM
        const t = controlsRef.current.touches;
        t.one = 32;     // TOUCH_ROTATE
        t.two = 64;     // TOUCH_ZOOM_TRUCK
        t.three = 128;  // TOUCH_TRUCK
      }
    }
  }, [isPlanView]);

  useEffect(() => {
    const handleCameraView = (e: any) => {
      const detail = typeof e.detail === 'string' ? { view: e.detail, snap: false } : e.detail;
      const { view, snap } = detail;
      
      if (view === 'toggle-projection') {
        setIsOrthographic(prev => !prev);
      } else if (view === 'spin') {
        setIsSpinning(prev => !prev);
      } else if (controlsRef.current) {
        let x = 0, y = 1.5, z = 0;
        let tx = 0, ty = 1.5, tz = 0;
        const dist = 15; // Closer so it's not far away
        if (view === 'top') { x = 0; y = 20; z = 0.001; tx = 0; ty = 0; tz = 0; }
        else if (view === 'back') { x = 0; y = 1.5; z = -dist; }
        else if (view === 'front') { x = 0; y = 1.5; z = dist; }
        else if (view === 'left') { x = -dist; y = 1.5; z = 0; }
        else if (view === 'right') { x = dist; y = 1.5; z = 0; }
        else if (view === 'perspective') { x = 7; y = 5; z = 9; }
        
        setIsSpinning(false);
        controlsRef.current.setLookAt(x, y, z, tx, ty, tz, !snap);
      }
    };
    window.addEventListener('camera-set-view', handleCameraView);
    return () => window.removeEventListener('camera-set-view', handleCameraView);
  }, []);

  useEffect(() => {
    const stopSpin = () => setIsSpinning(false);
    window.addEventListener('pointerdown', stopSpin);
    window.addEventListener('wheel', stopSpin);
    return () => {
      window.removeEventListener('pointerdown', stopSpin);
      window.removeEventListener('wheel', stopSpin);
    };
  }, []);

  useEffect(() => {
    const handleReset = () => {
      if (isPlanView && controlsRef.current) {
         controlsRef.current.setLookAt(0, 30, 0, 0, 0, 0, true);
      }
    };
    window.addEventListener('reset-plan-view', handleReset);
    return () => window.removeEventListener('reset-plan-view', handleReset);
  }, [isPlanView]);

  // Legacy sidebar drag-drop lands through a REAL raycast now. The old drop
  // handler mapped screen position with a crude x10 formula that ignored the
  // camera entirely, which is why drops landed outside the room.
  useEffect(() => {
    const onPlaceAt = (e: any) => {
      const { type, ndcX, ndcY } = e.detail;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const pt = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
        const st = useStore.getState();
        st.saveState();
        st.addObject(type, pt.x, pt.z);
      }
    };
    window.addEventListener('place-object-at', onPlaceAt);
    return () => window.removeEventListener('place-object-at', onPlaceAt);
  }, [camera]);

  // Freeze shadow-map updates while an object drag is in flight - shadow
  // re-renders every frame were the main source of drag lag in full scenes.
  useEffect(() => {
    gl.shadowMap.autoUpdate = controlsEnabled;
    if (controlsEnabled) gl.shadowMap.needsUpdate = true;
  }, [controlsEnabled, gl]);

  // Debug handle: exposes the live three.js scene so tooling can inspect
  // real geometry state (e.g. whether the wall mesh ever empties mid-drag).
  // Mirrors the existing __modulrStore handle; nothing reads it in the app.
  const { scene: threeScene } = useThree();
  useEffect(() => { (window as any).__modulrScene = threeScene; }, [threeScene]);

  // Double-clicking an object frames the camera on it.
  useEffect(() => {
    const onFocus = (e: any) => {
      const { x, z } = e.detail;
      controlsRef.current?.setLookAt(x + 3.5, 2.6, z + 3.5, x, 0.8, z, true);
    };
    window.addEventListener('focus-object', onFocus);
    return () => window.removeEventListener('focus-object', onFocus);
  }, []);

  const isNight = false;
  
  
  useFrame((_, delta) => {
    if (isSpinning && controlsRef.current) {
      controlsRef.current.azimuthAngle += delta * 0.3;
    }

    // Hard guarantee for plan view: whatever anything else does - a stray
    // input, a re-render restoring props, a view preset - the camera is
    // snapped back to straight-down every frame. Panning and zoom still work
    // because only the ANGLES are corrected, never the position.
    if (isPlanView && controlsRef.current) {
      const c = controlsRef.current;
      if (Math.abs(c.polarAngle) > 1e-4 || Math.abs(c.azimuthAngle) > 1e-4) {
        c.rotateTo(0, 0, false);
      }
    }
  });

  const handlePointerUp = (e: any) => {
     setSelectedObjectId(null);
     setSelectedElementId(null);
  };

  return (
    <>
      <ScreenshotHelper />
      <PlacementGhost />
      {isPlanView ? (
        <OrthographicCamera makeDefault position={[0, 40, 0]} zoom={60} near={0.1} far={1000} />
      ) : isOrthographic ? (
        <OrthographicCamera makeDefault position={[10, 10, 15]} zoom={80} near={0.1} far={1000} />
      ) : (
        <PerspectiveCamera makeDefault position={[10, 10, 15]} fov={cameraFov} near={0.1} far={1000} />
      )}

      {/* Lighting and Environment */}
      {/* <SoftShadows size={20} samples={16} focus={0.5} /> */}

      {/*
        Elevations must be flat and comparable.
        With the normal sun at [20,40,20] each elevation catches the light
        differently, so front / rear / left / right came out of the PDF in
        visibly different tones even though the cladding is identical. During an
        export the sun is dimmed, shadow casting is switched off and ambient is
        raised, which renders every face at its true material colour.
      */}
      {/*
        The sun is removed entirely during an export, not merely dimmed.
        Turning off shadow CASTING is not enough: a directional light still
        shades each face by its angle to the light, so with the sun at
        [20,40,20] the rear and left elevations face away and render dark while
        the front and right catch it. That is why identical cladding came out of
        the PDF in different tones.
      */}
      {!isExporting && (
        <directionalLight
          castShadow
          position={[20, 40, 20]}
          intensity={isNight ? 0.6 : 2.0}
          color={isNight ? "#a0b0d0" : "#fffcf2"}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-bias={-0.0001} shadow-normalBias={0.02}
        />
      )}

      {/*
        Pure ambient during export. Ambient light is direction-independent, so
        every face receives exactly the same illumination and renders at its
        true material colour - which is what an elevation drawing needs.
      */}
      {isExporting && <ambientLight intensity={3.0} color="#ffffff" />}

      <group name="environment-background" visible={viewMode !== 'render'}>
        {/*
          Generated sky rather than a photographic HDR backdrop. Sky is a
          procedural atmospheric model with a real sun position, so it gives a
          clean gradient and a sun without baking a specific location's
          buildings and trees into the background.

          The HDR is still loaded for lighting only (no `background` prop) -
          removing it entirely would flatten reflections and ambient bounce.
        */}
        {!isExporting && (
          <>
            <Sky
              distance={450000}
              sunPosition={[20, 12, 20]}
              inclination={0.49}
              azimuth={0.25}
              turbidity={4}
              rayleigh={1.2}
              mieCoefficient={0.005}
              mieDirectionalG={0.8}
            />
            {/* limit is the instanced buffer drei allocates and walks every
                frame. The three clouds below use 62 segments between them, so
                200 was reserving and iterating more than three times what is
                drawn. 64 covers them with room to spare. */}
            <Clouds material={THREE.MeshLambertMaterial} limit={64}>
              <Cloud seed={1} segments={26} bounds={[26, 3, 12]} volume={9} color="#ffffff" opacity={0.5} position={[-14, 22, -22]} />
              <Cloud seed={2} segments={20} bounds={[20, 3, 10]} volume={7} color="#f3f6fa" opacity={0.42} position={[20, 26, -30]} />
              <Cloud seed={3} segments={16} bounds={[16, 2, 8]} volume={5} color="#ffffff" opacity={0.32} position={[4, 30, -40]} />
            </Clouds>
          </>
        )}

        <Environment
          files={isNight ? "textures/night.hdr" : "textures/garden_nook.hdr"}
          blur={0.05}
          // Muted during export. An HDR is directional by nature - it is a
          // photograph of a real sky with a bright side - so leaving it at full
          // strength would reintroduce exactly the uneven face-to-face lighting
          // the flat ambient above is there to remove.
          environmentIntensity={isExporting ? 0.08 : (isNight ? 0.3 : 1.0)}
        />

        {/* Ground Plane */}
        <Plane 
          receiveShadow 
          args={[100, 100]} 
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          onClick={handlePointerUp}
        >
          <meshStandardMaterial color="#2e4225" roughness={0.8} metalness={0} />
        </Plane>
        
        <DreiGrid
          position={[0, 0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={1}
          cellColor={isNight ? '#2a3b2e' : '#8a9f8d'}
          sectionSize={5}
          sectionThickness={1.5}
          sectionColor={isNight ? '#1a2b1e' : '#4a6c59'}
          fadeDistance={40}
          fadeStrength={1.5}
        />
      </group>
      


      <group
        position={viewMode === 'render' ? [renderTransform.x, renderTransform.y, renderTransform.z] : [0, 0, 0]}
        rotation={[0, viewMode === 'render' ? renderTransform.rotationY : 0, 0]}
        scale={viewMode === 'render' ? renderTransform.scale : 1}
      >
        {/* The Garden Room */}
        <Suspense fallback={null}>
          <RoomGeometry />
        </Suspense>

        {/* Garden Objects */}
        <SceneObjects />
      </group>

      {viewMode === 'walking' ? (
        <WalkingControls controlsEnabled={controlsEnabled} />
      ) : (
        <CameraControls
          ref={controlsRef}
          enabled={controlsEnabled}
          makeDefault
          minDistance={5}
          maxDistance={60}
          // These MUST be reactive. They were fixed props, and drei re-applies
          // props on every render - so each render silently restored the orbit
          // range and undid the plan-view lock set imperatively in the effect
          // below. That is why plan view kept tilting back to a 3/4 view while
          // arranging furniture.
          minPolarAngle={0}
          maxPolarAngle={isPlanView ? 0 : Math.PI / 2 - 0.02}
          minAzimuthAngle={isPlanView ? 0 : -Infinity}
          maxAzimuthAngle={isPlanView ? 0 : Infinity}
        />
      )}
    </>
  );
}
