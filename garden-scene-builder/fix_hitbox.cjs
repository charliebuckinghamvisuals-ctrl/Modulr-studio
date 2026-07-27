const fs = require('fs');
let file = fs.readFileSync('src/components/3d/DragHandles.tsx', 'utf8');

file = file.replace('<sphereGeometry args={[0.7, 16, 16]} />', '<sphereGeometry args={[0.2, 16, 16]} />');

fs.writeFileSync('src/components/3d/DragHandles.tsx', file);
console.log('hitbox fixed');
