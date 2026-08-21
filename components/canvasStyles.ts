/**
 * One definition for every render canvas in the app.
 *
 * Render Engine, Line Converter, Weather Lab, Material Studio and Animation
 * Studio all show work on the same surface, and they each used to hard-code
 * their own copy of these classes - which is how they drifted apart. Import
 * this rather than writing the sizing inline.
 */

/** The canvas frame: border, artboard grid, and fill-the-space sizing.
 *
 *  Note there is deliberately no max-height here. The canvas is allowed to fill
 *  whatever the workspace gives it, because the workspace itself is now pinned
 *  to the viewport (see WORKSPACE_HEIGHT) rather than growing with its sidebar.
 *  Capping it here as well would just leave dead space under it on the pages
 *  with shorter toolbars. */
export const RENDER_CANVAS =
    'w-full flex-1 min-h-[320px] rounded-2xl overflow-hidden ' +
    'border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ' +
    'relative flex items-center justify-center render-grid';

/** The canvas once an image is loaded: shrink-wraps the image itself.
 *
 *  Charlie's ask (7 Aug 2026): the viewport should BE the image — no artboard
 *  bands around a letterboxed picture. An invisible in-flow copy of the image
 *  sizes this box (w-fit + the img's own max-w/max-h), and the real viewer
 *  renders absolutely on top, so the frame always matches the image's aspect
 *  ratio at the largest size that fits the workspace. */
export const RENDER_CANVAS_FITTED =
    'w-fit max-w-full mx-auto rounded-2xl overflow-hidden ' +
    'border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ' +
    'relative render-grid';

/**
 * Height cap for the invisible sizing image inside RENDER_CANVAS_FITTED.
 *
 * One viewport minus the header (6rem) and the chrome stacked under the canvas.
 * That reservation was 13rem, which was measured to be about 36px more than the
 * column actually uses - and since a landscape render is height-bound, every
 * pixel reserved here is lost from the WIDTH too. On a 1280x720 screen the
 * canvas came out 732px wide inside a 979px column, leaving a quarter of the
 * workspace empty.
 *
 * 9.5rem is what is genuinely below the canvas: the export row, one gap, and
 * the column's padding. Trimmed alongside that padding (p-4 lg:p-6 -> p-3
 * lg:p-4 in WorkspaceView), so the cap still lands inside the column rather
 * than pushing the export row into a scroll.
 */
export const RENDER_CANVAS_IMG_MAX_H = 'max-h-[calc(100vh-9.5rem)]';

/**
 * Height of a tool workspace.
 *
 * The header is h-24 (6rem) and sticky, so one viewport minus the header is
 * exactly the room a tool page has. This is a hard height rather than h-full
 * on purpose: AppShell's <main> carries min-h-screen, so h-full resolves
 * against a container that GROWS with its content - and a long toolbar would
 * drag the canvas taller with it, pushing the export row off the bottom of the
 * screen. Pinning it here means every tool page gets an identical canvas
 * regardless of how many controls its sidebar happens to have, and the toolbar
 * scrolls inside itself instead of stretching the page.
 */
export const WORKSPACE_HEIGHT = 'h-[calc(100vh-6rem)]';
