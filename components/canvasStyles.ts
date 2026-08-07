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

/** Height cap for the invisible sizing image inside RENDER_CANVAS_FITTED:
 *  one viewport minus the header (6rem), workspace padding and the export row. */
export const RENDER_CANVAS_IMG_MAX_H = 'max-h-[calc(100vh-13rem)]';

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
