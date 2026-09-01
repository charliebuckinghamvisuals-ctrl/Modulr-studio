import { useEffect, useState } from 'react';

/**
 * The customer's own paint palette.
 *
 * A custom colour (hex field or colour wheel) can be saved under a name -
 * "Kent Blue", "F&B Studio Green" - and then reappears as a swatch on every
 * unit's colour row. Stored in localStorage, so it survives reloads and is
 * shared across designs on this browser; it is a per-browser convenience,
 * not part of the saved design (the design stores the hex itself, so a
 * design opened elsewhere still renders its true colours).
 */
export type SavedColour = { name: string; hex: string };

const KEY = 'modulr_saved_colours_v1';
const MAX = 24;
const EVENT = 'modulr-saved-colours';

export function loadSavedColours(): SavedColour[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string' && /^#[0-9a-f]{6}$/i.test(c.hex));
  } catch {
    return [];
  }
}

function persist(list: SavedColour[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* quota/private mode - palette just won't stick */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function addSavedColour(name: string, hex: string) {
  const clean = hex.toLowerCase();
  // Re-saving a hex renames it rather than duplicating the swatch.
  const list = loadSavedColours().filter(c => c.hex.toLowerCase() !== clean);
  list.push({ name: name.trim().slice(0, 40) || clean, hex: clean });
  persist(list);
}

export function removeSavedColour(hex: string) {
  persist(loadSavedColours().filter(c => c.hex.toLowerCase() !== hex.toLowerCase()));
}

/** Live view of the palette - updates every open colour row when one saves,
 *  and follows changes made in another tab via the storage event. */
export function useSavedColours(): SavedColour[] {
  const [list, setList] = useState<SavedColour[]>(loadSavedColours);
  useEffect(() => {
    const refresh = () => setList(loadSavedColours());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return list;
}
