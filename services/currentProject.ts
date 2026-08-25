/**
 * The project the user most recently had open, so "Save to Project" can offer
 * it first instead of making them scan the list every time. Module state, not
 * persistence: it resets on reload, which is the right lifetime - "the job I'm
 * working on right now".
 */
let current: { id: string; name: string } | null = null;

export const setCurrentProject = (p: { id: string; name: string } | null) => {
    current = p;
};

export const getCurrentProject = (): { id: string; name: string } | null => current;
