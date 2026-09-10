import type { Door, DoorKind } from '../types';

/**
 * Exterior door sets, as they are actually sold.
 *
 * A door used to be just a leaf count, and Open Doors did one generic move
 * for every set. These are the four products a garden-room company quotes,
 * each with the leaf counts it is made in and its own way of opening.
 */
export const DOOR_KINDS: { id: DoorKind; name: string; blurb: string }[] = [
  { id: 'hinged', name: 'Single Door', blurb: 'One leaf on side hinges' },
  { id: 'french', name: 'French Doors', blurb: 'A pair, both hinged at the jambs' },
  { id: 'bifold', name: 'Bi-fold', blurb: 'Leaves fold back to one side' },
  { id: 'sliding', name: 'Sliding', blurb: 'Panes glide behind a fixed pane' },
];

export const DOOR_KIND_NAME: Record<DoorKind, string> = Object.fromEntries(DOOR_KINDS.map(k => [k.id, k.name])) as Record<DoorKind, string>;

/** Leaf counts each kind is made in. */
export const LEAF_RANGE: Record<DoorKind, [number, number]> = {
  hinged: [1, 1],
  french: [2, 2],
  bifold: [2, 7],
  sliding: [2, 4],
};

/**
 * The kind of a door, for designs saved before kinds existed: one leaf was
 * a hinged door, two a French pair, and anything wider a bi-fold - the set
 * a garden room nearly always has.
 */
export const doorKind = (door: Pick<Door, 'kind' | 'leaves'>): DoorKind =>
  door.kind ?? (door.leaves <= 1 ? 'hinged' : door.leaves === 2 ? 'french' : 'bifold');

/** Clamp a leaf count into what the kind is made in. */
export const clampLeaves = (kind: DoorKind, leaves: number) => {
  const [lo, hi] = LEAF_RANGE[kind];
  return Math.max(lo, Math.min(hi, Math.round(leaves) || lo));
};

/** The updates that switch a door to a kind, keeping the leaf count if the
 *  kind is made in it and otherwise using its usual count. */
export const changesForKind = (door: Door, kind: DoorKind): Partial<Door> => {
  const usual: Record<DoorKind, number> = { hinged: 1, french: 2, bifold: 3, sliding: 2 };
  const [lo, hi] = LEAF_RANGE[kind];
  const leaves = door.leaves >= lo && door.leaves <= hi ? door.leaves : usual[kind];
  const stack = kind === 'bifold' || kind === 'sliding' ? (door.stack ?? 'left') : undefined;
  return { kind, leaves, stack };
};

/** Words for the render prompt and the PDF schedule. */
export const describeDoor = (door: Pick<Door, 'kind' | 'leaves' | 'stack' | 'swing'>) => {
  const kind = doorKind(door);
  switch (kind) {
    case 'hinged': return 'single hinged door';
    case 'french': return 'French doors (pair of hinged leaves)';
    case 'bifold': return `${door.leaves}-leaf bi-fold set`;
    case 'sliding': return `${door.leaves}-pane sliding set`;
  }
};
