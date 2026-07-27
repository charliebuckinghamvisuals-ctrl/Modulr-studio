import re

with open('src/components/3d/MainScene.tsx', 'r') as f:
    ms_content = f.read()
ms_content = ms_content.replace(
    "import { useStore } from '../../store';",
    "import { useStore } from '../../store';\nimport { useShallow } from 'zustand/react/shallow';"
)
ms_content = ms_content.replace(
    "const { scene, viewMode, addObject, setSelectedObjectId, setSelectedElementId, controlsEnabled, renderTransform } = useStore();",
    """const { viewMode, addObject, setSelectedObjectId, setSelectedElementId, controlsEnabled, renderTransform } = useStore(useShallow(s => ({
    viewMode: s.viewMode,
    addObject: s.addObject,
    setSelectedObjectId: s.setSelectedObjectId,
    setSelectedElementId: s.setSelectedElementId,
    controlsEnabled: s.controlsEnabled,
    renderTransform: s.renderTransform
  })));"""
)
ms_content = ms_content.replace(
    "<RoomGeometry room={{...scene.room, showDimensions: scene.room.showDimensions && viewMode !== 'render'}} />",
    "<RoomGeometry />"
)
with open('src/components/3d/MainScene.tsx', 'w') as f:
    f.write(ms_content)

with open('src/components/3d/RoomGeometry.tsx', 'r') as f:
    rg_content = f.read()

rg_content = rg_content.replace(
    "import { useStore } from '../../store';",
    "import { useStore } from '../../store';\nimport { useShallow } from 'zustand/react/shallow';"
)
rg_content = rg_content.replace(
    "export function RoomGeometry({ room }: { room: Room }) {",
    """export function RoomGeometry() {
  const roomStore = useStore(s => s.scene.room);
  const viewModeStore = useStore(s => s.viewMode);
  const room = { ...roomStore, showDimensions: roomStore.showDimensions && viewModeStore !== 'render' };"""
)
rg_content = rg_content.replace(
    "const { selectedElementId, setSelectedElementId, updateDoor, updateWindow, setControlsEnabled, viewMode, scene } = useStore();",
    """const { selectedElementId, setSelectedElementId, updateDoor, updateWindow, setControlsEnabled, viewMode } = useStore(useShallow(s => ({
    selectedElementId: s.selectedElementId,
    setSelectedElementId: s.setSelectedElementId,
    updateDoor: s.updateDoor,
    updateWindow: s.updateWindow,
    setControlsEnabled: s.setControlsEnabled,
    viewMode: s.viewMode
  })));"""
)
with open('src/components/3d/RoomGeometry.tsx', 'w') as f:
    f.write(rg_content)

with open('src/components/3d/SceneObjects.tsx', 'r') as f:
    so_content = f.read()

so_content = so_content.replace(
    "import { useStore } from '../../store';",
    "import { useStore } from '../../store';\nimport { useShallow } from 'zustand/react/shallow';"
)
so_content = so_content.replace(
    "const { scene, isExporting } = useStore();",
    """const { objects, isExporting } = useStore(useShallow(s => ({
    objects: s.scene.objects,
    isExporting: s.isExporting
  })));"""
)
so_content = so_content.replace(
    "scene.objects.map",
    "objects.map"
)
so_content = so_content.replace(
    "const { selectedObjectId, setSelectedObjectId, updateObject, viewMode, scene } = useStore();",
    """const { selectedObjectId, setSelectedObjectId, updateObject, viewMode, room } = useStore(useShallow(s => ({
    selectedObjectId: s.selectedObjectId,
    setSelectedObjectId: s.setSelectedObjectId,
    updateObject: s.updateObject,
    viewMode: s.viewMode,
    room: s.scene.room
  })));"""
)
so_content = so_content.replace(
    "scene.room.depthMm",
    "room.depthMm"
)
so_content = so_content.replace(
    "scene.room.widthMm",
    "room.widthMm"
)
with open('src/components/3d/SceneObjects.tsx', 'w') as f:
    f.write(so_content)
