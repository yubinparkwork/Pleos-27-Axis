import type { NewAxisPreset } from "./types";

const WIDTH = 2800;
const HEIGHT = 2080;

const designPoint = (point: [number, number]): [number, number] => [
  point[0] * WIDTH,
  point[1] * HEIGHT,
];

/** Source-of-truth values are normalized; shader uniforms use design pixels. */
export const pleosOriginalNormalized = {
  origin: [0.49944, 0.50021] as [number, number],
  mainAxisLeft: [0, 0.8321] as [number, number],
  mainAxisRight: [1, 0.16757] as [number, number],
  topAxis: [0.50288, 0] as [number, number],
  rightDownAxis: [1, 0.84179] as [number, number],
  softDownAxis: [0.3517, 1] as [number, number],
  leftLightingBoundary: [0, 0.3769] as [number, number],
};

export const pleosOriginal: NewAxisPreset = {
  name: "pleos-original",
  referenceSize: [WIDTH, HEIGHT],
  origin: designPoint(pleosOriginalNormalized.origin),
  rays: {
    top: designPoint(pleosOriginalNormalized.topAxis),
    mainLeft: designPoint(pleosOriginalNormalized.mainAxisLeft),
    mainRight: designPoint(pleosOriginalNormalized.mainAxisRight),
    rightDown: designPoint(pleosOriginalNormalized.rightDownAxis),
    softDown: designPoint(pleosOriginalNormalized.softDownAxis),
  },
  lighting: {
    leftBoundary: designPoint(pleosOriginalNormalized.leftLightingBoundary),
    leftShadowWidth: 108,
    softDownWidthStart: 32,
    softDownWidthEnd: 158,
  },
  luminance: {
    topRight: 124,
    rightMiddle: 92,
    bottomLeft: 74,
    leftMiddle: 44,
    black: 0,
  },
  texture: {
    enabled: true,
    amount: 0.92,
    scale: 1,
    seamIntensity: 0.42,
  },
};
