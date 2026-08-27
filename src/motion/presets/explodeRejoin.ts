import { ExplodeRejoinMotion } from "../modules/ExplodeRejoinMotion";
import type { MotionPreset } from "../types";

export const explodeRejoinPreset: MotionPreset = {
  id: "explode-rejoin",
  label: "Explode & Rejoin",
  duration: 6.4,
  constraint: "anchored",
  modules: [ExplodeRejoinMotion],
  parameters: { distance: 0.055, stagger: 0, hold: 0.14, rejoinImpact: 0.08, microRotation: 0 },
};
