const fs = require('fs');
let file = fs.readFileSync('src/components/UI/ObjectEditorPanel.tsx', 'utf8');

file = file.replace(
  "import { Search, ChevronDown, ChevronUp, GripVertical, Trash2, X } from 'lucide-react';",
  "import { Search, ChevronDown, ChevronUp, GripVertical, Trash2, X } from 'lucide-react';\nimport { DimensionSlider } from '../DimensionSlider';"
);

const blocks = [
  {
    target: `            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">{obj.type === 'interior_door' ? 'Door Width' : 'Wall Length (Width)'}</span>
                <span className="text-xs font-mono text-gray-500">{obj.widthMm || (obj.type === 'interior_door' ? 800 : 1000)}mm</span>
              </div>
              <input 
                type="range" min="100" max="6000" step="10" 
                value={obj.widthMm || (obj.type === 'interior_door' ? 800 : 1000)} 
                onChange={(e) => updateObject(obj.id, { widthMm: parseInt(e.target.value) })}
                className="w-full apple-slider"
              />
            </div>`,
    replace: `<DimensionSlider label={obj.type === 'interior_door' ? 'Door Width' : 'Wall Length (Width)'} min={100} max={6000} step={10} value={obj.widthMm || (obj.type === 'interior_door' ? 800 : 1000)} onChange={(v) => updateObject(obj.id, { widthMm: v })} />`
  },
  {
    target: `            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">{obj.type === 'interior_door' ? 'Wall Depth (Thickness)' : 'Wall Depth (Thickness)'}</span>
                <span className="text-xs font-mono text-gray-500">{obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)}mm</span>
              </div>
              <input 
                type="range" min="50" max="500" step="10" 
                value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} 
                onChange={(e) => updateObject(obj.id, { depthMm: parseInt(e.target.value) })}
                className="w-full apple-slider"
              />
            </div>`,
    replace: `<DimensionSlider label={obj.type === 'interior_door' ? 'Wall Depth (Thickness)' : 'Wall Depth (Thickness)'} min={50} max={500} step={10} value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} onChange={(v) => updateObject(obj.id, { depthMm: v })} />`
  },
  {
    target: `            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">L-Return Length</span>
                <span className="text-xs font-mono text-gray-500">{obj.returnLengthMm || 0}mm</span>
              </div>
              <input 
                type="range" min="0" max="6000" step="10" 
                value={obj.returnLengthMm || 0} 
                onChange={(e) => updateObject(obj.id, { returnLengthMm: parseInt(e.target.value) })}
                className="w-full apple-slider"
              />
            </div>`,
    replace: `<DimensionSlider label="L-Return Length" min={0} max={6000} step={10} value={obj.returnLengthMm || 0} onChange={(v) => updateObject(obj.id, { returnLengthMm: v })} />`
  },
  {
    target: `                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Cutout Width</span>
                      <span className="text-xs font-mono text-gray-500">{obj.doorGapWidthMm || 800}mm</span>
                    </div>
                    <input 
                      type="range" min="500" max="2000" step="10" 
                      value={obj.doorGapWidthMm || 800} 
                      onChange={(e) => updateObject(obj.id, { doorGapWidthMm: parseInt(e.target.value) })}
                      className="w-full apple-slider"
                    />
                  </div>`,
    replace: `<DimensionSlider label="Cutout Width" min={500} max={2000} step={10} value={obj.doorGapWidthMm || 800} onChange={(v) => updateObject(obj.id, { doorGapWidthMm: v })} />`
  },
  {
    target: `                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Cutout Position</span>
                      <span className="text-xs font-mono text-gray-500">{obj.doorGapOffsetMm || 0}mm</span>
                    </div>
                    <input 
                      type="range" min={-(obj.widthMm||1000)/2} max={(obj.widthMm||1000)/2} step="10" 
                      value={obj.doorGapOffsetMm || 0} 
                      onChange={(e) => updateObject(obj.id, { doorGapOffsetMm: parseInt(e.target.value) })}
                      className="w-full apple-slider"
                    />
                  </div>`,
    replace: `<DimensionSlider label="Cutout Position" min={-(obj.widthMm||1000)/2} max={(obj.widthMm||1000)/2} step={10} value={obj.doorGapOffsetMm || 0} onChange={(v) => updateObject(obj.id, { doorGapOffsetMm: v })} />`
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
console.log('Replaced ' + changedCount + ' sliders in ObjectEditorPanel');
