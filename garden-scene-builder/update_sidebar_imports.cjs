const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
file = file.replace(
  "import { ClaudeSketchUpPrompt } from './ClaudeSketchUpPrompt';",
  "import { ClaudeSketchUpPrompt } from './ClaudeSketchUpPrompt';\nimport { DimensionSlider } from './DimensionSlider';"
);
fs.writeFileSync('src/components/Sidebar.tsx', file);
