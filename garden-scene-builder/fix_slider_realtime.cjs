const fs = require('fs');
let file = fs.readFileSync('src/components/DimensionSlider.tsx', 'utf8');

const oldSlider = `<input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onPointerUp={(e) => commit(e.currentTarget.value)}
        className="w-full apple-slider"
      />`;

const newSlider = `<input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          const num = parseInt(e.target.value) || 0;
          if (num !== value) onChange(num);
        }}
        className="w-full apple-slider"
      />`;

file = file.replace(oldSlider, newSlider);
fs.writeFileSync('src/components/DimensionSlider.tsx', file);
console.log('DimensionSlider updated to real-time');
