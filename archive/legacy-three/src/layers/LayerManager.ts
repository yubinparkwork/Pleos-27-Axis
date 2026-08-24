import * as THREE from "three";
import type { LayerSettings } from "../state/studioState";

export class LayerManager {
  readonly group = new THREE.Group();
  private materialClones: THREE.Material[] = [];
  private baseOffsets: number[] = [];

  rebuild(sourceMeshes: THREE.Mesh[], settings: LayerSettings): void {
    this.disposeChildren();
    if (!settings.enabled || settings.count <= 1) return;
    const layerCount = Math.min(8, Math.max(2, Math.round(settings.count)));
    for (let layerIndex = 1; layerIndex < layerCount; layerIndex += 1) {
      const layer = new THREE.Group();
      const normalized = layerIndex / Math.max(1, layerCount - 1);
      const offset = settings.spacing * layerIndex;
      layer.position.z = offset;
      this.baseOffsets.push(offset);
      for (const source of sourceMeshes) {
        const material = (source.material as THREE.Material).clone();
        material.transparent = true;
        material.opacity = Math.max(0.06, settings.opacity * (1 - normalized * 0.42));
        material.depthWrite = settings.preset !== "glass-stack";
        if (settings.preset === "offset-wireframe") {
          if (material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.ShaderMaterial) material.wireframe = true;
          material.opacity *= 0.7;
        }
        if (settings.preset === "glass-stack" && material instanceof THREE.MeshPhysicalMaterial) {
          material.transmission = Math.max(material.transmission, 0.7);
          material.roughness = Math.max(material.roughness, 0.2);
        }
        this.materialClones.push(material);
        const mesh = new THREE.Mesh(source.geometry, material);
        mesh.renderOrder = 2 + layerIndex;
        layer.add(mesh);
      }
      this.group.add(layer);
    }
  }

  updateReveal(time: number, intensity: number): void {
    this.group.children.forEach((layer, index) => {
      const base = this.baseOffsets[index] ?? 0;
      const wave = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 - index * 0.7));
      layer.position.z = base * THREE.MathUtils.lerp(1, wave, intensity);
    });
  }

  /**
   * Layer meshes intentionally share the base surface geometries. When the
   * animated fold replaces those buffers, keep every layer on the same live
   * geometry instead of leaving it attached to a disposed buffer.
   */
  updateGeometries(sourceMeshes: THREE.Mesh[]): void {
    this.group.children.forEach((layer) => {
      layer.children.forEach((child, faceIndex) => {
        if (child instanceof THREE.Mesh && sourceMeshes[faceIndex]) {
          child.geometry = sourceMeshes[faceIndex].geometry;
        }
      });
    });
  }

  private disposeChildren(): void {
    this.group.clear();
    this.materialClones.forEach((material) => material.dispose());
    this.materialClones = [];
    this.baseOffsets = [];
  }

  dispose(): void { this.disposeChildren(); }
}
