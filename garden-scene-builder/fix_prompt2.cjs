const fs = require('fs');
let file = fs.readFileSync('src/components/ClaudeSketchUpPrompt.tsx', 'utf8');

file = file.replace(
  "let prompt = `Write a Ruby script for SketchUp to generate a 3D model of a garden room with these specific dimensions and features. Keep the code clean, well-commented, and ready to run in the SketchUp Ruby Console. Group the main structures appropriately.",
  "let prompt = `Build me a 3D model of a garden room using SketchUp with these specific dimensions and features. Group the main structures appropriately."
);

fs.writeFileSync('src/components/ClaudeSketchUpPrompt.tsx', file);
console.log('Prompt intro updated');
