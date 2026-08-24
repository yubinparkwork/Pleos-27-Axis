import {
  getPleosColorFamily,
  isPleosColorToken,
  type PleosColorFamily,
  type PleosColorToken,
} from "./colors";

export type ToneOnTonePriority = 1 | 2 | 3;
export type ToneOnToneStatus =
  | "brand-compliant"
  | "experimental-review-required"
  | "invalid";

export interface ToneOnTonePair {
  readonly background: PleosColorToken;
  readonly foreground: PleosColorToken;
  /** Priority printed in the combination guide. Undefined means approved without a ranked logo example. */
  readonly priority?: ToneOnTonePriority;
}

export interface ToneOnToneValidation {
  readonly valid: boolean;
  readonly status: ToneOnToneStatus;
  readonly background: string;
  readonly foreground: string;
  readonly family?: PleosColorFamily;
  readonly priority?: ToneOnTonePriority;
  readonly reason: string;
}

/**
 * Approved pairs transcribed from Pleos 25 Design Guidelines pp.4-5.
 * Direction matters: background and foreground are not interchangeable.
 */
export const PLEOS_TONE_ON_TONE_PAIRS = [
  pair("white", "darkGray1", 1),
  pair("white", "darkGray2", 2),
  pair("white", "darkGray3", 3),
  pair("white", "black"),
  pair("lightGray1", "darkGray1", 1),
  pair("lightGray1", "darkGray2", 2),
  pair("lightGray1", "darkGray3", 3),
  pair("lightGray1", "black"),
  pair("lightGray2", "darkGray1"),
  pair("lightGray2", "darkGray2"),
  pair("lightGray2", "darkGray3"),
  pair("lightGray2", "black"),
  pair("lightGray3", "darkGray1", 1),
  pair("lightGray3", "darkGray2", 2),
  pair("lightGray3", "white", 3),
  pair("lightGray3", "black"),
  pair("black", "white"),
  pair("black", "lightGray1"),
  pair("black", "darkGray3"),
  pair("black", "darkGray2"),
  pair("darkGray1", "white", 1),
  pair("darkGray1", "darkGray3", 2),
  pair("darkGray1", "darkGray2", 3),
  pair("darkGray1", "lightGray1"),
  pair("darkGray2", "white", 1),
  pair("darkGray2", "darkGray3", 2),
  pair("darkGray2", "darkGray1", 3),
  pair("darkGray2", "lightGray1"),
  pair("darkGray3", "darkGray1", 1),
  pair("darkGray3", "darkGray2", 2),
  pair("darkGray3", "lightGray2", 3),
  pair("darkGray3", "black"),

  pair("red2", "red1", 1),
  pair("red2", "red3", 2),
  pair("red3", "red2", 2),
  pair("red2", "black", 3),
  pair("red3", "red1", 3),

  pair("green2", "green3", 1),
  pair("green2", "green1", 2),
  pair("green3", "green2", 2),
  pair("green2", "black", 3),
  pair("green3", "green1", 3),

  pair("blue3", "blue1", 1),
  pair("blue3", "blue4", 2),
  pair("blue4", "blue3", 2),
  pair("blue3", "black", 3),
  pair("blue4", "blue1", 3),
] as const satisfies readonly ToneOnTonePair[];

const pairLookup = new Map(
  PLEOS_TONE_ON_TONE_PAIRS.map((rule) => [pairKey(rule.background, rule.foreground), rule] as const),
);

const blue2ReviewBackgrounds = new Set<PleosColorToken>([
  "black",
  "darkGray1",
  "darkGray2",
  "blue4",
]);

export function validateToneOnTone(background: string, foreground: string): ToneOnToneValidation {
  if (!isPleosColorToken(background) || !isPleosColorToken(foreground)) {
    return result(false, "invalid", background, foreground, "Both colors must be Pleos palette tokens.");
  }

  if (background === foreground) {
    return result(false, "invalid", background, foreground, "Background and foreground must use distinct tones.");
  }

  const family = getPleosColorFamily(background);
  const approved = pairLookup.get(pairKey(background, foreground));
  if (approved) {
    return {
      valid: true,
      status: "brand-compliant",
      background,
      foreground,
      family,
      priority: approved.priority,
      reason: approved.priority
        ? `Approved tone-on-tone pair (priority ${approved.priority}).`
        : "Approved tone-on-tone pair.",
    };
  }

  if (foreground === "blue2" && blue2ReviewBackgrounds.has(background)) {
    return {
      valid: true,
      status: "experimental-review-required",
      background,
      foreground,
      family: "blue",
      reason: "Blue 2 is limited to dark environments and requires brand review.",
    };
  }

  const foregroundFamily = getPleosColorFamily(foreground);
  const sameHue = family === foregroundFamily;
  return result(
    false,
    "invalid",
    background,
    foreground,
    sameHue
      ? "This same-family pair is not an approved Pleos tone-on-tone combination."
      : "Cross-family color mixing is not permitted in the brand tone-on-tone system.",
    family,
  );
}

export function isToneOnToneCompatible(background: string, foreground: string): boolean {
  return validateToneOnTone(background, foreground).valid;
}

export function isBrandCompliantToneOnTone(background: string, foreground: string): boolean {
  return validateToneOnTone(background, foreground).status === "brand-compliant";
}

function pair(
  background: PleosColorToken,
  foreground: PleosColorToken,
  priority?: ToneOnTonePriority,
): ToneOnTonePair {
  return priority === undefined
    ? { background, foreground }
    : { background, foreground, priority };
}

function pairKey(background: PleosColorToken, foreground: PleosColorToken): string {
  return `${background}:${foreground}`;
}

function result(
  valid: boolean,
  status: ToneOnToneStatus,
  background: string,
  foreground: string,
  reason: string,
  family?: PleosColorFamily,
): ToneOnToneValidation {
  return family === undefined
    ? { valid, status, background, foreground, reason }
    : { valid, status, background, foreground, family, reason };
}
