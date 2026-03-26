import fs from 'fs';

const content = fs.readFileSync('server.js', 'utf8');
const normalised = content.replace(/\r\n/g, '\n');

const oldStr = `      3. If a component (like decking or doors) is not visible in that specific angle, return "none".
      
      Return a JSON array where each object corresponds to an image in the exact order they were provided.`;

const newStr = `      3. DECKING/GROUND: ONLY return a value if a clearly visible raised deck, paved patio, or path is directly in front of the building. If the ground is simply grass, return 'none'.
      4. DOORS - CRITICAL: Describe the EXACT glazing zone on every visible door:
         - If glass is ONLY on the top half and bottom is solid: write "top-half glazed, bottom solid panel".
         - If the door is fully glazed top to bottom: write "full-height glazed".
         - Always include: material, colour, door style and the glazing zone.
         - Example: "Anthracite grey aluminium composite door, top-half glazed, bottom solid panel".
      5. If a component is not visible in that specific angle, return "none".
      
      Return a JSON array where each object corresponds to an image in the exact order they were provided.`;

if (!normalised.includes(oldStr)) {
  console.error('NOT FOUND - old string missing from file');
  process.exit(1);
}

const updated = normalised.replace(oldStr, newStr);
fs.writeFileSync('server.js', updated, 'utf8');
console.log('SUCCESS - batch prompt updated');
