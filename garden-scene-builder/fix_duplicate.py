import re

with open('src/store.ts', 'r') as f:
    content = f.read()

# Remove the duplicated keys:
content = content.replace(
    "composite_wood: 180,\n      composite_black: 180,\n      composite_wood: 180,\n      composite_black: 180,",
    "composite_wood: 180,\n      composite_black: 180,"
)

with open('src/store.ts', 'w') as f:
    f.write(content)
