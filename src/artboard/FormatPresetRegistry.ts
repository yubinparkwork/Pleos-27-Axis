import type { ArtboardPresetId, ArtboardState } from "./ArtboardState";

export interface FormatPreset { id: ArtboardPresetId; label: string; width: number; height: number }

const FORMATS: FormatPreset[] = [
  { id: "square", label: "Square 1:1", width: 1080, height: 1080 },
  { id: "instagram-portrait", label: "Instagram 4:5", width: 1080, height: 1350 },
  { id: "portrait-3-4", label: "Portrait 3:4", width: 1080, height: 1440 },
  { id: "landscape-16-9", label: "Landscape 16:9", width: 1920, height: 1080 },
  { id: "vertical-9-16", label: "Vertical 9:16", width: 1080, height: 1920 },
  { id: "custom", label: "Custom", width: 1080, height: 1080 },
];

export class FormatPresetRegistry {
  static list(): FormatPreset[] { return FORMATS.map((item) => ({ ...item })); }
  static apply(state: ArtboardState, id: ArtboardPresetId): ArtboardState {
    const preset = FORMATS.find((item) => item.id === id) ?? FORMATS[0];
    return { ...state, id, width: preset.width, height: preset.height };
  }
}
