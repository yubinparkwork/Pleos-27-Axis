export type Point = [number, number];

export interface NewAxisPreset {
  name: string;
  referenceSize: Point;
  origin: Point;
  rays: {
    top: Point;
    mainLeft: Point;
    mainRight: Point;
    rightDown: Point;
    softDown: Point;
  };
  lighting: {
    leftBoundary: Point;
    leftShadowWidth: number;
    softDownWidthStart: number;
    softDownWidthEnd: number;
  };
  luminance: {
    topRight: number;
    rightMiddle: number;
    bottomLeft: number;
    leftMiddle: number;
    black: number;
  };
  texture: {
    enabled: boolean;
    amount: number;
    scale: number;
    seamIntensity: number;
  };
}

export function clonePreset(preset: NewAxisPreset): NewAxisPreset {
  return structuredClone(preset);
}

export function exportPreset(preset: NewAxisPreset): string {
  return JSON.stringify(preset, null, 2);
}
