import * as THREE from 'three';

const claddingCache = new Map<string, any>();
const noiseCache = new Map<string, any>();
const sedumCache = new Map<string, any>();
const floorCache = new Map<string, any>();


export function generateCladdingTextures(claddingType: string, heightMeters: number) {
  if (claddingCache.has(claddingType)) return claddingCache.get(claddingType);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = 512;
  roughnessCanvas.height = 512;
  const roughCtx = roughnessCanvas.getContext('2d')!;

  // Base colors
  let baseColor = '#a67b5b';
  let isWood = true;
  let isRender = false;
  let grooveColor = '#222';
  let plankColor = '#a67b5b';
  let highlightColor = '#c19672';
  let shadowColor = '#815632';

  if (claddingType === 'composite_grey') {
    isWood = false;
    baseColor = '#545a5e';
    plankColor = '#545a5e';
    highlightColor = '#656b6f';
    shadowColor = '#43494d';
    grooveColor = '#111';
  } else if (claddingType === 'composite_brown') {
    isWood = false;
    baseColor = '#4b3224';
    plankColor = '#4b3224';
    highlightColor = '#5e4334';
    shadowColor = '#3a2114';
    grooveColor = '#0b0b0b';
  } else if (claddingType === 'composite_wood') {
    // Realistic wood grain composite
    isWood = true; // Use wood grain generation
    baseColor = '#a07446';
    plankColor = '#a07446';
    highlightColor = '#c18f5e';
    shadowColor = '#6b4d2e';
    grooveColor = '#1a120b';
  } else if (claddingType === 'composite_black') {
    // Flat smooth material
    isWood = false;
    baseColor = '#1c1c1c';
    plankColor = '#222222';
    highlightColor = '#2a2a2a';
    shadowColor = '#1a1a1a';
    grooveColor = '#0a0a0a';
  } else if (claddingType === 'charred_wood') {
    isWood = true;
    baseColor = '#1a1a1a';
    plankColor = '#1f1e1c';
    highlightColor = '#2a2825';
    shadowColor = '#0a0a0a';
    grooveColor = '#050505';
  } else if (claddingType === 'oak' || claddingType === 'timber' || claddingType === 'timber_decking') {
    isWood = true;
    baseColor = '#a3794a';
    plankColor = '#a3794a';
    highlightColor = '#c49a6c';
    shadowColor = '#6b4c2a';
    grooveColor = '#2b1d0f';
  } else if (claddingType === 'cedar') {
    isWood = true;
    baseColor = '#975d41';
    plankColor = '#975d41';
    highlightColor = '#b5785a';
    shadowColor = '#7a4228';
    grooveColor = '#2a1a11';
  } else if (claddingType === 'render_white') {
    isWood = false;
    isRender = true;
    baseColor = '#f0ebd8';
    plankColor = '#f4efe0';
    highlightColor = '#fffdf5';
    shadowColor = '#d9d3c1';
    grooveColor = '#f0ebd8'; 
  } else if (claddingType === 'box_metal_grey') {
    isWood = false;
    baseColor = '#4a4d50';
    plankColor = '#4a4d50';
    highlightColor = '#606468';
    shadowColor = '#35383a';
    grooveColor = '#222';
  } else if (claddingType === 'box_metal_black') {
    isWood = false;
    baseColor = '#1c1e1f';
    plankColor = '#1c1e1f';
    highlightColor = '#2e3133';
    shadowColor = '#0a0b0c';
    grooveColor = '#000';
  } else if (claddingType === 'corrugated_metal') {
    isWood = false;
    baseColor = '#808285';
    plankColor = '#808285';
    highlightColor = '#9ea0a3';
    shadowColor = '#5e6063';
    grooveColor = '#333';
  } else if (claddingType === 'fire_board_grey') {
    isWood = false;
    isRender = true; 
    baseColor = '#8c9298';
    plankColor = '#8c9298';
    highlightColor = '#a2a7ab';
    shadowColor = '#6e7276';
    grooveColor = '#555';
  }

  // Determine number of boards based on height and width
  // But wait, the function takes widthMm now? Wait, no, it takes heightMeters.
  // Actually I need to add boardWidth to the parameters if we want customizable board widths.
  const numBoards = isRender ? 1 : 16;
  const boardHeight = 1024 / numBoards;

  ctx.fillStyle = grooveColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  bumpCtx.fillStyle = '#000000'; // Groove is low
  bumpCtx.fillRect(0, 0, canvas.width, canvas.height);
  
  roughCtx.fillStyle = '#ffffff'; // Groove is fully rough
  roughCtx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < numBoards; i++) {
    const y = i * boardHeight;
    const grooveHeight = isRender ? 0 : (isWood ? 4 : 8); 
    const plankH = boardHeight - grooveHeight;
    
    // Slight color variation per board
    const variation = isWood ? (Math.random() * 0.1 - 0.05) : (Math.random() * 0.02 - 0.01);
    ctx.globalAlpha = 1.0;
    
    // Add gradient for curvature/depth
    const grad = ctx.createLinearGradient(0, y, 0, y + plankH);
    if (isRender) {
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(0.5, plankColor);
        grad.addColorStop(1, shadowColor);
    } else if (isWood) {
        grad.addColorStop(0, plankColor);
        grad.addColorStop(0.5, shadowColor);
        grad.addColorStop(1, plankColor);
    } else {
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(0.5, plankColor);
        grad.addColorStop(1, shadowColor);
    }
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, plankH);
    
    bumpCtx.fillStyle = isRender ? '#888888' : '#ffffff'; 
    bumpCtx.fillRect(0, y, 1024, plankH);
    
    // Base roughness
    roughCtx.fillStyle = isWood ? '#aaaaaa' : '#cccccc'; // Wood is moderately rough, composite a bit rougher
    roughCtx.fillRect(0, y, 1024, plankH);

    // Add noise/grain
    if (isWood) {
        // Wood grain
        ctx.fillStyle = shadowColor;
        for (let j = 0; j < 240; j++) {
            ctx.globalAlpha = Math.random() * 0.15;
            const x1 = Math.random() * 1024;
            const y1 = y + Math.random() * plankH;
            const length = Math.random() * 200 + 50;
            const width = Math.random() * 4 + 2;
            ctx.fillRect(x1, y1, length, width);
            
            // bump grain
            bumpCtx.fillStyle = Math.random() > 0.5 ? '#cccccc' : '#eeeeee';
            bumpCtx.fillRect(x1, y1, length, width);
            
            // roughness variation
            roughCtx.fillStyle = Math.random() > 0.5 ? '#888888' : '#bbbbbb';
            roughCtx.fillRect(x1, y1, length, width);
            
            ctx.fillStyle = shadowColor;
        }
        
        ctx.fillStyle = highlightColor;
        for (let j = 0; j < 1200; j++) {
            ctx.globalAlpha = Math.random() * 0.1;
            const x1 = Math.random() * 1024;
            const y1 = y + Math.random() * plankH;
            const length = Math.random() * 100 + 20;
            ctx.fillRect(x1, y1, length, 3);
        }
    } else if (isRender) {
        // Render noise (stucco)
        ctx.fillStyle = shadowColor;
        for (let j = 0; j < 50000; j++) {
            const xr = Math.random() * 1024;
            const yr = y + Math.random() * plankH;
            if (Math.random() > 0.5) {
               ctx.fillStyle = shadowColor;
               bumpCtx.fillStyle = '#666';
            } else {
               ctx.fillStyle = highlightColor;
               bumpCtx.fillStyle = '#aaa';
            }
            ctx.globalAlpha = Math.random() * 0.15;
            bumpCtx.globalAlpha = Math.random() * 0.5;
            ctx.fillRect(xr, yr, 2, 2);
            bumpCtx.fillRect(xr, yr, 2, 2);
            roughCtx.fillStyle = '#ffffff';
            roughCtx.globalAlpha = 0.8;
            roughCtx.fillRect(xr, yr, 2, 2);
        }
    } else {
        // Composite noise
        ctx.fillStyle = shadowColor;
        for (let j = 0; j < 3000; j++) {
            ctx.globalAlpha = Math.random() * 0.1;
            const x1 = Math.random() * 1024;
            const y1 = y + Math.random() * plankH;
            ctx.fillRect(x1, y1, 3, 1);
        }
    }
    
    if (!isRender) {
      // Edge highlights
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = highlightColor;
      ctx.fillRect(0, y, 1024, 2);
      ctx.fillStyle = shadowColor;
      ctx.fillRect(0, y + plankH - 2, 1024, 2);
      
      // Bump edge gradients (soft rounding)
      bumpCtx.globalAlpha = 1.0;
      bumpCtx.fillStyle = '#aaaaaa';
      bumpCtx.fillRect(0, y, 1024, 2);
      bumpCtx.fillRect(0, y + plankH - 2, 1024, 2);
    }
  }

  const repeatCount = isRender ? 4 : (heightMeters * 10) / numBoards;

  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = 16;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(isRender ? 4 : 1, repeatCount);
  map.anisotropy = 4;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 16;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.wrapS = THREE.MirroredRepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(isRender ? 4 : 1, repeatCount);
  bumpMap.anisotropy = 4;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  roughnessMap.anisotropy = 16;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.wrapS = THREE.MirroredRepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(isRender ? 4 : 1, repeatCount);
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  const result = { map, bumpMap, roughnessMap };
  claddingCache.set(claddingType, result);
  return result;
}

export function generateNoiseTexture(intensity: number = 0.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const val = 255 - (Math.random() * 255 * intensity);
    data[i] = val;     // red
    data[i + 1] = val; // green
    data[i + 2] = val; // blue
    data[i + 3] = 255; // alpha
  }
  
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.needsUpdate = true;
  noiseCache.set('noise', texture);
  return texture;
}

export function generateGrassTexture(isNight: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const baseGreen = isNight ? '#0a1d10' : '#4f7556';
  const lightGreen = isNight ? 'rgba(23, 48, 28, 0.4)' : 'rgba(93, 122, 100, 0.4)';
  const darkGreen = isNight ? 'rgba(10, 20, 15, 0.4)' : 'rgba(56, 85, 66, 0.4)';

  ctx.fillStyle = baseGreen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add noise and blades
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const isLight = Math.random() > 0.5;
    ctx.fillStyle = isLight ? lightGreen : darkGreen;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 8, y - Math.random() * 12);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function generateSedumTexture(isNight: boolean) {
  const key = isNight ? 'night' : 'day';
  if (sedumCache.has(key)) return sedumCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  const baseGreen = isNight ? '#0a0d08' : '#223018';
  const lightGreen = isNight ? 'rgba(25, 35, 18, 0.8)' : 'rgba(54, 76, 38, 0.9)';
  const reddish = isNight ? 'rgba(30, 15, 10, 0.6)' : 'rgba(90, 45, 30, 0.7)';
  const darkBrown = isNight ? 'rgba(15, 10, 5, 0.8)' : 'rgba(30, 20, 10, 0.9)';
  const brightGreen = isNight ? 'rgba(15, 30, 8, 0.6)' : 'rgba(70, 95, 30, 0.8)';

  ctx.fillStyle = baseGreen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  bumpCtx.fillStyle = '#111111';
  bumpCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Clusters of sedum plants
  for (let c = 0; c < 200; c++) {
    const cx = Math.random() * 1024;
    const cy = Math.random() * 1024;
    const clusterSize = Math.random() * 30 + 20;
    
    for (let i = 0; i < clusterSize; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 30;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      
      const r = Math.random();
      let color = '';
      let bumpColor = '';
      if (r < 0.4) { color = lightGreen; bumpColor = '#888888'; }
      else if (r < 0.7) { color = brightGreen; bumpColor = '#aaaaaa'; }
      else if (r < 0.9) { color = reddish; bumpColor = '#ffffff'; }
      else { color = darkBrown; bumpColor = '#444444'; }
      
      ctx.fillStyle = color;
      bumpCtx.fillStyle = bumpColor;
      
      const radiusX = Math.random() * 4 + 2;
      const radiusY = Math.random() * 4 + 2;
      
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      
      bumpCtx.beginPath();
      bumpCtx.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
      bumpCtx.fill();
    }
  }

  // Scatter filler
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = Math.random();
    
    let color = '';
    let bumpColor = '';
    if (r < 0.3) { color = lightGreen; bumpColor = '#777777'; }
    else if (r < 0.6) { color = brightGreen; bumpColor = '#999999'; }
    else if (r < 0.8) { color = reddish; bumpColor = '#dddddd'; }
    else { color = darkBrown; bumpColor = '#333333'; }
    
    ctx.fillStyle = color;
    bumpCtx.fillStyle = bumpColor;
    
    const radiusX = Math.random() * 3 + 1.5;
    const radiusY = Math.random() * 3 + 1.5;
    
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    
    bumpCtx.beginPath();
    bumpCtx.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
    bumpCtx.fill();
  }
  
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const isLight = Math.random() > 0.5;
    ctx.fillStyle = isLight ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.needsUpdate = true;
  
  const result = { map: texture, bumpMap: bumpTexture };
  sedumCache.set(key, result);
  return result;
}

export function generateInteriorFloorTexture(floorType: string) {
  if (floorCache.has(floorType)) return floorCache.get(floorType);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bumpCtx = bumpCanvas.getContext('2d')!;

  if (floorType === 'oak' || floorType === 'pine' || floorType === 'walnut' || floorType === 'cherry') {
    // Wood Planks
    const numPlanks = 8;
    const plankW = 1024 / numPlanks;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bumpCtx.fillStyle = '#000';
    bumpCtx.fillRect(0, 0, canvas.width, canvas.height);

    let baseColor = '#a3794a';
    let grainColor = '#6b4c2a';

    if (floorType === 'pine') {
      baseColor = '#d9b982';
      grainColor = '#b5925a';
    } else if (floorType === 'walnut') {
      baseColor = '#4a3219';
      grainColor = '#2b1d0e';
    } else if (floorType === 'cherry') {
      baseColor = '#803422';
      grainColor = '#52190d';
    }

    for (let i = 0; i < numPlanks; i++) {
        const x = i * plankW;
        const width = plankW - 4;

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, 0, width, 1024);
        
        bumpCtx.fillStyle = '#fff';
        bumpCtx.fillRect(x, 0, width, 1024);

        // grain
        ctx.fillStyle = grainColor;
        for (let j = 0; j < 100; j++) {
            ctx.globalAlpha = Math.random() * 0.1;
            const y1 = Math.random() * 1024;
            const x1 = x + Math.random() * width;
            const h = Math.random() * 100 + 20;
            const w = Math.random() * 2 + 1;
            ctx.fillRect(x1, y1, w, h);
            bumpCtx.fillStyle = Math.random() > 0.5 ? '#e0e0e0' : '#ffffff';
            bumpCtx.fillRect(x1, y1, w, h);
        }
    }
  } else if (floorType === 'tiles') {
    // Tiles (Square)
    const gridSize = 4;
    const tileSize = 1024 / gridSize;
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bumpCtx.fillStyle = '#000';
    bumpCtx.fillRect(0, 0, canvas.width, canvas.height);

    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            const gx = x * tileSize;
            const gy = y * tileSize;
            const grout = 8;
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#eceff1'; // Light grey marble-ish
            ctx.fillRect(gx + grout/2, gy + grout/2, tileSize - grout, tileSize - grout);
            bumpCtx.fillStyle = '#fff';
            bumpCtx.fillRect(gx + grout/2, gy + grout/2, tileSize - grout, tileSize - grout);
            
            // noise
            ctx.fillStyle = '#000';
            for (let j = 0; j < 500; j++) {
               ctx.globalAlpha = Math.random() * 0.05;
               ctx.fillRect(gx + Math.random() * tileSize, gy + Math.random() * tileSize, 2, 2);
            }
        }
    }
  } else if (floorType === 'carpet') {
    // Carpet (beige / light grey)
    ctx.fillStyle = '#e0cfb8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bumpCtx.fillStyle = '#fff';
    bumpCtx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#cbae8e';
    bumpCtx.fillStyle = '#888';
    for (let i = 0; i < 5000; i++) {
        ctx.globalAlpha = Math.random() * 0.4;
        const x = Math.random() * 1024;
        const y = Math.random() * 1024;
        ctx.fillRect(x, y, 2, 2);
        bumpCtx.globalAlpha = Math.random();
        bumpCtx.fillRect(x, y, 2, 2);
    }
  } else {
    // Concrete
    ctx.fillStyle = '#9e9e9e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bumpCtx.fillStyle = '#fff';
    bumpCtx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000';
    bumpCtx.fillStyle = '#aaa';
    for (let i = 0; i < 2000; i++) {
        ctx.globalAlpha = Math.random() * 0.05;
        const x = Math.random() * 1024;
        const y = Math.random() * 1024;
        const s = Math.random() * 10 + 2;
        ctx.fillRect(x, y, s, s);
        bumpCtx.globalAlpha = Math.random() * 0.2;
        bumpCtx.fillRect(x, y, s, s);
    }
  }

  ctx.globalAlpha = 1.0;
  bumpCtx.globalAlpha = 1.0;

  const map = new THREE.CanvasTexture(canvas);
  map.anisotropy = 16;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = 16;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.wrapS = THREE.MirroredRepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  const result = { map, bumpMap };
  floorCache.set(floorType, result);
  return result;
}
