import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { CameraControls, Environment, Lightformer, ContactShadows, Plane, Text, Grid as DreiGrid, SoftShadows, PerspectiveCamera, OrthographicCamera, Sky, Cloud, Clouds, Stars, useEnvironment, useTexture } from '@react-three/drei';

// Both sky maps fetched up front. The night one used to load on the first
// flip to night: while it loaded the Environment suspended, the scene lost
// its environment map, every material recompiled without one and then
// again with it - two shader rebuilds and a second of black on the first
// sunset (11 Sep).
useEnvironment.preload({ files: 'textures/garden_nook.hdr' });
useEnvironment.preload({ files: 'textures/night.hdr' });
import { sunState, MOON_DIR } from '../../utils/sun';
import { isLightFitting } from '../../modelRegistry';
import { FenceRuns, FenceTool } from './FenceRuns';
import { Paths, PathTool } from './Paths';
import { Decks, DeckTool } from './Decks';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { RoomGeometry } from './RoomGeometry';
import { SceneObjects } from './SceneObjects';
import { LightingPlan } from './LightingPlan';
import { PlacementGhost } from './PlacementGhost';
import { ObjectType } from '../../types';
import { buildWalkSolids, walkBlocked, walkFloorY, toRoomLocal, toWorld } from '../../utils/walkCollide';
import { enclosedRange } from '../../utils/bay';
import { captureRenderInputs } from '../../utils/renderInputs';


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
 *   - eye height 1.5m above whatever you are standing on - the garden, the
 *     finished floor, the outdoor section's deck - easing up the step at
 *     the threshold rather than snapping
 *   - the walk STARTS OUTSIDE, in front of the building. Every wall is
 *     solid (utils/walkCollide): you cannot drift through the cladding,
 *     and an open door is a gap you walk through - click a door to open it
 *   - Esc releases the pointer (the browser does this for us) and the
 *     cursor comes back for the sidebar and the finish swatches
 */
function WalkingControls({ controlsEnabled }: { controlsEnabled: boolean }) {
  /*
   * The camera is read LIVE, never captured.
   *
   * This component used to take `camera` from useThree() at render and bake
   * it into the click handler's closure. Entering the walkthrough from the
   * 3D view reuses the same perspective camera, so that worked - but from
   * plan view (or with Perspective switched off) the default camera is
   * swapped for a new one AFTER that render, and the effect's deps did not
   * include it. useFrame moved the new camera, so the view looked right,
   * while the crosshair pick raycast from the OLD plan camera: forty metres
   * up, pointing straight down through the roof. The first thing that ray
   * hits is the shell, so every click read "change wall colour" no matter
   * what you were looking at. Which is why this kept coming back - each fix
   * was tried from 3D view and passed, and the room is laid out in plan.
   */
  const { gl, scene, get } = useThree();
  const room = useStore(s => s.scene.room);
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3());

  // Eye height above whatever the walker stands on. 1.6m puts the camera
  // behind the eyes of a 1.87m person, which is why the first version felt
  // like looking down on the room; 1.5m is eye level for someone around
  // 1.62m and matches how the space actually reads standing in it.
  const EYE = 1.5;
  // The walker's radius: keeps the near clip plane off a wall face, so you
  // never see through the cladding, and stops you clipping a door jamb.
  const RADIUS = 0.3;

  // The solid walls, rebuilt only when the building or a door's open state
  // changes - never per frame.
  const openDoorIds = useStore(s => s.openDoorIds);
  const areDoorsOpen = useStore(s => s.areDoorsOpen);
  const solids = useMemo(() => buildWalkSolids(room, openDoorIds, areDoorsOpen), [room, openDoorIds, areDoorsOpen]);
  const solidsRef = useRef(solids);
  solidsRef.current = solids;

  // Start in the garden, a few paces in front of the building and facing
  // it - the front elevation is what a client sees first, and the doors
  // are how they get in. (Putting the orbit camera BACK afterwards is
  // MainScene's job, through the controls - restoring the camera itself
  // here is undone the moment CameraControls remounts, because it reads
  // the walk pose into its own state during render, before any cleanup.)
  /**
   * Put the walker somewhere, facing something. 'outside' is the start:
   * in the garden in front of the building, facing it. 'inside' is the
   * middle of the room facing the front doors - the quick way in for a
   * client who only wants the interior and does not want to open a door
   * every time (T while walking, or the button on the card).
   */
  const teleport = (where: 'inside' | 'outside') => {
    const camera = get().camera;
    const rm = useStore.getState().scene.room;
    let local: { x: number; z: number }, face: number;
    if (where === 'inside') {
      const enc = enclosedRange(rm);
      local = { x: (enc.x0 + enc.x1) / 2, z: 0 };
      face = Math.PI; // rotation.y = PI looks down +z: out through the front
    } else {
      const deck = (rm.hasDecking || rm.hasPictureFrame) ? (rm.deckingSizeMm ?? 1500) / 1000 : 0;
      local = { x: 0, z: rm.depthMm / 2000 + deck + 5 };
      face = 0; // rotation.y = 0 looks down -z: at the building
    }
    const p = toWorld(rm, local.x, local.z);
    position.current.set(p.x, walkFloorY(rm, local.x, local.z) + EYE, p.z);
    velocity.current.set(0, 0, 0);
    // The room's own turn is added so the facing holds on a rotated plot.
    yaw.current = face + (rm.rot ?? 0);
    pitch.current = 0;
    camera.position.copy(position.current);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
  };
  const isInside = () => { const l = toRoomLocal(useStore.getState().scene.room, position.current.x, position.current.z); const rm = useStore.getState().scene.room; return Math.abs(l.x) < rm.widthMm / 2000 && Math.abs(l.z) < rm.depthMm / 2000; };

  // Start in the garden, a few paces in front of the building and facing
  // it - the front elevation is what a client sees first, and the doors
  // are how they get in. (Putting the orbit camera BACK afterwards is
  // MainScene's job, through the controls - restoring the camera itself
  // here is undone the moment CameraControls remounts, because it reads
  // the walk pose into its own state during render, before any cleanup.)
  /**
   * A saved camera (UI/CameraPanel.tsx) arrives as a pose: where to stand
   * and what to look at, world metres. Yaw and pitch are derived from the
   * look direction the way the walker holds them (rotation order YXZ,
   * rotation.y = yaw looks along (-sin yaw, 0, -cos yaw)).
   */
  const applyPose = (pose: { position: number[]; target: number[] }) => {
    const camera = get().camera;
    const [px, py, pz] = pose.position, [tx, ty, tz] = pose.target;
    const d = new THREE.Vector3(tx - px, ty - py, tz - pz);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    position.current.set(px, py, pz);
    velocity.current.set(0, 0, 0);
    yaw.current = Math.atan2(-d.x, -d.z);
    pitch.current = Math.asin(Math.max(-1, Math.min(1, d.y)));
    camera.position.copy(position.current);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
  };

  useEffect(() => {
    teleport(useStore.getState().walkStart);
    const onTeleport = (e: any) => {
      if (e.detail?.pose?.position && e.detail?.pose?.target) { applyPose(e.detail.pose); return; }
      teleport(e.detail?.where === 'inside' || (e.detail?.where === 'toggle' && !isInside()) ? 'inside' : 'outside');
    };
    window.addEventListener('walk-teleport', onTeleport);
    return () => window.removeEventListener('walk-teleport', onTeleport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!controlsEnabled) return;
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      keys.current[e.code] = true;
      // T: straight inside, or back out to the garden.
      if (e.code === 'KeyT' && !e.repeat) window.dispatchEvent(new CustomEvent('walk-teleport', { detail: { where: 'toggle' } }));
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

    /**
     * What is under the crosshair right now, or null.
     *
     * Shared by the click handler and the hover probe so there is exactly one
     * definition of "what am I pointing at" - the HUD can never promise a
     * paint target the click would resolve differently.
     */
    const resolveTarget = (ndc: THREE.Vector2): { kind: 'object' | 'floor' | 'wall' | 'opening' | 'partition'; id?: string } | null => {
      // Live camera - see the note at the top of the component.
      picker.setFromCamera(ndc, get().camera);
      for (const hit of picker.intersectObjects(scene.children, true)) {
        if (!hit.object.visible) continue;

        /**
         * The FIRST thing you can see decides it, full stop.
         *
         * This used to skip a hit it did not recognise and carry on down the
         * ray, so any unmarked surface became a window onto whatever stood
         * behind it - the worktop has no marker of its own, so aiming at a run
         * of units resolved to the wall beyond and the badge read "change wall
         * colour" while pointing at a cabinet. Returning null instead means
         * the worst case is no badge and a click that does nothing, never a
         * click that quietly edits something else.
         */
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (node.userData?.objectId) return { kind: 'object', id: node.userData.objectId as string };
          // A window or door - frame, sash or glass - before the wall it sits
          // in, because the opening group is nested inside the shell group.
          if (node.userData?.openingId) return { kind: 'opening', id: node.userData.openingId as string };
          // An internal wall, door set included - its doors are edited from
          // the wall, not the room's own frame panel.
          if (node.userData?.partitionId) return { kind: 'partition', id: node.userData.partitionId as string };
          if (node.userData?.isFloor) return { kind: 'floor' };
          if (node.userData?.isShell) return { kind: 'wall' };
          node = node.parent;
        }
        return null;
      }
      return null;
    };
    // Debug handle in the __modulr* family: the exact resolver the click
    // uses, callable from DevTools or a headless check without pointer lock.
    (window as any).__modulrWalkResolve = resolveTarget;

    const onCanvasDown = (e: PointerEvent) => {
      const locked = document.pointerLockElement === canvas;
      // Locked, the crosshair IS the pointer. Unlocked - which is how you are
      // left right after picking something - aim from the real cursor, so
      // moving from one item to the next is ONE click each. The old
      // behaviour spent the first click just re-capturing the mouse, which
      // meant every colour change cost an extra click.
      let ndc = new THREE.Vector2(0, 0);
      // Where on screen the pick happened, 0..1. The brush is drawn HERE
      // rather than at the middle of the screen: unlocked, the pick comes
      // from the cursor, so a brush pinned to the centre could sit over a
      // sofa while its label described the wall the cursor was actually on.
      let sx = 0.5, sy = 0.5;
      if (!locked) {
        const r = canvas.getBoundingClientRect();
        sx = (e.clientX - r.left) / r.width;
        sy = (e.clientY - r.top) / r.height;
        ndc = new THREE.Vector2(sx * 2 - 1, -(sy * 2) + 1);
      }
      /**
       * A click while WALKING arms the brush; it does not open anything.
       *
       * Clicking a surface marks it and hands the mouse back, so a paint brush
       * appears over what you picked. Clicking that brush opens its finishes,
       * and choosing one returns you to walking. Two deliberate steps beat a
       * panel that springs open every time the crosshair crosses a cabinet.
       *
       * A click while the cursor is OUT only arms if the brush is already up.
       * Otherwise it just starts you walking - the very first click on
       * entering the walkthrough lands on a wall like any other, and arming
       * off that meant you could not simply set off: you had to dismiss a
       * brush you never asked for before you could move.
       */
      /*
       * Unlocked, a click picks WHERE YOU CLICKED. Always.
       *
       * It used to only pick if the brush was already up, so the first click
       * after the cursor came back just re-captured the mouse - and the click
       * AFTER that picked the crosshair at the middle of the screen rather
       * than the thing you had aimed at. Click a cabinet low in the frame and
       * you got the wall behind the crosshair, every time, which is why this
       * kept coming back as "it only lets me change the wall colour".
       *
       * Starting to walk is no longer overloaded onto the same click: the
       * "Click to look around" card in the HUD is a real button now, so the
       * two intentions are separate and neither can shadow the other.
       */
      /*
       * Picking happens ONLY while the mouse is captured.
       *
       * This has bounced back and forth because one click was carrying two
       * meanings - start walking, and pick this - so whichever won, the other
       * looked broken. Locked or unlocked, first click or fifth, there was
       * always a case where the wrong one fired.
       *
       * One rule now, with no exceptions: cursor out means the click resumes
       * walking, cursor captured means the click picks whatever the crosshair
       * is on. The pick point and the crosshair are then the same point by
       * definition, so the brush can never appear over one thing while naming
       * another - and entering the walkthrough can never arm a brush you did
       * not ask for.
       */
      const st = useStore.getState();
      const target = locked ? resolveTarget(ndc) : null;
      if (target) {
        st.setSelectedObjectId(null);
        st.setWalkFloorOpen(false);
        st.setWalkWallOpen(false);
        st.setWalkFrameOpen(false);
        st.setWalkDoorOpen(false);
        st.setWalkPending({ ...target, sx, sy });
        if (locked) document.exitPointerLock();
      } else if (!locked) {
        // Nothing to arm, or armed and clicked past everything - walk on.
        st.setWalkPending(null);
        canvas.requestPointerLock();
      }
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
        st.setWalkFrameOpen(false);
        st.setWalkPending(null);
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
    // The Walk button captures the mouse as part of its own click, which
    // happens BEFORE this component mounts - so the change event has already
    // been and gone. Without this the HUD would sit there telling you to
    // click to walk while you were already walking.
    onLockChange();
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

  useFrame((state, rawDelta) => {
    if (!controlsEnabled) return;
    const camera = state.camera;
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

    // Walls are solid; open doors are gaps. Resolved one axis at a time in
    // room-local space so a wall you walk into at an angle slides you along
    // it rather than stopping you dead. A walker already inside a wall
    // (the building was resized under them) is let out rather than pinned.
    const step = velocity.current.clone().multiplyScalar(delta);
    const here = toRoomLocal(room, position.current.x, position.current.z);
    const there = toRoomLocal(room, position.current.x + step.x, position.current.z + step.z);
    const rects = solidsRef.current;
    const free = !walkBlocked(rects, here.x, here.z, RADIUS);
    let lx = here.x, lz = here.z, hit = false;
    if (!free || !walkBlocked(rects, there.x, lz, RADIUS)) lx = there.x; else hit = true;
    if (!free || !walkBlocked(rects, lx, there.z, RADIUS)) lz = there.z; else hit = true;
    // And not off into the next county.
    const w = room.widthMm / 1000, d = room.depthMm / 1000;
    lx = Math.max(-w / 2 - 20, Math.min(w / 2 + 20, lx));
    lz = Math.max(-d / 2 - 20, Math.min(d / 2 + 20, lz));
    const next = toWorld(room, lx, lz);
    position.current.x = next.x;
    position.current.z = next.z;
    if (hit) velocity.current.multiplyScalar(0.5); // scrub speed on contact

    // Eye height follows the ground: up the step onto the plinth at the
    // threshold, down onto the garden again. Eased, not snapped.
    const targetY = walkFloorY(room, lx, lz) + EYE;
    position.current.y += (targetY - position.current.y) * (1 - Math.exp(-10 * delta));

    camera.position.copy(position.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z = 0;

    /*
     * Inside or outside, for the camera panel's "which render engine"
     * decision (22 Sep 2026). Computed in the room's own frame so a rotated
     * plot works, and written to the store only on a change - the setter
     * compares first, so a walk across the room is one write, not 60/second.
     */
    const rmNow = useStore.getState().scene.room;
    const l = toRoomLocal(rmNow, position.current.x, position.current.z);
    const wt = (rmNow.wallThicknessMm ?? 150) / 1000;
    const enc = enclosedRange(rmNow);
    const halfD = rmNow.depthMm / 2000 - wt;
    useStore.getState().setWalkInside(l.x > enc.x0 && l.x < enc.x1 && l.z > -halfD && l.z < halfD);
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
    // The render engine's inputs: the shaded view at 2K and the exact edge
    // drawing of the same frame. The Sidebar's "Send to Render Engine"
    // calls this; see utils/renderInputs.ts for why both are needed.
    (window as any).__modulrCaptureRenderInputs = () => captureRenderInputs(gl, scene, camera);
  }, [gl, scene, camera, advance]);

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
  const { viewMode, addObject, setSelectedObjectId, setSelectedElementId, controlsEnabled, renderTransform, isExporting, cameraFov, walkFov } = useStore(useShallow(s => ({
    viewMode: s.viewMode,
    addObject: s.addObject,
    setSelectedObjectId: s.setSelectedObjectId,
    setSelectedElementId: s.setSelectedElementId,
    controlsEnabled: s.controlsEnabled,
    renderTransform: s.renderTransform,
    isExporting: s.isExporting,
    cameraFov: s.cameraFov,
    walkFov: s.walkFov
  })));
  const controlsRef = useRef<any>(null);
  // Debug handle: the orbit rig, so a test can pose the camera through the
  // controls rather than fighting them frame by frame. Nothing reads it.
  useEffect(() => { (window as any).__modulrControls = controlsRef; }, []);
  const { camera, raycaster, pointer, gl } = useThree();
  const [isOrthographic, setIsOrthographic] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  // The lighting view is a reflected ceiling plan, so it shares the plan's
  // locked top-down camera and its stripped-away roof and ceiling.
  const isPlanView = viewMode === 'plan' || viewMode === 'lighting';

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

  /**
   * Where the 3D view was before a walk, so it can come back there.
   *
   * The walkthrough swaps CameraControls out and borrows its camera. On the
   * way back, CameraControls remounts and reads whatever pose the camera has
   * - the walker's, 1.5m off the floor, pitched at the last thing looked at -
   * so 3D View reopened standing on the floor. The effect above never
   * corrected it because isPlanView does not change on that transition, and
   * Plan or Lighting to 3D only looked right because that swap builds a
   * fresh camera. The orbit pose is snapshotted every frame while in 3D view
   * (two vector copies) and handed to the fresh controls on return; with no
   * snapshot - a walk entered from plan - the default 3D pose is used.
   */
  const savedOrbit = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null);
  const prevViewMode = useRef(viewMode);
  useEffect(() => {
    const prev = prevViewMode.current;
    prevViewMode.current = viewMode;
    // Plan and Lighting reset 3D View to its default pose on the way back
    // (the effect above), so a walk started from there should land on that
    // same default, not on some earlier 3D pose.
    if (viewMode === 'plan' || viewMode === 'lighting') savedOrbit.current = null;
    if (prev !== 'walking' || viewMode !== '3d' || !controlsRef.current) return;
    const s = savedOrbit.current;
    if (s) controlsRef.current.setLookAt(s.p.x, s.p.y, s.p.z, s.t.x, s.t.y, s.t.z, false);
    else controlsRef.current.setLookAt(10, 10, 15, 0, 0, 0, false);
  }, [viewMode]);

  useEffect(() => {
    const handleCameraView = (e: any) => {
      const detail = typeof e.detail === 'string' ? { view: e.detail, snap: false } : e.detail;
      const { view, snap } = detail;

      // A saved orbit camera (UI/CameraPanel.tsx): position and target in
      // world metres, straight into the controls.
      if (detail.pose?.position && detail.pose?.target && controlsRef.current) {
        const [px, py, pz] = detail.pose.position, [tx, ty, tz] = detail.pose.target;
        setIsSpinning(false);
        controlsRef.current.setLookAt(px, py, pz, tx, ty, tz, !snap);
        return;
      }

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

  // Was hardcoded false: the whole night look - sun, HDR, environment
  // intensity, grid colours - was already wired to this and simply never
  // switched on. It is what makes a lighting layout visible.
  const isNight = useStore(s => s.nightPreview);
  // The sun, from the slider: position, colour, strength and the sky's
  // tuning all come from the one time of day (utils/sun). Night is when
  // the sun is down; the moon takes over as the key light.
  const timeOfDay = useStore(s => s.timeOfDay);
  const sun = useMemo(() => sunState(timeOfDay), [timeOfDay]);
  const hasFittings = useStore(s => s.scene.objects.some(o => isLightFitting(o.type)));
  const grassTex: any = useTexture({ map: './textures/grass_color.jpg', normalMap: './textures/grass_normal.jpg', roughnessMap: './textures/grass_roughness.jpg' });
  const grass = useMemo(() => {
    const out: any = {};
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      const t = grassTex[k].clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(100 / 1.4, 100 / 1.4);
      t.anisotropy = 8;
      t.colorSpace = k === 'map' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      t.needsUpdate = true;
      out[k] = t;
    }
    return out;
  }, [grassTex.map, grassTex.normalMap, grassTex.roughnessMap]);
  const keyDir = sun.night ? MOON_DIR : sun.dir;
  // Exposure follows the daylight, so an evening is dimmer as a whole and
  // not just lit from a lower angle. Not while exporting - the elevation
  // drawings need their fixed, even light.
  const { gl: sceneGl } = useThree();
  useEffect(() => {
    if (isExporting) { sceneGl.toneMappingExposure = 1.2; return; }
    sceneGl.toneMappingExposure = 0.55 + 0.65 * sun.daylight;
  }, [sceneGl, sun.daylight, isExporting]);
  const keyPos: [number, number, number] = [keyDir[0] * 45, Math.max(6, keyDir[1] * 45), keyDir[2] * 45];
  // Cloud colour follows the light: white by day, lit peach and orange as
  // the sun drops (the clouds are where a sunset actually shows), a dim
  // grey-blue at night.
  const cloudMix = (day: string, night: string) => {
    const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
    const lit = lerp3(p(day), p('#ff9c5a'), Math.pow(sun.warmth, 1.3) * 0.85);
    const c = lerp3(p(night), lit, sun.daylight);
    return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  };


  useFrame((_, delta) => {
    if (isSpinning && controlsRef.current) {
      controlsRef.current.azimuthAngle += delta * 0.3;
    }

    // Snapshot the orbit pose while in 3D view - see savedOrbit above.
    if (viewMode === '3d' && controlsRef.current) {
      const s = savedOrbit.current ?? (savedOrbit.current = { p: new THREE.Vector3(), t: new THREE.Vector3() });
      controlsRef.current.getPosition(s.p);
      controlsRef.current.getTarget(s.t);
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
     useStore.getState().setSelectedFenceId(null);
     useStore.getState().setSelectedPathId(null);
     useStore.getState().setSelectedDeckId(null);
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
        <PerspectiveCamera makeDefault position={[10, 10, 15]} fov={viewMode === 'walking' ? walkFov : cameraFov} near={0.1} far={1000} />
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
          position={keyPos}
          intensity={sun.night ? 0.6 : Math.max(0.05, sun.intensity)}
          color={sun.night ? "#a0b0d0" : sun.colour}
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

      {/*
        Interior bounce light, walkthrough only.
        three.js has no global illumination. A ceiling faces DOWN, so it
        catches nothing at all from a sun overhead and rendered markedly darker
        than the walls it meets - the same paint reading as two colours, which
        is exactly the complaint the export ambient above was added to solve
        for elevations. In a real room a ceiling is lit almost entirely by
        light bouncing up off the floor, and a hemisphere light IS that bounce:
        down-facing surfaces receive its GROUND colour, so the ground is the
        brighter of the two here. Not applied outside, where a sky-lit roof and
        a shaded soffit is correct.
      */}
      {viewMode === 'walking' && !isExporting && (
        /*
          After dark the same light IS the room's bounce: what the fittings
          throw at the floor and walls comes back up warm and even. That is
          how a visualiser lights a night interior - keys on the fittings,
          a soft warm fill for the bounce a renderer would compute - and it
          is what a point light on the ceiling could never be: it has no
          position, so it makes no blob. Warm, floor brighter than ceiling,
          and only when there are fittings to bounce.
        */
        <hemisphereLight
          color={sun.night ? '#ffe9d2' : '#e8eef5'}
          groundColor={sun.night ? '#ffdcb8' : '#ffffff'}
          intensity={sun.night ? (hasFittings ? 1.1 : 0.15) : 0.2 + 1.9 * sun.daylight}
        />
      )}

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
              sunPosition={[sun.dir[0] * 100, sun.dir[1] * 100, sun.dir[2] * 100]}
              turbidity={sun.turbidity}
              rayleigh={sun.rayleigh}
              mieCoefficient={sun.mie}
              mieDirectionalG={0.8}
            />
            {/* After sunset: stars, and a moon where the night's key light
                comes from. The atmosphere shader goes dark on its own once
                the sun is below the horizon. */}
            {sun.elevation < 0 && (
              <>
                <Stars radius={220} depth={60} count={2600} factor={4.5} saturation={0} fade speed={0.4} />
                <mesh position={[MOON_DIR[0] * 380, MOON_DIR[1] * 380, MOON_DIR[2] * 380]}>
                  <sphereGeometry args={[7, 24, 24]} />
                  <meshBasicMaterial color="#eef1f8" toneMapped={false} />
                </mesh>
              </>
            )}
            {/* limit is the instanced buffer drei allocates and walks every
                frame. The three clouds below use 62 segments between them, so
                200 was reserving and iterating more than three times what is
                drawn. 64 covers them with room to spare. */}
            <Clouds material={THREE.MeshLambertMaterial} limit={64}>
              <Cloud seed={1} segments={26} bounds={[26, 3, 12]} volume={9} color={cloudMix('#ffffff', '#2a3040')} opacity={0.5} position={[-14, 22, -22]} />
              <Cloud seed={2} segments={20} bounds={[20, 3, 10]} volume={7} color={cloudMix('#f3f6fa', '#262c3a')} opacity={0.42} position={[20, 26, -30]} />
              <Cloud seed={3} segments={16} bounds={[16, 2, 8]} volume={5} color={cloudMix('#ffffff', '#2a3040')} opacity={0.32} position={[4, 30, -40]} />
            </Clouds>
          </>
        )}

        {viewMode === 'walking' && !isExporting ? (
          /*
            Walkthrough reflections: the garden HDR, plus light where a room
            would have it.
            three.js does not occlude the environment map with the room's
            walls, so indoors a metal surface still mirrors the garden. That
            is what makes the metals look real - the HDR has structure and
            range - and it stays. The one problem it caused: a FLAT brass
            post facing the HDR's dark hedges reflected dark green-grey and
            read as gunmetal, while the round towel rail beside it (which
            samples the whole hemisphere) stayed brass - one shower, "a mix of
            brass and stainless". So the HDR is re-rendered into a cubemap
            with four window-sized panels hung at eye level around it, one
            per side: the horizontal directions a post can face all carry
            some light now, and the sky, ground and trees between the panels
            keep the reflections looking like a real place. A plain lit room
            was tried first and every metal went flat and matte - an
            environment with no structure gives a reflection with none.
          */
          <Environment
            files={isNight ? "textures/night.hdr" : "textures/garden_nook.hdr"}
            resolution={256}
            frames={1}
            environmentIntensity={isNight ? 0.3 : 0.3 + 0.7 * sun.daylight}
          >
            {/* Eight panels, 45 degrees apart, each spanning about 25 degrees
                of azimuth - so every horizontal direction is within a few
                degrees of a light, with the garden showing in the gaps. Four
                panels left every other post reflecting a gap. */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <Lightformer
                key={i}
                form="rect"
                intensity={isNight ? 0.35 : 0.35 + 1.05 * sun.daylight}
                color="#fff4e4"
                position={[Math.sin(i * Math.PI / 4) * 7, 1.6, Math.cos(i * Math.PI / 4) * 7]}
                rotation-y={i * Math.PI / 4 + Math.PI}
                scale={[3.0, 2.4, 1]}
              />
            ))}
          </Environment>
        ) : (
          <Environment
            files={isNight ? "textures/night.hdr" : "textures/garden_nook.hdr"}
            blur={0.05}
            // Muted during export. An HDR is directional by nature - it is a
            // photograph of a real sky with a bright side - so leaving it at full
            // strength would reintroduce exactly the uneven face-to-face lighting
            // the flat ambient above is there to remove.
            environmentIntensity={isExporting ? 0.08 : (isNight ? 0.3 : 0.3 + 0.7 * sun.daylight)}
          />
        )}

        {/* Ground Plane - real grass (ambientCG Grass002, 1.4m tile) rather
            than a flat green. One 1K set over a 100m plane; the frame cost
            is a texture fetch per pixel, not geometry. */}
        <Plane
          receiveShadow
          args={[100, 100]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          onClick={handlePointerUp}
        >
          <meshStandardMaterial {...grass} roughness={1} metalness={0} />
        </Plane>
        
        <DreiGrid
          name="floor-grid"
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
        <FenceRuns />
        <FenceTool />
        <Paths />
        <PathTool />
        <Decks />
        <DeckTool />
        <LightingPlan />
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
