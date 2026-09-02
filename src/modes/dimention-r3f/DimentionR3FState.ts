import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type DimentionR3FPresetId = "clear-studio" | "pleos-prism" | "dark-glass";
export type DimentionDirectLightShape = "spot" | "area";
export type DimentionEmitterShape = "circle" | "ellipse" | "ring" | "rect";

export interface DimentionDirectLightState {
  enabled: boolean; shape: DimentionDirectLightShape; color: string; intensity: number;
  positionX: number; positionY: number; positionZ: number;
  targetX: number; targetY: number; targetZ: number;
  width: number; height: number; angle: number; penumbra: number;
  distance: number; decay: number; motionAmount: number;
}

export interface DimentionSpectralLightState {
  enabled: boolean; shape: Exclude<DimentionEmitterShape, "rect">; color: string; intensity: number;
  positionX: number; positionY: number; positionZ: number;
  width: number; height: number; softness: number;
  orbitRadius: number; orbitHeight: number; phase: number;
}

export interface DimentionEnvironmentLightState {
  enabled: boolean; shape: DimentionEmitterShape; color: string; intensity: number;
  positionX: number; positionY: number; positionZ: number;
  rotationX: number; rotationY: number; rotationZ: number;
  width: number; height: number;
}

export interface DimentionLightingRigState {
  key: DimentionDirectLightState;
  red: DimentionSpectralLightState;
  green: DimentionSpectralLightState;
  blue: DimentionSpectralLightState;
  whiteArea: DimentionEnvironmentLightState;
  rear: DimentionEnvironmentLightState;
}

export interface DimentionR3FState {
  version: 1;
  preset: DimentionR3FPresetId;
  geometry: { gap: number; bevel: number };
  material: {
    roughness: number; transmission: number; thickness: number; ior: number;
    chromaticAberration: number; anisotropicBlur: number; attenuationDistance: number;
    environment: number;
  };
  lighting: {
    exposure: number; master: number; rgb: number; white: number;
    speed: number; bloom: number; ao: number;
    rig: DimentionLightingRigState;
  };
  mirror: { enabled: boolean; bounces: number; recursionScale: number; reflectivity: number; absorption: number; dispersion: number; edgeIntensity: number };
  camera: { panX: number; panY: number; freeOrbit: boolean; orbitYaw: number; orbitPitch: number; orbitZoom: number; panelCollapsed: boolean };
  motion: { enabled: boolean; playing: boolean; time: number; duration: number };
  quality: { transmissionResolution: number; samples: number; multisampling: number; maxDpr: number };
  artboard: ArtboardState;
  export: {
    ppi: number;
    videoFps: 24 | 30 | 60;
    videoResolution: "4k" | "custom";
    videoWidth: number;
    videoHeight: number;
    videoBitrateMbps: number;
  };
}

const base = (): DimentionR3FState => ({
  version: 1,
  preset: "pleos-prism",
  geometry: { gap: .055, bevel: .035 },
  material: { roughness: .055, transmission: 1, thickness: 1.75, ior: 1.48, chromaticAberration: .075, anisotropicBlur: .08, attenuationDistance: 5.5, environment: 1.65 },
  lighting: {
    exposure: 1.02, master: 1, rgb: 1.15, white: .8, speed: .58, bloom: .16, ao: .9,
    rig: {
      key: { enabled: true, shape: "spot", color: "#ffffff", intensity: 42, positionX: -3.6, positionY: 5.4, positionZ: -4.2, targetX: 0, targetY: 0, targetZ: 0, width: 5.5, height: 3.2, angle: .66, penumbra: 1, distance: 18, decay: 1.35, motionAmount: .8 },
      red: { enabled: true, shape: "circle", color: "#FA293C", intensity: .92, positionX: 0, positionY: 0, positionZ: 0, width: 2.4, height: 2.4, softness: .72, orbitRadius: 4.6, orbitHeight: 3.1, phase: 0 },
      green: { enabled: true, shape: "circle", color: "#0ADC91", intensity: .84, positionX: 0, positionY: 0, positionZ: 0, width: 2.25, height: 2.25, softness: .72, orbitRadius: 5.2, orbitHeight: 3.1, phase: 120 },
      blue: { enabled: true, shape: "circle", color: "#4664FF", intensity: 1, positionX: 0, positionY: 0, positionZ: 0, width: 2.6, height: 2.6, softness: .72, orbitRadius: 4.9, orbitHeight: 3.1, phase: 240 },
      whiteArea: { enabled: true, shape: "ellipse", color: "#ffffff", intensity: 2.4, positionX: 0, positionY: 6, positionZ: -5, rotationX: 90, rotationY: 0, rotationZ: 0, width: 8, height: 3.2 },
      rear: { enabled: true, shape: "ring", color: "#CDDCFF", intensity: 1.4, positionX: 0, positionY: 0, positionZ: 5, rotationX: 0, rotationY: 0, rotationZ: 0, width: 3.2, height: 3.2 },
    },
  },
  mirror: { enabled: true, bounces: 7, recursionScale: .72, reflectivity: .84, absorption: .16, dispersion: .055, edgeIntensity: 1.25 },
  camera: { panX: 0, panY: 0, freeOrbit: false, orbitYaw: 0, orbitPitch: 0, orbitZoom: 1, panelCollapsed: false },
  motion: { enabled: true, playing: true, time: 0, duration: 9 },
  quality: { transmissionResolution: 512, samples: 6, multisampling: 8, maxDpr: 1.5 },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, scale: .82, background: "#050607" },
  export: { ppi: 300, videoFps: 30, videoResolution: "4k", videoWidth: 3840, videoHeight: 2160, videoBitrateMbps: 80 },
});

export const DIMENTION_R3F_PRESETS: Readonly<Record<DimentionR3FPresetId, DimentionR3FState>> = {
  "pleos-prism": base(),
  "clear-studio": {
    ...base(), preset: "clear-studio",
    material: { ...base().material, roughness: .025, thickness: 1.35, chromaticAberration: .025, anisotropicBlur: .025, environment: 1.9 },
    lighting: { ...base().lighting, rgb: .56, white: 1.25, bloom: .08, ao: .72 },
    artboard: { ...base().artboard, axisAnchor: { ...base().artboard.axisAnchor }, background: "#111315" },
  },
  "dark-glass": {
    ...base(), preset: "dark-glass",
    material: { ...base().material, roughness: .095, transmission: .94, thickness: 2.4, chromaticAberration: .045, attenuationDistance: 1.9, environment: 2.1 },
    lighting: { ...base().lighting, exposure: .84, rgb: 1.35, white: .42, bloom: .22, ao: 1.15 },
    artboard: { ...base().artboard, axisAnchor: { ...base().artboard.axisAnchor }, background: "#010203" },
  },
};

export const createDimentionR3FState = (preset: DimentionR3FPresetId = "pleos-prism"): DimentionR3FState => cloneDimentionR3FState(DIMENTION_R3F_PRESETS[preset]);
export const cloneDimentionR3FState = (state: DimentionR3FState): DimentionR3FState => JSON.parse(JSON.stringify(state)) as DimentionR3FState;

export function sanitizeDimentionR3FState(value: unknown): DimentionR3FState {
  const candidate = value as Partial<DimentionR3FState> | null;
  const preset: DimentionR3FPresetId = candidate?.preset === "clear-studio" || candidate?.preset === "dark-glass" ? candidate.preset : "pleos-prism";
  const fallback = createDimentionR3FState(preset);
  const number = (entry: unknown, defaultValue: number, min: number, max: number) => typeof entry === "number" && Number.isFinite(entry) ? Math.min(max, Math.max(min, entry)) : defaultValue;
  const color = (entry: unknown, defaultValue: string) => typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry) ? entry : defaultValue;
  const rig = candidate?.lighting?.rig;
  const directShape = (entry: unknown, defaultValue: DimentionDirectLightShape): DimentionDirectLightShape => entry === "area" || entry === "spot" ? entry : defaultValue;
  const emitterShape = (entry: unknown, defaultValue: DimentionEmitterShape): DimentionEmitterShape => entry === "circle" || entry === "ellipse" || entry === "ring" || entry === "rect" ? entry : defaultValue;
  const spectralShape = (entry: unknown, defaultValue: DimentionSpectralLightState["shape"]): DimentionSpectralLightState["shape"] => entry === "circle" || entry === "ellipse" || entry === "ring" ? entry : defaultValue;
  const spectral = (entry: Partial<DimentionSpectralLightState> | undefined, defaultValue: DimentionSpectralLightState): DimentionSpectralLightState => ({
    enabled: entry?.enabled !== false,
    shape: spectralShape(entry?.shape, defaultValue.shape),
    color: color(entry?.color, defaultValue.color),
    intensity: number(entry?.intensity, defaultValue.intensity, 0, 8),
    positionX: number(entry?.positionX, defaultValue.positionX, -12, 12),
    positionY: number(entry?.positionY, defaultValue.positionY, -12, 12),
    positionZ: number(entry?.positionZ, defaultValue.positionZ, -12, 12),
    width: number(entry?.width, defaultValue.width, .05, 12),
    height: number(entry?.height, defaultValue.height, .05, 12),
    softness: number(entry?.softness, defaultValue.softness, .05, 1.5),
    orbitRadius: number(entry?.orbitRadius, defaultValue.orbitRadius, 0, 12),
    orbitHeight: number(entry?.orbitHeight, defaultValue.orbitHeight, 0, 12),
    phase: number(entry?.phase, defaultValue.phase, -360, 360),
  });
  const environment = (entry: Partial<DimentionEnvironmentLightState> | undefined, defaultValue: DimentionEnvironmentLightState): DimentionEnvironmentLightState => ({
    enabled: entry?.enabled !== false,
    shape: emitterShape(entry?.shape, defaultValue.shape),
    color: color(entry?.color, defaultValue.color),
    intensity: number(entry?.intensity, defaultValue.intensity, 0, 20),
    positionX: number(entry?.positionX, defaultValue.positionX, -12, 12),
    positionY: number(entry?.positionY, defaultValue.positionY, -12, 12),
    positionZ: number(entry?.positionZ, defaultValue.positionZ, -12, 12),
    rotationX: number(entry?.rotationX, defaultValue.rotationX, -180, 180),
    rotationY: number(entry?.rotationY, defaultValue.rotationY, -180, 180),
    rotationZ: number(entry?.rotationZ, defaultValue.rotationZ, -180, 180),
    width: number(entry?.width, defaultValue.width, .05, 20),
    height: number(entry?.height, defaultValue.height, .05, 20),
  });
  return {
    version: 1, preset,
    geometry: { gap: number(candidate?.geometry?.gap, fallback.geometry.gap, 0, .45), bevel: number(candidate?.geometry?.bevel, fallback.geometry.bevel, 0, .15) },
    material: {
      roughness: number(candidate?.material?.roughness, fallback.material.roughness, 0, .5), transmission: number(candidate?.material?.transmission, fallback.material.transmission, 0, 1),
      thickness: number(candidate?.material?.thickness, fallback.material.thickness, .05, 6), ior: number(candidate?.material?.ior, fallback.material.ior, 1.01, 2.333),
      chromaticAberration: number(candidate?.material?.chromaticAberration, fallback.material.chromaticAberration, 0, .3), anisotropicBlur: number(candidate?.material?.anisotropicBlur, fallback.material.anisotropicBlur, 0, .5),
      attenuationDistance: number(candidate?.material?.attenuationDistance, fallback.material.attenuationDistance, .1, 20), environment: number(candidate?.material?.environment, fallback.material.environment, 0, 4),
    },
    lighting: {
      exposure: number(candidate?.lighting?.exposure, fallback.lighting.exposure, .2, 3), master: number(candidate?.lighting?.master, fallback.lighting.master, 0, 3),
      rgb: number(candidate?.lighting?.rgb, fallback.lighting.rgb, 0, 4), white: number(candidate?.lighting?.white, fallback.lighting.white, 0, 4), speed: number(candidate?.lighting?.speed, fallback.lighting.speed, 0, 3),
      bloom: number(candidate?.lighting?.bloom, fallback.lighting.bloom, 0, 1), ao: number(candidate?.lighting?.ao, fallback.lighting.ao, 0, 4),
      rig: {
        key: {
          enabled: rig?.key?.enabled !== false,
          shape: directShape(rig?.key?.shape, fallback.lighting.rig.key.shape),
          color: color(rig?.key?.color, fallback.lighting.rig.key.color),
          intensity: number(rig?.key?.intensity, fallback.lighting.rig.key.intensity, 0, 200),
          positionX: number(rig?.key?.positionX, fallback.lighting.rig.key.positionX, -12, 12), positionY: number(rig?.key?.positionY, fallback.lighting.rig.key.positionY, -12, 12), positionZ: number(rig?.key?.positionZ, fallback.lighting.rig.key.positionZ, -12, 12),
          targetX: number(rig?.key?.targetX, fallback.lighting.rig.key.targetX, -6, 6), targetY: number(rig?.key?.targetY, fallback.lighting.rig.key.targetY, -6, 6), targetZ: number(rig?.key?.targetZ, fallback.lighting.rig.key.targetZ, -6, 6),
          width: number(rig?.key?.width, fallback.lighting.rig.key.width, .05, 20), height: number(rig?.key?.height, fallback.lighting.rig.key.height, .05, 20),
          angle: number(rig?.key?.angle, fallback.lighting.rig.key.angle, .05, 1.5), penumbra: number(rig?.key?.penumbra, fallback.lighting.rig.key.penumbra, 0, 1),
          distance: number(rig?.key?.distance, fallback.lighting.rig.key.distance, 0, 50), decay: number(rig?.key?.decay, fallback.lighting.rig.key.decay, 0, 3), motionAmount: number(rig?.key?.motionAmount, fallback.lighting.rig.key.motionAmount, 0, 6),
        },
        red: spectral(rig?.red, fallback.lighting.rig.red),
        green: spectral(rig?.green, fallback.lighting.rig.green),
        blue: spectral(rig?.blue, fallback.lighting.rig.blue),
        whiteArea: environment(rig?.whiteArea, fallback.lighting.rig.whiteArea),
        rear: environment(rig?.rear, fallback.lighting.rig.rear),
      },
    },
    mirror: {
      enabled: candidate?.mirror?.enabled !== false,
      bounces: Math.round(number(candidate?.mirror?.bounces ?? (candidate?.mirror as unknown as { layers?: number })?.layers, fallback.mirror.bounces, 1, 12)),
      recursionScale: number(candidate?.mirror?.recursionScale ?? (candidate?.mirror as unknown as { scale?: number })?.scale, fallback.mirror.recursionScale, .5, .9),
      reflectivity: number(candidate?.mirror?.reflectivity ?? (candidate?.mirror as unknown as { fade?: number })?.fade, fallback.mirror.reflectivity, .2, .98),
      absorption: number(candidate?.mirror?.absorption, fallback.mirror.absorption, 0, 1.5),
      dispersion: number(candidate?.mirror?.dispersion, fallback.mirror.dispersion, 0, .2),
      edgeIntensity: number(candidate?.mirror?.edgeIntensity, fallback.mirror.edgeIntensity, .2, 3),
    },
    camera: {
      panX: number(candidate?.camera?.panX, fallback.camera.panX, -3, 3),
      panY: number(candidate?.camera?.panY, fallback.camera.panY, -3, 3),
      freeOrbit: candidate?.camera?.freeOrbit === true,
      orbitYaw: number(candidate?.camera?.orbitYaw, fallback.camera.orbitYaw, -180, 180),
      orbitPitch: number(candidate?.camera?.orbitPitch, fallback.camera.orbitPitch, -80, 80),
      orbitZoom: number(candidate?.camera?.orbitZoom, fallback.camera.orbitZoom, .25, 4),
      panelCollapsed: candidate?.camera?.panelCollapsed === true,
    },
    motion: { enabled: candidate?.motion?.enabled !== false, playing: candidate?.motion?.playing !== false, time: number(candidate?.motion?.time, 0, 0, 120), duration: number(candidate?.motion?.duration, fallback.motion.duration, 2, 30) },
    quality: {
      transmissionResolution: Math.round(number(candidate?.quality?.transmissionResolution, fallback.quality.transmissionResolution, 128, 1024)), samples: Math.round(number(candidate?.quality?.samples, fallback.quality.samples, 1, 12)),
      multisampling: Math.round(number(candidate?.quality?.multisampling, fallback.quality.multisampling, 0, 8)), maxDpr: number(candidate?.quality?.maxDpr, fallback.quality.maxDpr, 1, 2),
    },
    artboard: { ...fallback.artboard, ...candidate?.artboard, axisAnchor: { ...fallback.artboard.axisAnchor, ...candidate?.artboard?.axisAnchor } },
    export: {
      ppi: Math.round(number(candidate?.export?.ppi, fallback.export.ppi, 72, 600)),
      videoFps: candidate?.export?.videoFps === 24 || candidate?.export?.videoFps === 60 ? candidate.export.videoFps : 30,
      videoResolution: candidate?.export?.videoResolution === "custom" ? "custom" : "4k",
      videoWidth: Math.round(number(candidate?.export?.videoWidth, fallback.export.videoWidth, 16, 8192)),
      videoHeight: Math.round(number(candidate?.export?.videoHeight, fallback.export.videoHeight, 16, 8192)),
      videoBitrateMbps: Math.round(number(candidate?.export?.videoBitrateMbps, fallback.export.videoBitrateMbps, 20, 160)),
    },
  };
}
