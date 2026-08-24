export const PLEOS_COLORS = {
  black: "#000000",
  white: "#FFFFFF",

  darkGray1: "#262626",
  darkGray2: "#4D4D4D",
  darkGray3: "#999999",

  lightGray1: "#F2F2F2",
  lightGray2: "#E5E5E5",
  lightGray3: "#CCCCCC",

  red1: "#FFCDD7",
  red2: "#FA293C",
  red3: "#55110E",

  green1: "#B4FFD2",
  green2: "#0ADC91",
  green3: "#053C32",

  blue1: "#CDDCFF",
  blue2: "#4664FF",
  blue3: "#2350FF",
  blue4: "#0F235A",
} as const;

export type PleosColorToken = keyof typeof PLEOS_COLORS;
export type PleosColorHex = (typeof PLEOS_COLORS)[PleosColorToken];
export type PleosColorFamily = "grayscale" | "red" | "green" | "blue";

export const PLEOS_COLOR_FAMILY_BY_TOKEN = {
  black: "grayscale",
  white: "grayscale",
  darkGray1: "grayscale",
  darkGray2: "grayscale",
  darkGray3: "grayscale",
  lightGray1: "grayscale",
  lightGray2: "grayscale",
  lightGray3: "grayscale",
  red1: "red",
  red2: "red",
  red3: "red",
  green1: "green",
  green2: "green",
  green3: "green",
  blue1: "blue",
  blue2: "blue",
  blue3: "blue",
  blue4: "blue",
} as const satisfies Record<PleosColorToken, PleosColorFamily>;

export const PLEOS_COLOR_TOKENS_BY_FAMILY = {
  grayscale: [
    "black",
    "white",
    "darkGray1",
    "darkGray2",
    "darkGray3",
    "lightGray1",
    "lightGray2",
    "lightGray3",
  ],
  red: ["red1", "red2", "red3"],
  green: ["green1", "green2", "green3"],
  blue: ["blue1", "blue2", "blue3", "blue4"],
} as const satisfies Record<PleosColorFamily, readonly PleosColorToken[]>;

/** Solid backgrounds shown in the Pleos tone-on-tone examples. */
export const PLEOS_SOLID_BACKGROUND_TOKENS = [
  "white",
  "black",
  "darkGray1",
  "darkGray2",
  "darkGray3",
  "lightGray1",
  "lightGray2",
  "lightGray3",
  "red2",
  "red3",
  "green2",
  "green3",
  "blue3",
  "blue4",
] as const satisfies readonly PleosColorToken[];

/** Blue 2 is a limited-use accent, not a general solid-background token. */
export const PLEOS_LIMITED_USE_TOKENS = ["blue2"] as const satisfies readonly PleosColorToken[];

export function isPleosColorToken(value: unknown): value is PleosColorToken {
  return typeof value === "string" && Object.hasOwn(PLEOS_COLORS, value);
}

export function getPleosColorFamily(token: PleosColorToken): PleosColorFamily {
  return PLEOS_COLOR_FAMILY_BY_TOKEN[token];
}
