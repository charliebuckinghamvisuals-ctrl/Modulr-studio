import re

with open('src/components/CanvasArea.tsx', 'r') as f:
    content = f.read()

c1 = r"  const isComplete = !active && \(progress === 100 || progress === 0\) && minTimeElapsed;"
r1 = r"  const isComplete = minTimeElapsed;"

content = content.replace(c1, r1)

with open('src/components/CanvasArea.tsx', 'w') as f:
    f.write(content)
