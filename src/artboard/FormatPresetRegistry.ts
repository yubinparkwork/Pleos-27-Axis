import type { ArtboardPresetId, ArtboardState } from "./ArtboardState";

export interface FormatPreset { id: ArtboardPresetId; label: string; shortLabel: string; width: number; height: number; scale: number; gridY: number }

const FORMATS: FormatPreset[] = [
  { id: "square", label: "정사각형 1:1", shortLabel: "1:1", width: 1080, height: 1080, scale: .82, gridY: .5 },
  { id: "instagram-portrait", label: "인스타그램 4:5", shortLabel: "4:5", width: 1080, height: 1350, scale: .8, gridY: .46 },
  { id: "portrait-3-4", label: "세로형 3:4", shortLabel: "3:4", width: 1080, height: 1440, scale: .76, gridY: .47 },
  { id: "landscape-16-9", label: "가로형 16:9", shortLabel: "16:9", width: 1920, height: 1080, scale: .72, gridY: .5 },
  { id: "vertical-9-16", label: "세로형 9:16", shortLabel: "9:16", width: 1080, height: 1920, scale: .68, gridY: .48 },
  { id: "custom", label: "사용자 설정", shortLabel: "직접 입력", width: 1080, height: 1080, scale: .82, gridY: .5 },
];

export class FormatPresetRegistry {
  static list(): FormatPreset[] { return FORMATS.map((item) => ({ ...item })); }
  static apply(state: ArtboardState, id: ArtboardPresetId): ArtboardState {
    const preset = FORMATS.find((item) => item.id === id) ?? FORMATS[0];
    return { ...state, id, width: preset.width, height: preset.height, scale: preset.scale, axisAnchor: { ...state.axisAnchor, gridY: preset.gridY } };
  }
}
