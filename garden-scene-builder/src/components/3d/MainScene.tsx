import { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { CameraControls, Environment, Plane, Text, Grid as DreiGrid, SoftShadows, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { RoomGeometry } from './RoomGeometry';
import { SceneObjects } from './SceneObjects';
import { ObjectType } from '../../types';


function WalkingControls({ controlsEnabled }: { controlsEnabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});
  const controlsRef = useRef<any>(null);

  // set initial position when starting walking mode
  // only run once when component mounts
  useEffect(() => {
    if (controlsRef.current) {
        controlsRef.current.setLookAt(0, 1.6, 5, 0, 1.6, 0, false);
    }
  }, []);

  useEffect(() => {
    if (!controlsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    const handleBlur = () => { keys.current = {}; };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      keys.current = {};
    };
  }, [controlsEnabled]);

  useFrame((_, delta) => {
    if (!controlsRef.current || !controlsEnabled) return;
    const speed = 1.8 * delta; // Slower walking speed
    
    // Get forward vector from camera direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (keys.current['w']) move.add(forward);
    if (keys.current['s']) move.sub(forward);
    if (keys.current['a']) move.sub(right);
    if (keys.current['d']) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      
      const currentPos = new THREE.Vector3();
      controlsRef.current.getPosition(currentPos);
      const currentTarget = new THREE.Vector3();
      controlsRef.current.getTarget(currentTarget);

      currentPos.add(move);
      currentTarget.add(move);
      
      controlsRef.current.setLookAt(
        currentPos.x, currentPos.y, currentPos.z,
        currentTarget.x, currentTarget.y, currentTarget.z,
        false
      );
    }
  });

  return (
    <CameraControls 
      ref={controlsRef} 
      enabled={controlsEnabled}
      makeDefault
      minDistance={0.1}
      maxDistance={0.1} // keeping it close constrains orbit to act like look-around
      azimuthRotateSpeed={0.6} // standard turning
      polarRotateSpeed={0.6}
      truckSpeed={0} 
    />
  );
}

function ScreenshotHelper() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    const handleCapture = () => {
      const bg = scene.getObjectByName('environment-background');
      if (bg) bg.visible = false;
      const oldBg = scene.background;
      scene.background = null;

      gl.render(scene, camera);
      const img = gl.domElement.toDataURL('image/png');

      if (bg) bg.visible = true;
      scene.background = oldBg;

      window.dispatchEvent(new CustomEvent('screenshot-taken', { detail: img }));
    };

    window.addEventListener('take-screenshot', handleCapture);
    return () => window.removeEventListener('take-screenshot', handleCapture);
  }, [gl, scene, camera]);

  return null;
}

export function MainScene() {
  const { viewMode, addObject, setSelectedObjectId, setSelectedElementId, controlsEnabled, renderTransform } = useStore(useShallow(s => ({
    viewMode: s.viewMode,
    addObject: s.addObject,
    setSelectedObjectId: s.setSelectedObjectId,
    setSelectedElementId: s.setSelectedElementId,
    controlsEnabled: s.controlsEnabled,
    renderTransform: s.renderTransform
  })));
  const controlsRef = useRef<any>(null);
  const { camera, raycaster, pointer } = useThree();
  const [isOrthographic, setIsOrthographic] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const isPlanView = viewMode === 'plan';

  useEffect(() => {
    if (controlsRef.current) {
      if (isPlanView) {
        controlsRef.current.rotateTo(0, 0, false);
        controlsRef.current.setLookAt(0, 30, 0, 0, 0, 0, true);
        controlsRef.current.minPolarAngle = 0;
        controlsRef.current.maxPolarAngle = 0;
        controlsRef.current.minAzimuthAngle = 0;
        controlsRef.current.maxAzimuthAngle = 0;
        controlsRef.current.mouseButtons.left = 2; // TRUCK
      } else {
        controlsRef.current.setLookAt(10, 10, 15, 0, 0, 0, true);
        controlsRef.current.minPolarAngle = 0;
        controlsRef.current.maxPolarAngle = Math.PI / 2 - 0.02;
        controlsRef.current.minAzimuthAngle = -Infinity;
        controlsRef.current.maxAzimuthAngle = Infinity;
        controlsRef.current.mouseButtons.left = 1; // ORBIT
      }
    }
  }, [isPlanView]);

  useEffect(() => {
    const handleCameraView = (e: any) => {
      const detail = typeof e.detail === 'string' ? { view: e.detail, snap: false } : e.detail;
      const { view, snap } = detail;
      
      if (view === 'toggle-projection') {
        setIsOrthographic(prev => !prev);
      } else if (view === 'spin') {
        setIsSpinning(prev => !prev);
      } else if (controlsRef.current) {
        let x = 0, y = 1.5, z = 0;
        let tx = 0, ty = 1.5, tz = 0;
        const dist = 15; // Closer so it's not far away
        if (view === 'top') { x = 0; y = 20; z = 0.001; tx = 0; ty = 0; tz = 0; }
        else if (view === 'back') { x = 0; y = 1.5; z = -dist; }
        else if (view === 'front') { x = 0; y = 1.5; z = dist; }
        else if (view === 'left') { x = -dist; y = 1.5; z = 0; }
        else if (view === 'right') { x = dist; y = 1.5; z = 0; }
        else if (view === 'perspective') { x = 7; y = 5; z = 9; }
        
        setIsSpinning(false);
        controlsRef.current.setLookAt(x, y, z, tx, ty, tz, !snap);
      }
    };
    window.addEventListener('camera-set-view', handleCameraView);
    return () => window.removeEventListener('camera-set-view', handleCameraView);
  }, []);

  useEffect(() => {
    const stopSpin = () => setIsSpinning(false);
    window.addEventListener('pointerdown', stopSpin);
    window.addEventListener('wheel', stopSpin);
    return () => {
      window.removeEventListener('pointerdown', stopSpin);
      window.removeEventListener('wheel', stopSpin);
    };
  }, []);

  useEffect(() => {
    const handleReset = () => {
      if (isPlanView && controlsRef.current) {
         controlsRef.current.setLookAt(0, 30, 0, 0, 0, 0, true);
      }
    };
    window.addEventListener('reset-plan-view', handleReset);
    return () => window.removeEventListener('reset-plan-view', handleReset);
  }, [isPlanView]);

  const isNight = false;
  
  
  useFrame((_, delta) => {
    if (isSpinning && controlsRef.current) {
      controlsRef.current.azimuthAngle += delta * 0.3;
    }
  });

  const handlePointerUp = (e: any) => {
     setSelectedObjectId(null);
     setSelectedElementId(null);
  };

  return (
    <>
      <ScreenshotHelper />
      {isPlanView ? (
        <OrthographicCamera makeDefault position={[0, 40, 0]} zoom={60} near={0.1} far={1000} />
      ) : isOrthographic ? (
        <OrthographicCamera makeDefault position={[10, 10, 15]} zoom={80} near={0.1} far={1000} />
      ) : (
        <PerspectiveCamera makeDefault position={[10, 10, 15]} fov={50} near={0.1} far={1000} />
      )}

      {/* Lighting and Environment */}
      {/* <SoftShadows size={20} samples={16} focus={0.5} /> */}
      <ambientLight intensity={isNight ? 0.3 : 0.6} />
      <directionalLight 
        castShadow 
        position={[20, 40, 20]} 
        intensity={isNight ? 0.6 : 2.0} 
        color={isNight ? "#a0b0d0" : "#fffcf2"}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001} shadow-normalBias={0.02}
      />
      
      <group name="environment-background" visible={viewMode !== 'render'}>
        <Environment 
          files={isNight ? "/textures/night.hdr" : "/textures/outdoor.hdr"} 
          background 
          blur={0.05} 
          environmentIntensity={isNight ? 0.3 : 1.0} 
        />

        {/* Ground Plane */}
        <Plane 
          receiveShadow 
          args={[100, 100]} 
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          onClick={handlePointerUp}
        >
          <meshStandardMaterial color="#2e4225" roughness={0.8} metalness={0} />
        </Plane>
        
        <DreiGrid
          position={[0, 0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={1}
          cellColor={isNight ? '#2a3b2e' : '#8a9f8d'}
          sectionSize={5}
          sectionThickness={1.5}
          sectionColor={isNight ? '#1a2b1e' : '#4a6c59'}
          fadeDistance={40}
          fadeStrength={1.5}
        />
      </group>
      


      <group
        position={viewMode === 'render' ? [renderTransform.x, renderTransform.y, renderTransform.z] : [0, 0, 0]}
        rotation={[0, viewMode === 'render' ? renderTransform.rotationY : 0, 0]}
        scale={viewMode === 'render' ? renderTransform.scale : 1}
      >
        {/* The Garden Room */}
        <Suspense fallback={null}>
          <RoomGeometry />
        </Suspense>

        {/* Garden Objects */}
        <SceneObjects />
      </group>

      {viewMode === 'walking' ? (
        <WalkingControls controlsEnabled={controlsEnabled} />
      ) : (
        <CameraControls 
          ref={controlsRef}
          enabled={controlsEnabled}
          makeDefault 
          minDistance={5} 
          maxDistance={60} 
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
      )}
    </>
  );
}
