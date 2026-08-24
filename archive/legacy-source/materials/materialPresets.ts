import type { MaterialSettings, TextureSettings } from "../state/threeDStudioState";
import type { FaceId } from "../textures/types";

export type MaterialPresetId = "reference-matte" | "matte-graphite" | "black-chrome" | "brushed-aluminum" | "smoked-glass" | "frosted-acrylic" | "paper-fiber" | "iridescent-film";
export interface MaterialPreset { id: MaterialPresetId; name: string; settings: Partial<MaterialSettings>; texture: Partial<TextureSettings>; faceColors?: Partial<Record<FaceId, string>> }

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "reference-matte", name: "Reference Matte 3D", settings: { baseColor: "#777777", roughness: .88, metalness: .03, clearcoat: .04, transmission: 0, environmentIntensity: .35 }, texture: { enabled: false, procedural: "none" }, faceColors: { "top-right": "#8a8a8a", "right-middle": "#626262", "bottom-right": "#050505", "bottom-left": "#555555", "left-upper": "#161616" } },
  { id: "matte-graphite", name: "Matte Graphite", settings: { baseColor: "#242424", roughness: .78, metalness: .12, clearcoat: .08, environmentIntensity: .5 }, texture: { enabled: true, procedural: "fine-grain", slot: "roughness", intensity: .28, scale: 1.4, contrast: 1.5 } },
  { id: "black-chrome", name: "Black Chrome", settings: { baseColor: "#080808", roughness: .12, metalness: .98, clearcoat: .35, clearcoatRoughness: .08, environmentIntensity: 1.35 }, texture: { enabled: false, procedural: "none" } },
  { id: "brushed-aluminum", name: "Brushed Aluminum", settings: { baseColor: "#a7aaad", roughness: .34, metalness: .94, clearcoat: .12, environmentIntensity: 1.1 }, texture: { enabled: true, procedural: "brushed-horizontal", slot: "roughness", intensity: .38, scale: 2.2, scaleY: 5, contrast: 1.8, projection: "face-local" } },
  { id: "smoked-glass", name: "Smoked Glass", settings: { baseColor: "#111518", opacity: .9, roughness: .12, metalness: 0, transmission: .86, thickness: .72, ior: 1.48, environmentIntensity: 1.25, depthWrite: false }, texture: { enabled: false, procedural: "none" } },
  { id: "frosted-acrylic", name: "Frosted Acrylic", settings: { baseColor: "#c2c7c9", opacity: .96, roughness: .58, metalness: 0, transmission: .72, thickness: .45, ior: 1.47, environmentIntensity: .9, depthWrite: false }, texture: { enabled: true, procedural: "frosted-noise", slot: "roughness", intensity: .32, scale: 1.8 } },
  { id: "paper-fiber", name: "Paper Fiber", settings: { baseColor: "#b9b5ab", roughness: .96, metalness: 0, clearcoat: 0, environmentIntensity: .2 }, texture: { enabled: true, procedural: "paper-fiber", slot: "bump", intensity: .22, scale: 1.6, contrast: 1.4 } },
  { id: "iridescent-film", name: "Iridescent Film", settings: { baseColor: "#3c3d3f", roughness: .34, metalness: .18, clearcoat: .28, iridescence: .42, iridescenceIOR: 1.28, iridescenceThickness: 340, environmentIntensity: .9 }, texture: { enabled: true, procedural: "fine-grain", slot: "roughness", intensity: .1, scale: 1.1 } },
];

export const materialPresetById = (id: MaterialPresetId): MaterialPreset => MATERIAL_PRESETS.find((preset) => preset.id === id) ?? MATERIAL_PRESETS[0];
