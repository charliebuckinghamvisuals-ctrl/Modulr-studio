import re

with open('src/components/Sidebar.tsx', 'r') as f:
    content = f.read()

# 1. Import useShallow and change useStore
content = content.replace(
    "import { useStore } from '../store';",
    "import { useStore } from '../store';\nimport { useShallow } from 'zustand/react/shallow';"
)

content = content.replace(
    "const { scene, updateRoom, updateDoor, addWindow, updateWindow, removeWindow, toggleTime, viewMode, areDoorsOpen, toggleDoors } = useStore();",
    """const { room, updateRoom, updateDoor, addWindow, updateWindow, removeWindow, toggleTime, viewMode, areDoorsOpen, toggleDoors } = useStore(useShallow(s => ({
    room: s.scene.room,
    updateRoom: s.updateRoom,
    updateDoor: s.updateDoor,
    addWindow: s.addWindow,
    updateWindow: s.updateWindow,
    removeWindow: s.removeWindow,
    toggleTime: s.toggleTime,
    viewMode: s.viewMode,
    areDoorsOpen: s.areDoorsOpen,
    toggleDoors: s.toggleDoors
  })));"""
)

# 2. Add DeferredInput component at the top
deferred_input = """import React, { useState, useEffect } from 'react';

function DeferredInput({ type, value, onChange, className, ...props }: any) {
  const [localValue, setLocalValue] = useState(value);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commit = () => {
    if (localValue !== value) {
      onChange({ target: { value: localValue } });
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onPointerUp={type === 'range' ? commit : undefined}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={className}
      {...props}
    />
  );
}

"""
content = content.replace("export function Sidebar() {", deferred_input + "export function Sidebar() {")

# 3. Replace <input type="range" and <input type="number" with <DeferredInput
# We need to make sure we don't break self-closing tags.
content = re.sub(r'<input(\s+type="(?:range|number)")', r'<DeferredInput\1', content)

# 4. Replace scene.room with room
content = content.replace("scene.room", "room")

with open('src/components/Sidebar.tsx', 'w') as f:
    f.write(content)
