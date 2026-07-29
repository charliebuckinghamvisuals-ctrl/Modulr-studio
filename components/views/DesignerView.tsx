import React, { useEffect } from 'react';
import { useAppEngine, compressImageFile } from '../../hooks/useAppEngine';
import { AppStage } from '../../types';
import { useCredits } from '../../hooks/useCredits';
import { Construction } from 'lucide-react';

export const DesignerView: React.FC<{ engine: any }> = ({ engine }) => {

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Allow messages from the local origin or the iframe origin
      if (event.data && event.data.type === 'RENDER_3D_SCENE') {
        const dataUrl = event.data.image;
        
        // Convert dataUrl to a File object so the engine can process it properly
        fetch(dataUrl)
          .then(res => res.blob())
          .then(async blob => {
            const file = new File([blob], '3d-design.png', { type: 'image/png' });
            
            try {
                // Compress the image to strip the prefix and reduce size before sending to API
                const base64Data = await compressImageFile(file, 1920);
                
                // Set it as if they uploaded a SketchUp image
                engine.setIsSketchUpMode(true);
                
                // Manually set the original image directly
                engine.setOriginalImageForStage(AppStage.RENDER_ENGINE, base64Data);
                
                // Switch to the Render Engine stage
                engine.setActiveStage(AppStage.RENDER_ENGINE);

                // Trigger the analysis automatically so the user sees the loading state
                engine.handleAnalyzeForRenderEngine(base64Data);
            } catch (err) {
                console.error("Failed to process 3D scene image", err);
            }
          });
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Lock scroll on the main page when configurator is active
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('message', handleMessage);
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };
  }, [engine]);

  const { plan, loading } = useCredits();

  if (loading) {
    return (
        <div className="w-full h-[100dvh] flex flex-col bg-[#0F1110] items-center justify-center">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
  }

  const isMasterAccount = plan?.toLowerCase() === 'master';

  if (!isMasterAccount) {
      return (
          <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-[#0F1110] relative overflow-hidden">
              <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#61ffb8]/5 rounded-full blur-[150px] pointer-events-none"></div>
              <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#61ffb8]/5 rounded-full blur-[120px] pointer-events-none"></div>
              
              <div className="z-10 flex flex-col items-center text-center space-y-6 max-w-md p-10 bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 shadow-2xl">
                  <div className="w-20 h-20 rounded-3xl bg-[#61ffb8]/10 flex items-center justify-center text-[#61ffb8] border border-[#61ffb8]/20">
                      <Construction size={40} />
                  </div>
                  <div className="space-y-3">
                      <h2 className="text-3xl font-bold text-white tracking-tighter">Under Construction</h2>
                      <p className="text-slate-400 text-sm leading-relaxed">The 3D Configurator is currently being built and is strictly accessible to Master accounts only.</p>
                  </div>
                  <button 
                      onClick={() => engine.setActiveStage(AppStage.HOME)} 
                      className="mt-4 px-8 py-4 rounded-xl bg-[#61ffb8] text-slate-900 text-xs font-bold uppercase tracking-widest hover:bg-[#61ffb8]/90 transition-all w-full"
                  >
                      Return to Dashboard
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-[#0F1110]">
      <iframe 
        src="/3d-config/index.html" 
        className="w-full flex-1 border-none"
        title="3D Configurator"
      />
    </div>
  );
};
