export type CameraPresetId = "reference-front" | "front-perspective" | "three-quarter-left" | "three-quarter-right" | "low-angle" | "macro-center";
export interface CameraPreset { id: CameraPresetId; name: string; mode: "orthographic" | "perspective"; position: [number, number, number]; target: [number, number, number]; fov: number; zoom: number }
export const CAMERA_PRESETS: CameraPreset[] = [
  { id: "reference-front", name: "Reference Front", mode: "orthographic", position: [0, 0, 5], target: [0, 0, 0], fov: 42, zoom: 1 },
  { id: "front-perspective", name: "Front Perspective", mode: "perspective", position: [0, 0, 4.2], target: [0, 0, 0], fov: 42, zoom: 1 },
  { id: "three-quarter-left", name: "Three Quarter Left", mode: "perspective", position: [-2.45, 1.2, 3.6], target: [0, 0, 0], fov: 44, zoom: 1 },
  { id: "three-quarter-right", name: "Three Quarter Right", mode: "perspective", position: [2.45, 1.15, 3.6], target: [0, 0, 0], fov: 44, zoom: 1 },
  { id: "low-angle", name: "Low Angle", mode: "perspective", position: [.2, -2.1, 3.4], target: [0, 0, .05], fov: 48, zoom: 1 },
  { id: "macro-center", name: "Macro Center", mode: "perspective", position: [.55, .35, 2.05], target: [0, 0, .08], fov: 35, zoom: 1 },
];
export const cameraPresetById = (id: CameraPresetId): CameraPreset => CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[0];
