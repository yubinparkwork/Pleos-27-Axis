import { Environment, Lightformer, OrbitControls as DreiOrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CrystalAssembly } from "../../crystal/CrystalAssembly";
import { InternalReflectionSystem } from "./InternalReflectionPass";
import { createSoftboxes, updateSoftboxes, SOFTBOX_IDS, softboxProfileGLSL } from "./SpectralSoftboxes";
import type { DimentionEnvironmentLightState, DimentionR3FState, DimentionSpectralLightState } from "./DimentionR3FState";

// Keep these renderer-owned objects referentially stable. React Three Fiber
// reapplies camera props when this object identity changes; recreating it for a
// panel/timeline update resets the camera to its un-oriented default before the
// CameraRig effect has a reason to run again, leaving the Axis behind camera.
const CANVAS_CAMERA = { position: [0, 0, -12] as [number, number, number], near: .05, far: 80, manual: true };
const CANVAS_GL = { antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" as const };

export interface DimentionR3FRuntime {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  setSize: RootState["setSize"];
  setDpr: RootState["setDpr"];
  invalidate: RootState["invalidate"];
  completedFrames(): number;
}

export type DimentionCaptureQuality = "preview" | "still" | "video";

interface SceneProps {
  state: DimentionR3FState;
  captureQuality: DimentionCaptureQuality;
  capturePlan: { width: number; height: number; scale: number } | null;
  onRuntime(runtime: DimentionR3FRuntime): void;
  onTime(time: number): void;
  onCameraOrbit(yaw: number, pitch: number, zoom: number): void;
}

interface AxisGeometry { geometry: THREE.BufferGeometry; center: THREE.Vector3 }

const RGB_SPOT_BASE_POWER = 420;
const RGB_SPOT_ENERGY_CEILING = 650;
const RGB_TOTAL_POWER = 1.65;
// All three sources remain on together. Motion changes reflection positions,
// never allocates a solo "hero" beat to one color or collapses the sources.
const RGB_SIMULTANEOUS = { weights: [1 / 3, 1 / 3, 1 / 3], phaseSpread: 1 } as const;

function softLimitEnergy(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return ceiling * (1 - Math.exp(-value / ceiling));
}

function smoothSequenceStep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function easedLoopPhase(phase: number): number {
  const turn = ((phase / (Math.PI * 2) % 1) + 1) % 1;
  const doubled = turn * 2;
  const half = Math.floor(doubled);
  return (half + smoothSequenceStep(doubled - half)) * Math.PI;
}

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
  const completed = useRef(0);
  // Composer renders at priority 1; acknowledge only completed output frames.
  useFrame(() => { completed.current += 1; }, 2);
  useEffect(() => onRuntime({ gl: runtime.gl, scene: runtime.scene, camera: runtime.camera, setSize: runtime.setSize, setDpr: runtime.setDpr, invalidate: runtime.invalidate, completedFrames: () => completed.current }), [onRuntime]);
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
  const ambient = useRef<THREE.AmbientLight>(null);
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
    if (ambient.current) ambient.current.intensity = .035 * state.lighting.master * (state.motion.enabled ? .94 + Math.sin(phase * .21) * .06 : 1);
    report.current += delta;
    if (report.current > .2) { report.current = 0; onTime(time.current); }
  });
  const key = state.lighting.rig.key;
  return <>
    {key.shape === "spot" ? <spotLight ref={white} color={key.color} angle={key.angle} penumbra={key.penumbra} distance={key.distance} decay={key.decay} /> : <rectAreaLight ref={area} color={key.color} width={key.width} height={key.height} />}
    <ambientLight ref={ambient} color="#dbe4ff" intensity={.035 * state.lighting.master} />
  </>;
}

function MovingRgbSpotlights({ state }: { state: DimentionR3FState }): React.JSX.Element {
  const red = useRef<THREE.SpotLight>(null);
  const green = useRef<THREE.SpotLight>(null);
  const blue = useRef<THREE.SpotLight>(null);
  const time = useRef(state.motion.time);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const rgbMotionSpeed = Number.isFinite(state.lighting.rgbMotionSpeed) ? state.lighting.rgbMotionSpeed : .42;
    // RGB movement is deliberately slower than the rest of the rig. The
    // quintic phase warp gives each half orbit a soft departure and arrival
    // instead of a mechanically constant angular velocity.
    const phase = easedLoopPhase(time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed * rgbMotionSpeed);
    const sequence = RGB_SIMULTANEOUS;
    const lights = [state.lighting.rig.red, state.lighting.rig.green, state.lighting.rig.blue];
    const spots = [red.current, green.current, blue.current];
    const sharedEnergy = softLimitEnergy(
      state.lighting.master * state.lighting.rgb * RGB_SPOT_BASE_POWER,
      RGB_SPOT_ENERGY_CEILING,
    );
    spots.forEach((spot, index) => {
      if (!spot) return;
      const light = lights[index];
      // Keep spatial separation as the rig moves, so the hues do not all
      // merge into one white source.
      const angle = phase + THREE.MathUtils.degToRad(light.phase) * sequence.phaseSpread;
      spot.position.set(light.positionX + Math.cos(angle) * light.orbitRadius, light.positionY + Math.sin(angle * .83) * light.orbitHeight, light.positionZ + Math.sin(angle) * light.orbitRadius);
      spot.target.position.set(0, 0, 0);
      spot.target.updateMatrixWorld();
      const energyShare = sequence.weights[index] * RGB_TOTAL_POWER;
      const requestedIntensity = sharedEnergy * light.intensity * energyShare;
      spot.intensity = light.enabled && Number.isFinite(requestedIntensity) ? requestedIntensity : 0;
    });
  });
  const redLight: DimentionSpectralLightState = state.lighting.rig.red;
  const greenLight: DimentionSpectralLightState = state.lighting.rig.green;
  const blueLight: DimentionSpectralLightState = state.lighting.rig.blue;
  const reflectorSize = Number.isFinite(state.lighting.rgbCoverage) ? state.lighting.rgbCoverage : .78;
  const widenedAngle = (light: DimentionSpectralLightState) => Math.min(1.42, light.angle * (.72 + reflectorSize * .45));
  return <>
    <spotLight ref={red} color={redLight.color} angle={widenedAngle(redLight)} penumbra={Math.max(.9, redLight.penumbra)} distance={redLight.distance} decay={redLight.decay} />
    <spotLight ref={green} color={greenLight.color} angle={widenedAngle(greenLight)} penumbra={Math.max(.9, greenLight.penumbra)} distance={greenLight.distance} decay={greenLight.decay} />
    <spotLight ref={blue} color={blueLight.color} angle={widenedAngle(blueLight)} penumbra={Math.max(.9, blueLight.penumbra)} distance={blueLight.distance} decay={blueLight.decay} />
  </>;
}

function MovingRgbReflectionSources({ state }: { state: DimentionR3FState }): React.JSX.Element {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const time = useRef(state.motion.time);
  const boxes = useMemo(createSoftboxes, []);
  const basis = useMemo(() => new THREE.Matrix4(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const materials = useMemo(() => SOFTBOX_IDS.map(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#ffffff") } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform vec3 uColor; ${softboxProfileGLSL} void main() { float light = softboxProfile(vUv * 2.0 - 1.0, 0.0); gl_FragColor = vec4(uColor * light, 1.0); }`,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), []);
  useEffect(() => () => { materials.forEach((material) => material.dispose()); }, [materials]);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const speed = Number.isFinite(state.lighting.rgbMotionSpeed) ? state.lighting.rgbMotionSpeed : .42;
    const phase = easedLoopPhase(time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed * speed);
    updateSoftboxes(boxes, state, phase);
    meshes.current.forEach((mesh, index) => {
      if (!mesh) return;
      const box = boxes[index];
      mesh.position.copy(box.position);
      normal.crossVectors(box.u, box.v);
      basis.makeBasis(box.u, box.v, normal);
      mesh.quaternion.setFromRotationMatrix(basis);
      // Low-frequency environment support only; finite local reflections
      // below supply spatial variation across the planar glass faces.
      materials[index].uniforms.uColor.value.copy(box.color).multiplyScalar(.015);
      mesh.scale.set(box.size.x * 2, box.size.y * 2, 1);
    });
  });
  return <>
    {SOFTBOX_IDS.map((index) => <mesh key={`rgb-reflection-fill-${index}`} ref={(mesh) => { meshes.current[index] = mesh; }} material={materials[index]}>
      <planeGeometry args={[1, 1]} />
    </mesh>)}
  </>;
}

const opticalTransportVertexShader = /* glsl */`
  precision highp float;
  attribute vec3 axisLocal;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vAxisLocal;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vAxisLocal = axisLocal;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const opticalTransportFragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uSourcePositions[18];
  uniform vec3 uSourceU[18];
  uniform vec3 uSourceV[18];
  uniform vec3 uSourceColors[18];
  uniform vec2 uSourceSizes[18];
  uniform vec3 uCameraForward;
  uniform float uIor;
  uniform float uRoughness;
  uniform float uThickness;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  ${softboxProfileGLSL}

  vec3 reflectedSoftboxes(vec3 origin, vec3 ray, float blur) {
    vec3 radiance = vec3(0.0);
    for (int i = 0; i < 18; i++) {
      vec3 planeNormal = cross(uSourceU[i], uSourceV[i]);
      float denom = dot(ray, planeNormal);
      if (abs(denom) < 0.0001) continue;
      float t = dot(uSourcePositions[i] - origin, planeNormal) / denom;
      if (t <= 0.0) continue;
      vec3 hit = origin + ray * t - uSourcePositions[i];
      vec2 p = vec2(dot(hit, uSourceU[i]), dot(hit, uSourceV[i])) / uSourceSizes[i];
      radiance += uSourceColors[i] * softboxProfile(p, blur);
    }
    return radiance;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    // Orthographic rays are parallel: cameraPosition - fragment would give
    // artificial spherical highlights on a flat face.
    vec3 viewDirection = normalize(-uCameraForward);
    if (dot(normal, viewDirection) < 0.0) normal *= -1.0;
    float cosine = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosine, 5.0);
    vec3 ray = reflect(-viewDirection, normal);
    // Finite source intersections move across faces as the object rotates.
    // There is deliberately no incidence-only face fill or edge paint.
    vec3 radiance = reflectedSoftboxes(vWorldPosition, ray, uRoughness * .6);
    vec3 internalRay = refract(-viewDirection, normal, 1.0 / max(1.01, uIor));
    vec3 exitPoint = vWorldPosition + internalRay * min(uThickness, 6.0);
    vec3 secondary = reflectedSoftboxes(exitPoint, ray, .1 + uRoughness * .6);
    vec3 color = (radiance + secondary * .08) * fresnel * 6.0;
    // Bounded HDR, hue-preserving luminance shoulder. The renderer handles
    // final tone mapping once, together with the physical glass.
    float peak = max(color.r, max(color.g, color.b));
    color /= 1.0 + peak * .20;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function RgbOpticalTransport({ geometries, state }: { geometries: AxisGeometry[]; state: DimentionR3FState }): React.JSX.Element {
  const time = useRef(state.motion.time);
  const boxes = useMemo(createSoftboxes, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: opticalTransportVertexShader,
    fragmentShader: opticalTransportFragmentShader,
    uniforms: {
      uSourcePositions: { value: boxes.map(box => box.position) },
      uSourceU: { value: boxes.map(box => box.u) },
      uSourceV: { value: boxes.map(box => box.v) },
      uSourceColors: { value: boxes.map(box => box.color) },
      uSourceSizes: { value: boxes.map(box => box.size) },
      uCameraForward: { value: new THREE.Vector3() },
      uIor: { value: state.material.ior },
      uRoughness: { value: state.material.roughness },
      uThickness: { value: state.material.thickness },
    },
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    toneMapped: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), [boxes]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame(({ camera }, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const phase = easedLoopPhase(time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed * state.lighting.rgbMotionSpeed);
    updateSoftboxes(boxes, state, phase);
    camera.getWorldDirection(material.uniforms.uCameraForward.value);
    material.uniforms.uIor.value = state.material.ior;
    material.uniforms.uRoughness.value = state.material.roughness;
    material.uniforms.uThickness.value = state.material.thickness;
  }, -20);
  return <group name="RgbOpticalTransport">
    {geometries.map(({ geometry, center }, index) => <mesh key={`rgb-optical-transport-${index}`} geometry={geometry} position={center} material={material} renderOrder={2} />)}
  </group>;
}

function EnvironmentEmitter({ light, intensityScale, state, phaseOffset }: { light: DimentionEnvironmentLightState; intensityScale: number; state: DimentionR3FState; phaseOffset: number }): React.JSX.Element | null {
  const motionGroup = useRef<THREE.Group>(null);
  const time = useRef(state.motion.time);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    const group = motionGroup.current;
    if (!group) return;
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    if (!state.motion.enabled) { group.position.set(0, 0, 0); return; }
    const phase = time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed + phaseOffset;
    const amount = Number.isFinite(light.motionAmount) ? light.motionAmount : .5;
    group.position.set(
      Math.sin(phase * .31) * amount,
      Math.cos(phase * .23 + .7) * amount * .62,
      Math.sin(phase * .19 + 1.3) * amount * .38,
    );
  });
  if (!light.enabled) return null;
  const form = light.shape === "ring" ? "ring" : light.shape === "rect" ? "rect" : "circle";
  return <group ref={motionGroup}><Lightformer
      form={form}
      intensity={light.intensity * intensityScale}
      color={light.color}
      position={[light.positionX, light.positionY, light.positionZ]}
      rotation={[THREE.MathUtils.degToRad(light.rotationX), THREE.MathUtils.degToRad(light.rotationY), THREE.MathUtils.degToRad(light.rotationZ)]}
      scale={[light.width, light.height, 1]}
    /></group>;
}

function AxisGlass({ state, captureQuality }: { state: DimentionR3FState; captureQuality: DimentionCaptureQuality }): React.JSX.Element {
  const assembly = useRef<THREE.Group>(null);
  const time = useRef(state.motion.time);
  const geometries = useMemo(() => buildAxisGeometries(state.geometry.gap, state.geometry.bevel), [state.geometry.bevel, state.geometry.gap]);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useEffect(() => () => geometries.forEach(({ geometry }) => geometry.dispose()), [geometries]);
  useFrame((_, delta) => {
    const group = assembly.current;
    if (!group) return;
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const progress = state.motion.enabled ? time.current / Math.max(.001, state.motion.duration) : 0;
    group.rotation.y = -progress * state.motion.cubeRotationTurns * Math.PI * 2;
    group.updateMatrixWorld(true);
  }, -30);
  return <group ref={assembly} name="PleosAxisCubeRotation">
    {geometries.map(({ geometry, center }, index) => <mesh key={`outer-${index}`} geometry={geometry} position={center} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#ffffff"
        attenuationColor="#ffffff"
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
    <RgbOpticalTransport geometries={geometries} state={state} />
    {state.mirror.enabled && <InternalReflectionSystem geometries={geometries} state={state} captureQuality={captureQuality} />}
  </group>;
}

function OpticalStudio({ state, captureQuality, onTime, onCameraOrbit }: Pick<SceneProps, "state" | "captureQuality" | "onTime" | "onCameraOrbit">): React.JSX.Element {
  const background = useThree((three) => three.scene);
  const maxSamples = useThree(three => three.gl.capabilities.maxSamples);
  useEffect(() => { background.background = state.artboard.transparent ? null : new THREE.Color(state.artboard.background); }, [background, state.artboard.background, state.artboard.transparent]);
  return <>
    <CameraRig state={state} />
    <FreeOrbit state={state} onCameraOrbit={onCameraOrbit} />
    <AxisGlass state={state} captureQuality={captureQuality} />
    <MovingPleosLights state={state} onTime={onTime} />
    <MovingRgbSpotlights state={state} />
    <Environment resolution={captureQuality === "preview" ? 512 : 1024} frames={Infinity} background={false}>
      <group rotation={[0, 0, 0]}>
        <MovingRgbReflectionSources state={state} />
        <EnvironmentEmitter light={state.lighting.rig.whiteArea} intensityScale={state.lighting.master * state.lighting.white} state={state} phaseOffset={0} />
        <EnvironmentEmitter light={state.lighting.rig.rear} intensityScale={state.lighting.master * state.lighting.white} state={state} phaseOffset={Math.PI * .83} />
      </group>
    </Environment>
    <EffectComposer multisampling={Math.min(maxSamples, captureQuality === "preview" ? state.quality.multisampling : 2)} enableNormalPass frameBufferType={THREE.HalfFloatType}>
      <N8AO aoRadius={.72} distanceFalloff={1} intensity={state.lighting.ao} quality={captureQuality === "preview" ? "medium" : "high"} halfRes={captureQuality === "preview"} />
      <Bloom intensity={state.lighting.bloom} luminanceThreshold={1.05} luminanceSmoothing={.45} mipmapBlur />
      <SMAA />
    </EffectComposer>
  </>;
}

export function DimentionR3FScene({ state, captureQuality, capturePlan, onRuntime, onTime, onCameraOrbit }: SceneProps): React.JSX.Element {
  return <Canvas
    className="dimention-r3f-canvas"
    orthographic
    dpr={capturePlan?.scale ?? state.quality.maxDpr}
    style={capturePlan ? { width: capturePlan.width, height: capturePlan.height } : undefined}
    camera={CANVAS_CAMERA}
    gl={CANVAS_GL}
    onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = state.lighting.exposure; }}
  >
    <RuntimeBridge onRuntime={onRuntime} />
    <ExposureBridge exposure={state.lighting.exposure} />
    <OpticalStudio state={state} captureQuality={captureQuality} onTime={onTime} onCameraOrbit={onCameraOrbit} />
  </Canvas>;
}
