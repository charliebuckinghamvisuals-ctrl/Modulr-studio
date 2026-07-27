const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

if (!file.includes('ClaudeSketchUpPrompt')) {
  file = file.replace("import { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';\nimport { ClaudeSketchUpPrompt } from './ClaudeSketchUpPrompt';");
  fs.writeFileSync('src/components/Sidebar.tsx', file);
}
