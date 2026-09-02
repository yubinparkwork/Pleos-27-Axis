import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DimentionR3FState } from "./DimentionR3FState";
import type { DimentionCaptureQuality } from "./DimentionR3FScene";

const vertexShader = /* glsl */`
  precision highp float;

  attribute vec3 axisLocal;
  varying vec3 vCubePosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vCubePosition = axisLocal;
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uFeedbackTexture;
  uniform mat3 uWorldToCube;
  uniform vec2 uOutputResolution;
  uniform vec2 uFeedbackResolution;
  uniform vec2 uCenterUv;
  uniform float uFeedbackReady;
  uniform float uIor;
  uniform float uDispersion;
  uniform float uRecursionScale;
  uniform float uReflectivity;
  uniform float uAbsorption;
  uniform float uEdgeIntensity;
  uniform vec3 uBackgroundColor;
  uniform int uBounces;

  varying vec3 vCubePosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  vec3 sampleFeedback(vec2 uv) {
    vec2 texel = 1.0 / max(uFeedbackResolution, vec2(1.0));
    vec3 value = texture2D(uFeedbackTexture, uv).rgb * 0.40;
    value += texture2D(uFeedbackTexture, uv + vec2(texel.x, 0.0)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv - vec2(texel.x, 0.0)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv + vec2(0.0, texel.y)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv - vec2(0.0, texel.y)).rgb * 0.15;
    return value;
  }

  vec3 safeDirection(vec3 direction) {
    vec3 signs = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction));
    return signs * max(abs(direction), vec3(0.0001));
  }

  float fresnelSchlick(float cosine, float etaI, float etaT) {
    float f0 = (etaI - etaT) / (etaI + etaT);
    f0 *= f0;
    return f0 + (1.0 - f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
  }

  bool intersectBox(vec3 rayOrigin, vec3 rayDirection, float halfSize, out float nearDistance, out float farDistance, out vec3 nearNormal, out vec3 farNormal) {
    vec3 direction = safeDirection(rayDirection);
    vec3 inverseDirection = 1.0 / direction;
    vec3 first = (-vec3(halfSize) - rayOrigin) * inverseDirection;
    vec3 second = (vec3(halfSize) - rayOrigin) * inverseDirection;
    vec3 nearTimes = min(first, second);
    vec3 farTimes = max(first, second);
    nearDistance = max(nearTimes.x, max(nearTimes.y, nearTimes.z));
    farDistance = min(farTimes.x, min(farTimes.y, farTimes.z));
    if (farDistance <= max(nearDistance, 0.0)) return false;

    nearNormal = vec3(0.0);
    farNormal = vec3(0.0);
    if (nearTimes.x >= nearTimes.y && nearTimes.x >= nearTimes.z) nearNormal.x = -sign(direction.x);
    else if (nearTimes.y >= nearTimes.z) nearNormal.y = -sign(direction.y);
    else nearNormal.z = -sign(direction.z);
    if (farTimes.x <= farTimes.y && farTimes.x <= farTimes.z) farNormal.x = sign(direction.x);
    else if (farTimes.y <= farTimes.z) farNormal.y = sign(direction.y);
    else farNormal.z = sign(direction.z);
    return true;
  }

  float cubeEdge(vec3 hitPosition, vec3 faceNormal, float halfSize) {
    vec3 normalizedHit = abs(hitPosition) / max(halfSize, 0.0001);
    vec3 crossSection = normalizedHit * (vec3(1.0) - abs(faceNormal));
    float edgeCoordinate = max(crossSection.x, max(crossSection.y, crossSection.z));
    return smoothstep(0.70, 0.985, edgeCoordinate);
  }

  vec3 sampleRecursiveGlass(vec2 screenUv, float halfSize, float layer, float edge) {
    vec2 radial = screenUv - uCenterUv;
    vec2 recursiveUv = uCenterUv + radial / max(halfSize, 0.08);
    vec2 radialDirection = radial / max(length(radial), 0.0001);
    float channelOffset = uDispersion * (0.006 + layer * 0.0007) * (0.45 + edge);
    vec2 redUv = recursiveUv + radialDirection * channelOffset;
    vec2 blueUv = recursiveUv - radialDirection * channelOffset;
    float inside = step(0.0, recursiveUv.x) * step(recursiveUv.x, 1.0) * step(0.0, recursiveUv.y) * step(recursiveUv.y, 1.0);
    vec3 captured = vec3(
      sampleFeedback(clamp(redUv, 0.0, 1.0)).r,
      sampleFeedback(clamp(recursiveUv, 0.0, 1.0)).g,
      sampleFeedback(clamp(blueUv, 0.0, 1.0)).b
    );
    captured = mix(captured, captured / (vec3(1.0) + captured), 0.72);
    return captured * inside * uFeedbackReady * 0.74;
  }

  vec4 shadeBoundary(vec3 rayDirection, vec3 hitPosition, vec3 faceNormal, float halfSize, float layer, float energy, vec2 screenUv) {
    float cosine = clamp(dot(-rayDirection, faceNormal), 0.0, 1.0);
    float fresnel = fresnelSchlick(cosine, uIor, 1.0);
    float edge = cubeEdge(hitPosition, faceNormal, halfSize);
    vec3 capturedGlass = sampleRecursiveGlass(screenUv, halfSize, layer, edge);
    vec3 reflectedLight = max(capturedGlass - uBackgroundColor * 0.82, vec3(0.0));
    float reflectedEnergy = max(reflectedLight.r, max(reflectedLight.g, reflectedLight.b));
    float faceTransmission = 0.015 + fresnel * 0.11;
    float contour = edge * uEdgeIntensity * (0.26 + fresnel * 0.60);
    vec3 opticalGlass = reflectedLight * (0.48 + reflectedEnergy * 0.52);
    vec3 color = opticalGlass * energy * (0.26 + fresnel * 0.58 + contour * 0.72);
    float alpha = energy * reflectedEnergy * (faceTransmission * 0.10 + contour * 0.24);
    return vec4(color, alpha);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / max(uOutputResolution, vec2(1.0));
    vec3 incidentWorld = normalize(vWorldPosition - cameraPosition);
    vec3 surfaceNormal = normalize(vWorldNormal);
    if (dot(incidentWorld, surfaceNormal) > 0.0) surfaceNormal *= -1.0;
    vec3 refractedWorld = refract(incidentWorld, surfaceNormal, 1.0 / max(1.01, uIor));
    if (dot(refractedWorld, refractedWorld) < 0.00001) refractedWorld = reflect(incidentWorld, surfaceNormal);

    vec3 rayDirection = normalize(uWorldToCube * refractedWorld);
    vec3 rayOrigin = clamp(vCubePosition + rayDirection * 0.004, vec3(-0.998), vec3(0.998));
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedAlpha = 0.0;
    float energy = 1.0;

    for (int layer = 0; layer < 12; layer += 1) {
      if (layer >= uBounces) break;
      float halfSize = pow(uRecursionScale, float(layer + 1));
      float nearDistance;
      float farDistance;
      vec3 nearNormal;
      vec3 farNormal;
      if (intersectBox(rayOrigin, rayDirection, halfSize, nearDistance, farDistance, nearNormal, farNormal)) {
        vec3 nearHit = rayOrigin + rayDirection * max(nearDistance, 0.0);
        vec3 farHit = rayOrigin + rayDirection * farDistance;
        vec4 frontBoundary = shadeBoundary(rayDirection, nearHit, nearNormal, halfSize, float(layer), energy, screenUv);
        vec4 backBoundary = shadeBoundary(rayDirection, farHit, -farNormal, halfSize, float(layer) + 0.5, energy * 0.52, screenUv);
        accumulatedColor += frontBoundary.rgb + backBoundary.rgb;
        accumulatedAlpha += frontBoundary.a + backBoundary.a;
        float pathLength = max(0.0, farDistance - max(nearDistance, 0.0));
        energy *= uReflectivity * exp(-uAbsorption * pathLength);
      } else {
        energy *= uReflectivity * 0.68;
      }
    }

    float entranceFresnel = fresnelSchlick(abs(dot(-incidentWorld, surfaceNormal)), 1.0, uIor);
    accumulatedAlpha = clamp(accumulatedAlpha + entranceFresnel * 0.004, 0.0, 0.42);
    gl_FragColor = vec4(accumulatedColor, accumulatedAlpha);
  }
`;

export interface InternalReflectionGeometry {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
}

interface ReflectionMeshProps extends InternalReflectionGeometry {
  state: DimentionR3FState;
  index: number;
  register(index: number, material: THREE.ShaderMaterial | null): void;
}

function deriveWorldToCube(geometry: THREE.BufferGeometry): THREE.Matrix3 {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const cube = geometry.getAttribute("axisLocal") as THREE.BufferAttribute | undefined;
  if (!cube || cube.count !== position.count) return new THREE.Matrix3().identity();
  const covariance = new Array<number>(9).fill(0);
  const worldCrossCube = new Array<number>(9).fill(0);
  for (let index = 0; index < position.count; index += 1) {
    const q = [cube.getX(index), cube.getY(index), cube.getZ(index)];
    const p = [position.getX(index), position.getY(index), position.getZ(index)];
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
      covariance[row * 3 + column] += q[row] * q[column];
      worldCrossCube[row * 3 + column] += p[row] * q[column];
    }
  }
  const cubeCovariance = new THREE.Matrix3().set(...covariance as [number, number, number, number, number, number, number, number, number]);
  const cross = new THREE.Matrix3().set(...worldCrossCube as [number, number, number, number, number, number, number, number, number]);
  return new THREE.Matrix3().multiplyMatrices(cross, cubeCovariance.invert()).invert();
}

function ReflectionMesh({ geometry, center, state, index, register }: ReflectionMeshProps): React.JSX.Element {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uFeedbackTexture: { value: null },
      uWorldToCube: { value: deriveWorldToCube(geometry) },
      uOutputResolution: { value: new THREE.Vector2(1, 1) },
      uFeedbackResolution: { value: new THREE.Vector2(1, 1) },
      uCenterUv: { value: new THREE.Vector2(.5, .5) },
      uFeedbackReady: { value: 0 },
      uIor: { value: state.material.ior },
      uDispersion: { value: state.mirror.dispersion },
      uRecursionScale: { value: state.mirror.recursionScale },
      uReflectivity: { value: state.mirror.reflectivity },
      uAbsorption: { value: state.mirror.absorption },
      uEdgeIntensity: { value: state.mirror.edgeIntensity },
      uBackgroundColor: { value: new THREE.Color(state.artboard.transparent ? "#000000" : state.artboard.background).convertSRGBToLinear() },
      uBounces: { value: state.mirror.bounces },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), [geometry]);

  useEffect(() => { register(index, material); return () => { register(index, null); material.dispose(); }; }, [index, material, register]);
  useEffect(() => {
    material.uniforms.uIor.value = state.material.ior;
    material.uniforms.uDispersion.value = state.mirror.dispersion;
    material.uniforms.uRecursionScale.value = state.mirror.recursionScale;
    material.uniforms.uReflectivity.value = state.mirror.reflectivity;
    material.uniforms.uAbsorption.value = state.mirror.absorption;
    material.uniforms.uEdgeIntensity.value = state.mirror.edgeIntensity;
    material.uniforms.uBackgroundColor.value.set(state.artboard.transparent ? "#000000" : state.artboard.background).convertSRGBToLinear();
    material.uniforms.uBounces.value = state.mirror.bounces;
  }, [material, state.artboard.background, state.artboard.transparent, state.material.ior, state.mirror.absorption, state.mirror.bounces, state.mirror.dispersion, state.mirror.edgeIntensity, state.mirror.recursionScale, state.mirror.reflectivity]);

  return <mesh name={`RecursiveGlassReflection-${index}`} geometry={geometry} position={center} scale={1.001} material={material} renderOrder={3} />;
}

interface InternalReflectionSystemProps {
  geometries: InternalReflectionGeometry[];
  state: DimentionR3FState;
  captureQuality: DimentionCaptureQuality;
}

export function InternalReflectionSystem({ geometries, state, captureQuality }: InternalReflectionSystemProps): React.JSX.Element {
  const group = useRef<THREE.Group>(null);
  const materials = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const initialized = useRef(false);
  const readTarget = useRef<THREE.WebGLRenderTarget | null>(null);
  const writeTarget = useRef<THREE.WebGLRenderTarget | null>(null);
  const previousCameraPosition = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0));
  const previousCameraQuaternion = useRef(new THREE.Quaternion());
  const projectedCenter = useRef(new THREE.Vector3());
  const savedViewport = useRef(new THREE.Vector4());
  const savedScissor = useRef(new THREE.Vector4());
  const mainResolution = useRef(new THREE.Vector2());
  const { gl, scene, camera, size } = useThree();
  const captureSize = useMemo(() => {
    const qualityLimit = captureQuality === "video" ? 3072 : captureQuality === "still" ? 2048 : 1024;
    const desiredLimit = captureQuality === "preview" ? state.quality.transmissionResolution * 2 : Math.max(size.width, size.height);
    const limit = Math.max(256, Math.min(qualityLimit, gl.capabilities.maxTextureSize, Math.round(desiredLimit)));
    const aspect = size.width / Math.max(1, size.height);
    return aspect >= 1
      ? { width: limit, height: Math.max(1, Math.round(limit / aspect)) }
      : { width: Math.max(1, Math.round(limit * aspect)), height: limit };
  }, [captureQuality, gl.capabilities.maxTextureSize, size.height, size.width, state.quality.transmissionResolution]);
  const targetOptions = useMemo(() => ({
    depthBuffer: true,
    stencilBuffer: false,
    samples: captureQuality === "preview" ? 0 : 4,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
  }), [captureQuality]);
  const targetA = useFBO(captureSize.width, captureSize.height, targetOptions);
  const targetB = useFBO(captureSize.width, captureSize.height, targetOptions);

  const register = useMemo(() => (index: number, material: THREE.ShaderMaterial | null) => { materials.current[index] = material; }, []);
  useEffect(() => {
    initialized.current = false;
    readTarget.current = targetA;
    writeTarget.current = targetB;
  }, [camera, geometries, state.artboard.background, state.artboard.transparent, state.geometry.bevel, state.geometry.gap, state.material.attenuationDistance, state.material.ior, state.material.roughness, state.material.thickness, state.material.transmission, state.mirror.bounces, state.mirror.recursionScale, targetA, targetB]);

  const configureMaterials = (texture: THREE.Texture | null, ready: number, width: number, height: number) => {
    materials.current.forEach((material, index) => {
      if (!material) return;
      const center = geometries[index]?.center;
      if (center) {
        projectedCenter.current.copy(center).project(camera);
        material.uniforms.uCenterUv.value.set(projectedCenter.current.x * .5 + .5, projectedCenter.current.y * .5 + .5);
      }
      material.uniforms.uFeedbackTexture.value = texture;
      material.uniforms.uFeedbackReady.value = ready;
      material.uniforms.uOutputResolution.value.set(width, height);
      material.uniforms.uFeedbackResolution.value.set(captureSize.width, captureSize.height);
    });
  };

  useFrame(() => {
    const reflectionGroup = group.current;
    if (!reflectionGroup || !readTarget.current || !writeTarget.current) return;
    const cameraChanged = camera.position.distanceToSquared(previousCameraPosition.current) > 1e-8
      || 1 - Math.abs(camera.quaternion.dot(previousCameraQuaternion.current)) > 1e-8;
    if (cameraChanged) {
      initialized.current = false;
      previousCameraPosition.current.copy(camera.position);
      previousCameraQuaternion.current.copy(camera.quaternion);
    }

    const previousRenderTarget = gl.getRenderTarget();
    const previousScissorTest = gl.getScissorTest();
    gl.getViewport(savedViewport.current);
    gl.getScissor(savedScissor.current);
    const pixelRatio = gl.getPixelRatio();
    mainResolution.current.set(Math.max(1, Math.round(size.width * pixelRatio)), Math.max(1, Math.round(size.height * pixelRatio)));
    gl.setScissorTest(false);
    gl.setViewport(0, 0, captureSize.width, captureSize.height);

    if (!initialized.current) {
      reflectionGroup.visible = false;
      configureMaterials(null, 0, captureSize.width, captureSize.height);
      gl.setRenderTarget(readTarget.current);
      gl.clear(true, true, true);
      gl.render(scene, camera);
      reflectionGroup.visible = true;
      initialized.current = true;
    } else {
      configureMaterials(readTarget.current.texture, 1, captureSize.width, captureSize.height);
      gl.setRenderTarget(writeTarget.current);
      gl.clear(true, true, true);
      gl.render(scene, camera);
      const completed = writeTarget.current;
      writeTarget.current = readTarget.current;
      readTarget.current = completed;
    }

    gl.setRenderTarget(previousRenderTarget);
    gl.setViewport(savedViewport.current);
    gl.setScissor(savedScissor.current);
    gl.setScissorTest(previousScissorTest);
    configureMaterials(readTarget.current.texture, 1, mainResolution.current.x, mainResolution.current.y);
  }, -10);

  return <group ref={group} name="RecursiveGlassFboSystem">
    {geometries.map(({ geometry, center }, index) => <ReflectionMesh key={`recursive-reflection-${index}`} geometry={geometry} center={center} state={state} index={index} register={register} />)}
  </group>;
}
