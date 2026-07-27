import re

with open('src/components/3d/RoomGeometry.tsx', 'r') as f:
    content = f.read()

# 1. useCladdingTextures
c1 = r"""  return useMemo\(\(\) => \{
    const maps = \{
        map: baseMaps\.map\.clone\(\),
        bumpMap: baseMaps\.bumpMap\.clone\(\),
        roughnessMap: baseMaps\.roughnessMap\.clone\(\) 
    \};

    const numBoards = 16;
    const boardW = \(widthMm \?\? 100\) / 1000;
    const texTotalWidth = numBoards \* boardW;
    
    // Y represents the direction across the boards
    const yRepeat = 1 / texTotalWidth; 
    // X represents the direction along the length of the boards
    const xRepeat = 1 / 4; 

    const isVert = orientation === 'vertical';
    const rotation = isVert \? Math\.PI / 2 : 0;

    const configureMap = \(m: THREE\.Texture\) => \{
        // We ALWAYS scale X by xRepeat and Y by yRepeat, because the rotation
        // will automatically align these scaled axes to the world correctly\.
        m\.repeat\.set\(xRepeat, yRepeat\);
        m\.center\.set\(0\.5, 0\.5\);
        m\.rotation = rotation;
        
    \};

    configureMap\(maps\.map\);
    configureMap\(maps\.bumpMap\);
    configureMap\(maps\.roughnessMap\);

    return maps;
  \}, \[baseMaps, orientation, widthMm\]\);"""

r1 = """  const clonedMaps = useMemo(() => {
    const maps = {
        map: baseMaps.map.clone(),
        bumpMap: baseMaps.bumpMap.clone(),
        roughnessMap: baseMaps.roughnessMap.clone() 
    };

    const numBoards = 16;
    const boardW = (widthMm ?? 100) / 1000;
    const texTotalWidth = numBoards * boardW;
    
    const yRepeat = 1 / texTotalWidth; 
    const xRepeat = 1 / 4; 

    const isVert = orientation === 'vertical';
    const rotation = isVert ? Math.PI / 2 : 0;

    const configureMap = (m: THREE.Texture) => {
        m.repeat.set(xRepeat, yRepeat);
        m.center.set(0.5, 0.5);
        m.rotation = rotation;
    };

    configureMap(maps.map);
    configureMap(maps.bumpMap);
    configureMap(maps.roughnessMap);

    return maps;
  }, [baseMaps, orientation, widthMm]);
  
  useEffect(() => {
    return () => {
      clonedMaps.map.dispose();
      clonedMaps.bumpMap.dispose();
      clonedMaps.roughnessMap.dispose();
    };
  }, [clonedMaps]);
  
  return clonedMaps;"""

content = re.sub(c1, r1, content)

# 2. sedumTexture
c2 = r"""  const sedumTexture = useMemo\(\(\) => \{
    return \{
      map: baseSedumMaps\.map\.clone\(\),
      bumpMap: baseSedumMaps\.bumpMap\.clone\(\)
    \};
  \}, \[baseSedumMaps\]\);
  
  useMemo\(\(\) => \{
    sedumTexture\.map\.repeat\.set\(Math\.max\(2, w\), Math\.max\(2, d\)\);
    sedumTexture\.bumpMap\.repeat\.set\(Math\.max\(2, w\), Math\.max\(2, d\)\);
  \}, \[sedumTexture, w, d\]\);"""

r2 = """  const sedumTexture = useMemo(() => {
    return {
      map: baseSedumMaps.map.clone(),
      bumpMap: baseSedumMaps.bumpMap.clone()
    };
  }, [baseSedumMaps]);
  
  useEffect(() => {
    return () => {
      sedumTexture.map.dispose();
      sedumTexture.bumpMap.dispose();
    };
  }, [sedumTexture]);
  
  useMemo(() => {
    sedumTexture.map.repeat.set(Math.max(2, w), Math.max(2, d));
    sedumTexture.bumpMap.repeat.set(Math.max(2, w), Math.max(2, d));
  }, [sedumTexture, w, d]);"""

content = re.sub(c2, r2, content)

# 3. floorMaps
c3 = r"""  const floorMaps = useMemo\(\(\) => \{
    return \{
      map: baseFloorMaps\.map\.clone\(\),
      bumpMap: baseFloorMaps\.bumpMap\.clone\(\)
    \};
  \}, \[baseFloorMaps\]\);
  
  useMemo\(\(\) => \{
    floorMaps\.map\.repeat\.set\(w \* 0\.5, d \* 0\.5\);
    floorMaps\.bumpMap\.repeat\.set\(w \* 0\.5, d \* 0\.5\);
  \}, \[floorMaps, w, d\]\);"""

r3 = """  const floorMaps = useMemo(() => {
    return {
      map: baseFloorMaps.map.clone(),
      bumpMap: baseFloorMaps.bumpMap.clone()
    };
  }, [baseFloorMaps]);
  
  useEffect(() => {
    return () => {
      floorMaps.map.dispose();
      floorMaps.bumpMap.dispose();
    };
  }, [floorMaps]);
  
  useMemo(() => {
    floorMaps.map.repeat.set(w * 0.5, d * 0.5);
    floorMaps.bumpMap.repeat.set(w * 0.5, d * 0.5);
  }, [floorMaps, w, d]);"""

content = re.sub(c3, r3, content)

with open('src/components/3d/RoomGeometry.tsx', 'w') as f:
    f.write(content)
