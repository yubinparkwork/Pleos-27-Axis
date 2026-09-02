import { Environment, Lightformer, OrbitControls as DreiOrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CrystalAssembly } from "../../crystal/CrystalAssembly";
import { InternalReflectionSystem } from "./InternalReflectionPass";
import type { DimentionEnvironmentLightState, DimentionR3FState, DimentionSpectralLightState } from "./DimentionR3FState";

// Keep these renderer-owned objects referentially stable. React Three Fiber
// reapplies camera props when this object identity changes; recreating it for a
// panel/timeline update resets the camera to its un-oriented default before the
// CameraRig effect has a reason to run again, leaving the Axis behind camera.
const CANVAS_CAMERA = { position: [0, 0, -12] as [number, number, number], near: .05, far: 80 };
const CANVAS_GL = { antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" as const };

export interface DimentionR3FRuntime {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  setSize: RootState["setSize"];
  setDpr: RootState["setDpr"];
  invalidate: RootState["invalidate"];
}

export type DimentionCaptureQuality = "preview" | "still" | "video";

interface SceneProps {
  state: DimentionR3FState;
  captureQuality: DimentionCaptureQuality;
  onRuntime(runtime: DimentionR3FRuntime): void;
  onTime(time: number): void;
  onCameraOrbit(yaw: number, pitch: number, zoom: number): void;
}

interface AxisGeometry { geometry: THREE.BufferGeometry; center: THREE.Vector3 }

const discVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const discFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uSoftness;
  uniform float uShape;
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float radius = length(point);
    float falloff = mix(1.15, 2.8, clamp(uSoftness, 0.05, 1.5) / 1.5);
    float core = exp(-pow(radius * falloff, mix(1.45, 3.2, clamp(uSoftness, 0.05, 1.5) / 1.5)));
    float halo = exp(-pow(radius * (falloff + 1.5), 1.6)) * 0.28;
    float disc = (core + halo) * smoothstep(1.08, 0.72, radius);
    float ringDistance = abs(radius - 0.62);
    float ring = exp(-pow(ringDistance * mix(5.0, 13.0, clamp(uSoftness, 0.05, 1.5) / 1.5), 2.0)) * smoothstep(1.05, 0.88, radius);
    float alpha = mix(disc, ring, step(1.5, uShape));
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor * uIntensity * alpha, alpha);
  }
`;

function buildAxisGeometries(gap: number, bevel: number): AxisGeometry[] {
  const source = new CrystalAssembly();
  source.setBevelRadius(bevel);
  source.setGap(gap);
  source.updateMatrixWorld(true);
  const geometries: AxisGeometry[] = [];
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name !== "ClosedOpticalSolid") return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    geometry.translate(-center.x, -center.y, -center.z);
    geometries.push({ geometry, center });
  });
  source.dispose();
  return geometries;
}

function RuntimeBridge({ onRuntime }: Pick<SceneProps, "onRuntime">): null {
  const runtime = useThree();
  useEffect(() => onRuntime({ gl: runtime.gl, scene: runtime.scene, camera: runtime.camera, setSize: runtime.setSize, setDpr: runtime.setDpr, invalidate: runtime.invalidate }), [onRuntime]);
  return null;
}

function ExposureBridge({ exposure }: { exposure: number }): null {
  const gl = useThree((state) => state.gl);
  useEffect(() => { gl.toneMappingExposure = exposure; }, [exposure, gl]);
  return null;
}

function CameraRig({ state }: { state: DimentionR3FState }): null {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const halfHeight = 2.32 / Math.max(.25, state.artboard.scale);
    const halfWidth = halfHeight * size.width / Math.max(1, size.height);
    const anchorX = (state.artboard.axisAnchor.gridX - .5) * halfWidth * 2;
    const anchorY = (.5 - state.artboard.axisAnchor.gridY) * halfHeight * 2;
    const cameraX = anchorX + state.camera.panX;
    const cameraY = anchorY + state.camera.panY;
    const yaw = THREE.MathUtils.degToRad(state.camera.orbitYaw);
    const pitch = THREE.MathUtils.degToRad(state.camera.orbitPitch);
    const horizontal = Math.cos(pitch) * 12;
    camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.zoom = state.camera.orbitZoom;
    camera.position.set(cameraX + Math.sin(yaw) * horizontal, cameraY + Math.sin(pitch) * 12, -Math.cos(yaw) * horizontal);
    camera.lookAt(cameraX, cameraY, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.height, size.width, state.artboard.axisAnchor.gridX, state.artboard.axisAnchor.gridY, state.artboard.scale, state.camera.orbitPitch, state.camera.orbitYaw, state.camera.orbitZoom, state.camera.panX, state.camera.panY]);
  return null;
}

function FreeOrbit({ state, onCameraOrbit }: Pick<SceneProps, "state" | "onCameraOrbit">): React.JSX.Element {
  const controls = useRef<OrbitControlsImpl>(null);
  const { size } = useThree();
  const halfHeight = 2.32 / Math.max(.25, state.artboard.scale);
  const halfWidth = halfHeight * size.width / Math.max(1, size.height);
  const targetX = (state.artboard.axisAnchor.gridX - .5) * halfWidth * 2 + state.camera.panX;
  const targetY = (.5 - state.artboard.axisAnchor.gridY) * halfHeight * 2 + state.camera.panY;
  const reportOrbit = () => {
    const control = controls.current;
    if (!control) return;
    const offset = control.object.position.clone().sub(control.target);
    const radius = Math.max(.001, offset.length());
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(offset.x, -offset.z));
    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.y / radius, -1, 1)));
    onCameraOrbit(yaw, pitch, control.object.zoom);
  };
  return <DreiOrbitControls
    ref={controls}
    enabled
    target={[targetX, targetY, 0]}
    enablePan={false}
    enableRotate={state.camera.freeOrbit}
    enableZoom
    zoomSpeed={.65}
    minZoom={.25}
    maxZoom={4}
    enableDamping
    dampingFactor={.08}
    rotateSpeed={.55}
    minPolarAngle={THREE.MathUtils.degToRad(10)}
    maxPolarAngle={THREE.MathUtils.degToRad(170)}
    onEnd={reportOrbit}
  />;
}

function MovingPleosLights({ state, onTime }: Pick<SceneProps, "state" | "onTime">): React.JSX.Element {
  const white = useRef<THREE.SpotLight>(null);
  const area = useRef<THREE.RectAreaLight>(null);
  const time = useRef(state.motion.time);
  const report = useRef(0);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const phase = time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed;
    const key = state.lighting.rig.key;
    const x = key.positionX + Math.sin(phase * .42) * key.motionAmount;
    if (white.current) {
      white.current.position.set(x, key.positionY, key.positionZ);
      white.current.lookAt(key.targetX, key.targetY, key.targetZ);
      white.current.intensity = key.enabled ? key.intensity * state.lighting.master * state.lighting.white : 0;
    }
    if (area.current) {
      area.current.position.set(x, key.positionY, key.positionZ);
      area.current.lookAt(key.targetX, key.targetY, key.targetZ);
      area.current.intensity = key.enabled ? key.intensity * .4 * state.lighting.master * state.lighting.white : 0;
    }
    report.current += delta;
    if (report.current > .2) { report.current = 0; onTime(time.current); }
  });
  const key = state.lighting.rig.key;
  return <>
    {key.shape === "spot" ? <spotLight ref={white} color={key.color} angle={key.angle} penumbra={key.penumbra} distance={key.distance} decay={key.decay} /> : <rectAreaLight ref={area} color={key.color} width={key.width} height={key.height} />}
    <ambientLight color="#dbe4ff" intensity={.035 * state.lighting.master} />
  </>;
}

function GradientDisc({ color, intensity, softness, shape }: { color: string; intensity: number; softness: number; shape: DimentionSpectralLightState["shape"] }): React.JSX.Element {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: discVertexShader,
    fragmentShader: discFragmentShader,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uSoftness: { value: softness }, uShape: { value: shape === "ring" ? 2 : 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  useEffect(() => { material.uniforms.uColor.value.set(color); material.uniforms.uIntensity.value = intensity; material.uniforms.uSoftness.value = softness; material.uniforms.uShape.value = shape === "ring" ? 2 : 0; }, [color, intensity, material, shape, softness]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh>
    <planeGeometry args={[2, 2]} />
    <primitive object={material} attach="material" />
  </mesh>;
}

function SpectralEmitter({ light, state, lightRef }: { light: DimentionSpectralLightState; state: DimentionR3FState; lightRef: React.RefObject<THREE.Group | null> }): React.JSX.Element | null {
  if (!light.enabled) return null;
  return <group ref={lightRef} scale={[light.width, light.height, 1]}><GradientDisc color={light.color} intensity={state.lighting.master * state.lighting.rgb * 1.55 * light.intensity} softness={light.softness} shape={light.shape} /></group>;
}

function MovingSpectralDiscs({ state }: { state: DimentionR3FState }): React.JSX.Element {
  const red = useRef<THREE.Group>(null);
  const green = useRef<THREE.Group>(null);
  const blue = useRef<THREE.Group>(null);
  const time = useRef(state.motion.time);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const phase = time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed;
    const lights = [state.lighting.rig.red, state.lighting.rig.green, state.lighting.rig.blue];
    const groups = [red.current, green.current, blue.current];
    groups.forEach((group, index) => {
      if (!group) return;
      const light = lights[index];
      const angle = phase + THREE.MathUtils.degToRad(light.phase);
      group.position.set(light.positionX + Math.cos(angle) * light.orbitRadius, light.positionY + Math.sin(angle * .83) * light.orbitHeight, light.positionZ + Math.sin(angle) * light.orbitRadius);
      group.lookAt(0, 0, 0);
    });
  });
  // These discs exist only as visible reflection sources in the environment.
  // Direct illumination comes from the spotlights above, so keeping this value
  // restrained prevents the glass body from reading as self-emissive.
  return <>
    <SpectralEmitter light={state.lighting.rig.red} state={state} lightRef={red} />
    <SpectralEmitter light={state.lighting.rig.green} state={state} lightRef={green} />
    <SpectralEmitter light={state.lighting.rig.blue} state={state} lightRef={blue} />
  </>;
}

function EnvironmentEmitter({ light, intensityScale }: { light: DimentionEnvironmentLightState; intensityScale: number }): React.JSX.Element | null {
  if (!light.enabled) return null;
  const form = light.shape === "ring" ? "ring" : light.shape === "rect" ? "rect" : "circle";
  return <Lightformer
    form={form}
    intensity={light.intensity * intensityScale}
    color={light.color}
    position={[light.positionX, light.positionY, light.positionZ]}
    rotation={[THREE.MathUtils.degToRad(light.rotationX), THREE.MathUtils.degToRad(light.rotationY), THREE.MathUtils.degToRad(light.rotationZ)]}
    scale={[light.width, light.height, 1]}
  />;
}

function AxisGlass({ state, captureQuality }: { state: DimentionR3FState; captureQuality: DimentionCaptureQuality }): React.JSX.Element {
  const geometries = useMemo(() => buildAxisGeometries(state.geometry.gap, state.geometry.bevel), [state.geometry.bevel, state.geometry.gap]);
  useEffect(() => () => geometries.forEach(({ geometry }) => geometry.dispose()), [geometries]);
  return <group>
    {geometries.map(({ geometry, center }, index) => <mesh key={`outer-${index}`} geometry={geometry} position={center} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#f6f8f8"
        attenuationColor="#dce8e8"
        attenuationDistance={state.material.attenuationDistance}
        transmission={state.material.transmission}
        roughness={state.material.roughness}
        thickness={state.material.thickness}
        ior={state.material.ior}
        dispersion={state.material.chromaticAberration}
        anisotropy={state.material.anisotropicBlur}
        clearcoat={1}
        clearcoatRoughness={.018}
        envMapIntensity={state.material.environment}
        specularIntensity={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>)}
    {state.mirror.enabled && <InternalReflectionSystem geometries={geometries} state={state} captureQuality={captureQuality} />}
  </group>;
}

function OpticalStudio({ state, captureQuality, onTime, onCameraOrbit }: Pick<SceneProps, "state" | "captureQuality" | "onTime" | "onCameraOrbit">): React.JSX.Element {
  const background = useThree((three) => three.scene);
  useEffect(() => { background.background = state.artboard.transparent ? null : new THREE.Color(state.artboard.background); }, [background, state.artboard.background, state.artboard.transparent]);
  return <>
    <CameraRig state={state} />
    <FreeOrbit state={state} onCameraOrbit={onCameraOrbit} />
    <AxisGlass state={state} captureQuality={captureQuality} />
    <MovingPleosLights state={state} onTime={onTime} />
    <Environment resolution={256} frames={Infinity} background={false}>
      <group rotation={[0, 0, 0]}>
        <EnvironmentEmitter light={state.lighting.rig.whiteArea} intensityScale={state.lighting.master * state.lighting.white} />
        <MovingSpectralDiscs state={state} />
        <EnvironmentEmitter light={state.lighting.rig.rear} intensityScale={state.lighting.master * state.lighting.white} />
      </group>
    </Environment>
    <EffectComposer multisampling={state.quality.multisampling} enableNormalPass>
      <N8AO aoRadius={.72} distanceFalloff={1} intensity={state.lighting.ao} quality={captureQuality === "preview" ? "medium" : "high"} halfRes={captureQuality === "preview"} />
      <Bloom intensity={state.lighting.bloom} luminanceThreshold={1.05} luminanceSmoothing={.45} mipmapBlur />
    </EffectComposer>
  </>;
}

export function DimentionR3FScene({ state, captureQuality, onRuntime, onTime, onCameraOrbit }: SceneProps): React.JSX.Element {
  return <Canvas
    className="dimention-r3f-canvas"
    orthographic
    dpr={[1, state.quality.maxDpr]}
    camera={CANVAS_CAMERA}
    gl={CANVAS_GL}
    onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = state.lighting.exposure; }}
  >
    <RuntimeBridge onRuntime={onRuntime} />
    <ExposureBridge exposure={state.lighting.exposure} />
    <OpticalStudio state={state} captureQuality={captureQuality} onTime={onTime} onCameraOrbit={onCameraOrbit} />
  </Canvas>;
}
