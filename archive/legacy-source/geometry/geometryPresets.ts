import type { NewAxisGeometrySettings } from "../state/threeDStudioState";

export interface GeometryPreset { id: string; name: string; values: Partial<NewAxisGeometrySettings> & { rayDepth: NewAxisGeometrySettings["rayDepth"] } }
export const GEOMETRY_PRESETS: GeometryPreset[] = [
  { id: "reference-fold", name: "Reference Fold", values: { centerDepth: .12, depthScale: 1, exploded: 0, rayDepth: { top: -.06, upperRight: .08, lowerRight: -.1, softDown: .13, lowerLeft: -.04 } } },
  { id: "shallow-fold", name: "Shallow Fold", values: { centerDepth: .05, depthScale: .55, exploded: 0, rayDepth: { top: -.03, upperRight: .04, lowerRight: -.05, softDown: .06, lowerLeft: -.02 } } },
  { id: "deep-fold", name: "Deep Fold", values: { centerDepth: .2, depthScale: 1.5, exploded: 0, rayDepth: { top: -.12, upperRight: .18, lowerRight: -.22, softDown: .27, lowerLeft: -.13 } } },
  { id: "convex-axis", name: "Convex Axis", values: { centerDepth: .34, depthScale: 1, exploded: 0, rayDepth: { top: -.08, upperRight: -.05, lowerRight: -.08, softDown: -.04, lowerLeft: -.07 } } },
  { id: "concave-axis", name: "Concave Axis", values: { centerDepth: -.25, depthScale: 1, exploded: 0, rayDepth: { top: .1, upperRight: .08, lowerRight: .11, softDown: .07, lowerLeft: .09 } } },
  { id: "alternating-fold", name: "Alternating Fold", values: { centerDepth: .08, depthScale: 1.25, exploded: 0, rayDepth: { top: -.18, upperRight: .2, lowerRight: -.24, softDown: .22, lowerLeft: -.16 } } },
  { id: "exploded-planes", name: "Exploded Planes", values: { centerDepth: .08, depthScale: 1, exploded: .12, rayDepth: { top: -.08, upperRight: .1, lowerRight: -.13, softDown: .16, lowerLeft: -.06 } } },
];
