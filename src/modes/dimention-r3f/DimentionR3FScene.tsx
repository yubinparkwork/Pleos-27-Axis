import { Environment, Lightformer, OrbitControls as DreiOrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
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

const RGB_SPOT_BASE_POWER = 420;
const RGB_SPOT_ENERGY_CEILING = 650;
const RGB_DOMINANCE_TOTAL = 1.65;
// Keep the three emitters separated at the neutral loop beat. Collapsing the
// spread to zero placed every source on the same side of the glass near 14s,
// so a camera-facing reflection could disappear from all three cubes at once.
const RGB_NEUTRAL_PHASE_SPREAD = .35;
const RGB_LIGHT_SEQUENCE = [
  { weights: [1 / 3, 1 / 3, 1 / 3] as const, phaseSpread: RGB_NEUTRAL_PHASE_SPREAD },
  { weights: [.70, .15, .15] as const, phaseSpread: 1 },
  { weights: [.15, .70, .15] as const, phaseSpread: 1 },
  { weights: [.15, .15, .70] as const, phaseSpread: 1 },
  { weights: [1 / 3, 1 / 3, 1 / 3] as const, phaseSpread: RGB_NEUTRAL_PHASE_SPREAD },
] as const;

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

function rgbLightSequence(normalizedTime: number): { weights: [number, number, number]; phaseSpread: number } {
  const progress = ((normalizedTime % 1) + 1) % 1 * (RGB_LIGHT_SEQUENCE.length - 1);
  const segment = Math.min(RGB_LIGHT_SEQUENCE.length - 2, Math.floor(progress));
  const blend = smoothSequenceStep(progress - segment);
  const from = RGB_LIGHT_SEQUENCE[segment];
  const to = RGB_LIGHT_SEQUENCE[segment + 1];
  return {
    weights: [
      THREE.MathUtils.lerp(from.weights[0], to.weights[0], blend),
      THREE.MathUtils.lerp(from.weights[1], to.weights[1], blend),
      THREE.MathUtils.lerp(from.weights[2], to.weights[2], blend),
    ],
    phaseSpread: THREE.MathUtils.lerp(from.phaseSpread, to.phaseSpread, blend),
  };
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
    const sequence = rgbLightSequence(time.current / Math.max(.001, state.motion.duration));
    const lights = [state.lighting.rig.red, state.lighting.rig.green, state.lighting.rig.blue];
    const spots = [red.current, green.current, blue.current];
    const sharedEnergy = softLimitEnergy(
      state.lighting.master * state.lighting.rgb * RGB_SPOT_BASE_POWER,
      RGB_SPOT_ENERGY_CEILING,
    );
    spots.forEach((spot, index) => {
      if (!spot) return;
      const light = lights[index];
      // At the neutral beat the lights converge enough for their colors to
      // merge, while the minimum spread keeps illumination on multiple faces.
      // They fan back out for the red, green and blue hero beats.
      const angle = phase + THREE.MathUtils.degToRad(light.phase) * sequence.phaseSpread;
      spot.position.set(light.positionX + Math.cos(angle) * light.orbitRadius, light.positionY + Math.sin(angle * .83) * light.orbitHeight, light.positionZ + Math.sin(angle) * light.orbitRadius);
      spot.target.position.set(0, 0, 0);
      spot.target.updateMatrixWorld();
      // Energy remains bounded throughout the sequence. Hero beats allocate
      // 70% to the featured color and retain 15% of each supporting color.
      const energyShare = sequence.weights[index] * RGB_DOMINANCE_TOTAL;
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
  const color = useMemo(() => new THREE.Color(), []);
  const materials = useMemo(() => [0, 1, 2, 3, 4, 5].map(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#ffffff") } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision highp float; varying vec2 vUv; uniform vec3 uColor; void main() { float radius = length(vUv - 0.5) * 2.0; float halo = pow(1.0 - smoothstep(0.0, 1.0, radius), 0.48); gl_FragColor = vec4(uColor * halo, halo); }`,
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
    const coverage = Number.isFinite(state.lighting.rgbCoverage) ? state.lighting.rgbCoverage : .78;
    const phase = easedLoopPhase(time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed * speed);
    const sequence = rgbLightSequence(time.current / Math.max(.001, state.motion.duration));
    const lights = [state.lighting.rig.red, state.lighting.rig.green, state.lighting.rig.blue];
    meshes.current.forEach((mesh, index) => {
      if (!mesh) return;
      const colorIndex = index % 3;
      const opposite = index >= 3;
      const light = lights[colorIndex];
      const angle = phase + THREE.MathUtils.degToRad(light.phase) * sequence.phaseSpread + (opposite ? Math.PI : 0);
      const radius = light.orbitRadius * 1.18;
      mesh.position.set(light.positionX + Math.cos(angle) * radius, light.positionY + Math.sin(angle * .83) * light.orbitHeight * 1.08, light.positionZ + Math.sin(angle) * radius);
      mesh.lookAt(0, 0, 0);
      const pairEnergy = opposite ? .28 : 1;
      const energy = light.enabled ? state.lighting.master * state.lighting.rgb * (.18 + sequence.weights[colorIndex] * 1.72) * 2.8 * pairEnergy : 0;
      materials[index].uniforms.uColor.value.copy(color.set(light.color)).multiplyScalar(Math.min(18.0, energy * 1.7));
      // These cards exist only in the captured environment. They behave as
      // moving studio sources, so color appears through angle-dependent glass
      // reflection instead of a full-scene RGB field.
      const size = 1.8 + coverage * 2.6;
      const aspect = .24 + coverage * .16;
      mesh.scale.set(size * (opposite ? .68 : 1), size * aspect * (opposite ? .68 : 1), 1);
    });
  });
  return <>
    {[0, 1, 2, 3, 4, 5].map((index) => <mesh key={`rgb-reflection-fill-${index}`} ref={(mesh) => { meshes.current[index] = mesh; }} material={materials[index]}>
      <circleGeometry args={[1, 48]} />
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
  uniform vec3 uLightPositions[3];
  uniform vec3 uLightColors[3];
  uniform vec3 uLightEnergy;
  uniform float uIor;
  uniform float uRoughness;
  uniform float uThickness;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vAxisLocal;

  float fresnelSchlick(float cosine, float ior) {
    float f0 = (1.0 - ior) / (1.0 + ior);
    f0 *= f0;
    return f0 + (1.0 - f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    if (dot(normal, viewDirection) < 0.0) normal *= -1.0;
    vec3 q = abs(vAxisLocal);
    float secondAxis = max(min(q.x, q.y), max(min(q.x, q.z), min(q.y, q.z)));
    float edge = smoothstep(0.54, 0.985, secondAxis);
    float fresnel = fresnelSchlick(abs(dot(normal, viewDirection)), max(1.01, uIor));
    float roughness = clamp(uRoughness * 2.0, 0.0, 1.0);
    float specularPower = mix(46.0, 7.0, roughness);
    float transmissionPower = mix(18.0, 4.5, roughness);
    vec3 color = vec3(0.0);

    for (int index = 0; index < 3; index += 1) {
      vec3 toLight = uLightPositions[index] - vWorldPosition;
      float distanceToLight = max(0.001, length(toLight));
      vec3 lightDirection = toLight / distanceToLight;
      vec3 reflectedDirection = reflect(-lightDirection, normal);
      vec3 refractedDirection = refract(-lightDirection, normal, 1.0 / max(1.01, uIor));
      float specular = pow(max(dot(reflectedDirection, viewDirection), 0.0), specularPower);
      float transmitted = pow(max(dot(-refractedDirection, viewDirection), 0.0), transmissionPower);
      vec3 fromLight = normalize(vWorldPosition - uLightPositions[index]);
      vec3 beamDirection = normalize(-uLightPositions[index]);
      float cone = smoothstep(0.70, 0.975, dot(fromLight, beamDirection));
      float incidence = pow(abs(dot(normal, lightDirection)), 0.72);
      float distanceFalloff = 1.0 / (1.0 + distanceToLight * distanceToLight * 0.018);
      float opticalPath = exp(-distanceToLight * 0.018 / max(0.15, uThickness));
      float surfaceTransmission = cone * incidence * opticalPath * (0.14 + edge * 0.42) * (0.62 + fresnel);
      float response = specular * (1.25 + fresnel * 1.5)
        + transmitted * opticalPath * (0.20 + edge * 0.92)
        + surfaceTransmission
        + edge * fresnel * specular * 1.35;
      color += uLightColors[index] * uLightEnergy[index] * distanceFalloff * response;
    }

    color = color / (vec3(1.0) + color * 0.42);
    float alpha = clamp(max(color.r, max(color.g, color.b)) * 0.34, 0.0, 0.58);
    gl_FragColor = vec4(color, alpha);
  }
`;

function RgbOpticalTransport({ geometries, state }: { geometries: AxisGeometry[]; state: DimentionR3FState }): React.JSX.Element {
  const time = useRef(state.motion.time);
  const positions = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], []);
  const colors = useMemo(() => [new THREE.Color(), new THREE.Color(), new THREE.Color()], []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: opticalTransportVertexShader,
    fragmentShader: opticalTransportFragmentShader,
    uniforms: {
      uLightPositions: { value: positions },
      uLightColors: { value: colors },
      uLightEnergy: { value: new THREE.Vector3() },
      uIor: { value: state.material.ior },
      uRoughness: { value: state.material.roughness },
      uThickness: { value: state.material.thickness },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), [colors, positions]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => { time.current = state.motion.time; }, [state.motion.time]);
  useFrame((_, delta) => {
    if (state.motion.enabled && state.motion.playing) time.current = (time.current + delta) % state.motion.duration;
    const speed = Number.isFinite(state.lighting.rgbMotionSpeed) ? state.lighting.rgbMotionSpeed : .42;
    const phase = easedLoopPhase(time.current / Math.max(.001, state.motion.duration) * Math.PI * 2 * state.lighting.speed * speed);
    const sequence = rgbLightSequence(time.current / Math.max(.001, state.motion.duration));
    const lights = [state.lighting.rig.red, state.lighting.rig.green, state.lighting.rig.blue];
    const sharedEnergy = softLimitEnergy(state.lighting.master * state.lighting.rgb * RGB_SPOT_BASE_POWER, RGB_SPOT_ENERGY_CEILING);
    const energy = material.uniforms.uLightEnergy.value as THREE.Vector3;
    lights.forEach((light, index) => {
      const angle = phase + THREE.MathUtils.degToRad(light.phase) * sequence.phaseSpread;
      positions[index].set(light.positionX + Math.cos(angle) * light.orbitRadius, light.positionY + Math.sin(angle * .83) * light.orbitHeight, light.positionZ + Math.sin(angle) * light.orbitRadius);
      colors[index].set(light.color);
      energy.setComponent(index, light.enabled ? sharedEnergy * light.intensity * sequence.weights[index] * RGB_DOMINANCE_TOTAL / 210 : 0);
    });
    material.uniforms.uIor.value = state.material.ior;
    material.uniforms.uRoughness.value = state.material.roughness;
    material.uniforms.uThickness.value = state.material.thickness;
  });
  return <group name="RgbOpticalTransport">
    {geometries.map(({ geometry, center }, index) => <mesh key={`rgb-optical-transport-${index}`} geometry={geometry} position={center} scale={1.0015} material={material} renderOrder={2} />)}
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
    <RgbOpticalTransport geometries={geometries} state={state} />
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
    <MovingRgbSpotlights state={state} />
    <Environment resolution={256} frames={Infinity} background={false}>
      <group rotation={[0, 0, 0]}>
        <MovingRgbReflectionSources state={state} />
        <EnvironmentEmitter light={state.lighting.rig.whiteArea} intensityScale={state.lighting.master * state.lighting.white} state={state} phaseOffset={0} />
        <EnvironmentEmitter light={state.lighting.rig.rear} intensityScale={state.lighting.master * state.lighting.white} state={state} phaseOffset={Math.PI * .83} />
      </group>
    </Environment>
    <EffectComposer multisampling={state.quality.multisampling} enableNormalPass>
      <N8AO aoRadius={.72} distanceFalloff={1} intensity={state.lighting.ao} quality={captureQuality === "preview" ? "medium" : "high"} halfRes={captureQuality === "preview"} />
      <Bloom intensity={state.lighting.bloom} luminanceThreshold={1.05} luminanceSmoothing={.45} mipmapBlur />
      <SMAA />
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
