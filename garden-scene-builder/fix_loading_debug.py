import re

with open('src/components/CanvasArea.tsx', 'r') as f:
    content = f.read()

c2 = r"          <span>\{Math\.round\(displayProgress\)\}%</span>"
r2 = r"          <span>{Math.round(displayProgress)}% ({active?'active':'inactive'} p:{Math.round(progress)})</span>"

content = content.replace(c2, r2)

with open('src/components/CanvasArea.tsx', 'w') as f:
    f.write(content)
