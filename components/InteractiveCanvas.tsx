
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HandGesture, HandData } from '../types';
import HUD from './HUD';

// --- PHYSICS CONFIGURATION ---
const CONFIG = {
  PARTICLE_COUNT: 1200,
  SPHERE_RADIUS: 1.5,
  BLOOM_STRENGTH: 2.5,     // Intensity of the neon glow
  BLOOM_RADIUS: 0.5,
  BLOOM_THRESHOLD: 0.1,
  SMOOTHING_FACTOR: 0.15,  // Lower = Smoother but more lag (Lerp factor)
  COMPRESSION_FACTOR: 0.7  // How much the sphere shrinks when squeezed (0.7 = shrinks to 30%)
};

const InteractiveCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // THREE System Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  
  // Meshes
  const mainSphereRef = useRef<THREE.Mesh | null>(null);
  const innerCoreRef = useRef<THREE.Mesh | null>(null);
  const instancedParticlesRef = useRef<THREE.InstancedMesh | null>(null);
  
  // Vision & Logic Refs
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  // Physics State (Smoothed Values)
  const physicsState = useRef({
    position: new THREE.Vector3(0, 0, 0),
    splitFactor: 0,
    gripStrength: 0,
    rotationSpeed: 0.005,
    time: 0
  });

  // UI State
  const [loading, setLoading] = useState(true);
  const [handData, setHandData] = useState<HandData>({
    gesture: HandGesture.NONE,
    position: { x: 0.5, y: 0.5 },
    worldPosition: { x: 0, y: 0 },
    isPresent: false,
    trackingMode: 'NONE',
    handSeparation: 0,
    gripStrength: 0,
    energyOutput: 0
  });

  useEffect(() => {
    initThree();
    initVision();
    startCamera();

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && composerRef.current) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
        composerRef.current.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const initThree = () => {
    if (!canvasRef.current) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 8;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        canvas: canvasRef.current, 
        alpha: true, 
        antialias: false // Post-processing usually handles AA or makes it redundant
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    renderer.toneMapping = THREE.ReinhardToneMapping;
    rendererRef.current = renderer;

    // 2. Post-Processing (BLOOM)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 
        CONFIG.BLOOM_STRENGTH, 
        CONFIG.BLOOM_RADIUS, 
        CONFIG.BLOOM_THRESHOLD
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // 3. Main Sphere (The "Containment Field")
    // Icosahedron gives a nice tech/crystal vibe
    const geometry = new THREE.IcosahedronGeometry(CONFIG.SPHERE_RADIUS, 4); 
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x00f3ff,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    mainSphereRef.current = sphere;

    // 4. Inner Core (The "Energy Source")
    const coreGeo = new THREE.SphereGeometry(CONFIG.SPHERE_RADIUS * 0.4, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, // White hot center
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);
    innerCoreRef.current = core;

    // 5. Instanced Particles (High Performance)
    const particleGeo = new THREE.TetrahedronGeometry(0.08, 0);
    const particleMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
    });
    const instancedMesh = new THREE.InstancedMesh(particleGeo, particleMat, CONFIG.PARTICLE_COUNT);
    scene.add(instancedMesh);
    instancedParticlesRef.current = instancedMesh;

    // Initialize particle data (custom user data for animation)
    const dummy = new THREE.Object3D();
    const particleData = [];
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        // Random spherical distribution
        const phi = Math.acos(-1 + (2 * i) / CONFIG.PARTICLE_COUNT);
        const theta = Math.sqrt(CONFIG.PARTICLE_COUNT * Math.PI) * phi;
        const r = CONFIG.SPHERE_RADIUS;
        
        particleData.push({
            basePos: new THREE.Vector3(
                r * Math.cos(theta) * Math.sin(phi),
                r * Math.sin(theta) * Math.sin(phi),
                r * Math.cos(phi)
            ),
            randomOffset: new THREE.Vector3(
                (Math.random() - 0.5) * 2, 
                (Math.random() - 0.5) * 2, 
                (Math.random() - 0.5) * 2
            ),
            speed: 0.5 + Math.random()
        });
        
        dummy.position.copy(particleData[i].basePos);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.userData = { particles: particleData };
  };

  const initVision = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
            setLoading(false);
            animate();
        };
      }
    } catch (e) {
      console.error("Camera error:", e);
    }
  };

  // --- MATH HELPERS ---

  const mapScreenToWorld = (screenX: number, screenY: number, depthZ: number) => {
    if (!cameraRef.current) return new THREE.Vector3();
    const vec = new THREE.Vector3();
    const pos = new THREE.Vector3();
    
    // Convert 0-1 to Normalized Device Coordinates (-1 to +1)
    // Note: X is flipped because webcam is mirrored
    vec.set((1 - screenX) * 2 - 1, -(screenY) * 2 + 1, 0.5);
    
    vec.unproject(cameraRef.current);
    vec.sub(cameraRef.current.position).normalize();
    const distance = (depthZ - cameraRef.current.position.z) / vec.z;
    pos.copy(cameraRef.current.position).add(vec.multiplyScalar(distance));
    return pos;
  };

  const calculateGrip = (landmarks: NormalizedLandmark[]): number => {
      // Calculate average distance from fingertips to wrist (normalized by hand scale)
      const wrist = landmarks[0];
      const tips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]]; // Thumb, Index, etc.
      
      // Calculate hand scale (wrist to middle finger base)
      const scaleBase = Math.sqrt(
          Math.pow(landmarks[9].x - wrist.x, 2) + 
          Math.pow(landmarks[9].y - wrist.y, 2)
      );

      let totalDist = 0;
      tips.forEach(tip => {
          const d = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
          totalDist += d;
      });
      const avgDist = totalDist / 5;
      
      // Normalize: Open hand ~1.8x scaleBase, Closed ~0.6x scaleBase
      // Grip 0 (Open) -> Grip 1 (Closed)
      const rawGrip = 1 - ((avgDist / scaleBase) - 0.6) / 1.2;
      return Math.max(0, Math.min(1, rawGrip));
  };

  // --- MAIN LOOP ---

  const animate = () => {
    requestRef.current = requestAnimationFrame(animate);
    const now = performance.now();
    const delta = (now - lastTimeRef.current) / 1000;
    //lastTimeRef.current = now; // (Don't update lastTimeRef here to keep delta useful for physics if needed, but here we just use monotonic time)
    physicsState.current.time += 0.01;

    if (!handLandmarkerRef.current || !videoRef.current || !sceneRef.current) return;

    // 1. PROCESS VISION
    let targetPos = new THREE.Vector3(0, 0, 0);
    let targetGrip = 0;
    let targetSplit = 0;
    let isPresent = false;
    let trackingMode: 'SINGLE' | 'DUAL' | 'NONE' = 'NONE';

    if (videoRef.current.currentTime !== lastTimeRef.current) {
        lastTimeRef.current = videoRef.current.currentTime;
        const results = handLandmarkerRef.current.detectForVideo(videoRef.current, now);

        if (results.landmarks && results.landmarks.length > 0) {
            isPresent = true;
            
            if (results.landmarks.length === 2) {
                trackingMode = 'DUAL';
                const h1 = results.landmarks[0];
                const h2 = results.landmarks[1];
                
                // Center point
                const cx = (h1[9].x + h2[9].x) / 2;
                const cy = (h1[9].y + h2[9].y) / 2;
                targetPos = mapScreenToWorld(cx, cy, 0);

                // Separation
                const dist = Math.sqrt(Math.pow(h1[9].x - h2[9].x, 2) + Math.pow(h1[9].y - h2[9].y, 2));
                // Map distance 0.1 -> 0.6 to split 0 -> 1
                targetSplit = Math.max(0, Math.min(1, (dist - 0.1) / 0.5));

                // Grip (Average of both)
                targetGrip = (calculateGrip(h1) + calculateGrip(h2)) / 2;

            } else {
                trackingMode = 'SINGLE';
                const h1 = results.landmarks[0];
                targetPos = mapScreenToWorld(h1[9].x, h1[9].y, 0);
                targetGrip = calculateGrip(h1);
                targetSplit = 0;
            }
        }
    }

    // 2. SMOOTH PHYSICS (Lerp)
    const state = physicsState.current;
    
    // If hand is lost, drift back to center
    if (!isPresent) targetPos.set(0, 0, 0);

    state.position.lerp(targetPos, CONFIG.SMOOTHING_FACTOR);
    state.gripStrength += (targetGrip - state.gripStrength) * CONFIG.SMOOTHING_FACTOR;
    state.splitFactor += (targetSplit - state.splitFactor) * CONFIG.SMOOTHING_FACTOR;

    // 3. UPDATE VISUALS

    // --- SPHERE COMPRESSION PHYSICS ---
    // Squeeze logic: As grip increases, scale decreases, but rotation speed increases (Conservation of Angular Momentum)
    const compression = 1.0 - (state.gripStrength * CONFIG.COMPRESSION_FACTOR); // 1.0 -> 0.3
    const visualScale = compression * (1 + state.splitFactor * 2); // Expands if split
    
    // Rotation Speed: Increases with compression
    const rotSpeed = 0.005 + (state.gripStrength * 0.05) + (state.splitFactor * 0.02);
    state.rotationSpeed = rotSpeed;

    if (mainSphereRef.current && innerCoreRef.current) {
        const sphere = mainSphereRef.current;
        const core = innerCoreRef.current;

        // Position
        sphere.position.copy(state.position);
        core.position.copy(state.position);

        // Rotation
        sphere.rotation.y += state.rotationSpeed;
        sphere.rotation.z += state.rotationSpeed * 0.5;
        
        // Scale
        sphere.scale.setScalar(visualScale);
        core.scale.setScalar(visualScale * 0.3); // Core is smaller

        // Color/Heat shift
        // Grip 0 = Cyan, Grip 1 = White/Red hot
        // Split = Purple/Chaos
        const r = Math.min(1, state.gripStrength + state.splitFactor);
        const g = Math.max(0, 1 - state.gripStrength * 0.5);
        const b = Math.max(0, 1 - state.gripStrength);
        
        (sphere.material as THREE.MeshBasicMaterial).color.setRGB(r * 0.5, g, 1);
        (core.material as THREE.MeshBasicMaterial).color.setRGB(1, 1 - state.gripStrength, 1 - state.gripStrength);
        
        // Hide sphere wireframe when fully split
        (sphere.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.3 - state.splitFactor);
    }

    // --- PARTICLE VORTEX PHYSICS ---
    if (instancedParticlesRef.current) {
        const mesh = instancedParticlesRef.current;
        const dummy = new THREE.Object3D();
        const data = mesh.userData.particles;
        const time = state.time;

        mesh.position.copy(state.position);

        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            const p = data[i];
            
            // Base state: On the sphere surface
            // Active state: Swirling orbit
            
            // Calculate orbital offset based on split factor
            // Use simple noise-like trig for vortex
            const angle = time * p.speed + (i * 0.1);
            const radius = CONFIG.SPHERE_RADIUS * visualScale * (1 + state.splitFactor * 4); // Expand wide on split
            
            // Chaos/Noise vector
            const noiseX = Math.sin(time * 2 + i) * state.splitFactor * 2;
            const noiseY = Math.cos(time * 3 + i) * state.splitFactor * 2;
            const noiseZ = Math.sin(time * 1.5 + i) * state.splitFactor * 2;

            // Target Position Calculation
            let tx, ty, tz;

            if (state.splitFactor > 0.1) {
                // Orbital Vortex Mode
                tx = Math.cos(angle) * radius + noiseX;
                ty = (p.basePos.y * compression) + noiseY; // Flattened slightly
                tz = Math.sin(angle) * radius + noiseZ;
            } else {
                // Surface Mode (Adhere to compressed sphere)
                tx = p.basePos.x * compression;
                ty = p.basePos.y * compression;
                tz = p.basePos.z * compression;
            }

            dummy.position.set(tx, ty, tz);
            
            // Particles spin/look at center
            dummy.lookAt(0, 0, 0);
            dummy.scale.setScalar(1 + state.gripStrength * 2); // Particles get brighter/bigger when compressed
            
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }

    // 4. SYNC UI
    if (trackingMode !== 'NONE') {
        let gesture = HandGesture.HOVER;
        if (state.splitFactor > 0.3) gesture = HandGesture.SPLIT;
        else if (state.gripStrength > 0.5) gesture = HandGesture.GRIP;

        setHandData({
            gesture,
            position: { x: 0, y: 0 },
            worldPosition: state.position,
            isPresent: true,
            trackingMode,
            handSeparation: state.splitFactor,
            gripStrength: state.gripStrength,
            energyOutput: (state.gripStrength + state.splitFactor) / 2
        });
    } else {
        setHandData(prev => ({ ...prev, isPresent: false }));
    }

    // 5. RENDER
    if (composerRef.current) {
        composerRef.current.render();
    } else {
        rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black">
      {/* Background Video (Flipped visually via CSS to match mirror effect) */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-30"
        autoPlay 
        playsInline 
        muted 
      />
      
      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
           <div className="text-cyan-400 font-mono animate-pulse text-xl tracking-[0.5em] jarvis-glow">
             INITIALIZING NEURAL LINK...
           </div>
        </div>
      )}
      
      <HUD handData={handData} />
    </div>
  );
};

export default InteractiveCanvas;
