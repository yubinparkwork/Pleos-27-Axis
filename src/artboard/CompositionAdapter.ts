import * as THREE from "three";
import type { ArtboardState } from "./ArtboardState";

export class CompositionAdapter {
  apply(camera: THREE.OrthographicCamera, artboard: ArtboardState): void {
    const aspect = artboard.width / artboard.height;
    const baseHeight = 6.7 / Math.max(0.2, artboard.scale);
    const baseWidth = baseHeight * aspect;
    camera.left = -baseWidth * 0.5;
    camera.right = baseWidth * 0.5;
    camera.top = baseHeight * 0.5;
    camera.bottom = -baseHeight * 0.5;
    const centerX = (artboard.axisAnchor.gridX - 0.5) * baseWidth;
    const centerY = (0.5 - artboard.axisAnchor.gridY) * baseHeight;
    camera.setViewOffset(artboard.width, artboard.height, centerX, centerY, artboard.width, artboard.height);
    camera.clearViewOffset();
    camera.position.x = centerX;
    camera.position.y = centerY;
    camera.updateProjectionMatrix();
  }

  fitPreview(containerWidth: number, containerHeight: number, artboard: ArtboardState): { width: number; height: number } {
    const padding = 56;
    const availableWidth = Math.max(1, containerWidth - padding * 2);
    const availableHeight = Math.max(1, containerHeight - padding * 2 - 48);
    const scale = Math.min(availableWidth / artboard.width, availableHeight / artboard.height) * artboard.previewZoom;
    return { width: Math.max(1, Math.round(artboard.width * scale)), height: Math.max(1, Math.round(artboard.height * scale)) };
  }
}
