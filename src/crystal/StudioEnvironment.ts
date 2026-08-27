import * as THREE from "three";
import { GradientEquirectTexture } from "three-gpu-pathtracer";

export interface PathTracingStudioEnvironment {
  setIntensity(value: number): void;
  dispose(): void;
}

export function installStudioEnvironment(scene: THREE.Scene): PathTracingStudioEnvironment {
  const resources: Array<{ dispose(): void }> = [];
  const objects: THREE.Object3D[] = [];

  const environment = new GradientEquirectTexture(512);
  environment.topColor.set(0xaebfc3).multiplyScalar(0.48);
  environment.bottomColor.set(0x050607);
  environment.exponent = 2.8;
  environment.update();
  scene.environment = environment;
  scene.background = environment;
  scene.environmentIntensity = 0.72;
  scene.backgroundIntensity = 0.33;
  scene.backgroundBlurriness = 0.16;
  resources.push(environment);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x07090a,
    roughness: 0.19,
    metalness: 0.03,
  });
  const floorGeometry = new THREE.PlaneGeometry(30, 30);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.08;
  floor.receiveShadow = true;
  objects.push(floor);
  resources.push(floorGeometry, floorMaterial);

  const rearMaterial = new THREE.MeshStandardMaterial({
    color: 0x060708,
    roughness: 0.32,
    metalness: 0,
  });
  const rearGeometry = new THREE.PlaneGeometry(24, 15);
  const rear = new THREE.Mesh(rearGeometry, rearMaterial);
  rear.position.set(0, 1.6, -5.2);
  objects.push(rear);
  resources.push(rearGeometry, rearMaterial);

  scene.add(...objects);

  return {
    setIntensity(value: number): void {
      scene.environmentIntensity = THREE.MathUtils.clamp(value, 0, 3);
      scene.backgroundIntensity = THREE.MathUtils.clamp(0.12 + value * 0.36, 0.08, 1);
    },
    dispose(): void {
      scene.remove(...objects);
      scene.environment = null;
      scene.background = null;
      resources.forEach((resource) => resource.dispose());
    },
  };
}
