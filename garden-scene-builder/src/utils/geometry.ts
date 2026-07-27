import * as THREE from 'three';

export function createWorldScaleBoxGeometry(width: number, height: number, depth: number, multiMaterial = true, offsetX = 0, offsetY = 0, offsetZ = 0) {
  const geom = new THREE.BoxGeometry(width, height, depth);
  const uvs = geom.attributes.uv;

  // Clear existing groups
  geom.clearGroups();

  // Define UV mapping for world scale
  for (let i = 0; i < uvs.count; i++) {
    const v = new THREE.Vector3();
    v.fromBufferAttribute(geom.attributes.position, i);
    
    // Group 0: Right (px)
    if (i >= 0 && i < 4) {
      uvs.setXY(i, -v.z - offsetZ, v.y + height/2 + offsetY);
    }
    // Group 1: Left (nx)
    else if (i >= 4 && i < 8) {
      uvs.setXY(i, v.z + offsetZ, v.y + height/2 + offsetY);
    }
    // Group 2: Top (py)
    else if (i >= 8 && i < 12) {
      uvs.setXY(i, v.x + offsetX, v.z + offsetZ);
    }
    // Group 3: Bottom (ny)
    else if (i >= 12 && i < 16) {
      uvs.setXY(i, v.x + offsetX, -v.z - offsetZ);
    }
    // Group 4: Front (pz)
    else if (i >= 16 && i < 20) {
      uvs.setXY(i, v.x + offsetX, v.y + height/2 + offsetY);
    }
    // Group 5: Back (nz)
    else if (i >= 20 && i < 24) {
      uvs.setXY(i, -v.x - offsetX, v.y + height/2 + offsetY);
    }
  }

  // Restore the 6 default material groups for a box geometry
  if (multiMaterial) {
    geom.addGroup(0, 6, 0); // px
    geom.addGroup(6, 6, 1); // nx
    geom.addGroup(12, 6, 2); // py
    geom.addGroup(18, 6, 3); // ny
    geom.addGroup(24, 6, 4); // pz
    geom.addGroup(30, 6, 5); // nz
  } else {
    geom.addGroup(0, 36, 0);
  } // nz

  uvs.needsUpdate = true;
  return geom;
}

export function createWorldScaleGableGeometry(width: number, height: number, depth: number, offsetX = 0, offsetY = 0, offsetZ = 0) {
  // A triangular prism for the gable ends.
  // Shape is a triangle on the XY plane: (0, height), (-width/2, 0), (width/2, 0)
  // Extruded along Z by depth.
  const shape = new THREE.Shape();
  shape.moveTo(-width/2, 0);
  shape.lineTo(width/2, 0);
  shape.lineTo(0, height);
  shape.lineTo(-width/2, 0);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: false,
  };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  // By default ExtrudeGeometry extends in +Z direction.
  // We want it centered on Z.
  geom.translate(0, 0, -depth/2);

  // Set world scale UVs
  const uvs = geom.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    const v = new THREE.Vector3();
    v.fromBufferAttribute(geom.attributes.position, i);
    
    // For the front/back faces, map to x,y.
    // For the side faces, map to z,y or x,z.
    // A simple heuristic for world mapping:
    const normal = new THREE.Vector3();
    if (geom.attributes.normal) {
        normal.fromBufferAttribute(geom.attributes.normal, i);
    }
    
    if (Math.abs(normal.z) > 0.5) {
        uvs.setXY(i, v.x + offsetX, v.y + height/2 + offsetY);
    } else if (Math.abs(normal.x) > 0.5) {
        uvs.setXY(i, -v.z - offsetZ, v.y + height/2 + offsetY);
    } else {
        uvs.setXY(i, v.x + offsetX, v.z + offsetZ);
    }
  }
  uvs.needsUpdate = true;
  return geom;
}
