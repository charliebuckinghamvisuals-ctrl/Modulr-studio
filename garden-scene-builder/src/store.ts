import { create } from 'zustand';
import { SceneState, SceneObject, BoundaryStyle, PathRun, PathSurface, DeckArea, ViewMode, ObjectType, ToolMode, CladdingType, ShapeType, WindowData, SkylightData, PartitionData, PartitionDoor, Door, InteriorDoorData, SavedCamera } from './types';
import { v4 as uuidv4 } from 'uuid';
import { isInteriorType, clampToRoomInterior, snapTap } from './utils/placement';
import { bayRange, wallSpanMm } from './utils/bay';
import { sunState, DAY_START, DAY_END } from './utils/sun';
import { UNIT_FAMILY, isVeneerFinish } from './modelRegistry';

// Debug/E2E hook: lets automated tests drive the store directly (drag
// simulation, perf probes). Harmless in production - nothing reads it.
declare global { interface Window { __modulrStore?: unknown } }

interface AppState {
  scene: SceneState;
  viewMode: ViewMode;
  /** True while the walker stands inside the enclosed room. Written only
   *  when it CHANGES (MainScene's walk loop), so it costs nothing per frame.
   *  The camera panel uses it to send a capture to the right render engine. */
  walkInside: boolean;
  setWalkInside: (v: boolean) => void;
  toolMode: ToolMode;
  selectedObjectId: string | null;
  selectedElementId: string | null;
  hoveredElementId: string | null;
  hoverTimeoutId: ReturnType<typeof setTimeout> | null;
  activePlacementType: ObjectType | null;
  controlsEnabled: boolean;
  isExporting: boolean;
  capturedImage: string | null;
  uploadedBgImage: string | null;
  harmonizedImage: string | null;
  renderTransform: { x: number; y: number; z: number; scale: number; rotationY: number };

  pastScenes: SceneState[];
  futureScenes: SceneState[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setToolMode: (mode: ToolMode) => void;
  /** Garden boundary fence runs (components/3d/FenceRuns): a straight run
   *  from (ax,az) to (bx,bz) in world metres, drawn corner to corner. */
  addFence: (ax: number, az: number, bx: number, bz: number) => void;
  removeFence: (id: string) => void;
  clearFences: () => void;
  /** Restyle one run (kind, height, colour), or every run when id is null -
   *  which also becomes the style new runs are drawn with. */
  updateFenceStyle: (id: string | null, style: Partial<BoundaryStyle>) => void;
  /** Put a run's two ends somewhere new (a drag, a rotate, a nudge). Any
   *  other run whose end sits on one of this run's ends comes with it, so
   *  dragging one side of a closed boundary stretches its neighbours instead
   *  of tearing the loop open; `solo` moves just this run. */
  moveFenceRun: (id: string, ax: number, az: number, bx: number, bz: number, solo?: boolean) => void;
  /** The run picked on the plan or in 3D, for the boundary style panel. */
  selectedFenceId: string | null;
  setSelectedFenceId: (id: string | null) => void;
  /** Garden paths (components/3d/Paths): a finished polyline becomes a path
   *  at the current pathStyle; updatePath restyles one, or all with null. */
  addPath: (points: [number, number][]) => void;
  updatePath: (id: string | null, patch: Partial<{ widthMm: number; surface: PathSurface }>) => void;
  removePath: (id: string) => void;
  clearPaths: () => void;
  /** Freeform decking (components/3d/Decks): a closed polygon becomes a deck
   *  at the current deckStyle. updateDeck restyles one, or all with null;
   *  moveDeckPoint drags one corner; moveDeck slides the whole deck. */
  addDeck: (points: [number, number][]) => void;
  updateDeck: (id: string | null, patch: Partial<{ heightMm: number; material: string }>) => void;
  moveDeckPoint: (id: string, index: number, x: number, z: number) => void;
  moveDeck: (id: string, dx: number, dz: number, from?: [number, number][]) => void;
  removeDeck: (id: string) => void;
  clearDecks: () => void;
  selectedDeckId: string | null;
  setSelectedDeckId: (id: string | null) => void;
  selectedPathId: string | null;
  setSelectedPathId: (id: string | null) => void;
  setActivePlacementType: (type: ObjectType | null) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedElementId: (id: string | null) => void;
  setHoveredElementId: (id: string | null) => void;
  setControlsEnabled: (enabled: boolean) => void;
  /** True while the walkthrough has captured the mouse pointer. Drives the
   *  on-screen prompt: locked = crosshair + key hints, unlocked = "click to
   *  look around". */
  /**
   * Which configurator this is.
   *
   * 'public' is the free one anyone can open: the building's exterior -
   * size, roof, cladding, doors and windows, extras - in 3D and plan, with
   * the PDF. No interior step, no objects or kitchen, no walkthrough or
   * lighting plan, and no Send to Render Engine. 'business' is everything.
   * Set from ?mode= on the URL and by the host app after load; defaults to
   * public so a direct visit to the page never hands out the paid version.
   */
  configMode: 'public' | 'business';
  setConfigMode: (mode: 'public' | 'business') => void;
  walkPointerLocked: boolean;
  /** Where the next walkthrough starts - chosen with the Walk Inside /
   *  Walk Outside buttons, read by the walk rig when it mounts. */
  walkStart: 'inside' | 'outside';
  setWalkStart: (where: 'inside' | 'outside') => void;
  setWalkPointerLocked: (locked: boolean) => void;
  /** Saved cameras (21 Sep 2026): the list lives on the scene so it saves
   *  with the design; the selection is UI state. See types.ts SavedCamera. */
  activeCameraId: string | null;
  setActiveCameraId: (id: string | null) => void;
  /** Camera mode: the whole screen is the view - toolbars and sidebar hide,
   *  only the camera panel stays (Charlie, 21 Sep 2026). */
  cameraMode: boolean;
  setCameraMode: (on: boolean) => void;
  addCamera: (camera: SavedCamera) => void;
  updateCamera: (id: string, updates: Partial<SavedCamera>) => void;
  removeCamera: (id: string) => void;
  /** True when the walkthrough floor-finish panel is open. */
  walkFloorOpen: boolean;
  setWalkFloorOpen: (open: boolean) => void;
  /** True when the walkthrough WALL-colour panel is open. Clicking a wall in
   *  the walkthrough used to open the floor panel, because walls were not
   *  pickable at all - see the crosshair handler in MainScene. */
  walkWallOpen: boolean;
  setWalkWallOpen: (open: boolean) => void;
  /** Frame panel, opened by clicking a window or door in the walkthrough.
   *  walkFrameId is the opening that was clicked, so the panel can offer
   *  that one's glazing style alongside the room-wide colours. */
  walkFrameOpen: boolean;
  setWalkFrameOpen: (open: boolean) => void;
  walkFrameId: string | null;
  setWalkFrameId: (id: string | null) => void;
  /**
   * What was CLICKED in the walkthrough and is waiting for a second click on
   * the brush to open its finishes.
   *
   * Deliberately click-then-confirm rather than hover. A brush that followed
   * the crosshair was on screen almost permanently - there is very little in a
   * room that is not repaintable - so it read as a stuck cursor rather than a
   * cue. Now the default is a bare dot and free movement, and the brush only
   * appears once you have actually picked something out.
   */
  walkPending: { kind: 'object' | 'floor' | 'wall' | 'opening' | 'partition'; id?: string; sx?: number; sy?: number } | null;
  setWalkPending: (t: { kind: 'object' | 'floor' | 'wall' | 'opening' | 'partition'; id?: string; sx?: number; sy?: number } | null) => void;
  /** Internal-door panel, opened by clicking an internal wall in the
   *  walkthrough; walkDoorPartId is that wall. */
  walkDoorOpen: boolean;
  setWalkDoorOpen: (open: boolean) => void;
  walkDoorPartId: string | null;
  setWalkDoorPartId: (id: string | null) => void;
  /** Internal doors swung open one at a time from the walkthrough panel -
   *  a look, not part of the design, so not saved with it. The Open Doors
   *  button still swings every door at once. */
  openDoorIds: string[];
  toggleDoorOpen: (id: string) => void;
  setIsExporting: (exporting: boolean) => void;
  setCapturedImage: (image: string | null) => void;
  setUploadedBgImage: (image: string | null) => void;
  setHarmonizedImage: (image: string | null) => void;
  setRenderTransform: (updates: Partial<{ x: number; y: number; z: number; scale: number; rotationY: number }>) => void;
  
  // History Actions
  saveState: () => void;
  newDesign: () => void;
  undo: () => void;
  redo: () => void;
  
  // Scene Actions
  /** Load a saved design. Accepts the full scene the host saves now
   *  ({ room, objects, fences }) or the bare room older saves hold; either
   *  way the room is merged over defaults so fields added since still load. */
  loadRoom: (design: Partial<SceneState['room']> | { room: Partial<SceneState['room']>; objects?: SceneObject[]; fences?: SceneState['fences']; paths?: PathRun[]; decks?: DeckArea[] }) => void;
  /** Apply a starting template: merges its room over the current one and
   *  replaces the placed objects. Undoable like any other edit. */
  applyPreset: (room: Partial<SceneState['room']>, objects: Array<Omit<SceneState['objects'][0], 'id'>>) => void;
  updateRoom: (updates: Partial<SceneState['room']>) => void;
  updatePricing: (updates: Partial<SceneState['pricing']>) => void;
  addDoor: () => void;
  /** Click-to-add: create a door on a specific wall at a specific offset
   *  (clamped so it fits), and select it. */
  addDoorAt: (wall: Door['wall'], offsetMm: number) => void;
  updateDoor: (id: string, updates: Partial<Door>) => void;
  removeDoor: (id: string) => void;
  addWindow: () => void;
  /** Click-to-add equivalent for windows. */
  addWindowAt: (wall: WindowData['wall'], offsetMm: number) => void;
  updateWindow: (id: string, updates: Partial<WindowData>) => void;
  removeWindow: (id: string) => void;
  
  addSkylight: () => void;
  updateSkylight: (id: string, updates: Partial<SkylightData>) => void;
  removeSkylight: (id: string) => void;
  
  
  addPartition: () => void;
  updatePartition: (id: string, updates: Partial<PartitionData>) => void;
  removePartition: (id: string) => void;
  addPartitionDoor: (partitionId: string) => void;
  updatePartitionDoor: (partitionId: string, doorId: string, updates: Partial<PartitionDoor>) => void;
  removePartitionDoor: (partitionId: string, doorId: string) => void;
  /** Give every internal door in the room the same handle and finish. */
  matchInteriorDoorHandles: (handle: PartitionDoor['handle'], ironmongery: string | undefined) => void;
  
    addInteriorDoor: () => void;
  updateInteriorDoor: (id: string, updates: Partial<InteriorDoorData>) => void;
  removeInteriorDoor: (id: string) => void;
  addLShapeWall: () => void;
  
  // Environment
  toggleTime: () => void;
  areDoorsOpen: boolean;
  toggleDoors: () => void;
  /** Perspective camera field of view (degrees) - lets the user frame the
   *  shot they send to the render engine with a wide or tight lens. */
  cameraFov: number;
  setCameraFov: (fov: number) => void;
  /** The walkthrough keeps its OWN lens. Standing inside a room wants a wider
   *  angle than framing the building from outside does - at the 50° used for
   *  elevations you see so little of a small room that it feels like looking
   *  down a tube. Each view now remembers the lens that suits it. */
  walkFov: number;
  setWalkFov: (fov: number) => void;
  
  // Object Actions
  /** settled: the caller has already placed the object by its FACES against
   *  the walls (see settleAgainstWalls), so the centre clamp - which keeps
   *  a centre 50mm off a wall - must not pull a wall-hung tap back off it. */
  addObject: (type: ObjectType, x: number, z: number, rot?: number, settled?: boolean) => void;
  /** Lay out downlights on an even rows x cols grid. See the implementation
   *  for why centres, not edges. */
  addSpotGrid: (rows: number, cols: number, replace?: boolean, spacing?: number) => void;
  /** Add one run of downlights across the width or down the depth, at
   *  `offset` from the room's centre line. `spacing` (metres) sets an exact
   *  pitch and centres the run; without it the span is divided evenly. */
  addSpotRow: (count: number, axis: 'across' | 'down', offset?: number, spacing?: number) => void;
  clearSpots: () => void;
  /** Set the door colour for a whole run of cabinets, or every unit. */
  recolourUnits: (scope: 'base' | 'wall' | 'tall' | 'all', hex: string) => void;
  /** Move an object to x,z, carrying the rest of its run with it. Pass solo
   *  to break one fitting out of the line instead. */
  moveWithGroup: (id: string, x: number, z: number, solo?: boolean) => void;
  /** Preview the design after dark. Daylight swamps the fittings, so without
   *  this a lighting layout cannot actually be judged. */
  nightPreview: boolean;
  setNightPreview: (on: boolean) => void;
  /** Time of day in hours (utils/sun): the sun slider. nightPreview follows
   *  it - true once the sun is down - so everything keyed to "night" (the
   *  fittings switching on, the night HDR) comes with the slider. */
  timeOfDay: number;
  setTimeOfDay: (hours: number) => void;
  /** The line a dragged fitting has snapped onto, drawn on the ceiling plan
   *  so "lined up" is something you can see rather than hope for. */
  alignGuide: { x?: number; z?: number } | null;
  setAlignGuide: (g: { x?: number; z?: number } | null) => void;
  duplicateObject: (id: string) => void;
  updateObject: (id: string, updates: Partial<SceneState['objects'][0]>) => void;
  removeObject: (id: string) => void;

  // Pricing
  calculatePrice: () => number;
}

/** Timestamp of the last undo snapshot — see saveState for why. */
let lastSaveStateAt = 0;

/** Minimum wall left standing at each end of an opening, in mm. */
const MIN_PIER_MM = 100;

/**
 * Keep a door/window opening inside its wall, always leaving a pier of wall
 * at each end.
 *
 * The wall is carved by a CSG subtraction whose box is exactly the opening's
 * width. Nothing used to bound that: dragging a width handle past the
 * building's length made the cut swallow the whole wall, so the boolean
 * legitimately returned EMPTY geometry and every wall vanished - and right at
 * the threshold it flipped in and out on each drag step, which is the
 * "flashing / building disappears" bug. Coplanar side faces at exactly
 * full width are unstable for the same reason, so the pier also keeps the
 * cut clear of the wall's end faces.
 *
 * Applied inside the store so EVERY path is covered - 3D drag handles,
 * sidebar sliders and the typed numeric panel alike.
 */
function clampOpening<T extends { wall: string; widthMm: number; offsetMm: number }>(
  room: SceneState['room'],
  el: T,
): T {
  // The stretch of wall that is actually there: with an outdoor section the
  // front wall stops at the divider, so an opening can no longer be clamped
  // to the building's full width and land over the open bay (where it is
  // hidden and looks lost). A wall the bay has removed entirely keeps the
  // full span: the opening stays hidden and comes back with the wall.
  const wallLen = (el.wall === 'front' || el.wall === 'back') ? room.widthMm : room.depthMm;
  // On an L the stretch is the face the opening is on - the main one, or the
  // notch's recessed one - so it is kept off the corner between them.
  const span = wallSpanMm(room, el.wall, Number.isFinite(el.offsetMm) ? el.offsetMm : undefined) ?? { lo: -wallLen / 2, hi: wallLen / 2 };
  const maxWidth = Math.max(300, span.hi - span.lo - MIN_PIER_MM * 2);
  // A width or offset that is not a number (an emptied input, a field an old
  // save never had) must not come out of here as NaN: Math.max(300, NaN) is
  // NaN, and a NaN opening is a cut the wall boolean silently ignores.
  const wantW = Number.isFinite(el.widthMm) ? el.widthMm : 900;
  const wantOff = Number.isFinite(el.offsetMm) ? el.offsetMm : 0;
  const widthMm = Math.min(Math.max(300, wantW), maxWidth);
  const lo = span.lo + widthMm / 2 + MIN_PIER_MM;
  const hi = span.hi - widthMm / 2 - MIN_PIER_MM;
  const offsetMm = lo > hi ? Math.round((lo + hi) / 2) : Math.min(Math.max(wantOff, lo), hi);
  return { ...el, widthMm, offsetMm };
}

/** Where a new opening on this wall starts: the middle of the wall that is
 *  there, snapped to 50mm. */
function wallMidMm(room: SceneState['room'], wall: string): number {
  const span = wallSpanMm(room, wall);
  return span ? Math.round((span.lo + span.hi) / 2 / 50) * 50 : 0;
}

const initialState: SceneState = {
  room: {
    shape: 'Box',
    widthMm: 8000,
    depthMm: 4300,
    wallThicknessMm: 150,
    heightMm: 2050,
    backHeightMm: 2010,
    baseHeightMm: 150,
    roofHeightMm: 300,
    hasCanopy: false,
    canopySizeMm: 1500,
    hasDecking: false,
    deckingSizeMm: 1500,
    deckingMaterial: undefined,
    overhangLeftMm: 0,
    overhangRightMm: 0,
    overhangBackMm: 0,
    cladding: 'cedar_composite',
    claddingOrientation: 'horizontal',
    // Default base matches the walls: with no explicit deckingMaterial the
    // base texture resolves from the cladding (resolveDeckingKey), so it
    // follows whatever cladding the user picks. Concrete is still available
    // in the Base/Decking picker for anyone who wants it.
    baseMaterial: 'composite_decking',
    roofMaterial: 'epdm',
    frameColor: 'anthracite',
    interiorColor: '#ffffff',
    interiorFloorType: 'oak_plank',
    floorScale: 1,
    worktopMaterial: 'carrara',
    x: 0,
    z: 0,
    rot: 0,
    // Off until asked for: the chips on every wall, fence, deck and path
    // cluttered every view (Charlie, 16 Sep). Extras > Show Dimensions.
    showDimensions: true,
    doors: [],
    hasDoorHandles: true,
    windows: [],
    skylights: [],
    partitions: [],
    lShapeCutoutWidthMm: 2000,
    lShapeCutoutDepthMm: 1500,
    lShapeCutoutCorner: 'front-right',
    hasPictureFrame: false,
  },
  objects: [],
  fences: [],
  paths: [],
  decks: [],
  pricing: {
    basePricePerSqm: 1200,
    canopyPricePerSqm: 300,
    deckingPricePerSqm: 180,
    // The outdoor section: its decked floor, lined soffit, corner post and
    // the dividing wall, over what the shell already costs.
    bayPricePerSqm: 350,
    doorLeafPrice: 650,
    windowPricePerSqm: 450,
    skylightPrice: 1200,
    partitionLmPrice: 250,
    claddingPrices: {
      composite_wood: 180,
      composite_black: 180,
      timber: 150,
      cedar: 190,
      composite_grey: 180,
      oak: 185,
      composite_brown: 170,
      charred_wood: 210,
      render_white: 160,
      box_metal_grey: 120,
      box_metal_black: 165,
      corrugated_metal: 110,
      fire_board_grey: 140,
      black_composite: 180,
      grey_composite: 180,
      cedar_cladding: 190,
      oak_cladding: 185,
      cedar_composite: 190,
      oak_composite: 185,
      light_oak_composite: 185,
      dark_grey_composite: 180,
      light_grey_composite: 180,
      white_composite: 180,
      slate_blue_composite: 180,
      sage_composite: 180,
      clay_composite: 180,
      corrugated_iron: 150,
      painted_planks: 175,
      corrugated_black: 160,
      corrugated_dark_grey: 160,
      box_metal_anthracite: 165,
    },
    roofPrices: {
      epdm: 80,
      sedum: 120,
      upvc: 90,
      metal: 110,
      roof_clay_tiles: 140,
      roof_slate_round: 160,
      roof_slate: 150,
      roof_corrugated_dark: 95,
      roof_corrugated_black: 95,
      roof_corrugated_dark_grey: 95,
    },
    basePrices: {
      concrete: 60,
      timber_decking: 80,
      composite_decking: 110
    }
  },
  env: {
    time: 'day',
    grass: true,
  },
  garden: {
    width: 20000,
    depth: 20000,
  },
};

/**
 * Crash/navigation recovery.
 *
 * The configurator holds a lot of work in memory and nothing on the server
 * until "Save Design" is pressed. Anything that unloads the page - a stray
 * click that navigates, a refresh, a tab crash - used to lose the lot. The
 * scene is now mirrored to localStorage a second after each change and
 * restored on load, so the worst case is losing the last second of work
 * instead of the session.
 *
 * A design pushed in by the host app (LOAD_3D_DESIGN) arrives after mount and
 * simply overwrites the restored scene, which is the right precedence.
 */
const AUTOSAVE_KEY = 'modulr_scene_autosave_v1';

function loadAutosave(): SceneState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only accept something that actually looks like a scene.
    if (!parsed?.room || typeof parsed.room.widthMm !== 'number' || !Array.isArray(parsed.objects)) return null;
    // Taps saved before they followed the sink can be sitting on the deck
    // with the spout over the wall. Seat each one on its sink on the way in.
    const objects = (parsed.objects as SceneObject[]).map(o => {
      const s = snapTap(o.type, o.x, o.z, parsed.objects, o.id);
      return s ? { ...o, x: s.x, z: s.z, rot: s.rot } : o;
    });
    return { ...initialState, ...parsed, objects, paths: Array.isArray(parsed.paths) ? parsed.paths : [], decks: Array.isArray(parsed.decks) ? parsed.decks : [], room: { ...initialState.room, ...parsed.room } };
  } catch {
    return null;
  }
}

export const useStore = create<AppState>((set, get) => ({
  scene: loadAutosave() ?? initialState,
  pastScenes: [],
  futureScenes: [],
  viewMode: '3d',
  walkInside: false,
  toolMode: 'select',
  selectedObjectId: null,
  selectedElementId: null,
  hoveredElementId: null,
  hoverTimeoutId: null,
  activePlacementType: null,
  isExporting: false,
  controlsEnabled: true,
  capturedImage: null,
  uploadedBgImage: null,
  harmonizedImage: null,
  renderTransform: { x: 0, y: -0.005, z: 0, scale: 1, rotationY: 0 },

  setViewMode: (mode) => set({ viewMode: mode, toolMode: 'select', activePlacementType: null, ...(mode === 'walking' ? {} : { walkInside: false }) }),
  setWalkInside: (v) => { if (useStore.getState().walkInside !== v) set({ walkInside: v }); },
  setToolMode: (mode) => set({ toolMode: mode }),
  addFence: (ax, az, bx, bz) => set((state) => ({
    scene: { ...state.scene, fences: [...(state.scene.fences || []), { id: uuidv4(), ax, az, bx, bz, ...(state.scene.boundaryStyle || {}) }] },
  })),
  updateFenceStyle: (id, style) => set((state) => ({
    scene: {
      ...state.scene,
      fences: (state.scene.fences || []).map(f => (id === null || f.id === id) ? { ...f, ...style } : f),
      boundaryStyle: id === null ? { kind: 'closeboard', heightMm: 1800, colour: '#c9b08a', ...(state.scene.boundaryStyle || {}), ...style } : state.scene.boundaryStyle,
    },
  })),
  moveFenceRun: (id, ax, az, bx, bz, solo = false) => set((state) => {
    const fences = state.scene.fences || [];
    const me = fences.find(f => f.id === id);
    if (!me) return {};
    // Ends are "joined" when the drawing tool put them on the same point.
    const joined = (x1: number, z1: number, x2: number, z2: number) => Math.hypot(x1 - x2, z1 - z2) < 0.02;
    return {
      scene: {
        ...state.scene,
        fences: fences.map(f => {
          if (f.id === id) return { ...f, ax, az, bx, bz };
          if (solo) return f;
          const n = { ...f };
          if (joined(f.ax, f.az, me.ax, me.az)) { n.ax = ax; n.az = az; }
          else if (joined(f.ax, f.az, me.bx, me.bz)) { n.ax = bx; n.az = bz; }
          if (joined(f.bx, f.bz, me.ax, me.az)) { n.bx = ax; n.bz = az; }
          else if (joined(f.bx, f.bz, me.bx, me.bz)) { n.bx = bx; n.bz = bz; }
          return n;
        }),
      },
    };
  }),
  selectedFenceId: null,
  // Picking a run takes the keyboard (arrows, R, Delete) from any object.
  setSelectedFenceId: (id) => set(id ? { selectedFenceId: id, selectedObjectId: null, selectedElementId: null } : { selectedFenceId: id }),
  addPath: (points) => set((state) => ({
    scene: { ...state.scene, paths: [...(state.scene.paths || []), { id: uuidv4(), points, widthMm: state.scene.pathStyle?.widthMm ?? 900, surface: state.scene.pathStyle?.surface ?? 'stone' }] },
  })),
  updatePath: (id, patch) => set((state) => ({
    scene: {
      ...state.scene,
      paths: (state.scene.paths || []).map(p => (id === null || p.id === id) ? { ...p, ...patch } : p),
      pathStyle: id === null ? { widthMm: 900, surface: 'stone', ...(state.scene.pathStyle || {}), ...patch } : state.scene.pathStyle,
    },
  })),
  removePath: (id) => set((state) => ({ scene: { ...state.scene, paths: (state.scene.paths || []).filter(p => p.id !== id) }, selectedPathId: state.selectedPathId === id ? null : state.selectedPathId })),
  clearPaths: () => set((state) => ({ scene: { ...state.scene, paths: [] }, selectedPathId: null })),
  addDeck: (points) => set((state) => ({
    scene: { ...state.scene, decks: [...(state.scene.decks || []), { id: uuidv4(), points, heightMm: state.scene.deckStyle?.heightMm ?? 150, material: state.scene.deckStyle?.material ?? 'match' }] },
  })),
  updateDeck: (id, patch) => set((state) => ({
    scene: {
      ...state.scene,
      decks: (state.scene.decks || []).map(d => (id === null || d.id === id) ? { ...d, ...patch } : d),
      deckStyle: id === null ? { heightMm: 150, material: 'match', ...(state.scene.deckStyle || {}), ...patch } : state.scene.deckStyle,
    },
  })),
  moveDeckPoint: (id, index, x, z) => set((state) => ({
    scene: { ...state.scene, decks: (state.scene.decks || []).map(d => d.id === id ? { ...d, points: d.points.map((p, i) => i === index ? [x, z] as [number, number] : p) } : d) },
  })),
  // `from` is the outline at grab time, so a drag re-places it from there
  // each move and the grid snap cannot creep.
  moveDeck: (id, dx, dz, from) => set((state) => ({
    scene: { ...state.scene, decks: (state.scene.decks || []).map(d => d.id === id ? { ...d, points: (from ?? d.points).map(([x, z]) => [Math.round((x + dx) * 1000) / 1000, Math.round((z + dz) * 1000) / 1000] as [number, number]) } : d) },
  })),
  removeDeck: (id) => set((state) => ({ scene: { ...state.scene, decks: (state.scene.decks || []).filter(d => d.id !== id) }, selectedDeckId: state.selectedDeckId === id ? null : state.selectedDeckId })),
  clearDecks: () => set((state) => ({ scene: { ...state.scene, decks: [] }, selectedDeckId: null })),
  selectedDeckId: null,
  setSelectedDeckId: (id) => set(id ? { selectedDeckId: id, selectedObjectId: null, selectedElementId: null, selectedFenceId: null, selectedPathId: null } : { selectedDeckId: id }),
  selectedPathId: null,
  setSelectedPathId: (id) => set({ selectedPathId: id }),
  removeFence: (id) => set((state) => ({
    scene: { ...state.scene, fences: (state.scene.fences || []).filter(f => f.id !== id) },
  })),
  clearFences: () => set((state) => ({ scene: { ...state.scene, fences: [] } })),
  setActivePlacementType: (type) => set({ activePlacementType: type, toolMode: type ? 'place' : 'select' }),
  setSelectedObjectId: (id) => set(id ? { selectedObjectId: id, selectedElementId: null, selectedFenceId: null, selectedDeckId: null } : { selectedObjectId: id, selectedElementId: null }),
  setSelectedElementId: (id) => set({ selectedElementId: id, selectedObjectId: null }),
  setHoveredElementId: (id) => {
    const store = get() as AppState;
    if (store.hoverTimeoutId) clearTimeout(store.hoverTimeoutId);
    
    if (id === null) {
      const timeout = setTimeout(() => {
        set({ hoveredElementId: null, hoverTimeoutId: null });
      }, 300);
      set({ hoverTimeoutId: timeout });
    } else {
      set({ hoveredElementId: id, hoverTimeoutId: null });
    }
  },
  setControlsEnabled: (enabled) => set({ controlsEnabled: enabled }),
  configMode: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'business') ? 'business' : 'public',
  setConfigMode: (mode) => set((state) => ({
    configMode: mode,
    // Leaving business mode also leaves its views: public has no walk or
    // lighting plan, and a stale one would show an empty toolbar.
    viewMode: mode === 'public' && (state.viewMode === 'walking' || state.viewMode === 'lighting') ? '3d' : state.viewMode,
  })),
  walkPointerLocked: false,
  walkStart: 'outside',
  setWalkStart: (where) => set({ walkStart: where }),
  activeCameraId: null,
  setActiveCameraId: (id) => set({ activeCameraId: id }),
  cameraMode: false,
  setCameraMode: (on) => set({ cameraMode: on }),
  addCamera: (camera) => set((state) => ({ scene: { ...state.scene, cameras: [...(state.scene.cameras || []), camera] } })),
  updateCamera: (id, updates) => set((state) => ({ scene: { ...state.scene, cameras: (state.scene.cameras || []).map(c => (c.id === id ? { ...c, ...updates } : c)) } })),
  removeCamera: (id) => set((state) => ({ scene: { ...state.scene, cameras: (state.scene.cameras || []).filter(c => c.id !== id) }, activeCameraId: state.activeCameraId === id ? null : state.activeCameraId })),
  setWalkPointerLocked: (locked) => set({ walkPointerLocked: locked }),
  walkFloorOpen: false,
  setWalkFloorOpen: (open) => set({ walkFloorOpen: open }),
  walkWallOpen: false,
  setWalkWallOpen: (open) => set({ walkWallOpen: open }),
  walkFrameOpen: false,
  setWalkFrameOpen: (open) => set({ walkFrameOpen: open }),
  walkFrameId: null,
  setWalkFrameId: (id) => set({ walkFrameId: id }),
  walkPending: null,
  setWalkPending: (t) => set({ walkPending: t }),
  walkDoorOpen: false,
  setWalkDoorOpen: (open) => set({ walkDoorOpen: open }),
  walkDoorPartId: null,
  setWalkDoorPartId: (id) => set({ walkDoorPartId: id }),
  openDoorIds: [],
  toggleDoorOpen: (id) => set((state) => ({
    openDoorIds: state.openDoorIds.includes(id) ? state.openDoorIds.filter(x => x !== id) : [...state.openDoorIds, id],
  })),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setCapturedImage: (image) => set({ capturedImage: image }),
  setUploadedBgImage: (image) => set({ uploadedBgImage: image }),
  setHarmonizedImage: (image) => set({ harmonizedImage: image }),
  setRenderTransform: (updates) => set((state) => ({ renderTransform: { ...state.renderTransform, ...updates } })),

  saveState: () => set((state) => {
    // One undo step per gesture, not per slider tick. The sidebar wraps every
    // debounced slider commit in saveState, so a single drag pushed dozens of
    // near-identical snapshots — Undo then appeared to do nothing, stepping
    // back 100mm at a time. Collapse snapshots taken within a second.
    const now = Date.now();
    const tooSoon = now - lastSaveStateAt < 1000;
    lastSaveStateAt = now;
    if (tooSoon && state.pastScenes.length > 0) return state;
    return {
      pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
      futureScenes: []
    };
  }),

  /**
   * Start again from a blank building.
   *
   * The autosave that restores your work after a refresh has no off switch, so
   * once a design existed there was no way back to an empty one - opening the
   * configurator always reloaded the last thing you touched. This clears the
   * stored scene as well as the in-memory one; without that the next reload
   * would simply bring the old design back and look like the button had done
   * nothing.
   *
   * Undo history goes too. Undoing across a deliberate "new design" would
   * resurrect half of the previous building.
   */
  newDesign: () => {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* private mode */ }
    set({
      scene: JSON.parse(JSON.stringify(initialState)),
      pastScenes: [],
      futureScenes: [],
      selectedObjectId: null,
      selectedElementId: null,
      activePlacementType: null,
    });
  },

  undo: () => set((state) => {
    if (state.pastScenes.length === 0) return state;
    const newPast = [...state.pastScenes];
    const previous = newPast.pop()!;
    return {
      pastScenes: newPast,
      scene: previous,
      futureScenes: [JSON.parse(JSON.stringify(state.scene)), ...state.futureScenes],
    };
  }),

  redo: () => set((state) => {
    if (state.futureScenes.length === 0) return state;
    const newFuture = [...state.futureScenes];
    const next = newFuture.shift()!;
    return {
      pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
      scene: next,
      futureScenes: newFuture,
    };
  }),

  loadRoom: (design) => set((state) => {
    // A full save carries its room under 'room'; a legacy save IS the room.
    const full = design && typeof design === 'object' && 'room' in design && design.room && typeof design.room === 'object';
    const room = full ? (design as { room: Partial<SceneState['room']> }).room : (design as Partial<SceneState['room']>);
    const saved = full ? (design as { objects?: SceneObject[]; fences?: SceneState['fences']; paths?: PathRun[]; decks?: DeckArea[] }) : {};
    const objects = Array.isArray(saved.objects)
      ? saved.objects.map(o => { const t = snapTap(o.type, o.x, o.z, saved.objects!, o.id); return t ? { ...o, x: t.x, z: t.z, rot: t.rot } : o; })
      : state.scene.objects;
    return {
      // The current scene goes onto the undo stack, so loading a design is
      // reversible like any other edit.
      pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
      futureScenes: [],
      scene: {
        ...state.scene,
        room: { ...initialState.room, ...room },
        objects,
        fences: Array.isArray(saved.fences) ? saved.fences : state.scene.fences,
        paths: Array.isArray(saved.paths) ? saved.paths : state.scene.paths,
        decks: Array.isArray(saved.decks) ? saved.decks : state.scene.decks,
        // A design's saved cameras come back with it; an older save without
        // any keeps whatever cameras are on the current scene.
        cameras: Array.isArray((saved as { cameras?: SavedCamera[] }).cameras) ? (saved as { cameras?: SavedCamera[] }).cameras : state.scene.cameras,
      },
      selectedElementId: null,
      selectedObjectId: null,
      activeCameraId: null,
    };
  }),

  applyPreset: (room, objects) => set((state) => ({
    pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
    futureScenes: [],
    scene: {
      ...state.scene,
      // Start from defaults so a template never inherits stray openings or
      // partitions from whatever was on screen, but keep the user's finish
      // choices, which are a matter of taste rather than layout.
      room: {
        ...initialState.room,
        cladding: state.scene.room.cladding,
        claddingOrientation: state.scene.room.claddingOrientation,
        frameColor: state.scene.room.frameColor,
        frameColorInner: state.scene.room.frameColorInner,
        frameStyle: state.scene.room.frameStyle,
        roofMaterial: state.scene.room.roofMaterial,
        ...room,
      },
      objects: objects.map(o => ({ ...o, id: uuidv4() })),
    },
    selectedElementId: null,
    selectedObjectId: null,
  })),

  updateRoom: (updates) => {
    /**
     * Snapshot BEFORE every room change, at the store level. Individual UI
     * paths (shape picker, typed dimensions, door edits) kept forgetting to
     * call saveState, so Undo skipped their changes and jumped to whatever
     * older snapshot existed. saveState's own 1-second collapse turns slider
     * drags and per-frame updates into a single undo step, so calling it
     * unconditionally here is safe.
     */
    get().saveState();
    return set((state) => {
    let finalUpdates = { ...updates };
    const currentRoom = state.scene.room;

    /*
     * No dimension may become NaN. Every numeric field of the room feeds a
     * geometry somewhere, and a NaN in the wall boolean is the one failure
     * that nothing downstream can see: the result has the right vertex
     * count, throws nothing, and draws nothing - the walls simply vanish.
     * Measured on the live build (14 Sep): widthMm NaN = no walls, no
     * warning. A non-finite number for a field that currently holds a
     * number is dropped here, keeping the value that was on screen.
     */
    for (const k of Object.keys(finalUpdates) as (keyof typeof finalUpdates)[]) {
      const v = finalUpdates[k] as unknown;
      if (typeof v === 'number' && !Number.isFinite(v)) {
        console.warn(`[store] updateRoom ignored non-finite ${String(k)}`, v);
        delete finalUpdates[k];
      }
    }

    const isPictureFrameOn = finalUpdates.hasPictureFrame !== undefined ? finalUpdates.hasPictureFrame : currentRoom.hasPictureFrame;
    
    if (isPictureFrameOn) {
       if (finalUpdates.canopySizeMm !== undefined && finalUpdates.deckingSizeMm === undefined) {
         finalUpdates.deckingSizeMm = finalUpdates.canopySizeMm;
       } else if (finalUpdates.deckingSizeMm !== undefined && finalUpdates.canopySizeMm === undefined) {
         finalUpdates.canopySizeMm = finalUpdates.deckingSizeMm;
       } else if (finalUpdates.hasPictureFrame === true) {
         const currentDecking = currentRoom.deckingSizeMm ?? 1500;
         const currentCanopy = currentRoom.canopySizeMm ?? 0;
         const newSize = currentCanopy > 0 ? currentCanopy : (currentDecking > 0 ? currentDecking : 500);
         finalUpdates.deckingSizeMm = newSize;
         finalUpdates.canopySizeMm = newSize;
       }
    }

    const room = { ...state.scene.room, ...finalUpdates };
    let objects = state.scene.objects;
    /*
     * The outdoor section changed: nothing may be left standing where the
     * room no longer is. Every object is re-clamped into its zone under the
     * new bay - furniture out of the bay and into the room, the hot tub
     * into the bay - so switching a bay on over a bedroom moves the bed
     * rather than leaving it in the open air (Charlie, 10 Sep).
     */
    if ('bay' in finalUpdates && objects.some(o => isInteriorType(o.type))) {
      objects = objects.map(o => {
        if (!isInteriorType(o.type)) return o;
        const c = clampToRoomInterior(room, o.x, o.z, 0.05, o.type);
        return (c.x === o.x && c.z === o.z) ? o : { ...o, x: c.x, z: c.z };
      });
    }

    /*
     * The walls changed size (building width/depth, wall thickness, the
     * outdoor section): every door and window is re-clamped to the wall
     * that is now there. Openings were only ever clamped when THEY changed,
     * so shrinking the building or the bay could leave a door wider than
     * its wall - a cut that swallows the whole wall, and a wall that is
     * simply not there. A wall must never disappear.
     */
    const wallsChanged = ['widthMm', 'depthMm', 'wallThicknessMm', 'bay'].some(k => k in finalUpdates);
    if (wallsChanged) {
      // Same object back when nothing moved, so an untouched opening does
      // not re-trigger the wall rebuild.
      const same = <T extends { widthMm: number; offsetMm: number }>(a: T, b: T) => a.widthMm === b.widthMm && a.offsetMm === b.offsetMm ? a : b;
      const doors = (room.doors || []).map(dr => same(dr, clampOpening(room, dr)));
      const windows = (room.windows || []).map(wn => same(wn, clampOpening(room, wn)));
      if (doors.some((dr, i) => dr !== room.doors![i]) || windows.some((wn, i) => wn !== room.windows[i])) {
        return { scene: { ...state.scene, room: { ...room, doors, windows }, objects } };
      }
    }

    return {
      scene: { ...state.scene, room, objects }
    };
  });
  },

  updatePricing: (updates) => set((state) => ({
    scene: { ...state.scene, pricing: { ...state.scene.pricing, ...updates } }
  })),

  addDoor: () => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        doors: [
          ...(state.scene.room.doors || []),
          clampOpening(state.scene.room, {
            id: uuidv4(),
            wall: 'front' as const,
            offsetMm: wallMidMm(state.scene.room, 'front'),
            widthMm: 2000,
            heightMm: 2100,
            leaves: 2,
          })
        ]
      }
    }
  })),

  addDoorAt: (wall, offsetMm) => set((state) => {
    const room = state.scene.room;
    const id = uuidv4();
    return {
      selectedElementId: id,
      selectedObjectId: null,
      scene: {
        ...state.scene,
        room: {
          ...room,
          doors: [
            ...(room.doors || []),
            clampOpening(room, { id, wall, offsetMm: Math.round(offsetMm / 50) * 50, widthMm: 1800, heightMm: 2100, leaves: 2 })
          ]
        }
      }
    };
  }),

  updateDoor: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        doors: (state.scene.room.doors || []).map(d => d.id === id ? clampOpening(state.scene.room, { ...d, ...updates }) : d)
      }
    }
  })),

  removeDoor: (id) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        doors: (state.scene.room.doors || []).filter(d => d.id !== id)
      }
    }
  })),

  addWindow: () => set((state) => {
    const room = state.scene.room;
    // New windows start at the left end of the front wall and slide right to
    // the first clear spot, so they never land on top of the (centred) door
    // or stack on an earlier window.
    const winW = 600;
    const margin = 300;
    // The front wall that is there - with an outdoor section it stops at
    // the divider, and a window over the bay would hang in mid-air.
    const span = wallSpanMm(room, 'front') ?? { lo: -room.widthMm / 2, hi: room.widthMm / 2 };
    const occupied = [
      ...(room.doors || []).filter(d => d.wall === 'front').map(d => ({ c: d.offsetMm, hw: d.widthMm / 2 })),
      ...room.windows.filter(w => w.wall === 'front').map(w => ({ c: w.offsetMm ?? 0, hw: w.widthMm / 2 })),
    ];
    const leftmost = span.lo + margin + winW / 2;
    const rightmost = span.hi - margin - winW / 2;
    let offsetMm = leftmost;
    while (
      offsetMm <= rightmost &&
      occupied.some(o => Math.abs(offsetMm - o.c) < o.hw + winW / 2 + 100)
    ) {
      offsetMm += 200;
    }
    if (offsetMm > rightmost) offsetMm = leftmost; // wall is full - fall back to the left end
    return {
      scene: {
        ...state.scene,
        room: {
          ...room,
          windows: [
            ...room.windows,
            {
              id: uuidv4(),
              wall: 'front',
              offsetMm,
              widthMm: winW,
              heightMm: 1000,
              sillMm: 800,
            }
          ]
        }
      }
    };
  }),

  addWindowAt: (wall, offsetMm) => set((state) => {
    const room = state.scene.room;
    const id = uuidv4();
    return {
      selectedElementId: id,
      selectedObjectId: null,
      scene: {
        ...state.scene,
        room: {
          ...room,
          windows: [
            ...room.windows,
            clampOpening(room, { id, wall, offsetMm: Math.round(offsetMm / 50) * 50, widthMm: 1000, heightMm: 1000, sillMm: 900 })
          ]
        }
      }
    };
  }),

  updateWindow: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        windows: state.scene.room.windows.map(w => w.id === id ? clampOpening(state.scene.room, { ...w, ...updates }) : w)
      }
    }
  })),

  removeWindow: (id) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        windows: state.scene.room.windows.filter(w => w.id !== id)
      }
    }
  })),

  addSkylight: () => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        skylights: [
          ...(state.scene.room.skylights || []),
          {
            id: uuidv4(),
            widthMm: 1000,
            lengthMm: 1500,
            offsetX: 0,
            offsetZ: 0,
            type: 'flat',
          }
        ]
      }
    }
  })),

  updateSkylight: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        skylights: (state.scene.room.skylights || []).map(s => s.id === id ? { ...s, ...updates } : s)
      }
    }
  })),

  removeSkylight: (id) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        skylights: (state.scene.room.skylights || []).filter(s => s.id !== id)
      }
    }
  })),

  addInteriorDoor: () => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        interiorDoors: [
          ...(state.scene.room.interiorDoors || []),
          { id: uuidv4(), xMm: 0, zMm: 0, rotation: 0, widthMm: 800, heightMm: 2000 }
        ]
      }
    }
  })),
  updateInteriorDoor: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        interiorDoors: state.scene.room.interiorDoors?.map(d => d.id === id ? { ...d, ...updates } : d) || []
      }
    }
  })),
  removeInteriorDoor: (id) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        interiorDoors: state.scene.room.interiorDoors?.filter(d => d.id !== id) || []
      }
    }
  })),
  addLShapeWall: () => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: [
          ...(state.scene.room.partitions || []),
          { id: uuidv4(), xMm: -1000, zMm: -1000, lengthMm: 2000, thicknessMm: 100, rotation: 0 },
          { id: uuidv4(), xMm: 0, zMm: 0, lengthMm: 2000, thicknessMm: 100, rotation: 90 }
        ]
      }
    }
  })),

  addPartition: () => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: [
          ...(state.scene.room.partitions || []),
          {
            id: uuidv4(),
            xMm: 0,
            zMm: 0,
            lengthMm: 2000,
            thicknessMm: 100,
            rotation: 0,
            doors: [],
          }
        ]
      }
    }
  })); },

  updatePartition: (id, updates) => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => p.id === id ? { ...p, ...updates } : p)
      }
    }
  })); },

  /**
   * Doors that BELONG to an internal wall. All three go through the same
   * partitions array, so the door travels when the wall moves and undo
   * captures each change like any other room edit.
   */
  addPartitionDoor: (partitionId) => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => p.id === partitionId
          ? { ...p, doors: [...(p.doors || []), { id: uuidv4(), offsetMm: 0, widthMm: 800, heightMm: 2000 }] }
          : p)
      }
    }
  })); },

  updatePartitionDoor: (partitionId, doorId, updates) => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => p.id === partitionId
          ? { ...p, doors: (p.doors || []).map(dr => dr.id === doorId ? { ...dr, ...updates } : dr) }
          : p)
      }
    }
  })); },

  matchInteriorDoorHandles: (handle, ironmongery) => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => ({
          ...p,
          doors: (p.doors || []).map(dr => ({ ...dr, handle, ironmongery })),
        })),
      },
    },
  })); },

  removePartitionDoor: (partitionId, doorId) => { get().saveState(); return set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => p.id === partitionId
          ? { ...p, doors: (p.doors || []).filter(dr => dr.id !== doorId) }
          : p)
      }
    }
  })); },

  removePartition: (id) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).filter(p => p.id !== id)
      }
    }
  })),

  toggleTime: () => set((state) => ({
    scene: {
      ...state.scene,
      env: { ...state.scene.env, time: state.scene.env.time === 'day' ? 'night' : 'day' }
    }
  })),

  areDoorsOpen: false,
  toggleDoors: () => set((state) => ({ areDoorsOpen: !state.areDoorsOpen })),

  cameraFov: 50,
  setCameraFov: (fov) => set({ cameraFov: Math.min(100, Math.max(20, fov)) }),
  walkFov: 60,
  setWalkFov: (fov) => set({ walkFov: Math.min(100, Math.max(20, fov)) }),
  nightPreview: false,
  // The toggle is a shortcut on the slider: night is 10pm, day is 1pm.
  setNightPreview: (on) => set({ nightPreview: on, timeOfDay: on ? 22 : 13 }),
  timeOfDay: 13,
  setTimeOfDay: (hours) => { const h = Math.max(DAY_START, Math.min(DAY_END, hours)); set({ timeOfDay: h, nightPreview: sunState(h).elevation < 0 }); },
  alignGuide: null,
  setAlignGuide: (g) => set(s => {
    // Reference-equal when nothing changed, so a drag does not re-render the
    // plan on every frame just to draw the same guide.
    const a = s.alignGuide;
    if (a === g) return s;
    if (a && g && a.x === g.x && a.z === g.z) return s;
    return { alignGuide: g };
  }),

  addObject: (type, x, z, rot = 0, settled = false) => set((state) => {
    // Interior objects can never land outside the building - drops used to
    // fall wherever the cursor ray hit the ground, walls or not. A placement
    // already settled by its faces keeps its position: the centre clamp's
    // 50mm margin would lift a wall-hung tap's plate off the wall.
    if (isInteriorType(type) && !settled) {
      const c = clampToRoomInterior(state.scene.room, x, z, 0.05, type);
      x = c.x; z = c.z;
    }
    // A new cabinet joins its run in the run's colour. It used to arrive in
    // the default grey beside units already painted, and stayed that way
    // until the next recolour of the whole family (Charlie, 10 Sep: a white
    // corner unit between grey ones).
    const fam = UNIT_FAMILY[type];
    const sibling = fam ? state.scene.objects.find(o => UNIT_FAMILY[o.type] === fam && !o.independent && o.color) : undefined;
    return {
      scene: {
        ...state.scene,
        objects: [
          ...state.scene.objects,
          { id: uuidv4(), type, x, z, rot, scale: 1, ...(sibling ? { color: sibling.color } : {}) }
        ]
      }
    };
  }),

  /**
   * Lay a grid of downlights across the room in one go.
   *
   * Placing spots one at a time and eyeballing the gaps is the slow, annoying
   * part of a lighting layout, and uneven spacing is obvious once it is built.
   * This divides the room into rows x cols equal cells and puts a fitting at
   * the CENTRE of each, which is the standard way to set downlights out: it
   * gives even spacing between fittings AND a half-space margin to the walls,
   * so no light sits hard against one.
   *
   * Replaces any existing spots rather than adding to them, so nudging the
   * numbers re-lays the grid instead of piling a second one on top.
   */
  addSpotGrid: (rows, cols, replace = true, spacing) => set((state) => {
    const room = state.scene.room;
    const wt = (room.wallThicknessMm ?? 150) / 1000;
    const iw = room.widthMm / 1000 - wt * 2;
    const id = room.depthMm / 1000 - wt * 2;
    const kept = replace ? state.scene.objects.filter(o => o.type !== 'spot_light') : state.scene.objects;
    const spots: SceneState['objects'] = [];
    for (let r = 0; r < rows; r++) {
      // Each row of the grid is its own group, so a grid can be nudged one
      // row at a time - which is how you adjust for a beam or a rooflight.
      const groupId = uuidv4();
      for (let c = 0; c < cols; c++) {
        // Exact centres when a spacing is given, otherwise fit the room.
        const x = spacing ? (c - (cols - 1) / 2) * spacing : -iw / 2 + iw * (c + 0.5) / cols;
        const z = spacing ? (r - (rows - 1) / 2) * spacing : -id / 2 + id * (r + 0.5) / rows;
        spots.push({ id: uuidv4(), type: 'spot_light', x, z, rot: 0, scale: 1, groupId });
      }
    }
    return { scene: { ...state.scene, objects: [...kept, ...spots] } };
  }),

  /**
   * One evenly spaced run of downlights, ADDED to whatever is already there.
   *
   * A real ceiling is usually a few runs rather than one grid - a row over the
   * worktop, a row down the middle, a pair over the desk - so rows compose.
   * Spacing is even along the run and the whole run is centred, with a
   * half-space left to the wall at each end exactly as the grid does, so a row
   * dropped next to a grid still lines through with it.
   */
  addSpotRow: (count, axis, offset = 0, spacing) => set((state) => {
    const room = state.scene.room;
    const wt = (room.wallThicknessMm ?? 150) / 1000;
    const span = (axis === 'across' ? room.widthMm : room.depthMm) / 1000 - wt * 2;
    const spots: SceneState['objects'] = [];
    const groupId = uuidv4();
    for (let i = 0; i < count; i++) {
      /*
       * Given a spacing, that spacing is EXACT and the run is centred in the
       * room - "downlights at 1200 centres" is how a layout is specified, so
       * the number the user typed has to be the number on the ceiling. The
       * leftover becomes the margin to the walls. Without one, fall back to
       * dividing the span evenly.
       */
      const along = spacing
        ? (i - (count - 1) / 2) * spacing
        : -span / 2 + span * (i + 0.5) / count;
      spots.push({
        id: uuidv4(), type: 'spot_light', rot: 0, scale: 1, groupId,
        x: axis === 'across' ? along : offset,
        z: axis === 'across' ? offset : along,
      });
    }
    return { scene: { ...state.scene, objects: [...state.scene.objects, ...spots] } };
  }),

  /**
   * Move an object, taking its whole run with it.
   *
   * The run stays RIGID: the delta is worked out once and clamped so that
   * every member stays inside the room, rather than clamping each one
   * separately - which would squash the row against a wall and destroy the
   * even spacing that is the entire point of laying it out.
   *
   * `solo` moves just the one, for the odd fitting that needs shifting off
   * the line.
   */
  moveWithGroup: (id, x, z, solo = false) => set((state) => {
    const objects = state.scene.objects;
    const src = objects.find(o => o.id === id);
    if (!src) return {};
    const room = state.scene.room;
    const target = isInteriorType(src.type) ? clampToRoomInterior(room, x, z, 0.05, src.type) : { x, z };
    const mates = (!solo && src.groupId) ? objects.filter(o => o.groupId === src.groupId && o.id !== id) : [];
    if (!mates.length) {
      return { scene: { ...state.scene, objects: objects.map(o => o.id === id ? { ...o, x: target.x, z: target.z } : o) } };
    }
    // Whichever member hits a wall first sets how far the run can go.
    let dx = target.x - src.x, dz = target.z - src.z;
    for (const o of mates) {
      const c = clampToRoomInterior(room, o.x + dx, o.z + dz, 0.05, o.type);
      const mx = c.x - o.x, mz = c.z - o.z;
      if (Math.abs(mx) < Math.abs(dx)) dx = mx;
      if (Math.abs(mz) < Math.abs(dz)) dz = mz;
    }
    const gid = src.groupId;
    return {
      scene: {
        ...state.scene,
        objects: objects.map(o => (o.id === id || o.groupId === gid)
          ? { ...o, x: o.x + dx, z: o.z + dz }
          : o),
      },
    };
  }),

  /**
   * Recolour a whole run of cabinets at once.
   *
   * `scope` is a family - base, wall or tall - or 'all' for every unit in the
   * kitchen. See UNIT_FAMILY: a door colour belongs to a run, not to a single
   * carcass, so this is the normal way to change it and the per-unit swatch is
   * the exception.
   */
  recolourUnits: (scope, hex) => set((state) => ({
    scene: {
      ...state.scene,
      // Picking a colour on veneered doors means paint: the kitchen goes
      // back to the sheen it had before the wood, and takes the colour.
      room: isVeneerFinish(state.scene.room.unitFinish)
        ? { ...state.scene.room, unitFinish: state.scene.room.unitPaintFinish ?? 'satin' }
        : state.scene.room,
      objects: state.scene.objects.map(o => {
        const fam = UNIT_FAMILY[o.type];
        if (!fam) return o;
        // A bespoke unit has been deliberately taken out of the run - an
        // island in a contrasting colour - so a run recolour must not quietly
        // drag it back in.
        if (o.independent) return o;
        return (scope === 'all' || fam === scope) ? { ...o, color: hex } : o;
      }),
    },
  })),

  clearSpots: () => set((state) => ({
    scene: { ...state.scene, objects: state.scene.objects.filter(o => o.type !== 'spot_light') },
  })),

  duplicateObject: (id) => set((state) => {
    const src = state.scene.objects.find(o => o.id === id);
    if (!src) return {};
    const copy = { ...src, id: uuidv4(), x: src.x + 0.4, z: src.z + 0.4 };
    if (isInteriorType(copy.type)) {
      const c = clampToRoomInterior(state.scene.room, copy.x, copy.z, 0.05, copy.type);
      copy.x = c.x; copy.z = c.z;
    }
    return {
      scene: { ...state.scene, objects: [...state.scene.objects, copy] },
      selectedObjectId: copy.id,
    };
  }),

  updateObject: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      objects: state.scene.objects.map(o => o.id === id ? { ...o, ...updates } : o)
    }
  })),

  removeObject: (id) => set((state) => ({
    scene: {
      ...state.scene,
      objects: state.scene.objects.filter(o => o.id !== id)
    },
    selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId
  })),

  calculatePrice: () => {
    const { scene } = get();
    const { room, pricing } = scene;
    
    // Convert mm to meters for area calculation
    const w = room.widthMm / 1000;
    const d = room.depthMm / 1000;
    const h = room.heightMm / 1000;

    let floorArea = w * d;
    let roofArea = w * d;
    if (room.hasCanopy) roofArea += (w * (room.canopySizeMm || 0) / 1000);
    let wallArea = (w * h * 2) + (d * h * 2);

    if (room.shape === 'LShape' && room.lShapeCutoutWidthMm && room.lShapeCutoutDepthMm) {
      const cutoutW = room.lShapeCutoutWidthMm / 1000;
      const cutoutD = room.lShapeCutoutDepthMm / 1000;
      const cutoutArea = cutoutW * cutoutD;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
    }

    let deckingArea = 0;
    if (room.hasDecking) {
      const front = (room.deckingSizeMm || 0) / 1000;
      const sides = ((room.deckingLeftMm || 0) + (room.deckingRightMm || 0)) / 1000;
      // Front strip across the building, plus each side strip down the
      // building's depth and the front strip.
      deckingArea += w * front + sides * (d + front);
    }

    // Subtract doors
    let doorArea = 0;
    let doorPrice = 0;
    if (room.doors) {
      room.doors.forEach(door => {
        doorArea += (door.widthMm / 1000) * (door.heightMm / 1000);
        doorPrice += door.leaves * pricing.doorLeafPrice;
      });
      wallArea -= doorArea;
    }

    // Subtract windows
    let windowArea = 0;
    room.windows.forEach(win => {
      const area = (win.widthMm / 1000) * (win.heightMm / 1000);
      wallArea -= area;
      windowArea += area;
    });

    // Openings are subtracted independently with no overlap handling, so
    // enough large doors/windows could drive wallArea negative — which showed
    // up as a negative cladding line silently deflating the quote.
    wallArea = Math.max(0, wallArea);

    const claddingPrice = wallArea * (pricing.claddingPrices[room.cladding as string] || 150);
    const floorPrice = floorArea * (pricing.basePrices[room.baseMaterial as string] || 60);
    const roofPrice = roofArea * (pricing.roofPrices[room.roofMaterial as string] || 80);
    const windowsPrice = windowArea * pricing.windowPricePerSqm;
    const deckingPrice = deckingArea * pricing.deckingPricePerSqm;
    
    // picture frame adds cost?
    let pictureFramePrice = 0;
    if (room.hasPictureFrame) {
        // approximate picture frame cheek area
        const cheekDepth = (room.canopySizeMm || 1500) / 1000;
        pictureFramePrice = (h * cheekDepth * 2) * (pricing.claddingPrices[room.cladding as string] || 150);
    }

    let skylightsPrice = 0;
    (room.skylights || []).forEach(sky => {
       skylightsPrice += pricing.skylightPrice;
    });

    let partitionsPrice = 0;
    (room.partitions || []).forEach(part => {
       // An L-shaped wall is priced by its total run: main length plus leg.
       const lengthM = (part.lengthMm + (part.legLengthMm || 0)) / 1000;
       partitionsPrice += lengthM * pricing.partitionLmPrice;
    });

    const baseStructure = floorArea * pricing.basePricePerSqm;

    // The outdoor section, by its floor area. Designs saved before it
    // existed carry no rate for it, hence the fallback.
    const bay = bayRange(room);
    const bayPrice = bay ? bay.width * bay.depth * ((pricing as any).bayPricePerSqm ?? 350) : 0;

    return baseStructure + claddingPrice + floorPrice + roofPrice + doorPrice + windowsPrice + skylightsPrice + partitionsPrice + deckingPrice + pictureFramePrice + bayPrice;
  }
}));

// Debug handle for development tooling - lets DevTools inspect the undo
// stack and scene without React DevTools. Harmless in production.
if (typeof window !== 'undefined') {
  (window as any).__modulrStore = useStore;

  // Mirror the scene to storage shortly after it settles. Debounced so a
  // drag writes once at the end rather than on every pointer step.
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe((state, prev) => {
    if (state.scene === prev.scene) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(useStore.getState().scene));
      } catch { /* quota or private mode - recovery is best-effort */ }
    }, 1000);
  });

  // A page being closed or navigated away from is exactly the case this
  // exists for, so flush immediately rather than waiting for the debounce.
  window.addEventListener('pagehide', () => {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(useStore.getState().scene)); } catch { /* ignore */ }
  });
}

