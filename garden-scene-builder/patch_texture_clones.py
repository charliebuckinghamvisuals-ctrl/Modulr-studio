import re

with open('src/components/3d/RoomGeometry.tsx', 'r') as f:
    content = f.read()

# 1. useCladdingTextures
# Actually useCladdingTextures is already cloning inside a useMemo based on widthMm and orientation.
# So it ONLY clones when widthMm or orientation changes, NOT on every render!
# Why did the prompt say it allocates new GPU uploads each time?
# Because `m.needsUpdate = true` forces a GPU upload!
# If we change `m.needsUpdate = true;` to NOT be there, it shares the GPU texture.
# Wait, if we clone it, we only need to set `needsUpdate = true` once, or not at all?
# Three.js CanvasTexture clone() might copy the needsUpdate flag?
# Actually, setting `needsUpdate = true` forces an upload.
# Let's remove `m.needsUpdate = true;` from configureMap.
content = content.replace("m.needsUpdate = true;", "")

# Wait, sedumTexture
c1 = r"""  const sedumTexture = useMemo\(\(\) => \{
    const tex = \{
      map: baseSedumMaps\.map\.clone\(\),
      bumpMap: baseSedumMaps\.bumpMap\.clone\(\)
    \};
    tex\.map\.repeat\.set\(Math\.max\(2, w\), Math\.max\(2, d\)\);
    tex\.map\.needsUpdate = true;
    tex\.bumpMap\.repeat\.set\(Math\.max\(2, w\), Math\.max\(2, d\)\);
    tex\.bumpMap\.needsUpdate = true;
    return tex;
  \}, \[baseSedumMaps, w, d\]\);"""

r1 = """  const sedumTexture = useMemo(() => {
    return {
      map: baseSedumMaps.map.clone(),
      bumpMap: baseSedumMaps.bumpMap.clone()
    };
  }, [baseSedumMaps]);
  
  useMemo(() => {
    sedumTexture.map.repeat.set(Math.max(2, w), Math.max(2, d));
    sedumTexture.bumpMap.repeat.set(Math.max(2, w), Math.max(2, d));
  }, [sedumTexture, w, d]);"""

content = re.sub(c1, r1, content)

# floorTexture
c2 = r"""  const \{ map: floorMap, bumpMap: floorBumpMap \} = useMemo\(\(\) => \{
    const maps = \{
      map: baseFloorMaps\.map\.clone\(\),
      bumpMap: baseFloorMaps\.bumpMap\.clone\(\)
    \};
    maps\.map\.repeat\.set\(w \* 0\.5, d \* 0\.5\);
    maps\.map\.needsUpdate = true;
    maps\.bumpMap\.repeat\.set\(w \* 0\.5, d \* 0\.5\);
    maps\.bumpMap\.needsUpdate = true;
    return maps;
  \}, \[baseFloorMaps, w, d\]\);"""

r2 = """  const floorMaps = useMemo(() => {
    return {
      map: baseFloorMaps.map.clone(),
      bumpMap: baseFloorMaps.bumpMap.clone()
    };
  }, [baseFloorMaps]);
  
  useMemo(() => {
    floorMaps.map.repeat.set(w * 0.5, d * 0.5);
    floorMaps.bumpMap.repeat.set(w * 0.5, d * 0.5);
  }, [floorMaps, w, d]);
  
  const { map: floorMap, bumpMap: floorBumpMap } = floorMaps;"""

content = re.sub(c2, r2, content)

with open('src/components/3d/RoomGeometry.tsx', 'w') as f:
    f.write(content)
