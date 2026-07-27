const fs = require('fs');
let file = fs.readFileSync('src/components/ClaudeSketchUpPrompt.tsx', 'utf8');

file = file.replace(
  "let prompt = `Write a Ruby script for SketchUp to generate a 3D model of a garden room with these specific dimensions and features. Keep the code clean, well-commented, and ready to run in the SketchUp Ruby Console. Group the main structures appropriately.\\n\\nRoom Specifications:",
  "let prompt = `Build me a 3D model of a garden room using SketchUp with these specific dimensions and features. Group the main structures appropriately.\\n\\nRoom Specifications:"
);

file = file.replace(
  "prompt += `Please provide only the Ruby script in a code block. The script should use standard SketchUp API classes (Sketchup.active_model.entities) to draw these elements accurately in millimeters. Create materials with basic colors for the walls, glass, and frames.`;",
  ""
);

file = file.replace(
  "Generate a prompt to paste into Claude (or ChatGPT) to automatically write a SketchUp Ruby script that builds this exact room model.",
  "Generate a prompt to paste into Claude (or ChatGPT) to build this exact room model in SketchUp."
);

fs.writeFileSync('src/components/ClaudeSketchUpPrompt.tsx', file);
console.log('Prompt updated');
