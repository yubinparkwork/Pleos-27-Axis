import { axisLightSweepEffect } from "./AxisLightSweepEffect";
import { chromaticMappingEffect } from "./ChromaticMappingEffect";
import { ditherEffect } from "./DitherEffect";
import { materialTextureEffect } from "./MaterialTextureEffect";
import { planeIlluminationEffect } from "./PlaneIlluminationEffect";
import { refractionEffect } from "./RefractionEffect";
import { surfaceGrainEffect } from "./SurfaceGrainEffect";
import { topographicEffect } from "./TopographicEffect";
import type { EffectDefinition } from "./types";

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  surfaceGrainEffect, materialTextureEffect, axisLightSweepEffect, planeIlluminationEffect,
  refractionEffect, topographicEffect, ditherEffect, chromaticMappingEffect,
];

export const EFFECT_REGISTRY = new Map(EFFECT_DEFINITIONS.map((definition) => [definition.type, definition]));
