import re

with open('src/components/CanvasArea.tsx', 'r') as f:
    content = f.read()

c1 = r"  const isComplete = minTimeElapsed;"
r1 = r"  // Fallback: if minTimeElapsed (4.2s) and either progress is done OR it's been over 8s, force complete\n  const [forceComplete, setForceComplete] = useState(false);\n  useEffect(() => {\n    const timer = setTimeout(() => setForceComplete(true), 8000);\n    return () => clearTimeout(timer);\n  }, []);\n  const isComplete = (!active && progress === 100 && minTimeElapsed) || forceComplete;"

content = content.replace(c1, r1)

with open('src/components/CanvasArea.tsx', 'w') as f:
    f.write(content)
