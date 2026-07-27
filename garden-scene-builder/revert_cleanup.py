import re

with open('src/components/3d/RoomGeometry.tsx', 'r') as f:
    content = f.read()

# Remove the useEffects that dispose textures
content = re.sub(r'  useEffect\(\(\) => \{\n    return \(\) => \{\n      clonedMaps\.map\.dispose\(\);\n      clonedMaps\.bumpMap\.dispose\(\);\n      clonedMaps\.roughnessMap\.dispose\(\);\n    \};\n  \}, \[clonedMaps\]\);\n', '', content)

content = re.sub(r'  useEffect\(\(\) => \{\n    return \(\) => \{\n      sedumTexture\.map\.dispose\(\);\n      sedumTexture\.bumpMap\.dispose\(\);\n    \};\n  \}, \[sedumTexture\]\);\n', '', content)

content = re.sub(r'  useEffect\(\(\) => \{\n    return \(\) => \{\n      floorMaps\.map\.dispose\(\);\n      floorMaps\.bumpMap\.dispose\(\);\n    \};\n  \}, \[floorMaps\]\);\n', '', content)

with open('src/components/3d/RoomGeometry.tsx', 'w') as f:
    f.write(content)
