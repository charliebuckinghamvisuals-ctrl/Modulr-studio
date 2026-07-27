import re

with open('src/types.ts', 'r') as f:
    content = f.read()

# Remove the constants at the end
content = re.sub(r'export const CLADDING_PRICES:.*$', '', content, flags=re.DOTALL)

with open('src/types.ts', 'w') as f:
    f.write(content)
