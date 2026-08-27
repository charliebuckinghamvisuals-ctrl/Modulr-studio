import React, { useState } from 'react';
import { useStore } from '../../store';
import { jsPDF } from 'jspdf';
import { Download, X, Loader2 } from 'lucide-react';

interface ShotResult {
  dataUrl: string;
  width: number;
  height: number;
}

export function ExportPDFModal({ onClose }: { onClose: () => void }) {
  const { scene } = useStore();
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    projectName: 'Garden Room Project',
    notes: '',
    /**
     * What the PDF says about money. 'estimate' shows the configurator's
     * calculated figure; 'actual' shows the price the company typed (they
     * know their real quote better than our calculator); 'none' omits the
     * price section entirely - some firms never put numbers on a proposal.
     */
    priceMode: 'estimate' as 'estimate' | 'actual' | 'none',
    actualPrice: '',
  });

  const autoCrop = (base64: string): Promise<ShotResult> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
          let hasPixels = false;
          
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const alpha = data[(y * canvas.width + x) * 4 + 3];
              if (alpha > 5) {
                hasPixels = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          
          if (!hasPixels) {
            resolve({ dataUrl: base64, width: img.width, height: img.height });
            return;
          }
          
          const padding = 20;
          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(canvas.width, maxX + padding);
          maxY = Math.min(canvas.height, maxY + padding);
          
          const cropW = maxX - minX;
          const cropH = maxY - minY;
          
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d')!;
          cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          resolve({ dataUrl: cropCanvas.toDataURL('image/png'), width: cropW, height: cropH });
        } catch(e) {
          console.error('Crop failed', e);
          resolve({ dataUrl: base64, width: img.width, height: img.height });
        }
      };
      img.onerror = () => resolve({ dataUrl: base64, width: 800, height: 600 });
      img.src = base64;
    });
  };

  const takeScreenshot = async (view: string, mode: '3d' | 'plan' = '3d', showDims: boolean = true): Promise<ShotResult> => {
    return new Promise((resolve) => {
      // Switch view mode
      useStore.getState().setViewMode(mode);
      useStore.getState().setIsExporting(showDims);
      
      setTimeout(() => {
        const handleScreenshot = async (e: any) => {
          window.removeEventListener('screenshot-taken', handleScreenshot);
          const cropped = await autoCrop(e.detail);
          resolve(cropped);
        };
        window.addEventListener('screenshot-taken', handleScreenshot);
        window.dispatchEvent(new CustomEvent('camera-set-view', { detail: { view, snap: true } }));
        
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('take-screenshot'));
        }, 500);
      }, 500); // Give React time to render the viewMode change
    });
  };

  const handleExport = async () => {
    setLoading(true);
    useStore.getState().setHoveredElementId(null);
    
    setTimeout(async () => {
    try {
      // 1. Gather all screenshots
      const topImg = await takeScreenshot('top', 'plan', true);
      const frontImg = await takeScreenshot('front', '3d', true);
      const leftImg = await takeScreenshot('left', '3d', true);
      const rightImg = await takeScreenshot('right', '3d', true);
      const backImg = await takeScreenshot('back', '3d', true);
      const perspectiveImg = await takeScreenshot('perspective', '3d', false);

      // Fetch Planning Advice from API. The server computes the traffic-light
      // verdict from the totals sent here, so the numbers must be the REAL
      // ground-to-top figures for the roof shape.
      let planningAdvice = '';
      let planning: any = null;
      try {
        // For Gable, heightMm is already the total height — adding base+roof
        // again overstated the building by ~450mm in the planning advice.
        const isGablePdf = scene.room.shape === 'Gable';
        const heightExtra = isGablePdf ? 0 : (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200);
        const totalFrontHeight = scene.room.heightMm + heightExtra;
        const totalBackHeight = isGablePdf ? totalFrontHeight : (scene.room.backHeightMm ?? scene.room.heightMm) + heightExtra;

        const augmentedRoomDetails = {
           ...scene.room,
           overallTotalFrontHeightMm: totalFrontHeight,
           overallTotalBackHeightMm: totalBackHeight,
           overallTotalHeightMm: Math.max(totalFrontHeight, totalBackHeight),
           eavesHeightMm: isGablePdf ? scene.room.heightMm - (scene.room.roofHeightMm || 200) : Math.max(totalFrontHeight, totalBackHeight),
           heightMm: totalFrontHeight,
           backHeightMm: totalBackHeight,
           /*
            * What is INSIDE the building, which decides the incidental-use
            * test and until now was never sent. Class E only covers a building
            * incidental to the enjoyment of the house; put a bed in it and it
            * is sleeping accommodation, which is not incidental at any height.
            * The checklist could only ever show "?" against that line because
            * the server was being handed the shell and none of the contents.
            *
            * Types only - positions are irrelevant to the test and there is no
            * reason to send the furniture layout off the machine.
            */
           contents: Array.from(new Set((scene.objects || []).map(o => o.type))),
        };

        const response = await fetch('/api/planning-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomDetails: augmentedRoomDetails })
        });
        if (response.ok) {
          const data = await response.json();
          planningAdvice = data.advice;
          if (data.verdict) planning = data;
        }
      } catch (e) {
        console.error("Failed to fetch planning advice", e);
      }

      // 2. Generate PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // ── Branding ──────────────────────────────────────────────────────────
      // Read from the host app. The configurator runs in a same-origin iframe,
      // so it can read the branding the user saved in Account Management. Until
      // now the PDF ignored this entirely and hardcoded Modulr's own colour,
      // which is why no customer logo or colour ever appeared.
      const brand = (() => {
        const fallback = { logo: null as string | null, primaryColor: '#3b4d4a', contactInfo: '', pdfTemplate: 'classic' };
        try {
          const raw = localStorage.getItem('modulr_branding');
          return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
        } catch { return fallback; }
      })();

      const hexToRgb = (hex: string): [number, number, number] => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [59, 77, 74];
      };
      const BRAND = hexToRgb(brand.primaryColor);
      // PDF design, chosen in Account > Company Branding. 'classic' is the
      // original look; unknown values fall back to it so old caches never break.
      const template: 'classic' | 'minimal' | 'bold' =
        brand.pdfTemplate === 'minimal' ? 'minimal' : brand.pdfTemplate === 'bold' ? 'bold' : 'classic';
      const INK: [number, number, number] = [38, 42, 45];
      const MUTED: [number, number, number] = [122, 130, 134];
      const HAIRLINE: [number, number, number] = [222, 226, 228];

      // Single source of truth for the page grid, so every page lines up.
      const M = 18;                       // page margin
      const CONTENT_W = pageWidth - M * 2;
      const HEADER_H = 26;
      const FOOTER_Y = pageHeight - 12;

      // Measure the logo once so it can be placed at its true aspect ratio.
      let logoMeta: { data: string; fmt: string; ratio: number } | null = null;
      if (brand.logo) {
        try {
          const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
            const im = new Image();
            im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
            im.onerror = rej;
            im.src = brand.logo as string;
          });
          const fmt = /^data:image\/jpe?g/i.test(brand.logo) ? 'JPEG' : 'PNG';
          logoMeta = { data: brand.logo, fmt, ratio: dims.w / Math.max(1, dims.h) };
        } catch { logoMeta = null; }
      }

      const drawHeader = (title: string) => {
        if (template === 'minimal') {
          // No band: logo (or wordmark) on white, hairline underneath. Brand
          // colour appears only in the wordmark and section rules.
          if (logoMeta) {
            const h = 11;
            const w = Math.min(44, h * logoMeta.ratio);
            try { pdf.addImage(logoMeta.data, logoMeta.fmt, M, (HEADER_H - h) / 2, w, h); } catch { /* skip bad logo */ }
          } else {
            pdf.setTextColor(...BRAND);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text('MODULR STUDIO', M, HEADER_H / 2 + 1.5);
          }
          pdf.setTextColor(...MUTED);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.text(title.toUpperCase(), pageWidth - M, HEADER_H / 2 + 1, { align: 'right' });
          pdf.setDrawColor(...HAIRLINE);
          pdf.setLineWidth(0.2);
          pdf.line(M, HEADER_H - 2, pageWidth - M, HEADER_H - 2);
          return;
        }

        pdf.setFillColor(...BRAND);
        pdf.rect(0, 0, pageWidth, HEADER_H, 'F');

        if (logoMeta) {
          const h = 12;
          const w = Math.min(48, h * logoMeta.ratio);
          try { pdf.addImage(logoMeta.data, logoMeta.fmt, M, (HEADER_H - h) / 2, w, h); } catch { /* skip bad logo */ }
        } else {
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.text('MODULR STUDIO', M, HEADER_H / 2 + 1.5);
        }

        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(title.toUpperCase(), pageWidth - M, HEADER_H / 2 + 1, { align: 'right' });
      };

      const drawFooter = (page: number) => {
        pdf.setDrawColor(...HAIRLINE);
        pdf.setLineWidth(0.2);
        pdf.line(M, FOOTER_Y - 4, pageWidth - M, FOOTER_Y - 4);
        pdf.setFontSize(7.5);
        pdf.setTextColor(...MUTED);
        pdf.setFont('helvetica', 'normal');
        const left = brand.contactInfo || 'Generated with Modulr Studio';
        pdf.text(left.slice(0, 90), M, FOOTER_Y);
        pdf.text(String(page), pageWidth - M, FOOTER_Y, { align: 'right' });
      };

      /**
       * Section heading with a rule under it. `x` defaults to the left margin;
       * a heading over a right-hand column MUST pass its own x - drawing every
       * title at M is what printed "Openings & Fixtures" on top of "Finishes".
       */
      const sectionTitle = (label: string, y: number, x: number = M) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...BRAND);
        pdf.text(label.toUpperCase(), x, y);
        pdf.setDrawColor(...BRAND);
        pdf.setLineWidth(0.5);
        pdf.line(x, y + 1.8, x + 14, y + 1.8);
        return y + 9;
      };

      /** Key/value row with a hairline separator - reads as a spec table. */
      const specRow = (label: string, value: string, x: number, y: number, w: number) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...MUTED);
        pdf.text(label, x, y);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...INK);
        pdf.text(value, x + w, y, { align: 'right' });
        pdf.setDrawColor(...HAIRLINE);
        pdf.setLineWidth(0.15);
        pdf.line(x, y + 2.2, x + w, y + 2.2);
        return y + 7;
      };

      const drawImageFit = (shot: ShotResult, x: number, y: number, maxW: number, maxH: number) => {
        const ratio = Math.min(maxW / shot.width, maxH / shot.height);
        const w = shot.width * ratio;
        const h = shot.height * ratio;
        const cx = x + (maxW - w) / 2;
        const cy = y + (maxH - h) / 2;
        pdf.addImage(shot.dataUrl, 'PNG', cx, cy, w, h);
      };

      // Same Gable rule as the planning-advice block above: heightMm is total.
      const pdfHeightExtra = scene.room.shape === 'Gable' ? 0 : (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200);
      const totalHeightFront = scene.room.heightMm + pdfHeightExtra;
      const totalHeightBack = (scene.room.backHeightMm ?? scene.room.heightMm) + pdfHeightExtra;
      const totalPrice = useStore.getState().calculatePrice();
      /**
       * The figure the PDF shows. null = no price section at all. In 'actual'
       * mode an empty/invalid entry omits the price rather than silently
       * falling back to the estimate the user chose not to show.
       */
      const parsedActual = parseFloat(formData.actualPrice.replace(/[£,\s]/g, ''));
      const pdfPrice: number | null =
        formData.priceMode === 'none' ? null
        : formData.priceMode === 'actual' ? (isFinite(parsedActual) && parsedActual > 0 ? Math.round(parsedActual) : null)
        : Math.round(totalPrice);
      const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // ── Page 1: Cover ─────────────────────────────────────────────────────
      const meta = [
        formData.name ? `Prepared for ${formData.name}` : null,
        formData.address || null,
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      ].filter(Boolean).join('   ·   ');

      let y: number;
      if (template === 'bold') {
        // Deep brand-colour masthead with the title inside it - the whole
        // cover leads with the company's colour rather than a slim band.
        const MAST_H = 58;
        pdf.setFillColor(...BRAND);
        pdf.rect(0, 0, pageWidth, MAST_H, 'F');
        if (logoMeta) {
          const h = 12;
          const w = Math.min(48, h * logoMeta.ratio);
          try { pdf.addImage(logoMeta.data, logoMeta.fmt, M, 10, w, h); } catch { /* skip bad logo */ }
        } else {
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.text('MODULR STUDIO', M, 17);
        }
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text('DESIGN PROPOSAL', pageWidth - M, 17, { align: 'right' });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(24);
        pdf.text(formData.projectName || 'Garden Room', M, MAST_H - 18);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        pdf.text(meta, M, MAST_H - 9);
        y = MAST_H + 10;
      } else {
        drawHeader('Design Proposal');
        y = HEADER_H + 18;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.setTextColor(...INK);
        pdf.text(formData.projectName || 'Garden Room', M, y);
        y += 9;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...MUTED);
        pdf.text(meta, M, y);
        y += 8;
      }

      // Hero image
      const heroH = 92;
      drawImageFit(perspectiveImg, M, y, CONTENT_W, heroH);
      y += heroH + 12;

      // Two columns: specification and estimate
      const colGap = 10;
      const colW = (CONTENT_W - colGap) / 2;

      let leftY = sectionTitle('Specification', y);
      const isGableSpec = scene.room.shape === 'Gable';
      leftY = specRow('Roof', isGableSpec ? 'Gable' : 'Flat', M, leftY, colW);
      leftY = specRow('Width', `${scene.room.widthMm} mm`, M, leftY, colW);
      leftY = specRow('Depth', `${scene.room.depthMm} mm`, M, leftY, colW);
      if (isGableSpec) {
        // A gable has ONE height story: eaves and ridge. Front/back height is
        // flat-roof vocabulary, and printing the stored backHeightMm here
        // produced nonsense like "3500mm front, 2010mm back" from a stale
        // pre-switch value.
        leftY = specRow('Eaves height', `${scene.room.heightMm - (scene.room.roofHeightMm || 200)} mm`, M, leftY, colW);
        leftY = specRow('Ridge height', `${scene.room.heightMm} mm`, M, leftY, colW);
        leftY = specRow('Fascia depth', `${scene.room.gableFasciaMm ?? 100} mm`, M, leftY, colW);
      } else {
        leftY = specRow('Height (front)', `${totalHeightFront} mm`, M, leftY, colW);
        if (totalHeightBack !== totalHeightFront) {
          leftY = specRow('Height (back)', `${totalHeightBack} mm`, M, leftY, colW);
        }
      }
      if (scene.room.lShapeCutoutWidthMm && !['Box', 'Quba', 'Gable'].includes(scene.room.shape as string)) {
        leftY = specRow('Cutout width', `${scene.room.lShapeCutoutWidthMm} mm`, M, leftY, colW);
      }

      const rightX = M + colW + colGap;
      let rightY = y;
      if (pdfPrice !== null) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...BRAND);
        pdf.text(formData.priceMode === 'actual' ? 'PRICE' : 'ESTIMATE', rightX, y);
        pdf.setDrawColor(...BRAND);
        pdf.setLineWidth(0.5);
        pdf.line(rightX, y + 1.8, rightX + 14, y + 1.8);

        rightY = y + 12;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(21);
        pdf.setTextColor(...INK);
        pdf.text(`£${pdfPrice.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`, rightX, rightY);

        rightY += 7;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...MUTED);
        const priceNote = formData.priceMode === 'actual'
          ? 'Price for the design as specified. Any variations will be quoted separately.'
          : 'Indicative only, based on the design, size and materials selected. Not a formal quotation.';
        pdf.text(pdf.splitTextToSize(priceNote, colW), rightX, rightY);
      }

      if (formData.notes) {
        const notesY = Math.max(leftY, rightY + 14) + 6;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...MUTED);
        pdf.text('NOTES', M, notesY);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...INK);
        pdf.text(pdf.splitTextToSize(formData.notes, CONTENT_W), M, notesY + 5);
      }

      drawFooter(1);

      // ── Page 2: Plan & Schedule ───────────────────────────────────────────
      pdf.addPage();
      drawHeader('Plan & Schedule');

      let p2y = sectionTitle('Plan View', HEADER_H + 16);
      const planH = 88;
      drawImageFit(topImg, M, p2y, CONTENT_W, planH);
      p2y += planH + 14;

      // Finishes and openings side by side rather than one long stacked list.
      let finY = sectionTitle('Finishes', p2y);
      finY = specRow('Cladding', titleCase(String(scene.room.cladding)), M, finY, colW);
      finY = specRow('Base', titleCase(String(scene.room.baseMaterial)), M, finY, colW);
      finY = specRow('Roof', titleCase(String(scene.room.roofMaterial)), M, finY, colW);
      finY = specRow('Interior', titleCase(String(scene.room.interiorColor || 'White')), M, finY, colW);
      finY = specRow('Frames', titleCase(String(scene.room.frameColor)), M, finY, colW);
      finY = specRow('Floor', titleCase(String(scene.room.interiorFloorType || 'Oak')), M, finY, colW);

      let openY = sectionTitle('Openings & Fixtures', p2y, rightX);
      // The schedule lists the building's actual openings — doors, windows,
      // skylights. It previously grouped scene.objects, which put the garden
      // furniture (trees, sofas) under "Openings" and omitted every real door
      // and window from the client's document.
      const openings: { key: string; size: string }[] = [
        ...(scene.room.doors || []).map(dr => ({
          key: `${titleCase(String(dr.style || 'standard'))} Door (${dr.leaves} leaf)`,
          size: `${dr.widthMm} x ${dr.heightMm} mm`,
        })),
        ...(scene.room.windows || []).map(wn => ({
          key: `${titleCase(String(wn.style || 'standard'))} Window`,
          size: `${wn.widthMm} x ${wn.heightMm} mm`,
        })),
        ...(scene.room.skylights || []).map(sk => ({
          key: `${titleCase(String(sk.type))} Skylight`,
          size: `${sk.widthMm} x ${sk.lengthMm} mm`,
        })),
      ];
      // Group identical items so a schedule reads "3 x Window" rather than
      // three near-identical lines.
      const grouped = openings.reduce((acc: Record<string, { count: number; size: string }>, o) => {
        const key = `${o.key}|${o.size}`;
        if (!acc[key]) acc[key] = { count: 0, size: o.size };
        acc[key].count += 1;
        return acc;
      }, {});
      const entries = Object.entries(grouped).map(([k, info]) => [k.split('|')[0], info] as [string, { count: number; size: string }]);
      if (entries.length === 0) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...MUTED);
        pdf.text('None specified.', rightX, openY);
      } else {
        entries.slice(0, 14).forEach(([name, info]) => {
          openY = specRow(
            info.count > 1 ? `${name} (x${info.count})` : name,
            info.size || '-',
            rightX, openY, colW
          );
        });
      }

      drawFooter(2);

      // ── Page 3: Elevations ────────────────────────────────────────────────
      pdf.addPage();
      drawHeader('Elevations');

      const elTop = sectionTitle('Elevations', HEADER_H + 16);

      // Every caption previously repeated the full front AND back height, on all
      // four panels. That is the same two numbers printed eight times, which is
      // what made the sheet look cluttered. Each elevation now states only the
      // dimension it actually shows, and the shared heights are given once in a
      // single note underneath.
      const elW = (CONTENT_W - 12) / 2;
      const elH = elW * 0.62;
      const rowGap = 16;

      const elevation = (
        img: ShotResult, label: string, dim: string, x: number, yTop: number
      ) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...INK);
        pdf.text(label, x, yTop);

        // Light frame so each drawing reads as a discrete panel.
        pdf.setDrawColor(...HAIRLINE);
        pdf.setLineWidth(0.2);
        pdf.rect(x, yTop + 3, elW, elH);
        drawImageFit(img, x, yTop + 3, elW, elH);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...MUTED);
        pdf.text(dim, x, yTop + elH + 8);
      };

      elevation(frontImg, 'Front Elevation', `Width ${scene.room.widthMm} mm`, M, elTop);
      elevation(backImg, 'Rear Elevation', `Width ${scene.room.widthMm} mm`, M + elW + 12, elTop);

      const row2 = elTop + elH + rowGap + 6;
      elevation(leftImg, 'Left Elevation', `Depth ${scene.room.depthMm} mm`, M, row2);
      elevation(rightImg, 'Right Elevation', `Depth ${scene.room.depthMm} mm`, M + elW + 12, row2);

      // Shared heights, stated once.
      const noteY = row2 + elH + 18;
      pdf.setDrawColor(...HAIRLINE);
      pdf.setLineWidth(0.2);
      pdf.line(M, noteY - 6, pageWidth - M, noteY - 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      const heightNote = scene.room.shape === 'Gable'
        ? `Eaves height ${scene.room.heightMm - (scene.room.roofHeightMm || 200)} mm, ridge height ${scene.room.heightMm} mm. All dimensions in millimetres.`
        : totalHeightBack !== totalHeightFront
        ? `Overall height ${totalHeightFront} mm at the front, ${totalHeightBack} mm at the rear. All dimensions in millimetres.`
        : `Overall height ${totalHeightFront} mm. All dimensions in millimetres.`;
      pdf.text(heightNote, M, noteY);

      drawFooter(3);

      // ── Page 4: Planning Guidance ─────────────────────────────────────────
      let pageNo = 3;
      if (planningAdvice) {
        pdf.addPage();
        pageNo += 1;
        drawHeader('Planning Guidance');

        let pgY = sectionTitle('Planning Guidance', HEADER_H + 16);

        /**
         * TRAFFIC LIGHT verdict banner. The colour comes from the server's
         * CODE-computed Class E check (never from AI), so the light can be
         * trusted: green = PD anywhere on the plot, amber = PD only when
         * sited 2m+ from boundaries, red = outside the PD envelope.
         */
        if (planning?.verdict) {
          const LIGHT: Record<string, { rgb: [number, number, number]; label: string }> = {
            green: { rgb: [22, 130, 70], label: 'LIKELY PERMITTED DEVELOPMENT' },
            amber: { rgb: [200, 130, 20], label: 'PD WITH CONDITIONS - GET ADVICE' },
            red:   { rgb: [190, 50, 45], label: 'PLANNING PERMISSION LIKELY REQUIRED' },
          };
          const L = LIGHT[planning.verdict] || LIGHT.amber;
          pdf.setFillColor(...L.rgb);
          pdf.rect(M, pgY - 4, CONTENT_W, 16, 'F');
          // The three dots make the traffic light legible even in greyscale print.
          const dotY = pgY + 4;
          (['green', 'amber', 'red'] as const).forEach((k, i) => {
            const active = k === planning.verdict;
            pdf.setFillColor(255, 255, 255);
            if (active) pdf.circle(M + 6 + i * 7, dotY, 2.4, 'F');
            else { pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.4); pdf.circle(M + 6 + i * 7, dotY, 1.6, 'S'); }
          });
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.text(L.label, M + 28, pgY + 3);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.text(`Overall ${planning.totalHeightMm} mm · eaves ${planning.eavesHeightMm} mm`, M + 28, pgY + 8);
          pgY += 18;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9.5);
          pdf.setTextColor(...INK);
          const head = pdf.splitTextToSize(planning.headline || '', CONTENT_W);
          pdf.text(head, M, pgY + 2);
          pgY += head.length * 4.6 + 6;

          /**
           * THE CHECKLIST: every Class E criterion as a drawn tick / cross /
           * query (glyphs are drawn with lines because the built-in PDF fonts
           * have no checkmark character). Statuses come from the server's
           * code-computed checks, never from AI.
           */
          if (Array.isArray(planning.checks) && planning.checks.length) {
            const GREEN: [number, number, number] = [22, 130, 70];
            const RED: [number, number, number] = [190, 50, 45];
            const AMBERC: [number, number, number] = [200, 130, 20];
            const drawStatusIcon = (status: string, cx: number, cy: number) => {
              const r = 2.4;
              const col = status === 'pass' ? GREEN : status === 'fail' ? RED : AMBERC;
              pdf.setFillColor(...col);
              pdf.circle(cx, cy, r, 'F');
              pdf.setDrawColor(255, 255, 255);
              pdf.setLineWidth(0.55);
              if (status === 'pass') {
                pdf.line(cx - 1.1, cy + 0.1, cx - 0.3, cy + 1.0);
                pdf.line(cx - 0.3, cy + 1.0, cx + 1.2, cy - 0.9);
              } else if (status === 'fail') {
                pdf.line(cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9);
                pdf.line(cx - 0.9, cy + 0.9, cx + 0.9, cy - 0.9);
              } else {
                pdf.setTextColor(255, 255, 255);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.text('?', cx, cy + 1.4, { align: 'center' });
              }
            };

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(...MUTED);
            pdf.text('PERMITTED DEVELOPMENT CHECKLIST', M, pgY + 2);
            pgY += 7;
            for (const chk of planning.checks) {
              drawStatusIcon(chk.status, M + 3, pgY);
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8.5);
              pdf.setTextColor(...INK);
              pdf.text(String(chk.label), M + 9, pgY + 1);
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7.5);
              pdf.setTextColor(...MUTED);
              pdf.text(String(chk.detail || ''), M + 9, pgY + 5);
              pgY += 10;
            }
            pgY += 2;

            // Indicative likelihood score with a bar the length of the page.
            if (typeof planning.score === 'number') {
              const barW = CONTENT_W - 58;
              const col = planning.verdict === 'green' ? GREEN : planning.verdict === 'amber' ? AMBERC : RED;
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);
              pdf.setTextColor(...INK);
              pdf.text(`PD likelihood: ${planning.score}%`, M, pgY + 3);
              pdf.setFillColor(238, 238, 235);
              pdf.roundedRect(M + 42, pgY, barW, 4, 2, 2, 'F');
              pdf.setFillColor(...col);
              pdf.roundedRect(M + 42, pgY, Math.max(6, barW * planning.score / 100), 4, 2, 2, 'F');
              pgY += 8;
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7);
              pdf.setTextColor(...MUTED);
              pdf.text('Indicative only, based on the measurable design. Items marked "?" depend on siting, land status and use - assumed typical.', M, pgY + 1);
              pgY += 7;
            }
          }
        }

        // Disclaimer, boxed so it cannot be mistaken for the advice itself.
        // Previously this claimed the statement was "accurate", which is not a
        // claim to make about automatically generated planning guidance.
        pdf.setFillColor(248, 249, 250);
        pdf.setDrawColor(...HAIRLINE);
        pdf.setLineWidth(0.2);
        // Confident but honest: the old wording ("should not be relied upon")
        // read as "ignore this page". This assessment IS built on the real
        // Class E rules and the design's exact measurements - what it cannot
        // see is the site, so NAPC is framed as the confirmation step, not a
        // health warning. No invented accuracy percentages: on planning
        // guidance a number we cannot prove is a liability, not reassurance.
        const discl = pdf.splitTextToSize(
          'This assessment is based on the current national Permitted Development rules (Class E) and the exact measurements of this design. Final confirmation depends on your specific site and local authority - please contact NAPC (www.napc.uk) before proceeding and they will confirm it formally.',
          CONTENT_W - 8
        );
        const disclH = discl.length * 4 + 7;
        pdf.rect(M, pgY - 4, CONTENT_W, disclH, 'FD');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...MUTED);
        pdf.text(discl, M + 4, pgY + 1);
        pgY += disclH + 6;

        pdf.setFontSize(9);
        pdf.setTextColor(...INK);
        // Structured verdict: banner carries the headline, so the body is the
        // reasons/caveats/NAPC only. Legacy string keeps working as fallback.
        // The checklist above IS the "why", so the body carries only what the
        // ticks cannot: caveats, Building Regs and the NAPC route.
        const bodyText = planning?.verdict
          ? [
              'WORTH KNOWING:',
              ...planning.caveats.map((c: string, i: number) => `${i + 1}. ${c}`),
              '',
              'BUILDING REGULATIONS: ' + planning.buildingRegs,
              '',
              planning.napcNote,
            ].join('\n')
          : planningAdvice;
        const splitText = pdf.splitTextToSize(bodyText, CONTENT_W);
        for (let i = 0; i < splitText.length; i++) {
          if (pgY > FOOTER_Y - 12) {
            drawFooter(pageNo);
            pdf.addPage();
            pageNo += 1;
            drawHeader('Planning Guidance');
            pgY = HEADER_H + 16;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(...INK);
          }
          pdf.text(splitText[i], M, pgY);
          pgY += 4.6;
        }
        drawFooter(pageNo);
      }

      // Save PDF
      const safeName = (formData.projectName || 'modulr-design')
        .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      pdf.save(`${safeName || 'modulr-design'}.pdf`);
      
      // Reset Camera
      window.dispatchEvent(new CustomEvent('camera-set-view', { detail: { view: 'perspective', snap: false } }));
      
      setIsSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert('Error generating PDF: ' + err.message);
    } finally {
      useStore.getState().setIsExporting(false);
      useStore.getState().setViewMode("3d");
      setLoading(false);
    }
    }, 100);
  };

  
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full border-4 border-[#3b4d4a]/20 border-t-[#3b4d4a] animate-spin mb-6"></div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Generating PDF...</h2>
          <p className="text-gray-500 text-sm">Please wait while we render your beautiful garden room. This may take a moment.</p>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
            <Download size={32} />
          </div>
          <h2 className="text-2xl font-bold text-[#3b4d4a] mb-2">Design Downloaded!</h2>
          <p className="text-gray-600 mb-8">Your 3D design and guidance PDF has been generated successfully.</p>
          <div className="flex flex-col gap-3 w-full">
            {/*
              Saves the design to the host app so it can be attached to a
              Project. The configurator runs in an iframe with no storage of its
              own, so it hands the scene to the parent window.

              This button previously only called alert('Design saved
              successfully!') and wrote nothing anywhere, so a design the user
              believed was saved was silently lost.
            */}
            <button
              onClick={() => {
                try {
                  {
                    // The project record keeps a company-entered price over the
                    // calculator's; "no price on the PDF" still saves the
                    // estimate internally - hiding it from a client document is
                    // not the same as not wanting it in the CRM.
                    const est = useStore.getState().calculatePrice();
                    const typed = parseFloat(formData.actualPrice.replace(/[£,\s]/g, ''));
                    const price = formData.priceMode === 'actual' && isFinite(typed) && typed > 0 ? Math.round(typed) : est;
                    window.parent.postMessage({
                      type: 'SAVE_3D_DESIGN',
                      scene: useStore.getState().scene,
                      price,
                      savedAt: Date.now(),
                    }, window.location.origin);
                  }
                  setSaveState('saved');
                } catch (e) {
                  console.error('Could not hand the design to the host app', e);
                  setSaveState('error');
                }
              }}
              disabled={saveState === 'saved'}
              className="w-full py-3 bg-[#3b4d4a] text-white rounded-lg font-semibold shadow-sm hover:bg-[#2d3a38] disabled:opacity-60 transition-colors"
            >
              {saveState === 'saved' ? 'Saved to your projects' : saveState === 'error' ? 'Could not save - try again' : 'Save Design'}
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3 bg-gray-100 text-[#3b4d4a] rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Make Changes
            </button>
            <button 
              onClick={() => {
                window.location.reload();
              }}
              className="w-full py-3 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#3b4d4a]">Export Design PDF</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Fill out the details below to generate a comprehensive design and estimate document.
          </p>
          
          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-600">Project Name</label>
             <input 
               type="text" 
               value={formData.projectName}
               onChange={(e) => setFormData({...formData, projectName: e.target.value})}
               className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b4d4a] focus:border-transparent" 
               placeholder="e.g., Garden Studio 2026"
             />
          </div>
          
          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-600">Client Name</label>
             <input 
               type="text" 
               value={formData.name}
               onChange={(e) => setFormData({...formData, name: e.target.value})}
               className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b4d4a] focus:border-transparent" 
               placeholder="John Doe"
             />
          </div>
          
          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-600">Site Address</label>
             <textarea 
               value={formData.address}
               onChange={(e) => setFormData({...formData, address: e.target.value})}
               className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b4d4a] focus:border-transparent resize-none h-20" 
               placeholder="123 Example Street, City, Postcode"
             ></textarea>
          </div>

          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-600">Pricing on the PDF</label>
             <div className="grid grid-cols-3 gap-2">
               {([
                 { id: 'estimate', label: 'Estimate' },
                 { id: 'actual', label: 'My price' },
                 { id: 'none', label: 'No price' },
               ] as const).map(opt => (
                 <button
                   key={opt.id}
                   type="button"
                   onClick={() => setFormData({ ...formData, priceMode: opt.id })}
                   className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${formData.priceMode === opt.id ? 'bg-[#3b4d4a] text-white border-[#3b4d4a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#3b4d4a]/40'}`}
                 >
                   {opt.label}
                 </button>
               ))}
             </div>
             {formData.priceMode === 'estimate' && (
               <p className="text-[11px] text-gray-400">Shows the configurator&rsquo;s calculated estimate.</p>
             )}
             {formData.priceMode === 'actual' && (
               <input
                 value={formData.actualPrice}
                 onChange={(e) => setFormData({ ...formData, actualPrice: e.target.value })}
                 inputMode="decimal"
                 className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b4d4a] focus:border-transparent"
                 placeholder="Your confirmed price, e.g. 24500"
               />
             )}
             {formData.priceMode === 'none' && (
               <p className="text-[11px] text-gray-400">The PDF will not mention price at all.</p>
             )}
          </div>

          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-600">Additional Notes</label>
             <textarea
               value={formData.notes}
               onChange={(e) => setFormData({...formData, notes: e.target.value})}
               className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b4d4a] focus:border-transparent resize-none h-20" 
               placeholder="Any specific design requirements..."
             ></textarea>
          </div>
        </div>
        
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleExport}
            disabled={loading}
            className="px-6 py-2 bg-[#3b4d4a] text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-[#2d3a38] transition-colors flex items-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {loading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
