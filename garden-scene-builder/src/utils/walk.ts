/**
 * Hand control back to the walkthrough.
 *
 * Pointer lock can only be requested from a real user gesture, and a click on
 * the panel's Done button is one - so finishing a colour change puts you
 * straight back to walking instead of making you find a wall to click.
 */
export function resumeWalking() {
  const canvas = document.querySelector('canvas');
  if (canvas && document.pointerLockElement !== canvas) {
    // Safari rejects this if the document lost focus; walking on foot still
    // works, the user just clicks the room as before.
    try { canvas.requestPointerLock(); } catch { /* no lock, no harm */ }
  }
}
