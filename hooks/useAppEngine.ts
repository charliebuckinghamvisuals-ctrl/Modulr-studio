import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { AppStage, MaterialConfig, WeatherConfig, ProcessingState, LibraryMaterialItem, MaterialLibrary } from '../types';
import { PRESET_MATERIALS, WEATHER_CONDITIONS, SEASONS } from '../constants';
import { generateLineDrawing, analyzeComponents, analyzeBatchMaterials, renderBuilding, applyWeather, editImage, generatePresentationBoard, analyzeExteriorDetails, analyzeSceneForEditor, setConfigSpec, describeGarden, getSceneContext, setSceneContext, getLastVerification, RenderVerification } from '../services/geminiService';
import { saveToHistory } from '../services/historyService';
import { trackFeatureUsage } from '../services/analytics';
import { db, auth } from '../services/firebase';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export const compressImageFile = (file: File, maxWidth = 1920): Promise<string> => {
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
    // Camera effects (depth of field, background bokeh) are OFF by default -
    // the base output is a deep-focus archviz frame; this opts into the DSLR look.
    const [cameraEffects, setCameraEffects] = useState(false);
    // Seed of the last render, so "same look" re-renders are possible.
    const [lastSeed, setLastSeed] = useState<number | null>(null);
    // The server's automatic quality-check result for the last render.
    const [renderVerification, setRenderVerification] = useState<RenderVerification | null>(null);
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
    const [isAnalyzingMaterials, setIsAnalyzingMaterials] = useState(false);

    const [userPlan, setUserPlan] = useState<string>('free');
    const [studioBackground, setStudioBackground] = useState<string>('Pure White Studio');
    const [selectedAngle, setSelectedAngle] = useState<string>('Front');

    /**
     * Material Studio operates in one of two modes, chosen after upload:
     *   'closeup' - the original 2x2 macro detail sheet
     *   'change' - detect the building's materials and swap them
     * null means an image is loaded but the user hasn't chosen yet.
     */
    const [materialStudioMode, setMaterialStudioMode] = useState<'closeup' | 'change' | null>(null);

    // Typed as MaterialConfig so the optional `orientation` field is part of the
    // state's type. Without the annotation TypeScript inferred a narrower shape
    // from the initial value, and the code that sets orientation was an error.
    const [materials, setMaterials] = useState<MaterialConfig>({
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

    /**
     * Persist the library and report honestly whether it stuck.
     *
     * The previous version swallowed the error and showed a success toast
     * regardless, so a failed write told the user their material was saved when
     * it was not - and they only discovered the loss on next sign-in. Firestore
     * caps documents at 1 MB and library items carry base64 images, so this
     * failure mode is reached in normal use, not just in outages.
     */
    const persistLibrary = async (next: MaterialLibrary): Promise<boolean> => {
        try {
            if (auth.currentUser) {
                await setDoc(doc(db, 'users', auth.currentUser.uid), { materialLibrary: next }, { merge: true });
            } else {
                localStorage.setItem('modulr_material_library', JSON.stringify(next));
            }
            return true;
        } catch (e) {
            console.error("Library save error", e);
            return false;
        }
    };

    const addToLibrary = async (category: keyof MaterialLibrary, item: Omit<LibraryMaterialItem, 'id'>) => {
        const newItem: LibraryMaterialItem = {
            ...item,
            // crypto.randomUUID, not Date.now: two items added in the same
            // millisecond shared an id, and removeFromLibrary filters by id - 
            // so deleting one silently deleted both.
            id: crypto.randomUUID()
        };

        const next = {
            ...materialLibrary,
            [category]: [...materialLibrary[category], newItem]
        };

        const previous = materialLibrary;
        setMaterialLibrary(next);

        if (await persistLibrary(next)) {
            toast.success(`Added to ${category} library`);
        } else {
            setMaterialLibrary(previous); // keep the UI honest about what was stored
            toast.error("Couldn't save to your library. Your library may be full - try removing an item.");
        }
    };

    const removeFromLibrary = async (category: keyof MaterialLibrary, id: string) => {
        const next = {
            ...materialLibrary,
            [category]: materialLibrary[category].filter(item => item.id !== id)
        };

        const previous = materialLibrary;
        setMaterialLibrary(next);

        if (await persistLibrary(next)) {
            toast.success("Removed from library");
        } else {
            setMaterialLibrary(previous);
            toast.error("Couldn't update your library. Please try again.");
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const materialInputRef = useRef<HTMLInputElement>(null);

    /**
     * Empty the workspace but stay where you are.
     *
     * This is what the Reset button on each tool calls. Kept separate from
     * handleReset because "clear this and let me try again" and "take me back to
     * the start" are different intentions - resetting to the homepage means
     * navigating back into the tool and re-picking it, which is not what someone
     * wants after one bad render.
     *
     * The file inputs are cleared by value as well as by state: without that,
     * choosing the SAME file again fires no change event and the upload appears
     * to do nothing.
     */
    const clearWorkspace = () => {
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
        setIsBatchMode(false);

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (materialInputRef.current) materialInputRef.current.value = '';
    };

    /** Clear everything AND leave the tool - what the header's Start Over does. */
    const handleReset = () => {
        clearWorkspace();
        setActiveStage(AppStage.HOME);
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
        setIsAnalyzingMaterials(true);
        try {
            const detectedMaterials = await analyzeComponents(image);
            setMaterials(detectedMaterials);
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : 'Unknown error';
            if (msg.includes('Missing authentication token') || msg.includes('Unauthorized')) {
                toast.error('Please log in to use the auto-detect feature.');
            } else {
                toast.error(`Auto-detect failed: ${msg}. Using defaults.`);
            }
        } finally {
            setProcessing({ isLoading: false, message: '' });
            setIsAnalyzingMaterials(false);
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
            // A hand-picked image is not the configured 3D building — stale
            // configurator constraints must not leak into its render prompt.
            setConfigSpec(null);
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
                    // Do NOT analyse yet. Material Studio now has two modes, and
                    // they need different analyses - close-up detail extraction
                    // vs. component material detection. Running one on upload
                    // would waste a call and a credit whenever the user picked
                    // the other. The view prompts for a mode first.
                    setMaterialStudioMode(null);
                } else if (targetStage === AppStage.RENDER_ENGINE) {
                    setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' });
                    // Always auto-detect materials - works for photos, B&W line drawings, and SketchUp models
                    await handleAnalyzeForRenderEngine(base64Data);
                } else if (targetStage === AppStage.EDITOR) {
                    await handleAnalyzeForEditor(base64Data);
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
                
                // Ensure batch materials array aligns with slots, copying current overrides
                setBatchMaterials(mats => {
                    const newMats = [...mats];
                    while(newMats.length < 5) newMats.push(materials);
                    return newMats;
                });
                
                return next;
            });

            if (targetStage === AppStage.RENDER_ENGINE) {
                const isDefault = materials.walls === 'none' && materials.roof === 'none';
                if (isDefault && !isSketchUpMode) {
                    await handleAnalyzeForRenderEngine(base64Data);
                }
            }
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

        // Same canvas pass as single uploads: resize to 1920 and re-encode as
        // JPEG. Reading files raw meant a batch of phone photos could exceed
        // the server's base64 cap (which truncates, corrupting the image) or
        // the 20 MB JSON body limit outright.
        Promise.all(selectedFiles.map(file => compressImageFile(file, 1920))).then(base64Array => {
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

            // Watermark for Free users.
            // Charlie asked for the trial watermark to be off "for now"
            // (7 Aug 2026) - flip this to re-enable rather than rewriting it.
            const TRIAL_WATERMARK_ENABLED = false;
            if (TRIAL_WATERMARK_ENABLED && (userPlan === 'free' || userPlan === 'trial')) {
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
            const result = await renderBuilding(renderedImage, materials, refinementPrompt, true, isProMode, undefined, isSketchUpMode, undefined, false, undefined, cameraEffects);
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

    const handleGenerateLineDrawing = async (mode: 'image' | 'text' = 'image') => {
        const combinedPrompt = [lineDrawingPrompt, additionalPrompt].filter(Boolean).join('. ');
        const activeSource = mode === 'image' ? lineSourceImage : null;
        if (!activeSource && !combinedPrompt.trim()) {
            toast.error('Please describe what you want to generate, or upload an image.');
            return;
        }
        setProcessing({ isLoading: true, message: 'Constructing architectural geometry...' });
        try {
            const result = await generateLineDrawing(activeSource, combinedPrompt, isHighQuality, isColoredLineDrawing, lineEnvironmentImage, isProMode);
            trackFeatureUsage('line_converter');
            setLineImage(result);

            await saveToHistory({
                stage: AppStage.LINE_CONVERT,
                image: result,
                originalImage: activeSource,
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
        setIsAnalyzingMaterials(true);
        try {
            const detected = await analyzeComponents(originalImage);
            setMaterials(prev => ({ ...prev, ...detected }));
        } catch (error) {
            console.warn("Analysis partial fail");
            toast.error('Failed to analyze materials automatically.');
        } finally {
            setProcessing({ isLoading: false, message: '' });
            setIsAnalyzingMaterials(false);
        }
    };

    /**
     * opts.reuseSeed re-renders with the LAST seed ("same look") - materials
     * can change while the composition stays put. Default is a fresh random
     * seed each time ("new look"). Guarded against a click event arriving as
     * the first argument from onClick={handleRender}.
     */
    const handleRender = async (opts?: { reuseSeed?: boolean }) => {
        const source = originalImage;
        if (!source) return;

        const loadingMsg = isSketchUpMode
            ? 'Enhancing SketchUp model to photorealistic quality...'
            : 'Rendering photorealistic textures and lighting...';
        const weatherPrompt = weather.condition !== 'auto' ? `Weather condition: ${weather.condition}. ` : '';
        const finalPrompt = weatherPrompt + additionalPrompt;

        const seed = (opts && opts.reuseSeed === true && lastSeed !== null)
            ? lastSeed
            : Math.floor(Math.random() * 2_000_000_000);
        setLastSeed(seed);
        setRenderVerification(null);

        setProcessing({ isLoading: true, message: loadingMsg });
        try {
            const result = await renderBuilding(source, materials, finalPrompt, isHighQuality, isProMode, activeStage === AppStage.STUDIO ? selectedAngle : undefined, isSketchUpMode, activeStage === AppStage.STUDIO ? studioBackground : undefined, false, seed, cameraEffects);
            setRenderVerification(getLastVerification());
            trackFeatureUsage('render_engine');
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
        // Captured before anything can change it, restored in the finally below.
        const userSceneContextRestore = getSceneContext();

        setProcessing({ isLoading: true, message: 'Rendering batch sequence...' });
        try {
            const validIndices = batchImages.map((img, idx) => img && img.trim() !== '' ? idx : -1).filter(idx => idx !== -1);
            if (validIndices.length === 0) return;

            setProcessing({ isLoading: true, message: 'Rendering batch sequence...' });
            
            const newRenders: string[] = [...batchRenders];
            while(newRenders.length < 5) newRenders.push(''); // Ensure matching array length
            
            const batchSeed = Math.floor(Math.random() * 2147483647);

            /**
             * Keep the garden identical across every angle.
             *
             * Each angle is an independent API call with no memory of the
             * others, so telling the model to "match the other angles" asks it
             * to recall something it has never seen. A shared seed steadies the
             * look but does not fix the setting: left alone, angle two invents
             * its own fence and planting, and a multi-angle set where the
             * garden changes between shots is worth nothing.
             *
             * So the setting is made EXPLICIT and identical in every call. If
             * the user has described the client's garden we use that. If they
             * have not, we render the first angle, read the garden it produced,
             * and hand that description to every angle after it - so the rest
             * are told exactly what the first one made up.
             */
            const userSceneContext = getSceneContext();
            let sequenceContext = userSceneContext;

            for (let i = 0; i < validIndices.length; i++) {
                const slotIndex = validIndices[i];
                const sourceImg = batchImages[slotIndex];
                const matConfig = batchMaterials[slotIndex] || materials;
                
                setProcessing({ isLoading: true, message: `Rendering angle ${i + 1} of ${validIndices.length}...` });
                
                const weatherPrompt = weather.condition !== 'auto' ? `Weather condition: ${weather.condition}. ` : '';
                const finalPrompt = weatherPrompt + additionalPrompt;
                const isStudioReq = activeStage === AppStage.STUDIO;

                // Add a small delay between requests if not the first request to prevent Google API 429 Rate Limit
                if (i > 0) {
                    await new Promise(res => setTimeout(res, 3000));
                }

                const result = await renderBuilding(
                    sourceImg, 
                    matConfig, 
                    finalPrompt, 
                    isHighQuality, 
                    isProMode,
                    matConfig.orientation,
                    isSketchUpMode,
                    isStudioReq ? studioBackground : undefined,
                    true, // isBatchSequence
                    batchSeed,
                    cameraEffects
                );
                
                newRenders[slotIndex] = result;
                setBatchRenders([...newRenders]);

                // Lock the setting from the first angle onwards. Free (a text
                // response, not a generation) and it only has to happen once
                // per batch, so the cost is a couple of seconds before angle two.
                if (i === 0 && !sequenceContext && validIndices.length > 1) {
                    try {
                        setProcessing({ isLoading: true, message: 'Locking the scene for the remaining angles...' });
                        sequenceContext = await describeGarden(result);
                        setSceneContext(sequenceContext);
                    } catch (e) {
                        // Not worth failing a batch over: the angles simply stay
                        // as consistent as the shared seed can make them.
                        console.warn('Could not lock the batch scene', e);
                    }
                }

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
            // Put back whatever the user had. A scene derived from the first
            // angle exists to hold THIS batch together; leaving it set would
            // silently apply one batch's invented garden to every later single
            // render, with nothing in the panel to show why.
            setSceneContext(userSceneContextRestore);
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
                stage: AppStage.WEATHER_LAB,
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

    /**
     * Commit to a Material Studio mode and run the analysis that mode needs.
     *
     * 'closeup' extracts architectural focal points for the 2x2 detail sheet.
     * 'change'  detects the building's existing components (walls, roof,
     *           windows, doors, decking) so each can be swapped - the same
     *           analysis the Render Engine uses.
     */
    const startMaterialStudioMode = async (mode: 'closeup' | 'change') => {
        const source = stageImages[AppStage.MATERIAL_STUDIO];
        if (!source) return;

        setMaterialStudioMode(mode);
        setMaterialStudioImage(null);

        if (mode === 'closeup') {
            setDetectedDetails([]);
            setSelectedDetails([]);
            await handleAnalyzeForMaterialStudio(source);
            return;
        }

        setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' });
        setProcessing({ isLoading: true, message: 'Analysing the building’s materials...' });
        setIsAnalyzingMaterials(true);
        try {
            const detected = await analyzeComponents(source);
            setMaterials(detected);
            toast.success('Materials detected - change any of them below.');
        } catch (error) {
            console.error(error);
            toast.error('Could not analyse the materials in this image.');
        } finally {
            setIsAnalyzingMaterials(false);
            setProcessing({ isLoading: false, message: '' });
        }
    };

    /** Re-render the uploaded image with the user's chosen materials. */
    const handleMaterialStudioApply = async () => {
        const source = stageImages[AppStage.MATERIAL_STUDIO];
        if (!source) return;

        setProcessing({ isLoading: true, message: 'Applying new materials...' });
        try {
            const result = await renderBuilding(
                source,
                materials,
                additionalPrompt,
                isHighQuality,
                isProMode,
                undefined,
                isSketchUpMode,
                undefined,
                false,
                undefined,
                cameraEffects
            );
            trackFeatureUsage('material_studio_change');
            setMaterialStudioImage(result);

            await saveToHistory({
                stage: AppStage.MATERIAL_STUDIO,
                image: result,
                originalImage: source,
                prompt: additionalPrompt || 'Material change',
                settings: materials
            });
            window.dispatchEvent(new Event('aiarchviz-history-updated'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to apply materials');
        } finally {
            setProcessing({ isLoading: false, message: '' });
        }
    };

    const handleMaterialStudio = async (sourceImg?: string | null) => {
        /**
         * Only a string counts as a source image.
         *
         * This is called both with an explicit image and, from the Generate Grid
         * button, with nothing. Passed straight to onClick it received a React
         * click event instead, which is truthy - so the event travelled all the
         * way to the request body and JSON.stringify hit the circular reference
         * inside the element's fiber.
         *
         * The call site is fixed, but the guard stays: an optional first
         * parameter on a function used as an event handler is a trap worth
         * closing at both ends.
         */
        const explicit = typeof sourceImg === 'string' ? sourceImg : null;
        const targetImage = explicit || originalImage;
        if (!targetImage) return;
        if (selectedDetails.length !== 4) return;

        setProcessing({ isLoading: true, message: 'Generating Material Sheet (2x2 Grid)...' });
        try {
            const result = await generatePresentationBoard(targetImage, selectedDetails, isHighQuality, isProMode);
            trackFeatureUsage('material_studio');
            setMaterialStudioImage(result);

            await saveToHistory({
                stage: AppStage.MATERIAL_STUDIO,
                image: result,
                originalImage: targetImage,
                prompt: 'Generated Architecture Detailed Callouts',
                settings: { selectedDetails, detectedDetails }
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
        isAnalyzingMaterials,
        weather, setWeather,
        fileInputRef, materialInputRef,
        handleReset, clearWorkspace, handleImageUpload, handleBatchImageUpload, handleDownload,
        refinementPrompt, setRefinementPrompt,
        downloadFormat, setDownloadFormat,
        isSketchUpMode, setIsSketchUpMode,
        cameraEffects, setCameraEffects,
        lastSeed, renderVerification,
        isBatchMode, setIsBatchMode,
        userPlan, setUserPlan,
        studioBackground, setStudioBackground, selectedAngle, setSelectedAngle,
        materialLibrary, addToLibrary, removeFromLibrary,
        activeProfileId, setActiveProfileId,
        handleGenerateLineDrawing, handleAnalyzeMaterials, handleRender, handleBatchRender, handleRefineRender, handleEditImage, handleWeather, handleMaterialStudio, handleAnalyzeForEditor, handleAnalyzeForMaterialStudio, handleAnalyzeForRenderEngine,
        materialStudioMode, setMaterialStudioMode, startMaterialStudioMode, handleMaterialStudioApply,
        handleSlotImageUpload,
        getRenderUrl
    };
};
