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
  default: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' }
};

export function useRealMaterial(materialKey: string, widthMeters: number, heightMeters: number, rotation: number = 0) {
  const claddingWidthMm = useStore(state => state.scene.room.claddingWidthMm) || 100;
  
  const def = MATERIAL_DEF[materialKey as keyof typeof MATERIAL_DEF] || MATERIAL_DEF.default;
    
    // Step 3: Use real photographic CC0 PBR sets
    const textures = useTexture({
        map: `./textures/${def.prefix}_color.${(def as any).ext || 'jpg'}`,
        normalMap: `./textures/${def.prefix}_normal.${(def as any).ext || 'jpg'}`,
        roughnessMap: `./textures/${def.prefix}_roughness.${(def as any).ext || 'jpg'}`,
        aoMap: `./textures/${def.prefix}_ao.${(def as any).ext || 'jpg'}`,
    });

    const cloned = useMemo(() => {
        const maps = {
            map: textures.map.clone(),
            normalMap: textures.normalMap.clone(),
            roughnessMap: textures.roughnessMap.clone(),
            aoMap: textures.aoMap.clone()
        };

        const setupMap = (m: THREE.Texture, isColor: boolean) => {
            if (!m) return;
            m.wrapS = THREE.RepeatWrapping;
            m.wrapT = THREE.RepeatWrapping;
            m.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
            m.anisotropy = 16; // Step 3: Set anisotropy to max
            
            // Step 4: World-space UV scaling
            // Scale based on claddingWidthMm (100 = 1x scale, 50 = 2x repeat, 200 = 0.5x repeat).
            const isCladding = def.prefix !== 'slate_roof' && def.prefix !== 'sedum';
            const scale = isCladding ? claddingWidthMm / 100 : 1;
            
            let s = 1 / (def.tileSize * scale);
            m.repeat.set(s, s);
            m.center.set(0.5, 0.5);
            m.rotation = rotation;
            m.needsUpdate = true;
        };

        setupMap(maps.map, true);
        setupMap(maps.normalMap, false);
        setupMap(maps.roughnessMap, false);
        setupMap(maps.aoMap, false);

        return maps;
    }, [textures, widthMeters, heightMeters, rotation, def]);

    return { 
        ...cloned, 
        color: def.color, 
        roughness: def.roughness,
        normalScale: new THREE.Vector2(0.5, 0.5) // Step 3: start normalScale at 0.5
    };
}
