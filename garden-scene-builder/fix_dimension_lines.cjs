const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

const targetStr = `            // Generate segments
            const segments: Array<{ isOpening: boolean, start: number, end: number, length: number, element?: Opening }> = [];
            let currentPt = startEdge;

            elements.forEach((el) => {
               const elStart = Math.max(startEdge, el.offset - el.width / 2);
               const elEnd = Math.min(endEdge, el.offset + el.width / 2);
               
               const spaceBefore = elStart - currentPt;
               if (spaceBefore > 0.01) {
                  segments.push({ isOpening: false, start: currentPt, end: elStart, length: spaceBefore });
               }

               if (elEnd > elStart) {
                 segments.push({ isOpening: true, element: el, start: elStart, end: elEnd, length: elEnd - elStart });
                 currentPt = elEnd;
               }
            });

            const spaceAfter = endEdge - currentPt;
            if (spaceAfter > 0.01) {
               segments.push({ isOpening: false, start: currentPt, end: endEdge, length: spaceAfter });
            }`;

const replaceStr = `            // Generate segments
            const segments: Array<{ isOpening: boolean, start: number, end: number, length: number, element?: Opening, onValueChange?: (val: number) => void }> = [];
            let currentPt = startEdge;

            elements.forEach((el) => {
               const elStart = Math.max(startEdge, el.offset - el.width / 2);
               const elEnd = Math.min(endEdge, el.offset + el.width / 2);
               
               const spaceBefore = elStart - currentPt;
               const savedCurrentPt = currentPt; // capture for closure
               if (spaceBefore > 0.01) {
                  segments.push({ 
                    isOpening: false, 
                    start: savedCurrentPt, 
                    end: elStart, 
                    length: spaceBefore,
                    onValueChange: (valMm) => {
                      const newLength = valMm / 1000;
                      const newOffsetMm = (savedCurrentPt + newLength + el.width / 2) * 1000;
                      if (el.type === 'door') {
                        useStore.getState().updateDoor(el.id, { offsetMm: Math.round(newOffsetMm) });
                      } else {
                        useStore.getState().updateWindow(el.id, { offsetMm: Math.round(newOffsetMm) });
                      }
                    }
                  });
               }

               if (elEnd > elStart) {
                 segments.push({ isOpening: true, element: el, start: elStart, end: elEnd, length: elEnd - elStart });
                 currentPt = elEnd;
               }
            });

            const spaceAfter = endEdge - currentPt;
            if (spaceAfter > 0.01) {
               const lastEl = elements[elements.length - 1];
               segments.push({ 
                 isOpening: false, 
                 start: currentPt, 
                 end: endEdge, 
                 length: spaceAfter,
                 onValueChange: (valMm) => {
                   if (lastEl) {
                     const newLength = valMm / 1000;
                     const newOffsetMm = (endEdge - newLength - lastEl.width / 2) * 1000;
                     if (lastEl.type === 'door') {
                       useStore.getState().updateDoor(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     } else {
                       useStore.getState().updateWindow(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     }
                   }
                 }
               });
            }`;

if (file.includes(targetStr)) {
  file = file.replace(targetStr, replaceStr);
  
  // also need to update the DimText mapping
  const targetMap = `                    return (
                      <DimText 
                         key={\`\${wall}-seg-\${i}\`}
                         position={getPos(center)}
                         rotation={rot}
                         value={Math.round(seg.length * 1000)}
                         onValueChange={seg.isOpening && seg.element?.onUpdateWidth ? seg.element.onUpdateWidth : undefined}
                      />`;
                      
  const replaceMap = `                    return (
                      <DimText 
                         key={\`\${wall}-seg-\${i}\`}
                         position={getPos(center)}
                         rotation={rot}
                         value={Math.round(seg.length * 1000)}
                         onValueChange={seg.isOpening && seg.element?.onUpdateWidth ? seg.element.onUpdateWidth : seg.onValueChange}
                      />`;
                      
  file = file.replace(targetMap, replaceMap);
  fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
  console.log('RoomGeometry segments updated');
} else {
  console.log('targetStr not found!');
}
