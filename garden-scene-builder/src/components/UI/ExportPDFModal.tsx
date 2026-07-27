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
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    projectName: 'Garden Room Project',
    notes: '',
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

      // Fetch Planning Advice from API
      let planningAdvice = '';
      try {
        const totalFrontHeight = scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200);
        const totalBackHeight = (scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200);
        
        const augmentedRoomDetails = {
           ...scene.room,
           overallTotalFrontHeightMm: totalFrontHeight,
           overallTotalBackHeightMm: totalBackHeight,
           heightMm: totalFrontHeight, 
           backHeightMm: totalBackHeight 
        };

        const response = await fetch('/api/planning-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomDetails: augmentedRoomDetails })
        });
        if (response.ok) {
          const data = await response.json();
          planningAdvice = data.advice;
        }
      } catch (e) {
        console.error("Failed to fetch planning advice", e);
      }

      // 2. Generate PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const drawImageFit = (shot: ShotResult, x: number, y: number, maxW: number, maxH: number) => {
        const ratio = Math.min(maxW / shot.width, maxH / shot.height);
        const w = shot.width * ratio;
        const h = shot.height * ratio;
        const cx = x + (maxW - w) / 2;
        const cy = y + (maxH - h) / 2;
        pdf.addImage(shot.dataUrl, 'PNG', cx, cy, w, h);
      };

      // -- Page 1: Title, Info & 3D View --
      pdf.setFontSize(24);
      pdf.setTextColor(59, 77, 74); // #3b4d4a
      pdf.text(formData.projectName, 20, 30);
      
      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Prepared for: ${formData.name}`, 20, 40);
      pdf.text(`Address: ${formData.address}`, 20, 48);
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, 56);
      
      // 3D Perspective Image
      drawImageFit(perspectiveImg, 20, 70, pageWidth - 40, (pageWidth - 40) * 0.6);
      
      // Room Details Summary
      pdf.setFontSize(14);
      pdf.setTextColor(59, 77, 74);
      pdf.text('Structural Specifications', 20, 190);
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      pdf.text(`Shape: ${scene.room.shape}`, 20, 200);
      pdf.text(`Dimensions: ${scene.room.widthMm}mm (W) x ${scene.room.depthMm}mm (D)`, 20, 206);
      pdf.text(`Height: ${scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200)}mm (Front) / ${((scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200))}mm (Back)`, 20, 212);
      if (scene.room.lShapeCutoutWidthMm && scene.room.shape !== 'Box' && scene.room.shape !== 'Quba' && scene.room.shape !== 'Gable') {
        pdf.text(`Cutout Width: ${scene.room.lShapeCutoutWidthMm}mm`, 20, 218);
      }
      
      const totalPrice = useStore.getState().calculatePrice();
      
      pdf.setFontSize(14);
      pdf.setTextColor(59, 77, 74);
      
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(10);
      const quoteText = `Based on your design, size, and materials, expect to pay somewhere around £${totalPrice.toLocaleString('en-GB', { maximumFractionDigits: 0 })}.`;
      const quoteLines = pdf.splitTextToSize(quoteText, 80);
      pdf.text(quoteLines, 110, 190);
      
      pdf.setFontSize(10);
      pdf.setTextColor(120, 120, 120);
      const splitNotes = pdf.splitTextToSize(`Notes: ${formData.notes}`, pageWidth - 40);
      pdf.text(splitNotes, 20, 250);

      // -- Page 2: Plan View & Materials --
      pdf.addPage();
      pdf.setFontSize(18);
      pdf.setTextColor(59, 77, 74);
      pdf.text('Plan View', 20, 20);
      drawImageFit(topImg, 20, 30, pageWidth - 40, (pageWidth - 40) * 0.8);
      
      pdf.text('Material & Finish List', 20, 160);
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      let y = 170;
      pdf.text(`Cladding: ${scene.room.cladding.replace('_', ' ').toUpperCase()}`, 20, y); y += 6;
      pdf.text(`Base: ${scene.room.baseMaterial.replace('_', ' ').toUpperCase()}`, 20, y); y += 6;
      pdf.text(`Roof: ${scene.room.roofMaterial.replace('_', ' ').toUpperCase()}`, 20, y); y += 6;
      pdf.text(`Interior: ${scene.room.interiorColor || 'White'}`, 20, y); y += 6;
      pdf.text(`Frames: ${scene.room.frameColor.toUpperCase()}`, 20, y); y += 10;
      
      pdf.setFontSize(14);
      pdf.setTextColor(59, 77, 74);
      pdf.text('Fixtures & Openings', 20, y); y += 10;
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      scene.objects.forEach((obj, idx) => {
        pdf.text(`${idx + 1}. ${obj.type.toUpperCase()}`, 20, y); 
        pdf.text(`Width: ${obj.widthMm || 0}mm`, 80, y);
        y += 6;
      });

      // -- Page 3: Elevations --
      pdf.addPage();
      pdf.setFontSize(18);
      pdf.setTextColor(59, 77, 74);
      pdf.text('Elevations', 20, 20);
      
      const elWidth = (pageWidth - 60) / 2;
      const elHeight = elWidth * 0.8;
      
      pdf.setFontSize(12);
      pdf.text('Front Elevation', 20, 40);
      drawImageFit(frontImg, 20, 45, elWidth, elHeight);
      pdf.setFontSize(9);
      pdf.text(`Width: ${scene.room.widthMm}mm | Height: ${scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200)}mm (Front) / ${((scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200))}mm (Back)`, 20, 45 + elHeight + 5);
      
      pdf.setFontSize(12);
      pdf.text('Rear Elevation', 40 + elWidth, 40);
      drawImageFit(backImg, 40 + elWidth, 45, elWidth, elHeight);
      pdf.setFontSize(9);
      pdf.text(`Width: ${scene.room.widthMm}mm | Height: ${scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200)}mm (Front) / ${((scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200))}mm (Back)`, 40 + elWidth, 45 + elHeight + 5);
      
      pdf.setFontSize(12);
      pdf.text('Left Elevation', 20, 60 + elHeight + 10);
      drawImageFit(leftImg, 20, 65 + elHeight + 10, elWidth, elHeight);
      pdf.setFontSize(9);
      pdf.text(`Depth: ${scene.room.depthMm}mm | Height: ${scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200)}mm (Front) / ${((scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200))}mm (Back)`, 20, 65 + elHeight * 2 + 15);
      
      pdf.setFontSize(12);
      pdf.text('Right Elevation', 40 + elWidth, 60 + elHeight + 10);
      drawImageFit(rightImg, 40 + elWidth, 65 + elHeight + 10, elWidth, elHeight);
      pdf.setFontSize(9);
      pdf.text(`Depth: ${scene.room.depthMm}mm | Height: ${scene.room.heightMm + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200)}mm (Front) / ${((scene.room.backHeightMm ?? scene.room.heightMm) + (scene.room.baseHeightMm || 100) + (scene.room.roofHeightMm || 200))}mm (Back)`, 40 + elWidth, 65 + elHeight * 2 + 15);

      // --- Page 3: Planning Advice ---
      if (planningAdvice) {
        pdf.addPage();
        pdf.setFontSize(18);
        pdf.setTextColor(59, 77, 74);
        pdf.text('Design Statement & Guidance', 20, 20);
        
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text('This is an automated statement based on your design. Although accurate, we recommend consulting with NAPC (www.napc.uk) for final verification.', 20, 28, { maxWidth: pageWidth - 40 });

        pdf.setFontSize(10);
        pdf.setTextColor(80, 80, 80);
        const splitText = pdf.splitTextToSize(planningAdvice, pageWidth - 40);
        
        let yPos = 40;
        for (let i = 0; i < splitText.length; i++) {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(splitText[i], 20, yPos);
          yPos += 5;
        }
      }

      // Save PDF
      pdf.save('modulr_design_document.pdf');
      
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
            <button 
              onClick={() => {
                alert('Design saved successfully!');
              }}
              className="w-full py-3 bg-[#3b4d4a] text-white rounded-lg font-semibold shadow-sm hover:bg-[#2d3a38] transition-colors"
            >
              Save Design
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
