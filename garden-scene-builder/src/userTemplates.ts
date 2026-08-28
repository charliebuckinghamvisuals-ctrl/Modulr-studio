import { v4 as uuidv4 } from 'uuid';
import type { Room, SceneObject } from './types';

/**
 * Templates the user saves themselves.
 *
 * Shipping our own starter buildings was the wrong idea: the companies using
 * this sell their OWN ranges, so a generic "garden office" is noise. Instead
 * they save the designs they actually sell and re-open them as starting
 * points.
 *
 * Stored per browser. Designs that need to follow an account around already
 * have "Save Design", which goes to the host app.
 */

const KEY = 'modulr_templates_v1';

export interface UserTemplate {
  id: string;
  name: string;
  savedAt: number;
  room: Room;
  objects: SceneObject[];
}

export function listTemplates(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Save the given design under a name. Returns the new list. */
export function saveTemplate(name: string, room: Room, objects: SceneObject[]): UserTemplate[] {
  const list = listTemplates();
  const entry: UserTemplate = {
    id: uuidv4(),
    name: name.trim().slice(0, 60) || 'Untitled',
    savedAt: Date.now(),
    // Deep copy so later edits to the live scene cannot mutate the template.
    room: JSON.parse(JSON.stringify(room)),
    objects: JSON.parse(JSON.stringify(objects)),
  };
  const next = [entry, ...list].slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota - keep what is on screen */ }
  return next;
}

export function deleteTemplate(id: string): UserTemplate[] {
  const next = listTemplates().filter(t => t.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

/** "3.0 x 4.0 m" for the card, derived rather than stored. */
export function templateSize(t: UserTemplate): string {
  return `${(t.room.widthMm / 1000).toFixed(1)} × ${(t.room.depthMm / 1000).toFixed(1)} m`;
}
