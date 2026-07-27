import re

with open('src/components/Sidebar.tsx', 'r') as f:
    content = f.read()

# Replace the store selector
content = re.sub(
    r'  const { room, env, updateRoom,.*?}\)\)\);',
    r'''  const store = useStore.getState();
  const wrap = (fn: any) => (...args: any[]) => { store.saveState(); fn(...args); };

  const { room, env, viewMode, areDoorsOpen, toggleDoors } = useStore(useShallow(s => ({
    room: s.scene.room,
    env: s.scene.env,
    viewMode: s.viewMode,
    areDoorsOpen: s.areDoorsOpen,
    toggleDoors: s.toggleDoors
  })));

  const updateRoom = wrap(store.updateRoom);
  const updateDoor = wrap(store.updateDoor);
  const addWindow = wrap(store.addWindow);
  const updateWindow = wrap(store.updateWindow);
  const removeWindow = wrap(store.removeWindow);
  const toggleTime = wrap(store.toggleTime);''',
    content,
    flags=re.DOTALL
)

with open('src/components/Sidebar.tsx', 'w') as f:
    f.write(content)
