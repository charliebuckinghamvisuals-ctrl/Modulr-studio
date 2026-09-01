import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { useStore } from '../store';

// Step 5: Material Library
// We define real-world tile sizes in meters (Step 4) and map textures (Step 3).
export const MATERIAL_DEF = {
  timber: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  cedar: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#f0c0a0' },

  // ── Interior floors ───────────────────────────────────────────────────────
  // These previously all fell through to the 'larch' texture, which is rough,
  // grey, weathered exterior board. Tinting that yellow produced the muddy
  // "oak" floor. 'planks_clean' is a fine, tight, neutral plank surface, so a
  // wood tint over it reads as a finished interior floor. isFloor keeps them
  // out of the cladding board-width scaling, which is a wall concern.
  // tileSize 6.0m: the texture holds 43 planks (measured), so one tile across
  // 6.0m gives ~140mm boards, a common engineered floorboard width.
  oak: { prefix: 'planks_clean', tileSize: 6.0, roughness: 0.55, color: '#d8b98f', isFloor: true },
  pine: { prefix: 'planks_clean', tileSize: 6.0, roughness: 0.6, color: '#e8d3ac', isFloor: true },
  walnut: { prefix: 'planks_clean', tileSize: 6.0, roughness: 0.5, color: '#8a6242', isFloor: true },
  cherry: { prefix: 'planks_clean', tileSize: 6.0, roughness: 0.5, color: '#b07a55', isFloor: true },
  // ambientCG CC0 wood floors (WoodFloor051 / 053 / 008). Full PBR sets, so
  // colour stays white - the photograph IS the colour - and the normal and
  // roughness maps give real board relief and sheen. tileSize is the physical
  // size the source tile represents.
  // tileSize is the real-world size of the source tile, from ambientCG's own
  // dimension data where they publish it (reported in cm), so board widths
  // come out life-size instead of guessed.
  oak_plank: { prefix: 'oak_plank', tileSize: 1.8, roughness: 0.5, color: '#ffffff', isFloor: true },
  light_oak: { prefix: 'light_oak', tileSize: 2.0, roughness: 0.48, color: '#ffffff', isFloor: true, noAo: true },
  rustic_pine: { prefix: 'rustic_pine', tileSize: 1.9, roughness: 0.6, color: '#ffffff', isFloor: true },
  smoked_oak: { prefix: 'smoked_oak', tileSize: 2.0, roughness: 0.55, color: '#ffffff', isFloor: true, noAo: true },
  oak_herringbone: { prefix: 'oak_herringbone', tileSize: 1.8, roughness: 0.5, color: '#ffffff', isFloor: true },
  walnut_parquet: { prefix: 'walnut_parquet', tileSize: 2.0, roughness: 0.45, color: '#ffffff', isFloor: true },

  charcoal: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#555555' },
  weathered_larch: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  // ── Decking range ─────────────────────────────────────────────────────────
  // Colours deliberately mirror the wall cladding range so a scheme reads as
  // one product family. Painted tones use the colour-neutralised decking map
  // for the same reason the cladding does: tinting light grey through a brown
  // timber base produces mud rather than grey.
  composite_cedar: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.75, color: '#b0764b' },
  composite_oak: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.75, color: '#c9a173' },
  composite_light_oak: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.75, color: '#dcc09a' },
  composite_white: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.72, color: '#e8e6e1', neutral: true },
  composite_brown: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.8, color: '#8b6b55' },
  composite_black: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.8, color: '#1f2123', neutral: true },
  composite_dark_grey: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.78, color: '#4a5057', neutral: true },
  composite_grey: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.75, color: '#a9aeb2', neutral: true },
  composite_slate_blue: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.75, color: '#7c93a6', neutral: true },
  composite_sage: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.76, color: '#7e8c74', neutral: true },
  composite_clay: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.78, color: '#9a6b58', neutral: true },
  composite_wood: { prefix: 'planks_clean', tileSize: 2.0, roughness: 0.8, color: '#8b6b55' },
  charred_timber: { prefix: 'weathered_larch', tileSize: 2.0, roughness: 1.0, color: '#222222' },
  timber_decking: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  composite_decking: { prefix: 'decking_hardwood', tileSize: 2.0, roughness: 0.8, color: '#aaaaaa' },
  epdm: { prefix: 'slate_roof', tileSize: 1.0, roughness: 0.5, color: '#333333' },
  sedum: { prefix: 'sedum', tileSize: 2.0, roughness: 1.0, color: '#ffffff' },
  metal: { prefix: 'slate_roof', tileSize: 2.0, roughness: 0.4, color: '#777777' },
  slate: { prefix: 'slate_roof', tileSize: 1.0, roughness: 0.9, color: '#ffffff' },
  concrete: { prefix: 'sedum', tileSize: 4.0, roughness: 1.0, color: '#aaaaaa' },
  // ── Composite cladding range ──────────────────────────────────────────────
  // All share the same board profile texture. Wood tones tint the natural
  // timber map; painted finishes tint a colour-neutralised copy of the SAME
  // map (neutral: true), because multiplying a light grey or blue through a
  // brown wood base produces mud rather than the intended colour.
  cedar_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.65, color: '#b0764b' },
  oak_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.65, color: '#c9a173' },
  light_oak_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.62, color: '#dcc09a' },
  black_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.7, color: '#1f2123', neutral: true },
  dark_grey_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.68, color: '#4a5057', neutral: true },
  light_grey_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.62, color: '#a9aeb2', neutral: true },
  // Off-white rather than pure #fff: the colour multiplies the neutral board
  // map, and pure white leaves no headroom so the groove shading washes out.
  white_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.6, color: '#e8e6e1', neutral: true },
  // Kept so existing saved scenes referencing grey_composite still resolve.
  grey_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.65, color: '#767c84', neutral: true },
  slate_blue_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.62, color: '#7c93a6', neutral: true },
  sage_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.64, color: '#7e8c74', neutral: true },
  clay_composite: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.66, color: '#9a6b58', neutral: true },
  // Legacy keys from old saved scenes. Their original PNG textures no longer
  // exist in public/textures — pointing at the missing files faulted useTexture
  // and blanked the whole scene, so they resolve to the composite equivalents.
  cedar_cladding: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.65, color: '#b0764b' },
  oak_cladding: { prefix: 'synthetic_wood', tileSize: 2.0, roughness: 0.65, color: '#c9a173' },
  default: { prefix: 'larch', tileSize: 2.0, roughness: 1.0, color: '#ffffff' }
};

/**
 * Cladding key -> matching decking key.
 *
 * When no decking material has been chosen the decking follows the wall
 * cladding, which is the sensible default for a matched scheme. It must map to
 * the DECKING equivalent rather than reusing the cladding key directly: the
 * cladding materials are built on the vertical slat texture, so using one on a
 * deck laid slats across the floor instead of decking boards.
 */
export const CLADDING_TO_DECKING: Record<string, string> = {
  cedar_composite: 'composite_cedar',
  oak_composite: 'composite_oak',
  light_oak_composite: 'composite_light_oak',
  white_composite: 'composite_white',
  black_composite: 'composite_black',
  dark_grey_composite: 'composite_dark_grey',
  light_grey_composite: 'composite_grey',
  grey_composite: 'composite_grey',
  slate_blue_composite: 'composite_slate_blue',
  sage_composite: 'composite_sage',
  clay_composite: 'composite_clay',
};

/** Resolve the decking material, following the cladding when none is set. */
export const resolveDeckingKey = (deckingMaterial?: string, cladding?: string): string => {
  if (deckingMaterial) return deckingMaterial;
  if (cladding && CLADDING_TO_DECKING[cladding]) return CLADDING_TO_DECKING[cladding];
  return 'timber_decking';
};

/**
 * Floors that were retired when the photographic PBR range came in.
 *
 * The old interior floors were a single plank texture with a colour tint,
 * and 'tiles' / 'carpet' never had a texture at all - they fell through to
 * exterior cladding. They are gone from the picker, but designs saved
 * before the change still carry these values, so each one resolves to its
 * closest replacement rather than rendering as weathered larch.
 *
 * The KEYS here are also cladding and base-material names ('oak' is a
 * cladding, 'concrete' is a base), so their MATERIAL_DEF entries stay put -
 * only the FLOOR meaning is remapped.
 */
const LEGACY_FLOORS: Record<string, string> = {
  oak: 'oak_plank',
  pine: 'rustic_pine',
  walnut: 'smoked_oak',
  cherry: 'smoked_oak',
  tiles: 'light_oak',
  carpet: 'light_oak',
  concrete: 'light_oak',
  // The supplied-image herringbone was withdrawn in favour of the
  // photographic PBR range; its nearest match is the oak one.
  parquet: 'oak_herringbone',
};

/** The floor material to actually render for a stored floor value. */
export const resolveFloorKey = (key: string | undefined) =>
  (key && LEGACY_FLOORS[key]) || key || 'oak_plank';

export function useRealMaterial(materialKey: string, widthMeters: number, heightMeters: number, rotation: number = 0) {
  const claddingWidthMm = useStore(state => state.scene.room.claddingWidthMm) || 100;
  const claddingOrientation = useStore(state => state.scene.room.claddingOrientation);
  // Board size for interior floors, as a multiplier on the material's real
  // tile size: 2 lays planks twice as wide, 0.5 half as wide.
  const floorScale = useStore(state => state.scene.room.floorScale) || 1;
  // Hardware max, usually 16. Read from the renderer rather than hardcoded so a
  // device that supports less is not asked for something it cannot do.
  const maxAnisotropy = useThree(state => state.gl.capabilities.getMaxAnisotropy());
  
  const def = MATERIAL_DEF[materialKey as keyof typeof MATERIAL_DEF] || MATERIAL_DEF.default;
    
    // Step 3: Use real photographic CC0 PBR sets
    const texturePaths: any = {};
    if ((def as any).singleMap) {
        texturePaths.map = `./textures/${def.prefix}.${(def as any).ext || 'jpg'}`;
    } else if ((def as any).neutral) {
        // Colour-neutralised copy of the same board texture. Normal, roughness
        // and AO maps are colourless, so they are shared with the wood tones.
        texturePaths.map = `./textures/${def.prefix}_neutral_color.${(def as any).ext || 'jpg'}`;
        texturePaths.normalMap = `./textures/${def.prefix}_normal.${(def as any).ext || 'jpg'}`;
        texturePaths.roughnessMap = `./textures/${def.prefix}_roughness.${(def as any).ext || 'jpg'}`;
    } else {
        texturePaths.map = `./textures/${def.prefix}_color.${(def as any).ext || 'jpg'}`;
        texturePaths.normalMap = `./textures/${def.prefix}_normal.${(def as any).ext || 'jpg'}`;
        texturePaths.roughnessMap = `./textures/${def.prefix}_roughness.${(def as any).ext || 'jpg'}`;
        if (def.prefix !== 'synthetic_wood' && !(def as any).noAo) {
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

            // Anisotropic filtering. This was pinned to 4, which is what made the
            // cladding grooves look jagged and shimmer: they are thin, high
            // contrast vertical lines viewed at a glancing angle, which is the
            // exact case anisotropy exists to solve. Use the hardware maximum
            // (typically 16). It is a sampler setting, not extra geometry or
            // texture memory, so the cost is negligible on any modern GPU.
            m.anisotropy = maxAnisotropy;
            m.minFilter = THREE.LinearMipmapLinearFilter;
            m.magFilter = THREE.LinearFilter;
            m.generateMipmaps = true;
            
            // World-space board scaling. Floors are excluded: the Board Width
            // slider is a wall setting, and letting it drive the floor meant
            // changing the cladding resized the floorboards too.
            const isCladding = def.prefix !== 'slate_roof'
                && def.prefix !== 'sedum'
                && !(def as any).isFloor;
            
            let s_x = 1 / (def.tileSize * (isCladding ? claddingWidthMm / 100 : 1));
            let s_y = 1 / (def.tileSize * (isCladding ? claddingWidthMm / 100 : 1));

            // Floors use a plain boxGeometry whose UVs run 0..1 across the whole
            // face, whereas the walls use world-scaled UVs measured in metres.
            // The repeat convention is therefore INVERTED between the two: walls
            // want 1/tileSize, floors want size/tileSize. Applying the wall
            // formula to the floor produced less than one tile across an entire
            // room, which is why the boards looked enormous.
            if ((def as any).isFloor) {
                const floorW = widthMeters > 0 ? widthMeters : 4;
                const floorD = heightMeters > 0 ? heightMeters : 4;
                const tile = def.tileSize * floorScale;
                m.repeat.set(floorW / tile, floorD / tile);
                m.center.set(0.5, 0.5);
                m.rotation = rotation;
                m.needsUpdate = true;
                return;
            }
            
            if (isCladding) {
                // Force all cladding materials to stretch full length up the wall height (0 horizontal cut lines)
                const wallHeight = heightMeters > 0 ? heightMeters : 2.5;
                s_y = 1 / wallHeight;

                if (def.prefix === 'synthetic_wood') {
                    // BOARDS_IN_TEXTURE must match the actual number of boards
                    // across the texture image, or the Board Width slider lies.
                    // Measured by counting grooves in synthetic_wood_color.jpg:
                    // 34 boards across 1024px. This was previously 16, which
                    // rendered every board at 16/34 (47%) of the requested
                    // width, so a 200mm setting looked like roughly 94mm.
                    const BOARDS_IN_TEXTURE = 34;
                    const singleBoardMeters = claddingWidthMm / 1000;
                    const textureWidthMeters = BOARDS_IN_TEXTURE * singleBoardMeters;
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
        // Depend on the individual TEXTURE INSTANCES, not on the object
        // useTexture returns. drei rebuilds that wrapper object on every
        // render, so depending on it re-ran this memo every render: it
        // re-cloned every map and handed back brand-new texture instances
        // each time. Those instances are dependencies of the wall's CSG
        // memo, so the whole boolean wall rebuild fired on EVERY render -
        // which is what made dragging a door/window lag and made the walls
        // blink out mid-drag while the geometry and its material groups were
        // reassigned. The underlying instances from useLoader are cached and
        // stable, so keying on them makes this memo behave.
    }, [textures.map, textures.normalMap, textures.roughnessMap, textures.aoMap,
        widthMeters, heightMeters, rotation, def, claddingWidthMm, claddingOrientation, floorScale, maxAnisotropy]);

    // Memoised for the same reason: this object feeds material props and
    // memo dependency lists further up.
    return useMemo(() => ({
        ...cloned,
        color: def.color,
        roughness: def.roughness,
        normalScale: new THREE.Vector2(0.5, 0.5) // Step 3: start normalScale at 0.5
    }), [cloned, def]);
}
