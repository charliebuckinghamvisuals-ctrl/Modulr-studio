import { create } from 'zustand';
import { SceneState, ViewMode, ObjectType, ToolMode, CladdingType, ShapeType, WindowData, SkylightData, PartitionData, Door, InteriorDoorData } from './types';
import { v4 as uuidv4 } from 'uuid';

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
  updateRoom: (updates: Partial<SceneState['room']>) => void;
  updatePricing: (updates: Partial<SceneState['pricing']>) => void;
  addDoor: () => void;
  updateDoor: (id: string, updates: Partial<Door>) => void;
  removeDoor: (id: string) => void;
  addWindow: () => void;
  updateWindow: (id: string, updates: Partial<WindowData>) => void;
  removeWindow: (id: string) => void;
  
  addSkylight: () => void;
  updateSkylight: (id: string, updates: Partial<SkylightData>) => void;
  removeSkylight: (id: string) => void;
  
  
  addPartition: () => void;
  updatePartition: (id: string, updates: Partial<PartitionData>) => void;
  removePartition: (id: string) => void;
  
    addInteriorDoor: () => void;
  updateInteriorDoor: (id: string, updates: Partial<InteriorDoorData>) => void;
  removeInteriorDoor: (id: string) => void;
  addLShapeWall: () => void;
  
  // Environment
  toggleTime: () => void;
  areDoorsOpen: boolean;
  toggleDoors: () => void;
  
  // Object Actions
  addObject: (type: ObjectType, x: number, z: number) => void;
  updateObject: (id: string, updates: Partial<SceneState['objects'][0]>) => void;
  removeObject: (id: string) => void;

  // Pricing
  calculatePrice: () => number;
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
    cladding: 'composite_grey',
    claddingOrientation: 'horizontal',
    baseMaterial: 'concrete',
    roofMaterial: 'epdm',
    frameColor: 'anthracite',
    interiorColor: '#ffffff',
    interiorFloorType: 'oak',
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

export const useStore = create<AppState>((set, get) => ({
  scene: initialState,
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
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setCapturedImage: (image) => set({ capturedImage: image }),
  setUploadedBgImage: (image) => set({ uploadedBgImage: image }),
  setHarmonizedImage: (image) => set({ harmonizedImage: image }),
  setRenderTransform: (updates) => set((state) => ({ renderTransform: { ...state.renderTransform, ...updates } })),

  saveState: () => set((state) => ({
    pastScenes: [...state.pastScenes, JSON.parse(JSON.stringify(state.scene))],
    futureScenes: []
  })),

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

  updateRoom: (updates) => set((state) => {
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
  }),

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

  updateDoor: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        doors: (state.scene.room.doors || []).map(d => d.id === id ? { ...d, ...updates } : d)
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

  addWindow: () => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        windows: [
          ...state.scene.room.windows,
          {
            id: uuidv4(),
            wall: 'front',
            offsetMm: 0,
            widthMm: 600,
            heightMm: 1000,
            sillMm: 800,
          }
        ]
      }
    }
  })),

  updateWindow: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        windows: state.scene.room.windows.map(w => w.id === id ? { ...w, ...updates } : w)
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

  addPartition: () => set((state) => ({
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
          }
        ]
      }
    }
  })),

  updatePartition: (id, updates) => set((state) => ({
    scene: {
      ...state.scene,
      room: {
        ...state.scene.room,
        partitions: (state.scene.room.partitions || []).map(p => p.id === id ? { ...p, ...updates } : p)
      }
    }
  })),

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

  addObject: (type, x, z) => set((state) => ({
    scene: {
      ...state.scene,
      objects: [
        ...state.scene.objects,
        { id: uuidv4(), type, x, z, rot: 0, scale: 1 }
      ]
    }
  })),

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
    } else if (room.shape === 'TShape' && room.lShapeCutoutWidthMm && room.lShapeCutoutDepthMm) {
      const tCutW = room.lShapeCutoutWidthMm / 1000;
      const tCutD = room.lShapeCutoutDepthMm / 1000;
      const cutoutArea = tCutW * tCutD * 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      wallArea += (tCutD * h * 2);
    } else if (room.shape === 'CornerCut' && room.lShapeCutoutWidthMm) {
      const cutSize = room.lShapeCutoutWidthMm / 1000;
      const cutoutArea = (cutSize * cutSize) / 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      const diagonal = Math.sqrt(cutSize * cutSize * 2);
      wallArea = wallArea - (cutSize * 2 * h) + (diagonal * h);
    } else if (room.shape === 'TShape' && room.lShapeCutoutWidthMm && room.lShapeCutoutDepthMm) {
      const tCutW = room.lShapeCutoutWidthMm / 1000;
      const tCutD = room.lShapeCutoutDepthMm / 1000;
      const cutoutArea = tCutW * tCutD * 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      wallArea += (tCutD * h * 2);
    } else if (room.shape === 'CornerCut' && room.lShapeCutoutWidthMm) {
      const cutSize = room.lShapeCutoutWidthMm / 1000;
      const cutoutArea = (cutSize * cutSize) / 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      const diagonal = Math.sqrt(cutSize * cutSize * 2);
      wallArea = wallArea - (cutSize * 2 * h) + (diagonal * h);
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
       const lengthM = part.lengthMm / 1000;
       partitionsPrice += lengthM * pricing.partitionLmPrice;
    });

    const baseStructure = floorArea * pricing.basePricePerSqm;

    return baseStructure + claddingPrice + floorPrice + roofPrice + doorPrice + windowsPrice + skylightsPrice + partitionsPrice + deckingPrice + pictureFramePrice;
  }
}));
