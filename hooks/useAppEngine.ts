import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { AppStage, MaterialConfig, WeatherConfig, ProcessingState, LibraryMaterialItem, MaterialLibrary } from '../types';
import { PRESET_MATERIALS, WEATHER_CONDITIONS, SEASONS } from '../constants';
import { generateLineDrawing, analyzeComponents, analyzeBatchMaterials, renderBuilding, applyWeather, editImage, generatePresentationBoard, analyzeExteriorDetails, analyzeSceneForEditor } from '../services/geminiService';
import { saveToHistory } from '../services/historyService';
import { db, auth } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const compressImageFile = (file: File, maxWidth = 1920): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas ctx failed'));
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = () => reject(new Error('Image logic failed'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('File reader failed'));
        reader.readAsDataURL(file);
    });
};

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
    const [isHighQuality, setIsHighQuality] = useState(true);
    const [isProMode, setIsProMode] = useState(true);
    const [isColoredLineDrawing, setIsColoredLineDrawing] = useState(false);
    const [editorAnalysis, setEditorAnalysis] = useState<any>(null);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg'>('png');
    const [isSketchUpMode, setIsSketchUpMode] = useState(false);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

    const [userPlan, setUserPlan] = useState<string>('free');
    const [studioBackground, setStudioBackground] = useState<string>('Pure White Studio');
    const [selectedAngle, setSelectedAngle] = useState<string>('Front');

    const [materials, setMaterials] = useState({
        walls: 'none',
        roof: 'none',
        windows: 'none',
        doors: 'none',
        decking: 'none'
    });

    const [weather, setWeather] = useState<WeatherConfig>({
        condition: 'auto',
        intensity: 0.5,
        season: 'summer'
    });

    // Material Library State
    const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrary>({
        walls: [],
        roof: [],
        windows: [],
        doors: [],
        decking: []
    });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const docRef = doc(db, 'users', user.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        if (docSnap.data().materialLibrary) {
                            setMaterialLibrary(docSnap.data().materialLibrary);
                        }
                        if (docSnap.data().plan) {
                            setUserPlan(docSnap.data().plan);
                        }
                    } else {
                        const saved = localStorage.getItem('modulr_material_library');
                        if (saved) {
                            const parsed = JSON.parse(saved);
                            setMaterialLibrary(parsed);
                            await setDoc(docRef, { materialLibrary: parsed }, { merge: true });
                        }
                    }
                } catch (e) {
                    console.error("Firestore sync error", e);
                }
            } else {
                setMaterialLibrary({ walls: [], roof: [], windows: [], doors: [], decking: [] });
            }
        });
        return unsubscribe;
    }, []);

    const addToLibrary = async (category: keyof MaterialLibrary, item: Omit<LibraryMaterialItem, 'id'>) => {
        const newItem: LibraryMaterialItem = {
            ...item,
            id: Date.now().toString()
        };

        const next = {
            ...materialLibrary,
            [category]: [...materialLibrary[category], newItem]
        };
        
        setMaterialLibrary(next);
        
        if (auth.currentUser) {
            try {
                await setDoc(doc(db, 'users', auth.currentUser.uid), { materialLibrary: next }, { merge: true });
            } catch(e) { console.error("Save error", e); }
        } else {
            localStorage.setItem('modulr_material_library', JSON.stringify(next));
        }
        toast.success(`Added to ${category} library`);
    };

    const removeFromLibrary = async (category: keyof MaterialLibrary, id: string) => {
        const next = {
            ...materialLibrary,
            [category]: materialLibrary[category].filter(item => item.id !== id)
        };
        
        setMaterialLibrary(next);

        if (auth.currentUser) {
            try {
                await setDoc(doc(db, 'users', auth.currentUser.uid), { materialLibrary: next }, { merge: true });
            } catch(e) { console.error("Save error", e); }
        } else {
            localStorage.setItem('modulr_material_library', JSON.stringify(next));
        }
        toast.success("Removed from library");
    };

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
        setIsSketchUpMode(false);
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
            toast.error(`Auto-detect failed: ${error instanceof Error ? error.message : 'Unknown error'}. Using defaults.`);
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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetStage: AppStage) => {
        const file = e.target.files?.[0];
        if (file) {
            setProcessing({ isLoading: true, message: 'Optimizing high-res upload...' });
            try {
                const base64Data = await compressImageFile(file, 1920);

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
            } catch (err) {
                console.error('Image compression failed', err);
                toast.error('Failed to process image upload');
            } finally {
                setProcessing({ isLoading: false, message: '' });
                e.target.value = '';
            }
        }
    };

    const handleSlotImageUpload = async (file: File | null, index: number, targetStage: AppStage) => {
        if (!file) {
            // Allow clearing a slot
            setBatchImages(prev => {
                const next = [...prev];
                next[index] = '';
                return next;
            });
            // Wipe stale renders from matching index
            setBatchRenders(prev => {
                const next = [...prev];
                if (next.length > index) next[index] = '';
                return next;
            });
            setBatchMaterials(prev => {
                const next = [...prev];
                if (next.length > index) next[index] = null as any;
                return next;
            });
            return;
        }

        setActiveStage(targetStage);
        setOriginalImage(null); // Clear single image mode
        setProcessing({ isLoading: true, message: 'Optimizing high-res upload...' });

        try {
            const base64Data = await compressImageFile(file, 1920);
            
            // Wipe any old render data when re-uploading into an existing slot
            setBatchRenders(prev => {
                const next = [...prev];
                while(next.length < 5) next.push('');
                next[index] = '';
                return next;
            });

            setBatchImages(prev => {
                const next = [...prev];
                // Ensure array has at least 5 slots
                while(next.length < 5) next.push('');
                next[index] = base64Data;
                
                // Trigger batch material auto-detect on the new image
                analyzeBatchMaterials([base64Data]).then(detected => {
                    if (detected && detected.length > 0) {
                        setBatchMaterials(mats => {
                            const newMats = [...mats];
                            while(newMats.length < 5) newMats.push(materials);
                            newMats[index] = detected[0];
                            return newMats;
                        });
                        // If this is the first image uploaded, set root materials
                        if (next.filter(Boolean).length === 1) {
                            setMaterials(detected[0]);
                        }
                    }
                }).catch(err => {
                    console.error("Slot auto-detect failed", err);
                    toast.error("Auto detect failed for this slot.");
                });
                
                return next;
            });
        } catch (err) {
            console.error('Image compression failed', err);
            toast.error('Failed to process image upload');
        } finally {
            setProcessing({ isLoading: false, message: '' });
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

            // Watermark for Free users
            if (userPlan === 'free' || userPlan === 'trial') {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.font = 'bold 36px "Inter", sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.fillText('MODULR STUDIO', canvas.width - 40, canvas.height - 40);
                
                ctx.font = 'italic 20px "Inter", sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillText('Trial Render', canvas.width - 40, canvas.height - 15);
                ctx.restore();
            }

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
            const result = await renderBuilding(renderedImage, materials, refinementPrompt, true, isProMode, undefined, isSketchUpMode);
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

        const loadingMsg = isSketchUpMode
            ? 'Enhancing SketchUp model to photorealistic quality...'
            : 'Rendering photorealistic textures and lighting...';
        const weatherPrompt = weather.condition !== 'auto' ? `Weather condition: ${weather.condition}. ` : '';
        const finalPrompt = weatherPrompt + additionalPrompt;
        
        setProcessing({ isLoading: true, message: loadingMsg });
        try {
            const result = await renderBuilding(source, materials, finalPrompt, isHighQuality, isProMode, activeStage === AppStage.STUDIO ? selectedAngle : undefined, isSketchUpMode, activeStage === AppStage.STUDIO ? studioBackground : undefined);
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
            const validIndices = batchImages.map((img, idx) => img && img.trim() !== '' ? idx : -1).filter(idx => idx !== -1);
            if (validIndices.length === 0) return;

            setProcessing({ isLoading: true, message: 'Rendering batch sequence...' });
            
            const newRenders: string[] = [...batchRenders];
            while(newRenders.length < 5) newRenders.push(''); // Ensure matching array length
            
            for (let i = 0; i < validIndices.length; i++) {
                const slotIndex = validIndices[i];
                const sourceImg = batchImages[slotIndex];
                const matConfig = batchMaterials[slotIndex] || materials;
                
                setProcessing({ isLoading: true, message: `Rendering angle ${i + 1} of ${validIndices.length}...` });
                
                const weatherPrompt = weather.condition !== 'auto' ? `Weather condition: ${weather.condition}. ` : '';
                const finalPrompt = weatherPrompt + additionalPrompt;
                const isStudioReq = activeStage === AppStage.STUDIO;

                const result = await renderBuilding(
                    sourceImg, 
                    matConfig, 
                    finalPrompt, 
                    isHighQuality, 
                    isProMode,
                    matConfig.orientation, // backend orientation prompt
                    isSketchUpMode,
                    isStudioReq ? studioBackground : undefined // Pass background if studio
                );
                
                newRenders[slotIndex] = result;
                setBatchRenders([...newRenders]);
                
                // Show last rendered
                if (i === validIndices.length - 1) {
                    setRenderedImage(result);
                }
            }
            
            await saveToHistory({
                stage: activeStage,
                image: newRenders.find(i => i !== '') || null,
                originalImage: batchImages.find(i => i !== '') || null,
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
            const result = await generatePresentationBoard(originalImage, selectedDetails, isHighQuality, isProMode);
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
        isSketchUpMode, setIsSketchUpMode,
        userPlan, studioBackground, setStudioBackground, selectedAngle, setSelectedAngle,
        materialLibrary, addToLibrary, removeFromLibrary,
        activeProfileId, setActiveProfileId,
        handleGenerateLineDrawing, handleAnalyzeMaterials, handleRender, handleBatchRender, handleRefineRender, handleEditImage, handleWeather, handleMaterialStudio, handleAnalyzeForEditor, handleAnalyzeForMaterialStudio,
        handleSlotImageUpload,
        getRenderUrl
    };
};
