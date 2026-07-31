import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import { useStore } from '../store';

// Step 5: Material Library
// We define real-world tile sizes in meters (Step 4) and map textures (Step 3).
export const MATERIAL_DEF = {
  timber: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  cedar: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#f0c0a0' },
  oak: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#e5b985' },
  charcoal: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#555555' },
  weathered_larch: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  composite_grey: { prefix: 'planks_clean', tileSize: 2.0, roughness: 0.8, color: '#909497' },
  composite_brown: { prefix: 'planks_clean', tileSize: 2.0, roughness: 0.8, color: '#8b6b55' },
  composite_wood: { prefix: 'planks_clean', tileSize: 2.0, roughness: 0.8, color: '#8b6b55' },
  composite_black: { prefix: 'planks_clean', tileSize: 2.0, roughness: 0.8, color: '#2a2a2a' },
  charred_timber: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#222222' },
  timber_decking: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  composite_decking: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.8, color: '#aaaaaa' },
  epdm: { prefix: 'slate_roof', tileSize: 1.0, roughness: 0.5, color: '#333333' },
  sedum: { prefix: 'sedum', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  metal: { prefix: 'slate_roof', tileSize: 2.0, roughness: 0.4, color: '#777777' },
  slate: { prefix: 'slate_roof', tileSize: 1.0, roughness: 0.9, color: '#ffffff' },
  concrete: { prefix: 'sedum', tileSize: 4.0, roughness: 1.0, color: '#aaaaaa' },
  black_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.7, color: '#262729' },
  grey_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.6, color: '#6e737b' },
  cedar_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.6, color: '#be7847' },
  oak_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.6, color: '#cca278' },
  cedar_cladding: { prefix: 'Cedar Timber Cladding', tileSize: 2.0, roughness: 1.0, color: '#ffffff', ext: 'png', singleMap: true },
  oak_cladding: { prefix: 'Oak timber cladding', tileSize: 2.0, roughness: 1.0, color: '#ffffff', ext: 'png', singleMap: true },
  default: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' }
};

export function useRealMaterial(materialKey: string, widthMeters: number, heightMeters: number, rotation: number = 0) {
  const claddingWidthMm = useStore(state => state.scene.room.claddingWidthMm) || 100;
  const claddingOrientation = useStore(state => state.scene.room.claddingOrientation);
  
  const def = MATERIAL_DEF[materialKey as keyof typeof MATERIAL_DEF] || MATERIAL_DEF.default;
    
    // Step 3: Use real photographic CC0 PBR sets
    const texturePaths: any = {};
    if ((def as any).singleMap) {
        texturePaths.map = `./textures/${def.prefix}.${(def as any).ext || 'jpg'}`;
    } else {
        texturePaths.map = `./textures/${def.prefix}_color.${(def as any).ext || 'jpg'}`;
        texturePaths.normalMap = `./textures/${def.prefix}_normal.${(def as any).ext || 'jpg'}`;
        texturePaths.roughnessMap = `./textures/${def.prefix}_roughness.${(def as any).ext || 'jpg'}`;
        if (def.prefix !== 'synthetic_wood') {
            texturePaths.aoMap = `./textures/${def.prefix}_ao.${(def as any).ext || 'jpg'}`;
        }
    }
    const textures: any = useTexture(texturePaths);

    const cloned = useMemo(() => {
        const maps: any = {};
        if (textures.map) maps.map = textures.map.clone();
        if (textures.normalMap) maps.normalMap = textures.normalMap.clone();
        if (textures.roughnessMap) maps.roughnessMap = textures.roughnessMap.clone();
        if (textures.aoMap && def.prefix !== 'synthetic_wood') maps.aoMap = textures.aoMap.clone();

        const setupMap = (m: THREE.Texture | undefined, isColor: boolean) => {
            if (!m) return;
            m.wrapS = THREE.RepeatWrapping;
            m.wrapT = THREE.RepeatWrapping;
            m.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
            m.anisotropy = 4; // Optimized anisotropy to prevent lag on 4K textures
            
            // World-space board scaling
            const isCladding = def.prefix !== 'slate_roof' && def.prefix !== 'sedum';
            
            let s_x = 1 / (def.tileSize * (isCladding ? claddingWidthMm / 100 : 1));
            let s_y = 1 / (def.tileSize * (isCladding ? claddingWidthMm / 100 : 1));
            
            if (isCladding) {
                // Force all cladding materials to stretch full length up the wall height (0 horizontal cut lines)
                const wallHeight = heightMeters > 0 ? heightMeters : 2.5;
                s_y = 1 / wallHeight;

                if (def.prefix === 'synthetic_wood') {
                    const singleBoardMeters = claddingWidthMm / 1000;
                    const textureWidthMeters = 16 * singleBoardMeters;
                    s_x = 1 / textureWidthMeters;
                } else if ((def as any).singleMap) {
                    const singleBoardMeters = claddingWidthMm / 1000;
                    const textureWidthMeters = 12 * singleBoardMeters;
                    s_x = 1 / textureWidthMeters;
                }
            }
            
            m.repeat.set(s_x, s_y);
            m.center.set(0.5, 0.5);
            m.rotation = rotation;
            m.needsUpdate = true;
        };

        setupMap(maps.map, true);
        setupMap(maps.normalMap, false);
        setupMap(maps.roughnessMap, false);
        setupMap(maps.aoMap, false);

        return maps;
    }, [textures, widthMeters, heightMeters, rotation, def, claddingWidthMm, claddingOrientation]);

    return { 
        ...cloned, 
        color: def.color, 
        roughness: def.roughness,
        normalScale: new THREE.Vector2(0.5, 0.5) // Step 3: start normalScale at 0.5
    };
}
