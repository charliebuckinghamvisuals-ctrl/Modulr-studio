const fs = require('fs');
let file = fs.readFileSync('src/components/3d/DragHandles.tsx', 'utf8');

const t = `          let cursor = 'move';
          if (axis === 'x') cursor = 'col-resize';
          if (axis === 'z') cursor = 'ns-resize';
          if (axis === 'y') cursor = 'ns-resize';
          document.body.style.cursor = cursor;`;

const r = `          let cursor = 'move';
          if (vAxis === 'x') cursor = 'ew-resize';
          if (vAxis === 'z') cursor = 'ns-resize';
          if (vAxis === 'y') cursor = 'ns-resize';
          document.body.style.cursor = cursor;`;

if (file.includes(t)) {
  file = file.replace(t, r);
  fs.writeFileSync('src/components/3d/DragHandles.tsx', file);
  console.log('Cursor logic updated');
} else {
  console.log('Could not find cursor logic');
}
