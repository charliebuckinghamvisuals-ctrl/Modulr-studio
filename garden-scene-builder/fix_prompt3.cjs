const fs = require('fs');
let file = fs.readFileSync('src/components/ClaudeSketchUpPrompt.tsx', 'utf8');

file = file.replace(
  '- Roof Type:',
  '- Wall Thickness: ${room.wallThicknessMm || 150} mm\\n- Roof Type:'
);

fs.writeFileSync('src/components/ClaudeSketchUpPrompt.tsx', file);
console.log('Prompt wall thickness updated');
