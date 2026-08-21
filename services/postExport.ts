import html2canvas from 'html2canvas';
import { FORMATS, type ContentFormat } from './postDesign';

/**
 * Export the editing surface at full platform resolution.
 *
 * The design is rendered off-screen at the real pixel size and captured, rather
 * than upscaling the small on-screen editor. Because it is the SAME component,
 * the export cannot drift from the preview - which is exactly what went wrong
 * when the preview was DOM and the output was hand-drawn to a canvas.
 */
export const exportNode = async (node: HTMLElement, format: ContentFormat): Promise<string> => {
    const spec = FORMATS[format];
    const canvas = await html2canvas(node, {
        // The node is already laid out at full size off-screen, so no scaling.
        scale: 1,
        width: spec.width,
        height: spec.height,
        backgroundColor: '#0f172a',
        useCORS: true,
        // Data URLs and same-origin assets only, so no proxy is needed - but a
        // logo pasted from elsewhere would otherwise taint the canvas.
        allowTaint: false,
        logging: false,
    });
    return canvas.toDataURL('image/jpeg', 0.94);
};

export const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
};

/** Filenames people can actually find again in a downloads folder. */
export const assetFilename = (business: string, format: ContentFormat, index?: number) => {
    const stem = (business || 'modulr').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modulr';
    return `${stem}-${format}${index != null ? `-${index}` : ''}.jpg`;
};
