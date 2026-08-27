import { ExplodeRejoinMotion } from "../modules/ExplodeRejoinMotion";
import type { MotionPreset } from "../types";

export const explodeRejoinPreset: MotionPreset = {
  id: "explode-rejoin",
  label: "Explode & Rejoin",
  duration: 4.5,
  constraint: "anchored",
  modules: [ExplodeRejoinMotion],
  parameters: { distance: 0.08, stagger: 0, hold: 0.16, rejoinImpact: 0.35, microRotation: 0 },
};
