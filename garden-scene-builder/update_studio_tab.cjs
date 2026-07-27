const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

const t = `            <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-black/5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Previous Renders</h3>
              <div className="text-center py-8">
                <Box size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Your generated images will appear here</p>
              </div>
            </div>
          </div>
        )}`;

const r = `            <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-black/5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Previous Renders</h3>
              <div className="text-center py-8">
                <Box size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Your generated images will appear here</p>
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Developer Tools</h3>
              <ClaudeSketchUpPrompt />
            </div>
          </div>
        )}`;

if (file.includes(t)) {
  file = file.replace(t, r);
  fs.writeFileSync('src/components/Sidebar.tsx', file);
  console.log('Sidebar updated');
} else {
  console.log('Could not find Studio tab block');
}
