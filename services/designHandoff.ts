/**
 * Hand a saved 3D design from the Projects page to the Designer.
 *
 * The Designer's iframe only exists while the Designer stage is mounted, so
 * "Open in 3D Designer" cannot postMessage directly — it parks the room spec
 * here, navigates, and the Designer collects it once its iframe has loaded.
 */
let pendingRoom: unknown | null = null;

/** Returns false if the stored design JSON is unreadable. */
export const setPendingDesign = (scene3d: string): boolean => {
    try {
        pendingRoom = JSON.parse(scene3d);
        return true;
    } catch {
        pendingRoom = null;
        return false;
    }
};

export const consumePendingDesign = (): unknown | null => {
    const room = pendingRoom;
    pendingRoom = null;
    return room;
};
