// src/ui/Orb.tsx — Three.js audio-reactive particle orb
import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useOrb } from "./skills/useOrb.js";

const PARTICLE_POOL = 5000;

function Particles() {
  const { color, audioLevel, pulseSpeed, particleCount, state } = useOrb();
  const pointsRef = useRef();
  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  const smoothColor = useRef(new THREE.Color(color));

  // Generate sphere distribution
  const { positions, basePositions } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_POOL * 3);
    const base = new Float32Array(PARTICLE_POOL * 3);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      // Fibonacci sphere for even distribution
      const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_POOL);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.5;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      pos[i * 3]     = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      base[i * 3]     = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
    }
    return { positions: pos, basePositions: base };
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    // Lerp color
    smoothColor.current.lerp(targetColor, 0.08);
    pointsRef.current.material.color.copy(smoothColor.current);

    // Pulse + audio-reactive displacement
    const t = performance.now() * 0.001;
    const pulse = 1 + Math.sin(t * pulseSpeed * Math.PI * 2) * 0.05;
    const reactive = audioLevel * 0.5;

    const arr = pointsRef.current.geometry.attributes.position.array;
    const visibleN = Math.floor(particleCount);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const visible = i < visibleN;
      const factor = visible ? pulse + reactive * (0.6 + 0.4 * Math.sin(i * 0.1 + t * 2)) : 0;
      arr[i * 3]     = basePositions[i * 3]     * factor;
      arr[i * 3 + 1] = basePositions[i * 3 + 1] * factor;
      arr[i * 3 + 2] = basePositions[i * 3 + 2] * factor;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Slow rotation
    pointsRef.current.rotation.y += delta * (state === "thinking" ? 0.6 : 0.05);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_POOL}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color={color}
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function Orb() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.3} />
      <Particles />
    </Canvas>
  );
}
