import re

with open('src/utils/textures.ts', 'r') as f:
    content = f.read()

# Insert caches
if 'const claddingCache' not in content:
    content = content.replace("import * as THREE from 'three';", "import * as THREE from 'three';\n\nconst claddingCache = new Map<string, any>();\nconst noiseCache = new Map<string, any>();\nconst sedumCache = new Map<string, any>();\nconst floorCache = new Map<string, any>();\n")

# generateCladdingTextures
c1 = r"export function generateCladdingTextures\(claddingType: string, heightMeters: number\) \{"
r1 = """export function generateCladdingTextures(claddingType: string, heightMeters: number) {
  if (claddingCache.has(claddingType)) return claddingCache.get(claddingType);"""
content = re.sub(c1, r1, content)

# 2048 -> 1024 / 512
content = re.sub(r'canvas\.width = 2048;', 'canvas.width = 1024;', content)
content = re.sub(r'canvas\.height = 2048;', 'canvas.height = 1024;', content)
content = re.sub(r'bumpCanvas\.width = 2048;', 'bumpCanvas.width = 512;', content)
content = re.sub(r'bumpCanvas\.height = 2048;', 'bumpCanvas.height = 512;', content)
content = re.sub(r'roughnessCanvas\.width = 2048;', 'roughnessCanvas.width = 512;', content)
content = re.sub(r'roughnessCanvas\.height = 2048;', 'roughnessCanvas.height = 512;', content)

# Fix 2048 loops
content = content.replace("2048 / 1.0", "1024 / 1.0")
content = content.replace("2048 / heightMeters", "1024 / heightMeters")
content = content.replace("2048, 2048", "canvas.width, canvas.height")
content = content.replace("2048", "1024") # Any remaining 2048 -> 1024

# Loop counts
content = content.replace("for (let j = 0; j < 2400; j++)", "for (let j = 0; j < 240; j++)")
content = content.replace("for (let i = 0; i < 50000; i++)", "for (let i = 0; i < 5000; i++)")
content = content.replace("for (let i = 0; i < 20000; i++)", "for (let i = 0; i < 2000; i++)")
content = content.replace("for (let j = 0; j < 1000; j++)", "for (let j = 0; j < 100; j++)")
content = content.replace("for (let i = 0; i < 15000; i++)", "for (let i = 0; i < 1500; i++)")

# Cache return for cladding
content = content.replace("return { map, bumpMap, roughnessMap };", "const result = { map, bumpMap, roughnessMap };\n  claddingCache.set(claddingType, result);\n  return result;")

# generateNoiseTexture
c2 = r"export function generateNoiseTexture\(\) \{"
r2 = """export function generateNoiseTexture() {
  if (noiseCache.has('noise')) return noiseCache.get('noise');"""
content = re.sub(c2, r2, content)
content = content.replace("return texture;", "noiseCache.set('noise', texture);\n  return texture;", 1)

# generateSedumTexture
c3 = r"export function generateSedumTexture\(isNight: boolean\) \{"
r3 = """export function generateSedumTexture(isNight: boolean) {
  const key = isNight ? 'night' : 'day';
  if (sedumCache.has(key)) return sedumCache.get(key);"""
content = re.sub(c3, r3, content)
content = content.replace("return { map: texture, bumpMap: bumpTexture };", "const result = { map: texture, bumpMap: bumpTexture };\n  sedumCache.set(key, result);\n  return result;")

# generateInteriorFloorTexture
c4 = r"export function generateInteriorFloorTexture\(floorType: string\) \{"
r4 = """export function generateInteriorFloorTexture(floorType: string) {
  if (floorCache.has(floorType)) return floorCache.get(floorType);"""
content = re.sub(c4, r4, content)
content = content.replace("return { map, bumpMap };", "const result = { map, bumpMap };\n  floorCache.set(floorType, result);\n  return result;")

with open('src/utils/textures.ts', 'w') as f:
    f.write(content)
