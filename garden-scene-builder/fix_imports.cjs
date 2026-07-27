const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');
const t = `import { SceneState, ViewMode, ObjectType, ToolMode, CladdingType, ShapeType, WindowData, SkylightData, PartitionData, Door } from './types';`;
const r = `import { SceneState, ViewMode, ObjectType, ToolMode, CladdingType, ShapeType, WindowData, SkylightData, PartitionData, Door, InteriorDoorData } from './types';`;

file = file.replace(t, r);
fs.writeFileSync('src/store.ts', file);
