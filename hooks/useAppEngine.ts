import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { AppStage, MaterialConfig, WeatherConfig, ProcessingState } from '../types';
import { PRESET_MATERIALS, WEATHER_CONDITIONS, SEASONS } from '../constants';
import { generateLineDrawing, analyzeComponents, analyzeBatchMaterials, renderBuilding, applyWeather, editImage, generatePresentationBoard, analyzeExteriorDetails, analyzeSceneForEditor } from '../services/geminiService';
import { saveToHistory } from '../services/historyService';

export const useAppEngine = () => {
    const [activeStage, setActiveStage] = useState<AppStage>(AppStage.HOME);

    // Image State
    const [stageImages, setStageImages] = useState<Partial<Record<AppStage, string>>>({});
    const originalImage = stageImages[activeStage] || null;

    const setOriginalImage = (img: string | null) => {
        setStageImages(prev => {
            const next = { ...prev };
            if (img) next[activeStage] = img;
            else delete next[activeStage];
            return next;
        });
    };

    const setOriginalImageForStage = (stage: AppStage, img: string | null) => {
        setStageImages(prev => {
            const next = { ...prev };
            if (img) next[stage] = img;
            else delete next[stage];
            return next;
        });
    };

    const [lineImage, setLineImage] = useState<string | null>(null);
    const [lineSourceImage, setLineSourceImage] = useState<string | null>(null);
    const [renderedImage, setRenderedImage] = useState<string | null>(null);
    const [editorImage, setEditorImage] = useState<string | null>(null);
    const [lineEnvironmentImage, setLineEnvironmentImage] = useState<string | null>(null);
    const [finalImage, setFinalImage] = useState<string | null>(null);
    const [materialStudioImage, setMaterialStudioImage] = useState<string | null>(null);

    // Batch Rendering State
    const [batchImages, setBatchImages] = useState<string[]>([]);
    const [batchRenders, setBatchRenders] = useState<string[]>([]);
    const [batchMaterials, setBatchMaterials] = useState<MaterialConfig[]>([]);

    const [detectedDetails, setDetectedDetails] = useState<string[]>([]);
    const [selectedDetails, setSelectedDetails] = useState<string[]>([]);
    const [processing, setProcessing] = useState<ProcessingState>({ isLoading: false, message: '' });
    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [lineDrawingPrompt, setLineDrawingPrompt] = useState('');
    const [editorPrompt, setEditorPrompt] = useState('');
    const [lightingDirection, setLightingDirection] = useState<'morning' | 'noon' | 'evening' | 'night'>('noon');
    const [isHighQuality, setIsHighQuality] = useState(true);
    const [isProMode, setIsProMode] = useState(true);
    const [isColoredLineDrawing, setIsColoredLineDrawing] = useState(false);
    const [editorAnalysis, setEditorAnalysis] = useState<any>(null);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg'>('png');

    const [materials, setMaterials] = useState({
        walls: 'none',
        roof: 'none',
        windows: 'none',
        doors: 'none',
        decking: 'none'
    });

    const [weather, setWeather] = useState<WeatherConfig>({
        condition: 'sunny',
        intensity: 0.5,
        season: 'summer'
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const materialInputRef = useRef<HTMLInputElement>(null);

    const handleReset = () => {
        setStageImages({});
        setLineImage(null);
        setLineSourceImage(null);
        setRenderedImage(null);
        setEditorImage(null);
        setFinalImage(null);
        setMaterialStudioImage(null);
        setBatchImages([]);
        setBatchRenders([]);
        setBatchMaterials([]);
        setDetectedDetails([]);
        setSelectedDetails([]);
        setAdditionalPrompt('');
        setLineDrawingPrompt('');
        setEditorPrompt('');
        setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' });
        setActiveStage(AppStage.HOME);

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (materialInputRef.current) materialInputRef.current.value = '';
    };

    const handleAnalyzeForMaterialStudio = async (image: string) => {
        setProcessing({ isLoading: true, message: 'Analyzing material details...' });
        try {
            const details = await analyzeExteriorDetails(image);
            setDetectedDetails(details);
            setSelectedDetails([]); // Reset selection
        } catch (error) {
            console.error(error);
            toast.error('Could not analyze image details.');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleAnalyzeForRenderEngine = async (image: string) => {
        setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' }); // Explicit reset
        setProcessing({ isLoading: true, message: 'Detecting existing materials...' });
        try {
            const detectedMaterials = await analyzeComponents(image);
            setMaterials(detectedMaterials);
        } catch (error) {
            console.error(error);
            toast.error('Could not auto-detect materials. Using defaults.');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleAnalyzeForEditor = async (image: string) => {
        setEditorAnalysis(null);
        setProcessing({ isLoading: true, message: 'Analyzing scene details...' });
        try {
            const result = await analyzeSceneForEditor(image);
            setEditorAnalysis(result);
        } catch (error) {
            console.error(error);
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, targetStage: AppStage) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                const base64Data = result.split(',')[1];

                setStageImages(prev => ({ ...prev, [targetStage]: base64Data }));

                setLineImage(null);
                setRenderedImage(null);
                setEditorImage(null);
                setFinalImage(null);
                setMaterialStudioImage(null);
                setDetectedDetails([]);
                setSelectedDetails([]);

                setActiveStage(targetStage);

                if (targetStage === AppStage.LINE_CONVERT) {
                    setLineSourceImage(base64Data);
                } else if (targetStage === AppStage.MATERIAL_STUDIO) {
                    handleAnalyzeForMaterialStudio(base64Data);
                } else if (targetStage === AppStage.RENDER_ENGINE) {
                    setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' });
                    handleAnalyzeForRenderEngine(base64Data);
                } else if (targetStage === AppStage.EDITOR) {
                    handleAnalyzeForEditor(base64Data);
                }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        }
    };

    const handleBatchImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        const selectedFiles = files.slice(0, 5);
        setActiveStage(AppStage.RENDER_ENGINE);
        setOriginalImage(null); // Clear single image mode

        Promise.all(selectedFiles.map(file => {
            return new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const result = event.target?.result as string;
                    resolve(result.split(',')[1]);
                };
                reader.readAsDataURL(file);
            });
        })).then(base64Array => {
            setBatchImages(base64Array);
            setBatchRenders([]);
            handleAnalyzeBatchMaterials(base64Array);
        });

        e.target.value = '';
    };

    const handleAnalyzeBatchMaterials = async (images: string[]) => {
        setProcessing({ isLoading: true, message: 'Analyzing orientations and materials...' });
        try {
            const detectedBatch = await analyzeBatchMaterials(images);
            setBatchMaterials(detectedBatch);
            if (detectedBatch.length > 0) {
                 setMaterials(detectedBatch[0]); // fallback base material
            }
        } catch (error) {
            console.error('Batch analysis error:', error);
            toast.error('Could not auto-detect batch materials.');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const toggleDetailSelection = (detail: string) => {
        if (selectedDetails.includes(detail)) {
            setSelectedDetails(selectedDetails.filter(d => d !== detail));
        } else {
            if (selectedDetails.length < 4) {
                setSelectedDetails([...selectedDetails, detail]);
            }
        }
    };

    const getRenderUrl = (img: string | null) => {
        if (!img) return null;
        if (img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('http')) return img;
        return `data:image/jpeg;base64,${img}`;
    };

    const handleDownload = (imageData: string | null, filename: string) => {
        if (!imageData) return;

        const mimeType = downloadFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        const nameWithoutExt = filename.replace(/\.(png|jpe?g|pdf)$/i, '');
        const dynamicName = `${nameWithoutExt}-${Date.now()}.${downloadFormat}`;

        // Determine the correct source URL
        let srcUrl = imageData;
        if (!imageData.startsWith('data:') && !imageData.startsWith('blob:') && !imageData.startsWith('http')) {
            srcUrl = `data:image/jpeg;base64,${imageData}`;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Draw a white background first in case of PNG to JPG conversion
            if (downloadFormat === 'jpg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);

            // Convert and trigger download
            const dataUrl = canvas.toDataURL(mimeType, downloadFormat === 'jpg' ? 0.95 : undefined);
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = dynamicName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up
            canvas.width = 0;
            canvas.height = 0;
        };

        img.onerror = () => {
            console.error('Failed to load image for download');
            toast.error("Failed to process image for download.");
        };

        img.src = srcUrl;
    };

    const handleRefineRender = async () => {
        if (!renderedImage) return;
        if (!refinementPrompt.trim()) {
            toast.error('Please describe the changes you want to make.');
            return;
        }

        setProcessing({ isLoading: true, message: 'Refining and enhancing render...' });
        try {
            const result = await renderBuilding(renderedImage, materials, refinementPrompt, true, isProMode);
            setRenderedImage(result);
            setRefinementPrompt('');
            await saveToHistory({
                stage: AppStage.RENDER_ENGINE,
                image: result,
                originalImage: originalImage,
                prompt: `Refinement: ${refinementPrompt}`,
                settings: materials
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
            toast.success('Render updated successfully!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to refine render');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleGenerateLineDrawing = async () => {
        const combinedPrompt = [lineDrawingPrompt, additionalPrompt].filter(Boolean).join('. ');
        if (!lineSourceImage && !combinedPrompt.trim()) {
            toast.error('Please describe what you want to generate, or upload an image.');
            return;
        }
        setProcessing({ isLoading: true, message: 'Constructing architectural geometry...' });
        try {
            const result = await generateLineDrawing(lineSourceImage, combinedPrompt, isHighQuality, isColoredLineDrawing, lineEnvironmentImage, isProMode);
            setLineImage(result);
            await saveToHistory({
                stage: AppStage.LINE_CONVERT,
                image: result,
                originalImage: lineSourceImage,
                prompt: combinedPrompt,
                settings: { isHighQuality, isColoredLineDrawing },
                referenceImage: lineEnvironmentImage
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate line drawing');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleAnalyzeMaterials = async () => {
        if (!originalImage) return;
        setProcessing({ isLoading: true, message: 'Analyzing building components...' });
        try {
            const detected = await analyzeComponents(originalImage);
            setMaterials(prev => ({ ...prev, ...detected }));
        } catch (error) {
            console.warn("Analysis partial fail");
            toast.error('Failed to analyze materials automatically.');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleRender = async () => {
        const source = originalImage;
        if (!source) return;

        setProcessing({ isLoading: true, message: 'Rendering photorealistic textures and lighting...' });
        try {
            const result = await renderBuilding(source, materials, additionalPrompt, isHighQuality, isProMode);
            setRenderedImage(result);
            setEditorImage(null);
            await saveToHistory({
                stage: AppStage.RENDER_ENGINE,
                image: result,
                originalImage: originalImage,
                prompt: additionalPrompt,
                settings: materials
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to render');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleBatchRender = async () => {
        if (batchImages.length === 0) return;

        setProcessing({ isLoading: true, message: 'Rendering batch sequence...' });
        try {
            const newRenders: string[] = [];
            for (let i = 0; i < batchImages.length; i++) {
                const sourceImg = batchImages[i];
                const matConfig = batchMaterials[i] || materials;
                
                setProcessing({ isLoading: true, message: `Rendering angle ${i + 1} of ${batchImages.length}...` });
                
                const result = await renderBuilding(
                    sourceImg, 
                    matConfig, 
                    additionalPrompt, 
                    isHighQuality, 
                    isProMode,
                    matConfig.orientation
                );
                
                newRenders.push(result);
                setBatchRenders([...newRenders]);
                setRenderedImage(result);
            }
            
            await saveToHistory({
                stage: AppStage.RENDER_ENGINE,
                image: newRenders[0],
                originalImage: batchImages[0],
                prompt: 'Batch Render: ' + additionalPrompt,
                settings: materials
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
            
            toast.success('Batch render complete!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Batch render failed midway');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleEditImage = async (maskImage?: string | null) => {
        const source = originalImage;
        if (!source) return;

        setProcessing({ isLoading: true, message: 'Refining and editing details...' });
        try {
            const result = await editImage(source, editorPrompt, maskImage, isHighQuality, isProMode);
            setEditorImage(result);
            await saveToHistory({
                stage: AppStage.EDITOR,
                image: result,
                originalImage: originalImage,
                prompt: editorPrompt,
                settings: { isHighQuality }
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to edit image');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleWeather = async () => {
        const source = originalImage;
        if (!source) return;

        setProcessing({ isLoading: true, message: `Simulating ${weather.condition}...` });
        try {
            const result = await applyWeather(source, weather, isHighQuality, isProMode);
            setFinalImage(result);
            await saveToHistory({
                stage: AppStage.EDITOR,
                image: result,
                originalImage: originalImage,
                prompt: `Weather condition applied: ${weather.condition}`,
                settings: weather
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to apply weather');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleMaterialStudio = async () => {
        if (!originalImage) return;
        if (selectedDetails.length !== 4) return;

        setProcessing({ isLoading: true, message: 'Generating Material Sheet (2x2 Grid)...' });
        try {
            const result = await generatePresentationBoard(originalImage, selectedDetails, isProMode);
            setMaterialStudioImage(result);
            await saveToHistory({
                stage: AppStage.MATERIAL_STUDIO,
                image: result,
                originalImage: originalImage,
                prompt: 'Generated Architecture Detailed Callouts',
                settings: { selectedDetails }
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate Material Studio board');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    return {
        activeStage, setActiveStage,
        originalImage, setOriginalImage, setOriginalImageForStage, lineImage, setLineImage, lineSourceImage, setLineSourceImage, renderedImage, setRenderedImage, editorImage, setEditorImage, lineEnvironmentImage, setLineEnvironmentImage, finalImage, setFinalImage, materialStudioImage, setMaterialStudioImage,
        batchImages, setBatchImages, batchRenders, setBatchRenders, batchMaterials, setBatchMaterials,
        detectedDetails, setDetectedDetails, selectedDetails, setSelectedDetails, toggleDetailSelection,
        processing,
        additionalPrompt, setAdditionalPrompt,
        lineDrawingPrompt, setLineDrawingPrompt,
        editorPrompt, setEditorPrompt,
        lightingDirection, setLightingDirection,
        isHighQuality, setIsHighQuality,
        isProMode, setIsProMode,
        isColoredLineDrawing, setIsColoredLineDrawing,
        editorAnalysis, setEditorAnalysis,
        materials, setMaterials,
        weather, setWeather,
        fileInputRef, materialInputRef,
        handleReset, handleImageUpload, handleBatchImageUpload, handleDownload,
        refinementPrompt, setRefinementPrompt,
        downloadFormat, setDownloadFormat,
        handleGenerateLineDrawing, handleAnalyzeMaterials, handleRender, handleBatchRender, handleRefineRender, handleEditImage, handleWeather, handleMaterialStudio, handleAnalyzeForEditor, handleAnalyzeForMaterialStudio,
        getRenderUrl
    };
};
