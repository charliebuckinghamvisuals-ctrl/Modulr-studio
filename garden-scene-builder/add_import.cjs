const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');

const t = `import { RoomState, ObjectData, WindowData, SkylightData, DoorData, ObjectType, PartitionData } from './types';`;
const r = `import { RoomState, ObjectData, WindowData, SkylightData, DoorData, ObjectType, PartitionData, InteriorDoorData } from './types';`;

if (file.includes(t)) {
  file = file.replace(t, r);
  fs.writeFileSync('src/store.ts', file);
  console.log('added import');
} else {
  console.log('could not find import');
}
