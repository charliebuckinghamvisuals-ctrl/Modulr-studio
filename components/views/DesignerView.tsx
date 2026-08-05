import React, { useEffect } from 'react';
import { useAppEngine, compressImageFile } from '../../hooks/useAppEngine';
import { AppStage } from '../../types';
import { useCredits } from '../../hooks/useCredits';
import { Construction } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createProject } from '../../services/projectService';

export const DesignerView: React.FC<{ engine: any }> = ({ engine }) => {

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only trust messages from our own origin. The configurator is served from
      // the same host, so anything from elsewhere is not ours.
      if (event.origin !== window.location.origin) return;

      // Save Design in the configurator hands the scene up to here, because the
      // iframe has no Firebase client of its own.
      if (event.data && event.data.type === 'SAVE_3D_DESIGN') {
        (async () => {
          try {
            const { scene, price } = event.data;
            const room = scene?.room || {};
            const name = `Garden room ${room.widthMm || '?'} x ${room.depthMm || '?'}mm`;
            await createProject({
              name,
              estimateValue: typeof price === 'number' ? Math.round(price) : null,
              notes: `Created from the 3D Configurator.\n\n${JSON.stringify(scene?.room ?? {}, null, 2)}`,
            });
            toast.success('Design saved to your projects');
          } catch (err: any) {
            console.error('Failed to save 3D design', err);
            toast.error(err?.message || 'Could not save the design to your projects.');
          }
        })();
        return;
      }

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

  return (
    <div className="w-full h-[calc(100dvh-6rem)] flex flex-col bg-[#0F1110]">
      <iframe 
        src="/3d-config/index.html" 
        className="w-full flex-1 border-none"
        title="3D Configurator"
      />
    </div>
  );
};
