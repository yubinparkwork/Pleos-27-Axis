import * as THREE from "three";
import type { ColorFamily, MaterialPresetId, SpectralSettings } from "../state/studioState";
import { createProceduralTexture, type ProceduralTextureId, type TextureBundle } from "../textures/ProceduralTextureFactory";
import type { SurfaceTextureSlot } from "../textures/TextureUploader";
import { createSpectralMaterial, updateSpectralUniforms } from "./SpectralCausticMaterial";

export interface MaterialDefinition {
  id: MaterialPresetId;
  name: string;
  compliant: boolean;
  texture: ProceduralTextureId;
  roughness: number;
  metalness: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  sheen?: number;
  opacity?: number;
  normalScale?: number;
}

export const MATERIAL_PRESETS: MaterialDefinition[] = [
  { id: "reference-matte", name: "Reference Matte", compliant: true, texture: "fine-grain", roughness: 0.9, metalness: 0, normalScale: 0.08 },
  { id: "matte-graphite", name: "Matte Graphite", compliant: true, texture: "coarse-grain", roughness: 0.76, metalness: 0.08, normalScale: 0.18 },
  { id: "brushed-aluminum", name: "Brushed Aluminum", compliant: true, texture: "brushed-linear", roughness: 0.27, metalness: 0.94, anisotropy: 0.82, normalScale: 0.33 },
  { id: "black-chrome", name: "Black Chrome", compliant: true, texture: "fine-grain", roughness: 0.12, metalness: 1, normalScale: 0.04 },
  { id: "smoked-glass", name: "Smoked Glass", compliant: true, texture: "frosted-noise", roughness: 0.18, metalness: 0, transmission: 0.76, thickness: 0.38, ior: 1.46, opacity: 0.86, normalScale: 0.09 },
  { id: "frosted-acrylic", name: "Frosted Acrylic", compliant: true, texture: "frosted-noise", roughness: 0.48, metalness: 0, transmission: 0.62, thickness: 0.55, ior: 1.49, opacity: 0.9, normalScale: 0.24 },
  { id: "automotive-clearcoat", name: "Automotive Clearcoat", compliant: true, texture: "polymer-microtexture", roughness: 0.3, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.14, normalScale: 0.12 },
  { id: "technical-polymer", name: "Technical Polymer", compliant: true, texture: "polymer-microtexture", roughness: 0.52, metalness: 0.02, clearcoat: 0.18, clearcoatRoughness: 0.42, normalScale: 0.18 },
  { id: "paper-fiber", name: "Paper Fiber", compliant: true, texture: "paper-fiber", roughness: 0.96, metalness: 0, normalScale: 0.42 },
  { id: "micro-perforated", name: "Micro-perforated Metal", compliant: false, texture: "micro-dot", roughness: 0.43, metalness: 0.82, anisotropy: 0.18, normalScale: 0.48 },
  { id: "carbon-weave", name: "Carbon Weave", compliant: false, texture: "woven-pattern", roughness: 0.34, metalness: 0.3, anisotropy: 0.54, clearcoat: 0.48, normalScale: 0.3 },
];

const FAMILY_COLORS: Record<ColorFamily, string[]> = {
  grayscale: ["#050505", "#262626", "#4d4d4d", "#999999", "#e5e5e5", "#ffffff"],
  red: ["#240504", "#55110e", "#8c1820", "#fa293c", "#ffcdd7", "#000000"],
  green: ["#021f18", "#053c32", "#07865f", "#0adc91", "#b4ffd2", "#000000"],
  blue: ["#07112c", "#0f235a", "#1738a8", "#2350ff", "#cddcff", "#000000"],
};

export function backgroundForFamily(family: ColorFamily): THREE.Color {
  const color = family === "grayscale" ? "#050505" : FAMILY_COLORS[family][0];
  return new THREE.Color(color);
}

export class MaterialRegistry {
  private textureBundle: TextureBundle = { dispose() {} };
  private materials: THREE.Material[] = [];
  private readonly uploadedTextures: Partial<Record<SurfaceTextureSlot, THREE.Texture>> = {};

  createMaterials(presetId: MaterialPresetId, family: ColorFamily, faceCount: number, seed: number, spectral?: SpectralSettings): THREE.Material[] {
    this.dispose();
    if (spectral?.enabled) {
      this.materials = Array.from({ length: faceCount }, (_, index) => createSpectralMaterial(spectral, index, faceCount));
      return this.materials;
    }
    const definition = MATERIAL_PRESETS.find((item) => item.id === presetId) ?? MATERIAL_PRESETS[0];
    this.textureBundle = createProceduralTexture(definition.texture, seed, presetId === "paper-fiber" ? 2.2 : 5.5);
    const colors = FAMILY_COLORS[family];
    const shadeOrder = [4, 2, 0, 3, 1, 5, 2, 4];
    this.materials = Array.from({ length: faceCount }, (_, index) => {
      const material = new THREE.MeshPhysicalMaterial({
        name: `${definition.name} / Face ${index + 1}`,
        color: colors[shadeOrder[index % shadeOrder.length] % colors.length],
        roughness: definition.roughness,
        metalness: definition.metalness,
        transmission: definition.transmission ?? 0,
        thickness: definition.thickness ?? 0,
        ior: definition.ior ?? 1.5,
        clearcoat: definition.clearcoat ?? 0,
        clearcoatRoughness: definition.clearcoatRoughness ?? 0,
        anisotropy: definition.anisotropy ?? 0,
        sheen: definition.sheen ?? 0,
        opacity: definition.opacity ?? 1,
        transparent: (definition.opacity ?? 1) < 1 || (definition.transmission ?? 0) > 0,
        side: THREE.DoubleSide,
        envMapIntensity: presetId === "black-chrome" ? 1.65 : 0.82,
      });
      material.map = this.uploadedTextures.baseColor ?? null;
      material.normalMap = this.uploadedTextures.normal ?? this.textureBundle.normal ?? null;
      material.roughnessMap = this.textureBundle.roughness ?? null;
      material.normalScale.setScalar(definition.normalScale ?? 0.1);
      if (presetId === "smoked-glass") {
        material.attenuationColor = new THREE.Color(colors[1]);
        material.attenuationDistance = 1.8;
      }
      if (presetId === "brushed-aluminum") material.anisotropyRotation = index * Math.PI / Math.max(2, faceCount);
      return material;
    });
    return this.materials;
  }

  setUploadedTexture(slot: SurfaceTextureSlot, texture: THREE.Texture | null): void {
    if (texture) this.uploadedTextures[slot] = texture;
    else delete this.uploadedTextures[slot];
    this.materials.forEach((material) => {
      if (material instanceof THREE.MeshPhysicalMaterial) {
        if (slot === "baseColor") material.map = texture;
        if (slot === "normal") material.normalMap = texture ?? this.textureBundle.normal ?? null;
        material.needsUpdate = true;
      }
    });
  }

  getUploadedSlots(): SurfaceTextureSlot[] {
    return (["baseColor", "normal"] as const).filter((slot) => Boolean(this.uploadedTextures[slot]));
  }

  setSelectedFace(face: number | null): void {
    this.materials.forEach((material, index) => {
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.emissive.set(face === index ? "#ffffff" : "#000000");
        material.emissiveIntensity = face === index ? 0.08 : 0;
      } else if (material instanceof THREE.ShaderMaterial && material.uniforms.uSelected) {
        material.uniforms.uSelected.value = face === index ? 1 : 0;
      }
    });
  }

  setSweep(time: number, intensity: number): void {
    this.materials.forEach((material, index) => {
      const wave = Math.max(0, Math.cos(time * Math.PI * 2 - index * 0.9));
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.emissive.set("#ffffff");
        material.emissiveIntensity = wave * intensity * 0.12;
      } else if (material instanceof THREE.ShaderMaterial && material.uniforms.uSelected) {
        material.uniforms.uSelected.value = wave * intensity * 0.6;
      }
    });
  }

  updateSpectral(settings: SpectralSettings, normalizedTime: number): void {
    this.materials.forEach((material) => {
      if (!(material instanceof THREE.ShaderMaterial)) return;
      updateSpectralUniforms(material, settings);
      if (material.uniforms.uTime) material.uniforms.uTime.value = normalizedTime;
    });
  }

  get definition(): MaterialDefinition | undefined {
    return MATERIAL_PRESETS.find((item) => item.name === this.materials[0]?.name.split(" / ")[0]);
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.materials = [];
    this.textureBundle.dispose();
    this.textureBundle = { dispose() {} };
  }
}
