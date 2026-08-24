import * as THREE from "three";
import type { FaceMaterialOverride, MaterialSettings, TextureSettings } from "../state/threeDStudioState";
import type { FaceId } from "../textures/types";
import { FACE_ORDER } from "../geometry/RadialFoldGeometry";
import { materialPresetById } from "./materialPresets";
import { TextureManager } from "../textures/TextureManager";

export class MaterialManager {
  readonly materials = new Map<FaceId, THREE.MeshPhysicalMaterial>();
  constructor(private readonly textures: TextureManager) {
    FACE_ORDER.forEach((id) => this.materials.set(id, new THREE.MeshPhysicalMaterial({ flatShading: true, side: THREE.DoubleSide })));
  }

  update(settings: MaterialSettings, texture: TextureSettings, overrides: Partial<Record<FaceId, FaceMaterialOverride>> = {}): void {
    const preset = materialPresetById(settings.preset);
    this.textures.update(texture);
    this.materials.forEach((material, face) => {
      const override = overrides[face]; material.color.set(override?.enabled ? override.color : preset.faceColors?.[face] ?? settings.baseColor); material.opacity = settings.opacity;
      material.transparent = settings.opacity < 1 || settings.transmission > 0; material.roughness = override?.enabled ? override.roughness : settings.roughness; material.metalness = override?.enabled ? override.metalness : settings.metalness;
      material.clearcoat = settings.clearcoat; material.clearcoatRoughness = settings.clearcoatRoughness; material.transmission = settings.transmission;
      material.thickness = settings.thickness; material.ior = settings.ior; material.iridescence = settings.iridescence; material.iridescenceIOR = settings.iridescenceIOR;
      material.iridescenceThicknessRange = [100, settings.iridescenceThickness]; material.specularIntensity = settings.specularIntensity; material.specularColor.set(settings.specularColor);
      material.emissive.set(settings.emissive); material.emissiveIntensity = settings.emissiveIntensity; material.side = settings.side === "double" ? THREE.DoubleSide : THREE.FrontSide;
      material.depthWrite = settings.depthWrite; material.flatShading = settings.flatShading; material.envMapIntensity = settings.environmentIntensity;
      material.map = this.textures.textureFor("baseColor", face, texture); material.normalMap = this.textures.textureFor("normal", face, texture);
      material.roughnessMap = this.textures.textureFor("roughness", face, texture); material.metalnessMap = this.textures.textureFor("metalness", face, texture);
      material.bumpMap = this.textures.textureFor("bump", face, texture); material.bumpScale = texture.intensity * .08;
      material.displacementMap = this.textures.textureFor("displacement", face, texture); material.displacementScale = texture.intensity * .08;
      material.alphaMap = this.textures.textureFor("alpha", face, texture); material.emissiveMap = this.textures.textureFor("emissive", face, texture);
      material.normalScale.setScalar(texture.intensity); material.needsUpdate = true;
    });
  }

  dispose(): void { this.materials.forEach((material) => material.dispose()); this.materials.clear(); }
}
