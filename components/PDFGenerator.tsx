import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, FileText } from 'lucide-react';
import { Button } from './Button';
import { toast } from 'react-hot-toast';

interface PDFGeneratorProps {
    originalImage: string | null;
    renderedImage: string | null;
    materials: any;
    prompt: string;
}

export const PDFGenerator: React.FC<PDFGeneratorProps> = ({ originalImage, renderedImage, materials, prompt }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = async () => {
        if (!printRef.current || !originalImage || !renderedImage) {
            toast.error('Need both original and rendered images to export PDF.');
            return;
        }

        setIsExporting(true);
        const loadingToast = toast.loading('Generating High-Res PDF Presentation...');

        try {
            // Un-hide the print container temporarily for html2canvas to read it
            printRef.current.style.display = 'block';

            const canvas = await html2canvas(printRef.current, {
                scale: 2, // High resolution
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            printRef.current.style.display = 'none'; // Hide it again

            const imgData = canvas.toDataURL('image/png');

            // A4 dimensions in mm
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Modulr-Studio-Presentation-${Date.now()}.pdf`);

            toast.success('PDF Exported Successfully!', { id: loadingToast });
        } catch (error) {
            console.error('PDF Export Error:', error);
            toast.error('Failed to generate PDF.', { id: loadingToast });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            <Button
                variant="secondary"
                onClick={handleExportPDF}
                disabled={isExporting || !originalImage || !renderedImage}
                icon={<FileText size={16} />}
                className="text-xs"
            >
                {isExporting ? 'Generating...' : 'Export PDF'}
            </Button>

            {/* Hidden A4 Template for PDF Generation */}
            <div className="overflow-hidden absolute top-0 left-0 w-[800px] bg-white opacity-0 pointer-events-none" style={{ display: 'none' }}>
                <div ref={printRef} className="w-[800px] h-[1131px] bg-white p-12 flex flex-col font-sans text-slate-900 relative">

                    {/* Header */}
                    <div className="flex justify-between items-end border-b-2 border-slate-200 pb-6 mb-8">
                        <div>
                            <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-tight uppercase font-heading">
                                MODULR <span className="font-sans font-light">STUDIO</span>
                            </h1>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Presentation Board</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-400 font-medium">Generated via Neural Architecture Engine</p>
                            <p className="text-xs text-slate-400 font-medium mt-1">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    {/* Main Images */}
                    <div className="flex-1 flex flex-col gap-8">
                        {/* Rendered */}
                        <div className="flex flex-col gap-3 h-[400px]">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">01 / Proposed Concept</span>
                            <div className="w-full flex-1 rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100 bg-slate-50 relative flex items-center justify-center">
                                {renderedImage && <img src={`data:image/png;base64,${renderedImage}`} className="max-w-full max-h-full object-contain" alt="Render" />}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 h-[300px]">
                            {/* Original */}
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">02 / Source Geometry</span>
                                <div className="w-full flex-1 rounded-xl overflow-hidden shadow-inner border border-slate-100 bg-slate-50 relative flex items-center justify-center">
                                    {originalImage && <img src={`data:image/png;base64,${originalImage}`} className="max-w-full max-h-full object-contain opacity-80" alt="Original" />}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="flex flex-col gap-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">03 / Material Specification</span>
                                <div className="w-full flex-1 rounded-xl shadow-inner border border-slate-100 bg-slate-50 p-6 flex flex-col gap-4">
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                        {Object.entries(materials).map(([key, value]) => (
                                            <div key={key}>
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key}</p>
                                                <p className="text-sm font-medium text-slate-700 mt-1 capitalize leading-tight">{String(value) || 'Standard'}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-auto pt-4 border-t border-slate-200">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Design Directives</p>
                                        <p className="text-xs font-medium text-slate-600 mt-1 italic line-clamp-3 leading-relaxed">{prompt || 'No additional directives provided.'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer / Watermark */}
                    <div className="mt-auto pt-8 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                        <span>Private & Confidential</span>
                        <span className="flex items-center gap-1 uppercase"><span className="font-heading font-black">MODULR</span> <span className="font-sans font-light">STUDIO</span> v3.2 Pro</span>
                    </div>

                </div>
            </div>
        </>
    );
};
