const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

// We have several blocks looking like:
/*
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">Width</span>
                        <span className="text-xs font-mono text-gray-500">{door.widthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="800" max="6000" step="100" value={door.widthMm} onChange={(e) => wrap(store.updateDoor)(door.id, { widthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>
*/

// Or with text-xs on the flex wrapper. We can just replace the whole div manually.
const blocks = [
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">Width</span>
                        <span className="text-xs font-mono text-gray-500">{door.widthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="800" max="6000" step="100" value={door.widthMm} onChange={(e) => wrap(store.updateDoor)(door.id, { widthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Width" min={800} max={6000} step={100} value={door.widthMm} onChange={(v) => wrap(store.updateDoor)(door.id, { widthMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">Offset (Pos)</span>
                        <span className="text-xs font-mono text-gray-500">{door.offsetMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="-3000" max="3000" step="100" value={door.offsetMm} onChange={(e) => wrap(store.updateDoor)(door.id, { offsetMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Offset (Pos)" min={-3000} max={3000} step={100} value={door.offsetMm} onChange={(v) => wrap(store.updateDoor)(door.id, { offsetMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2 text-xs">
                        <span className="font-medium text-gray-700">Width</span>
                        <span className="font-mono text-gray-500">{win.widthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="400" max="6000" step="100" value={win.widthMm} onChange={(e) => updateWindow(win.id, { widthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Width" min={400} max={6000} step={100} value={win.widthMm} onChange={(v) => updateWindow(win.id, { widthMm: v })} />`
  },
  {
    target: `                        <div>
                          <div className="flex justify-between mb-2 text-xs">
                            <span className="font-medium text-gray-700">Height</span>
                            <span className="font-mono text-gray-500">{win.heightMm}mm</span>
                          </div>
                          <DeferredInput type="range" min="400" max="2500" step="100" value={win.heightMm} onChange={(e) => updateWindow(win.id, { heightMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                        </div>`,
    replace: `<DimensionSlider label="Height" min={400} max={2500} step={100} value={win.heightMm} onChange={(v) => updateWindow(win.id, { heightMm: v })} />`
  },
  {
    target: `                        <div>
                          <div className="flex justify-between mb-2 text-xs">
                            <span className="font-medium text-gray-700">Sill Height</span>
                            <span className="font-mono text-gray-500">{win.sillMm}mm</span>
                          </div>
                          <DeferredInput type="range" min="0" max="2000" step="100" value={win.sillMm} onChange={(e) => updateWindow(win.id, { sillMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                        </div>`,
    replace: `<DimensionSlider label="Sill Height" min={0} max={2000} step={100} value={win.sillMm} onChange={(v) => updateWindow(win.id, { sillMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2 text-xs">
                        <span className="font-medium text-gray-700">Offset Position</span>
                        <span className="font-mono text-gray-500">{win.offsetMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="-3000" max="3000" step="100" value={win.offsetMm} onChange={(e) => updateWindow(win.id, { offsetMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Offset Position" min={-3000} max={3000} step={100} value={win.offsetMm} onChange={(v) => updateWindow(win.id, { offsetMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2 text-xs">
                        <span className="font-medium text-gray-700">Length</span>
                        <span className="font-mono text-gray-500">{part.lengthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="400" max="6000" step="100" value={part.lengthMm} onChange={(e) => wrap(store.updatePartition)(part.id, { lengthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Length" min={400} max={6000} step={100} value={part.lengthMm} onChange={(v) => wrap(store.updatePartition)(part.id, { lengthMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2 text-xs">
                        <span className="font-medium text-gray-700">Width</span>
                        <span className="font-mono text-gray-500">{sky.widthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="400" max="3000" step="100" value={sky.widthMm} onChange={(e) => wrap(store.updateSkylight)(sky.id, { widthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Width" min={400} max={3000} step={100} value={sky.widthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { widthMm: v })} />`
  },
  {
    target: `                    <div>
                      <div className="flex justify-between mb-2 text-xs">
                        <span className="font-medium text-gray-700">Length</span>
                        <span className="font-mono text-gray-500">{sky.lengthMm}mm</span>
                      </div>
                      <DeferredInput type="range" min="400" max="3000" step="100" value={sky.lengthMm} onChange={(e) => wrap(store.updateSkylight)(sky.id, { lengthMm: parseInt(e.target.value) })} className="w-full apple-slider"/>
                    </div>`,
    replace: `<DimensionSlider label="Length" min={400} max={3000} step={100} value={sky.lengthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { lengthMm: v })} />`
  },
  {
    target: `                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-medium text-gray-600">Board Width</span>
                      <span className="text-xs font-mono text-[#3b4d4a]">{room.claddingWidthMm ?? 100}mm</span>
                    </div>
                    <DeferredInput
                      type="range"
                      min="50"
                      max="300"
                      step="5"
                      value={room.claddingWidthMm ?? 100}
                      onChange={(e) => updateRoom({ claddingWidthMm: parseInt(e.target.value) })}
                      className="w-full apple-slider"
                    />`,
    replace: `<DimensionSlider label="Board Width" min={50} max={300} step={5} value={room.claddingWidthMm ?? 100} onChange={(v) => updateRoom({ claddingWidthMm: v })} />`
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

fs.writeFileSync('src/components/Sidebar.tsx', file);
console.log('Replaced ' + changedCount + ' sliders');
