import type { LightingSettings } from "../state/threeDStudioState";
export type LightingPresetId = "reference-flat" | "softbox-studio" | "high-contrast" | "rim-light" | "top-light" | "dark-tunnel" | "neutral-product";
export interface LightingPreset { id: LightingPresetId; name: string; values: Partial<LightingSettings> }
const light = (intensity: number, position: [number, number, number], color = "#ffffff") => ({ enabled: true, intensity, position, target: [0, 0, 0] as [number, number, number], color, shadow: false, shadowBias: 0, softness: 2 });
export const LIGHTING_PRESETS: LightingPreset[] = [
  { id: "reference-flat", name: "Reference Flat", values: { ambientIntensity: .55, environmentIntensity: .55, backgroundLuminance: .012, key: light(2.2, [-2.6, 2.4, 4.2]), fill: light(1.15, [3, .6, 3.3], "#d9e1ff"), rim: light(1.8, [.4, -3.2, 1.4]) } },
  { id: "softbox-studio", name: "Softbox Studio", values: { ambientIntensity: .35, environmentIntensity: 1, backgroundLuminance: .035, key: light(4.5, [-3.6, 3.2, 4.8]), fill: light(2.2, [3.2, 1.4, 4]), rim: light(2.8, [0, -3.4, 2.2]) } },
  { id: "high-contrast", name: "High Contrast", values: { ambientIntensity: .12, environmentIntensity: .65, backgroundLuminance: .004, key: light(6.2, [-4, 2.2, 3.2]), fill: light(.18, [3, 0, 2.4]), rim: light(3.5, [2.5, -3.2, 1.2]) } },
  { id: "rim-light", name: "Rim Light", values: { ambientIntensity: .08, environmentIntensity: .45, backgroundLuminance: .002, key: light(.7, [-2, 2, 3]), fill: light(.25, [2, 0, 2]), rim: light(7.5, [0, -3, .5]) } },
  { id: "top-light", name: "Top Light", values: { ambientIntensity: .18, environmentIntensity: .5, backgroundLuminance: .008, key: light(6.5, [0, 4.5, 2.2]), fill: light(.6, [-2, 0, 3]), rim: light(.4, [2, -2, 2]) } },
  { id: "dark-tunnel", name: "Dark Tunnel", values: { ambientIntensity: .03, environmentIntensity: .18, backgroundLuminance: 0, key: light(1.8, [0, 0, 4]), fill: light(.05, [-3, 0, 1]), rim: light(5.2, [3, 0, .6]) } },
  { id: "neutral-product", name: "Neutral Product", values: { ambientIntensity: .42, environmentIntensity: 1.1, backgroundLuminance: .06, key: light(3.8, [-3, 3, 4]), fill: light(2.4, [3, 1, 3.5]), rim: light(2.2, [0, -3, 2]) } },
];
