import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DimentionR3FState } from "./DimentionR3FState";
import type { DimentionCaptureQuality } from "./DimentionR3FScene";
import { MAX_REFLECTION_PIXELS } from "./DimentionCapturePlan";

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
  uniform mat3 uWorldToObject;
  uniform vec2 uOutputResolution;
  uniform vec2 uFeedbackResolution;
  uniform vec2 uCenterUv;
  uniform float uFeedbackReady;
  uniform float uIor;
  uniform float uDispersion;
  uniform float uIntensity;
  uniform float uRecursionScale;
  uniform float uReflectivity;
  uniform float uAbsorption;
  uniform float uEdgeIntensity;
  uniform float uFresnelBoost;
  uniform float uBackfaceEnergy;
  uniform float uDepthShift;
  uniform float uBlur;
  uniform float uLightThreshold;
  uniform vec3 uBackgroundColor;
  uniform int uBounces;

  varying vec3 vCubePosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  vec3 sampleFeedback(vec2 uv) {
    vec2 texel = (1.0 + uBlur * 1.5) / max(uFeedbackResolution, vec2(1.0));
    vec3 value = texture2D(uFeedbackTexture, uv).rgb * 0.40;
    value += texture2D(uFeedbackTexture, uv + vec2(texel.x, 0.0)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv - vec2(texel.x, 0.0)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv + vec2(0.0, texel.y)).rgb * 0.15;
    value += texture2D(uFeedbackTexture, uv - vec2(0.0, texel.y)).rgb * 0.15;
    return value;
  }

  vec3 softPeakLimit(vec3 color, float knee, float ceiling) {
    float peak = max(color.r, max(color.g, color.b));
    if (peak <= knee) return color;
    float span = max(0.0001, ceiling - knee);
    float limitedPeak = knee + span * (1.0 - exp(-(peak - knee) / span));
    return color * limitedPeak / max(peak, 0.0001);
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

  float intersectBox(vec3 rayOrigin, vec3 rayDirection, float halfSize, out float nearDistance, out float farDistance, out vec3 nearNormal, out vec3 farNormal) {
    vec3 direction = safeDirection(rayDirection);
    vec3 inverseDirection = 1.0 / direction;
    vec3 first = (-vec3(halfSize) - rayOrigin) * inverseDirection;
    vec3 second = (vec3(halfSize) - rayOrigin) * inverseDirection;
    vec3 nearTimes = min(first, second);
    vec3 farTimes = max(first, second);
    nearDistance = max(nearTimes.x, max(nearTimes.y, nearTimes.z));
    farDistance = min(farTimes.x, min(farTimes.y, farTimes.z));

    nearNormal = vec3(0.0);
    farNormal = vec3(0.0);
    if (nearTimes.x >= nearTimes.y && nearTimes.x >= nearTimes.z) nearNormal.x = -sign(direction.x);
    else if (nearTimes.y >= nearTimes.z) nearNormal.y = -sign(direction.y);
    else nearNormal.z = -sign(direction.z);
    if (farTimes.x <= farTimes.y && farTimes.x <= farTimes.z) farNormal.x = sign(direction.x);
    else if (farTimes.y <= farTimes.z) farNormal.y = sign(direction.y);
    else farNormal.z = sign(direction.z);
    // These are shader-generated edges: MSAA alone cannot antialias them.
    float span = farDistance - max(nearDistance, 0.0);
    float footprint = max(fwidth(span), 0.0001);
    return smoothstep(-footprint, footprint, span);
  }

  float cubeEdge(vec3 hitPosition, vec3 faceNormal, float halfSize) {
    vec3 normalizedHit = abs(hitPosition) / max(halfSize, 0.0001);
    vec3 crossSection = normalizedHit * (vec3(1.0) - abs(faceNormal));
    float edgeCoordinate = max(crossSection.x, max(crossSection.y, crossSection.z));
    return smoothstep(0.70, 0.985, edgeCoordinate);
  }

  vec3 sampleRecursiveGlass(vec2 screenUv, vec3 hitPosition, vec3 faceNormal, vec3 rayDirection, float halfSize, float layer, float edge) {
    vec2 radial = screenUv - uCenterUv;
    // Each nested image follows the refracted/reflected path at the current
    // cube boundary. This keeps the repeated image faceted and tied to the
    // glass faces instead of producing a flat radial zoom gradient.
    vec3 reflectedDirection = reflect(rayDirection, faceNormal);
    vec2 facetFlow = vec2(
      reflectedDirection.x + hitPosition.z * 0.31,
      reflectedDirection.y - hitPosition.z * 0.23
    );
    facetFlow /= max(length(facetFlow), 0.0001);
    float nestedShift = (1.0 - halfSize) * (0.026 + layer * 0.0025) * uDepthShift;
    vec2 recursiveUv = uCenterUv + radial / max(halfSize, 0.08) + facetFlow * nestedShift;
    vec2 radialDirection = radial / max(length(radial), 0.0001);
    float channelOffset = uDispersion * (0.006 + layer * 0.0007) * (0.45 + edge);
    vec2 redUv = recursiveUv + radialDirection * channelOffset;
    vec2 blueUv = recursiveUv - radialDirection * channelOffset;
    vec2 border = min(recursiveUv, 1.0 - recursiveUv);
    vec2 footprint = max(fwidth(recursiveUv), 1.0 / uFeedbackResolution);
    vec2 coverage = smoothstep(-footprint, footprint, border);
    float inside = coverage.x * coverage.y;
    vec3 captured = vec3(
      sampleFeedback(clamp(redUv, 0.0, 1.0)).r,
      sampleFeedback(clamp(recursiveUv, 0.0, 1.0)).g,
      sampleFeedback(clamp(blueUv, 0.0, 1.0)).b
    );
    // Preserve the original mirror response below the knee. Compression only
    // engages when temporal feedback starts exceeding the stable HDR range.
    captured = softPeakLimit(captured, 1.0, 1.6);
    return captured * inside * uFeedbackReady * 0.93;
  }

  vec4 shadeBoundary(vec3 rayDirection, vec3 hitPosition, vec3 faceNormal, float halfSize, float layer, float energy, vec2 screenUv) {
    float cosine = clamp(dot(-rayDirection, faceNormal), 0.0, 1.0);
    float fresnel = clamp(fresnelSchlick(cosine, uIor, 1.0) * uFresnelBoost, 0.0, 1.0);
    float edge = cubeEdge(hitPosition, faceNormal, halfSize);
    vec3 capturedGlass = sampleRecursiveGlass(screenUv, hitPosition, faceNormal, rayDirection, halfSize, layer, edge);
    vec3 reflectedLight = max(capturedGlass - uBackgroundColor * 0.82, vec3(0.0));
    float reflectedEnergy = max(reflectedLight.r, max(reflectedLight.g, reflectedLight.b));
    // Propagate illuminated reflections, not the broad low-frequency color of
    // an entire glass face. This is what makes the recursion read as light
    // transport rather than a colored overlay.
    reflectedLight *= smoothstep(uLightThreshold * 0.067, uLightThreshold, reflectedEnergy);
    float depthFade = exp(-layer * 0.085);
    float faceTransmission = 0.026 + fresnel * 0.14;
    float contour = edge * uEdgeIntensity * (0.31 + fresnel * 0.66) * (1.0 + min(layer, 8.0) * 0.045);
    vec3 opticalGlass = reflectedLight * (0.58 + reflectedEnergy * 0.48);
    vec3 color = opticalGlass * energy * depthFade * (0.40 + fresnel * 0.66 + contour * 0.92);
    float alpha = energy * depthFade * reflectedEnergy * (faceTransmission * 0.15 + contour * 0.32);
    return vec4(color, alpha);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / max(uOutputResolution, vec2(1.0));
    vec3 incidentWorld = normalize(vWorldPosition - cameraPosition);
    vec3 surfaceNormal = normalize(vWorldNormal);
    if (dot(incidentWorld, surfaceNormal) > 0.0) surfaceNormal *= -1.0;
    vec3 refractedWorld = refract(incidentWorld, surfaceNormal, 1.0 / max(1.01, uIor));
    if (dot(refractedWorld, refractedWorld) < 0.00001) refractedWorld = reflect(incidentWorld, surfaceNormal);

    vec3 rayDirection = normalize(uWorldToCube * uWorldToObject * refractedWorld);
    vec3 rayOrigin = clamp(vCubePosition + rayDirection * 0.004, vec3(-0.998), vec3(0.998));
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedAlpha = 0.0;
    float energy = 1.0;

    for (int layer = 0; layer < 24; layer += 1) {
      if (layer >= uBounces) break;
      float halfSize = pow(uRecursionScale, float(layer + 1));
      float nearDistance;
      float farDistance;
      vec3 nearNormal;
      vec3 farNormal;
      float coverage = intersectBox(rayOrigin, rayDirection, halfSize, nearDistance, farDistance, nearNormal, farNormal);
      // Subpixel layers converge to zero, avoiding shimmering tiny contours.
      coverage *= smoothstep(0.5, 2.0, halfSize / max(length(fwidth(vCubePosition)), 0.00001));
      if (coverage > 0.0) {
        vec3 nearHit = rayOrigin + rayDirection * max(nearDistance, 0.0);
        vec3 farHit = rayOrigin + rayDirection * farDistance;
        vec4 frontBoundary = shadeBoundary(rayDirection, nearHit, nearNormal, halfSize, float(layer), energy, screenUv);
        vec4 backBoundary = shadeBoundary(rayDirection, farHit, -farNormal, halfSize, float(layer) + 0.5, energy * uBackfaceEnergy, screenUv);
        accumulatedColor += (frontBoundary.rgb + backBoundary.rgb) * coverage;
        accumulatedAlpha += (frontBoundary.a + backBoundary.a) * coverage;
        float pathLength = max(0.0, farDistance - max(nearDistance, 0.0));
        energy *= uReflectivity * exp(-uAbsorption * pathLength);
      } else {
        energy *= uReflectivity * 0.68;
      }
    }

    float entranceFresnel = clamp(fresnelSchlick(abs(dot(-incidentWorld, surfaceNormal)), 1.0, uIor) * uFresnelBoost, 0.0, 1.0);
    accumulatedAlpha = clamp(accumulatedAlpha + entranceFresnel * 0.005 * step(0.5, float(uBounces)), 0.0, 0.50);
    // The original look is untouched until the reflection overlay reaches the
    // soft knee. Only runaway feedback is rolled into a finite HDR ceiling.
    vec3 stableColor = softPeakLimit(accumulatedColor * uIntensity, 1.30, 2.35);
    gl_FragColor = vec4(stableColor, clamp(accumulatedAlpha * uIntensity, 0.0, 0.72));
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
  const bounces = state.mirror.cubeBounces[index];
  const mesh = useRef<THREE.Mesh>(null);
  const worldCenter = useRef(new THREE.Vector3());
  const worldToObject = useRef(new THREE.Matrix3());
  const { camera } = useThree();
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uFeedbackTexture: { value: null },
      uWorldToCube: { value: deriveWorldToCube(geometry) },
      uWorldToObject: { value: new THREE.Matrix3() },
      uOutputResolution: { value: new THREE.Vector2(1, 1) },
      uFeedbackResolution: { value: new THREE.Vector2(1, 1) },
      uCenterUv: { value: new THREE.Vector2(.5, .5) },
      uFeedbackReady: { value: 0 },
      uIor: { value: state.material.ior },
      uDispersion: { value: state.mirror.dispersion },
      uIntensity: { value: state.mirror.intensity },
      uRecursionScale: { value: state.mirror.recursionScale },
      uReflectivity: { value: state.mirror.reflectivity },
      uAbsorption: { value: state.mirror.absorption },
      uEdgeIntensity: { value: state.mirror.edgeIntensity },
      uFresnelBoost: { value: state.mirror.fresnelBoost },
      uBackfaceEnergy: { value: state.mirror.backfaceEnergy },
      uDepthShift: { value: state.mirror.depthShift },
      uBlur: { value: state.mirror.blur },
      uLightThreshold: { value: state.mirror.lightThreshold },
      uBackgroundColor: { value: new THREE.Color(state.artboard.transparent ? "#000000" : state.artboard.background).convertSRGBToLinear() },
      uBounces: { value: bounces },
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
  useFrame(() => {
    const current = mesh.current;
    if (!current) return;
    current.updateWorldMatrix(true, false);
    worldToObject.current.setFromMatrix4(current.matrixWorld).invert();
    material.uniforms.uWorldToObject.value.copy(worldToObject.current);
    current.getWorldPosition(worldCenter.current).project(camera);
    material.uniforms.uCenterUv.value.set(worldCenter.current.x * .5 + .5, worldCenter.current.y * .5 + .5);
  }, -20);
  useEffect(() => {
    material.uniforms.uIor.value = state.material.ior;
    material.uniforms.uDispersion.value = state.mirror.dispersion;
    material.uniforms.uIntensity.value = state.mirror.intensity;
    material.uniforms.uRecursionScale.value = state.mirror.recursionScale;
    material.uniforms.uReflectivity.value = state.mirror.reflectivity;
    material.uniforms.uAbsorption.value = state.mirror.absorption;
    material.uniforms.uEdgeIntensity.value = state.mirror.edgeIntensity;
    material.uniforms.uFresnelBoost.value = state.mirror.fresnelBoost;
    material.uniforms.uBackfaceEnergy.value = state.mirror.backfaceEnergy;
    material.uniforms.uDepthShift.value = state.mirror.depthShift;
    material.uniforms.uBlur.value = state.mirror.blur;
    material.uniforms.uLightThreshold.value = state.mirror.lightThreshold;
    material.uniforms.uBackgroundColor.value.set(state.artboard.transparent ? "#000000" : state.artboard.background).convertSRGBToLinear();
    material.uniforms.uBounces.value = bounces;
  }, [material, state.artboard.background, state.artboard.transparent, state.material.ior, state.mirror.absorption, state.mirror.backfaceEnergy, state.mirror.blur, state.mirror.bounces, state.mirror.depthShift, state.mirror.dispersion, state.mirror.edgeIntensity, state.mirror.fresnelBoost, state.mirror.intensity, state.mirror.lightThreshold, state.mirror.recursionScale, state.mirror.reflectivity]);

  // Update per-solid values even when only a tuple entry changed.
  useEffect(() => { material.uniforms.uBounces.value = bounces; }, [material, bounces]);
  return <mesh ref={mesh} name={`RecursiveGlassReflection-${index}`} geometry={geometry} position={center} material={material} renderOrder={3} />;
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
  const previousProjection = useRef(new THREE.Matrix4());
  const savedViewport = useRef(new THREE.Vector4());
  const savedScissor = useRef(new THREE.Vector4());
  const mainResolution = useRef(new THREE.Vector2());
  const { gl, scene, camera, size, viewport } = useThree();
  const captureSize = useMemo(() => {
    const desiredLimit = captureQuality === "preview" ? Math.min(2048, state.quality.transmissionResolution * 2) : Math.max(size.width, size.height) * viewport.dpr;
    const aspect = size.width / Math.max(1, size.height);
    const budgetLimit = Math.sqrt(MAX_REFLECTION_PIXELS * Math.max(aspect, 1 / aspect));
    const limit = Math.max(128, Math.floor(Math.min(desiredLimit, gl.capabilities.maxTextureSize, budgetLimit)));
    return aspect >= 1
      ? { width: limit, height: Math.max(1, Math.round(limit / aspect)) }
      : { width: Math.max(1, Math.round(limit * aspect)), height: limit };
  }, [captureQuality, gl.capabilities.maxTextureSize, size.height, size.width, viewport.dpr, state.quality.transmissionResolution]);
  const samples = Math.min(gl.capabilities.maxSamples, captureSize.width * captureSize.height > 2_100_000 ? 0 : 2);
  const makeTarget = () => new THREE.WebGLRenderTarget(captureSize.width, captureSize.height, {
    depthBuffer: true,
    stencilBuffer: false,
    samples,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  // Own target lifecycle explicitly; useFBO retains samples when switching to 0.
  const targets = useMemo(() => [makeTarget(), makeTarget()], [captureSize.width, captureSize.height, samples]);
  const [targetA, targetB] = targets;
  useEffect(() => () => targets.forEach(target => target.dispose()), [targets]);
  const cubeBouncesKey = state.mirror.cubeBounces.join(',');

  const register = useMemo(() => (index: number, material: THREE.ShaderMaterial | null) => { materials.current[index] = material; }, []);
  useEffect(() => {
    initialized.current = false;
    readTarget.current = targetA;
    writeTarget.current = targetB;
  }, [camera, geometries, state.artboard.background, state.artboard.transparent, state.geometry.bevel, state.geometry.gap, state.material.attenuationDistance, state.material.ior, state.material.roughness, state.material.thickness, state.material.transmission, cubeBouncesKey, state.mirror.recursionScale, captureQuality, targetA, targetB]);

  const configureMaterials = (texture: THREE.Texture | null, ready: number, width: number, height: number) => {
    materials.current.forEach((material) => {
      if (!material) return;
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
      || 1 - Math.abs(camera.quaternion.dot(previousCameraQuaternion.current)) > 1e-8
      || !camera.projectionMatrix.equals(previousProjection.current);
    if (cameraChanged) {
      initialized.current = false;
      previousCameraPosition.current.copy(camera.position);
      previousCameraQuaternion.current.copy(camera.quaternion);
      previousProjection.current.copy(camera.projectionMatrix);
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
