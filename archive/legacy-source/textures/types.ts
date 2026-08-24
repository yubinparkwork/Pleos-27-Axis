export type FaceId = "top-right" | "right-middle" | "bottom-right" | "bottom-left" | "left-upper";
export type ProjectionMode = "screen" | "world-planar" | "face-local";
export type TextureTarget = "all-faces" | FaceId;
export type TextureSlot = "baseColor" | "normal" | "roughness" | "metalness" | "bump" | "displacement" | "alpha" | "emissive";
export type ProceduralTextureKind = "none" | "fine-grain" | "coarse-grain" | "brushed-horizontal" | "brushed-radial" | "paper-fiber" | "frosted-noise" | "cellular" | "speckle" | "scanline" | "ordered-dot" | "topographic-line" | "directional-streak";
