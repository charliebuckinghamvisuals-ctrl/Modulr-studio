import React, { useEffect } from 'react';
import { useAppEngine, compressImageFile } from '../../hooks/useAppEngine';
import { AppStage } from '../../types';

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
