const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');

if (!file.includes('InteriorDoorData')) {
  const interfaceInsert = `export interface InteriorDoorData {
  id: string;
  xMm: number;
  zMm: number;
  rotation: number;
  widthMm: number;
  heightMm: number;
}

export interface PartitionData {`;
  file = file.replace('export interface PartitionData {', interfaceInsert);
}

if (!file.includes('interiorDoors?: InteriorDoorData[]')) {
  file = file.replace('partitions?: PartitionData[];', 'partitions?: PartitionData[];\n  interiorDoors?: InteriorDoorData[];');
}

if (!file.includes('addInteriorDoor:')) {
  const actionsInsert = `  addInteriorDoor: () => void;
  updateInteriorDoor: (id: string, updates: Partial<InteriorDoorData>) => void;
  removeInteriorDoor: (id: string) => void;
  addLShapeWall: () => void;
  
  // Environment`;
  file = file.replace('// Environment', actionsInsert);
}

const implementations = `
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

  addPartition:`;

if (!file.includes('addInteriorDoor: () => set')) {
  file = file.replace('addPartition:', implementations);
}

fs.writeFileSync('src/store.ts', file);
console.log('store updated');
