import { create } from 'zustand';
import { SceneState, ViewMode, ObjectType, ToolMode, CladdingType, ShapeType, WindowData, SkylightData, PartitionData, PartitionDoor, Door, InteriorDoorData } from './types';
import { v4 as uuidv4 } from 'uuid';
import { isInteriorType, clampToRoomInterior } from './utils/placement';

// Debug/E2E hook: lets automated tests drive the store directly (drag
// simulation, perf probes). Harmless in production - nothing reads it.
declare global { interface Window { __modulrStore?: unknown } }

interface AppState {
  scene: SceneState;
  viewMode: ViewMode;
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
  setActivePlacementType: (type: ObjectType | null) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedElementId: (id: string | null) => void;
  setHoveredElementId: (id: string | null) => void;
  setControlsEnabled: (enabled: boolean) => void;
  /** True while the walkthrough has captured the mouse pointer. Drives the
   *  on-screen prompt: locked = crosshair + key hints, unlocked = "click to
   *  look around". */
  walkPointerLocked: boolean;
  setWalkPointerLocked: (locked: boolean) => void;
  /** True when the walkthrough floor-finish panel is open. */
  walkFloorOpen: boolean;
  setWalkFloorOpen: (open: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
  setCapturedImage: (image: string | null) => void;
  setUploadedBgImage: (image: string | null) => void;
  setHarmonizedImage: (image: string | null) => void;
  setRenderTransform: (updates: Partial<{ x: number; y: number; z: number; scale: number; rotationY: number }>) => void;
  
  // History Actions
  saveState: () => void;
  undo: () => void;
  redo: () => void;
  
  // Scene Actions
  /** Replace the room with a saved design, merged over defaults so scenes
   *  saved before a field existed still load cleanly. */
  loadRoom: (room: Partial<SceneState['room']>) => void;
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
  
  // Object Actions
  addObject: (type: ObjectType, x: number, z: number, rot?: number) => void;
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
  const wallLen = (el.wall === 'front' || el.wall === 'back') ? room.widthMm : room.depthMm;
  const maxWidth = Math.max(300, wallLen - MIN_PIER_MM * 2);
  const widthMm = Math.min(Math.max(300, el.widthMm), maxWidth);
  const maxOffset = Math.max(0, wallLen / 2 - widthMm / 2 - MIN_PIER_MM);
  const offsetMm = Math.min(Math.max(el.offsetMm ?? 0, -maxOffset), maxOffset);
  return { ...el, widthMm, offsetMm };
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
    showDimensions: true,
    doors: [],
    hasDoorHandles: true,
    windows: [],
    skylights: [],
    partitions: [],
    lShapeCutoutWidthMm: 2000,
    lShapeCutoutDepthMm: 1500,
    hasPictureFrame: false,
  },
  objects: [],
  fences: [],
  pricing: {
    basePricePerSqm: 1200,
    canopyPricePerSqm: 300,
    deckingPricePerSqm: 180,
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
      box_metal_black: 120,
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
    },
    roofPrices: {
      epdm: 80,
      sedum: 120,
      upvc: 90,
      metal: 110
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
    return { ...initialState, ...parsed, room: { ...initialState.room, ...parsed.room } };
  } catch {
    return null;
  }
}

export const useStore = create<AppState>((set, get) => ({
  scene: loadAutosave() ?? initialState,
  pastScenes: [],
  futureScenes: [],
  viewMode: '3d',
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

  setViewMode: (mode) => set({ viewMode: mode, toolMode: 'select', activePlacementType: null }),
  setToolMode: (mode) => set({ toolMode: mode }),
  setActivePlacementType: (type) => set({ activePlacementType: type, toolMode: type ? 'place' : 'select' }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id, selectedElementId: null }),
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
  walkPointerLocked: false,
  setWalkPointerLocked: (locked) => set({ walkPointerLocked: locked }),
  walkFloorOpen: false,
  setWalkFloorOpen: (open) => set({ walkFloorOpen: open }),
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

  loadRoom: (room) => set((state) => ({
    // The current scene goes onto the undo stack, so loading a design is
    // reversible like any other edit.
    pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
    futureScenes: [],
    scene: {
      ...state.scene,
      room: { ...initialState.room, ...room },
    },
    selectedElementId: null,
  })),

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

    return {
      scene: { ...state.scene, room: { ...state.scene.room, ...finalUpdates } }
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
          {
            id: uuidv4(),
            wall: 'front',
            offsetMm: 0,
            widthMm: 2000,
            heightMm: 2100,
            leaves: 2,
          }
        ]
      }
    }
  })),

  addDoorAt: (wall, offsetMm) => set((state) => {
    const room = state.scene.room;
    const widthMm = 1800;
    const wallLen = (wall === 'front' || wall === 'back') ? room.widthMm : room.depthMm;
    const maxOff = Math.max(0, wallLen / 2 - widthMm / 2 - 200);
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
            { id, wall, offsetMm: Math.max(-maxOff, Math.min(maxOff, Math.round(offsetMm / 50) * 50)), widthMm, heightMm: 2100, leaves: 2 }
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
    const half = room.widthMm / 2;
    const occupied = [
      ...(room.doors || []).filter(d => d.wall === 'front').map(d => ({ c: d.offsetMm, hw: d.widthMm / 2 })),
      ...room.windows.filter(w => w.wall === 'front').map(w => ({ c: w.offsetMm ?? 0, hw: w.widthMm / 2 })),
    ];
    const leftmost = -half + margin + winW / 2;
    const rightmost = half - margin - winW / 2;
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
    const widthMm = 1000;
    const wallLen = (wall === 'front' || wall === 'back') ? room.widthMm : room.depthMm;
    const maxOff = Math.max(0, wallLen / 2 - widthMm / 2 - 200);
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
            { id, wall, offsetMm: Math.max(-maxOff, Math.min(maxOff, Math.round(offsetMm / 50) * 50)), widthMm, heightMm: 1000, sillMm: 900 }
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

  addObject: (type, x, z, rot = 0) => set((state) => {
    // Interior objects can never land outside the building - drops used to
    // fall wherever the cursor ray hit the ground, walls or not.
    if (isInteriorType(type)) {
      const c = clampToRoomInterior(state.scene.room, x, z);
      x = c.x; z = c.z;
    }
    return {
      scene: {
        ...state.scene,
        objects: [
          ...state.scene.objects,
          { id: uuidv4(), type, x, z, rot, scale: 1 }
        ]
      }
    };
  }),

  duplicateObject: (id) => set((state) => {
    const src = state.scene.objects.find(o => o.id === id);
    if (!src) return {};
    const copy = { ...src, id: uuidv4(), x: src.x + 0.4, z: src.z + 0.4 };
    if (isInteriorType(copy.type)) {
      const c = clampToRoomInterior(state.scene.room, copy.x, copy.z);
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
    if (room.hasDecking) deckingArea += (w * (room.deckingSizeMm || 0) / 1000);

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

    return baseStructure + claddingPrice + floorPrice + roofPrice + doorPrice + windowsPrice + skylightsPrice + partitionsPrice + deckingPrice + pictureFramePrice;
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

