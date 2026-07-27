const fs = require('fs');
let file = fs.readFileSync('src/components/ClaudeSketchUpPrompt.tsx', 'utf8');

file = file.replace(
  "- Cladding style: ${room.cladding}",
  "- Cladding style: ${room.cladding}\\n- Cladding Width: ${room.claddingWidthMm || 100} mm"
);

fs.writeFileSync('src/components/ClaudeSketchUpPrompt.tsx', file);
console.log('Prompt cladding width updated');
