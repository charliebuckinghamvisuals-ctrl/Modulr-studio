import re

with open('src/store.ts', 'r') as f:
    content = f.read()

# 1. Add composite_wood and composite_black to claddingPrices in store.ts
# It's in initialState
content = content.replace(
    "claddingPrices: {",
    "claddingPrices: {\n      composite_wood: 180,\n      composite_black: 180,"
)

# 2. Fix calculatePrice to handle TShape and CornerCut
calc_price = """    let floorArea = w * d;
    let roofArea = w * d;
    if (room.hasCanopy) roofArea += (w * (room.canopySizeMm || 0) / 1000);
    let wallArea = (w * h * 2) + (d * h * 2);

    if (room.shape === 'LShape' && room.lShapeCutoutWidthMm && room.lShapeCutoutDepthMm) {
      const cutoutW = room.lShapeCutoutWidthMm / 1000;
      const cutoutD = room.lShapeCutoutDepthMm / 1000;
      const cutoutArea = cutoutW * cutoutD;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
    } else if (room.shape === 'TShape' && room.lShapeCutoutWidthMm && room.lShapeCutoutDepthMm) {
      const tCutW = room.lShapeCutoutWidthMm / 1000;
      const tCutD = room.lShapeCutoutDepthMm / 1000;
      const cutoutArea = tCutW * tCutD * 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      wallArea += (tCutD * h * 2);
    } else if (room.shape === 'CornerCut' && room.lShapeCutoutWidthMm) {
      const cutSize = room.lShapeCutoutWidthMm / 1000;
      const cutoutArea = (cutSize * cutSize) / 2;
      floorArea -= cutoutArea;
      roofArea -= cutoutArea;
      const diagonal = Math.sqrt(cutSize * cutSize * 2);
      wallArea = wallArea - (cutSize * 2 * h) + (diagonal * h);
    }"""

content = re.sub(
    r'    let floorArea = w \* d;.*?    }',
    calc_price,
    content,
    flags=re.DOTALL
)

with open('src/store.ts', 'w') as f:
    f.write(content)
