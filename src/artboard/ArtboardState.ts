export type ArtboardFitMode = "contain" | "cover" | "custom";
export type ArtboardPresetId = "square" | "instagram-portrait" | "portrait-3-4" | "landscape-16-9" | "vertical-9-16" | "custom";

export interface ArtboardState {
  id: ArtboardPresetId;
  width: number;
  height: number;
  fitMode: ArtboardFitMode;
  axisAnchor: { gridX: number; gridY: number };
  scale: number;
  background: string;
  transparent: boolean;
  safeGuide: boolean;
  previewZoom: number;
}

export const DEFAULT_ARTBOARD: ArtboardState = {
  id: "square",
  width: 1080,
  height: 1080,
  fitMode: "contain",
  axisAnchor: { gridX: 0.5, gridY: 0.5 },
  scale: 0.82,
  background: "#050607",
  transparent: false,
  safeGuide: false,
  previewZoom: 1,
};
