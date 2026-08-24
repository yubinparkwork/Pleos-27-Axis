import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

function aim(light: THREE.Object3D, target: THREE.Vector3): void {
  light.lookAt(target);
}

function makeBackdropTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create studio backdrop");
  context.fillStyle = "#050607";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const paint = (x: number, y: number, radius: number, color: string): void => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(5,6,7,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  };
  paint(255, 220, 430, "rgba(196,222,224,.22)");
  paint(790, 500, 390, "rgba(235,202,165,.15)");
  paint(560, 85, 330, "rgba(225,231,230,.11)");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

export function installStudioEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  RectAreaLightUniformsLib.init();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.03);
  scene.environment = environment.texture;
  scene.background = new THREE.Color(0x050607);

  // Real scene cards sit behind the solids so transmission has structured
  // luminance to bend. They are intentionally neutral/warm/cool, never a
  // purple base tint.
  const backdropTexture = makeBackdropTexture(renderer);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 14),
    new THREE.MeshBasicMaterial({ map: backdropTexture, color: 0xffffff, toneMapped: false }),
  );
  backdrop.position.z = -5.2;
  scene.add(backdrop);

  // Narrow photographic light cards stay inside the projected crystal
  // silhouettes at the reference camera. MeshPhysicalMaterial bends these
  // through the volume, and its dispersion separates their edges naturally.
  const opticalCardDefinitions = [
    { color: 0xe9f6f7, position: [-1.28, 1.12, -2.65], size: [0.16, 1.72], rotation: 0.22 },
    { color: 0xffe5c9, position: [1.25, -1.02, -2.65], size: [0.14, 1.58], rotation: -0.36 },
  ] as const;
  const opticalCards = opticalCardDefinitions.map((definition) => {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(definition.size[0], definition.size[1]),
      new THREE.MeshBasicMaterial({ color: definition.color, toneMapped: false }),
    );
    card.position.set(definition.position[0], definition.position[1], definition.position[2]);
    card.rotation.z = definition.rotation;
    scene.add(card);
    return card;
  });

  const target = new THREE.Vector3(0, 0.2, 0);
  const key = new THREE.RectAreaLight(0xffffff, 7.5, 3.8, 7.5);
  key.position.set(-4.2, 3.8, 4.2);
  aim(key, target);
  scene.add(key);

  const cool = new THREE.RectAreaLight(0xd8f1f3, 5.2, 2.4, 5.8);
  cool.position.set(4.5, 1.6, 2.2);
  aim(cool, target);
  scene.add(cool);

  const warm = new THREE.RectAreaLight(0xffe2c5, 3.1, 2.3, 4.2);
  warm.position.set(-1.4, -2.7, -3.4);
  aim(warm, target);
  scene.add(warm);

  const rim = new THREE.SpotLight(0xffffff, 65, 18, Math.PI * 0.2, 0.92, 1.3);
  rim.position.set(1.5, 5.2, 5.6);
  rim.target.position.copy(target);
  rim.castShadow = true;
  rim.shadow.mapSize.set(2048, 2048);
  rim.shadow.bias = -0.00008;
  rim.shadow.radius = 5;
  scene.add(rim, rim.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 0.24, metalness: 0.05, envMapIntensity: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.15;
  floor.receiveShadow = true;
  scene.add(floor);

  return () => {
    scene.environment = null;
    environment.dispose();
    pmrem.dispose();
    room.dispose();
    key.dispose();
    cool.dispose();
    warm.dispose();
    rim.dispose();
    backdrop.geometry.dispose();
    (backdrop.material as THREE.Material).dispose();
    backdropTexture.dispose();
    opticalCards.forEach((card) => {
      card.geometry.dispose();
      (card.material as THREE.Material).dispose();
    });
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
  };
}
