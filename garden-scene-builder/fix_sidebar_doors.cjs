const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

const t = `<button onClick={(e) => wrap(store.updateInteriorDoor)(door.id, { rotation: door.rotation === 0 ? 90 : 0 })} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors bg-blue-50 px-2 py-1 rounded">
                          Rotate 90°
                        </button>
                      </div>
                    </div>`;

const r = `<button onClick={(e) => wrap(store.updateInteriorDoor)(door.id, { rotation: door.rotation === 0 ? 90 : 0 })} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors bg-blue-50 px-2 py-1 rounded">
                          Rotate 90°
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Width (mm)</label>
                          <input type="number" value={door.widthMm} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { widthMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Height (mm)</label>
                          <input type="number" value={door.heightMm} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { heightMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">X Position (mm)</label>
                          <input type="number" value={Math.round(door.xMm)} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { xMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Z Position (mm)</label>
                          <input type="number" value={Math.round(door.zMm)} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { zMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      
                    </div>`;

if (file.includes(t)) {
  file = file.replace(t, r);
  fs.writeFileSync('src/components/Sidebar.tsx', file);
  console.log('Sidebar doors updated');
} else {
  console.log('Could not find sidebar door block');
}
