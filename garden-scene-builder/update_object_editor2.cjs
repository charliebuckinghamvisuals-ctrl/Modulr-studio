const fs = require('fs');
let file = fs.readFileSync('src/components/UI/ObjectEditorPanel.tsx', 'utf8');

const blocks = [
  {
    target: `            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">{obj.type === 'interior_door' ? 'Frame Depth' : 'Wall Thickness'}</span>
                <span className="text-xs font-mono text-gray-500">{obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)}mm</span>
              </div>
              <input 
                type="range" min="50" max="500" step="10" 
                value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} 
                onChange={(e) => updateObject(obj.id, { depthMm: parseInt(e.target.value) })}
                className="w-full apple-slider"
              />
            </div>`,
    replace: `<DimensionSlider label={obj.type === 'interior_door' ? 'Frame Depth' : 'Wall Thickness'} min={50} max={500} step={10} value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} onChange={(v) => updateObject(obj.id, { depthMm: v })} />`
  },
  {
    target: `            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">L-Shape Return Length</span>
                <span className="text-xs font-mono text-gray-500">{obj.returnLengthMm || 0}mm</span>
              </div>
              <input 
                type="range" min="0" max="6000" step="10" 
                value={obj.returnLengthMm || 0} 
                onChange={(e) => updateObject(obj.id, { returnLengthMm: parseInt(e.target.value) })}
                className="w-full apple-slider"
              />
            </div>`,
    replace: `<DimensionSlider label="L-Shape Return Length" min={0} max={6000} step={10} value={obj.returnLengthMm || 0} onChange={(v) => updateObject(obj.id, { returnLengthMm: v })} />`
  }
];

let changedCount = 0;
blocks.forEach(b => {
  if (file.includes(b.target)) {
    file = file.replace(b.target, b.replace);
    changedCount++;
  } else {
    console.log('Could not find:\n' + b.target);
  }
});

fs.writeFileSync('src/components/UI/ObjectEditorPanel.tsx', file);
console.log('Replaced ' + changedCount + ' more sliders in ObjectEditorPanel');
