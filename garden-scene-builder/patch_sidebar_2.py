import re

with open('src/components/Sidebar.tsx', 'r') as f:
    content = f.read()

# Replace the store destructuring
c1 = r"""  const \{ room, env, updateRoom, updateDoor, addWindow, updateWindow, removeWindow, toggleTime, viewMode, areDoorsOpen, toggleDoors \} = useStore\(useShallow\(s => \(\{
    room: s\.scene\.room,
    updateRoom: s\.updateRoom,
    updateDoor: s\.updateDoor,
    addWindow: s\.addWindow,
    updateWindow: s\.updateWindow,
    removeWindow: s\.removeWindow,
    toggleTime: s\.toggleTime,
    viewMode: s\.viewMode,
    areDoorsOpen: s\.areDoorsOpen,
    toggleDoors: s\.toggleDoors
  \}\)\)\);"""

r1 = """  const store = useStore.getState();
  const wrap = (fn: any) => (...args: any[]) => { store.saveState(); fn(...args); };

  const { room, env, viewMode, areDoorsOpen, toggleDoors } = useStore(useShallow(s => ({
    room: s.scene.room,
    viewMode: s.viewMode,
    areDoorsOpen: s.areDoorsOpen,
    toggleDoors: s.toggleDoors,
    env: s.scene.env
  })));

  const updateRoom = wrap(store.updateRoom);
  const updateDoor = wrap(store.updateDoor);
  const addWindow = wrap(store.addWindow);
  const updateWindow = wrap(store.updateWindow);
  const removeWindow = wrap(store.removeWindow);
  const toggleTime = wrap(store.toggleTime);"""

content = re.sub(c1, r1, content)

# Fix the applyTemplate doors:
# from: { id: uuidv4(), type: 'french', wall: 'front', widthMm: 1800, heightMm: 2100, offsetMm: 0, isGlazed: true, isOpen: false }
# to: { id: uuidv4(), wall: 'front', widthMm: 1800, heightMm: 2100, offsetMm: 0, leaves: 2 }
# and bifold: { id: uuidv4(), type: 'bifold', wall: 'front', widthMm: 3000, heightMm: 2100, offsetMm: 0, isGlazed: true, isOpen: false }
# to: { id: uuidv4(), wall: 'front', widthMm: 3000, heightMm: 2100, offsetMm: 0, leaves: 4 }

content = content.replace(
    "doors: [{ id: uuidv4(), type: 'french', wall: 'front', widthMm: 1800, heightMm: 2100, offsetMm: 0, isGlazed: true, isOpen: false }]",
    "doors: [{ id: uuidv4(), wall: 'front', widthMm: 1800, heightMm: 2100, offsetMm: 0, leaves: 2 }]"
)

content = content.replace(
    "doors: [{ id: uuidv4(), type: 'bifold', wall: 'front', widthMm: 3000, heightMm: 2100, offsetMm: 0, isGlazed: true, isOpen: false }]",
    "doors: [{ id: uuidv4(), wall: 'front', widthMm: 3000, heightMm: 2100, offsetMm: 0, leaves: 4 }]"
)

# And replace `useStore.getState().updateX` with `wrap(store.updateX)`
content = re.sub(r'useStore\.getState\(\)\.(updateDoor|updateWindow|updateSkylight|updatePartition)', r'wrap(store.\1)', content)
content = re.sub(r'useStore\.getState\(\)\.(addDoor|addSkylight|addPartition|removeDoor|removeSkylight|removePartition)', r'wrap(store.\1)', content)


with open('src/components/Sidebar.tsx', 'w') as f:
    f.write(content)
