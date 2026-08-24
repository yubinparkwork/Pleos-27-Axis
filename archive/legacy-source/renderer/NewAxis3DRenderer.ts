import * as THREE from "three";
import { VertexNormalsHelper } from "three/addons/helpers/VertexNormalsHelper.js";
import type { NewAxis3DStudioState } from "../state/threeDStudioState";
import type { FaceId, TextureSlot } from "../textures/types";
import { createRadialFoldFaces, FACE_ORDER } from "../geometry/RadialFoldGeometry";
import { createCreaseGeometry } from "../geometry/CreaseGeometry";
import { RAY_ORDER, rayDirections } from "../geometry/newAxisCoordinates";
import { TextureManager } from "../textures/TextureManager";
import { MaterialManager } from "../materials/MaterialManager";
import { CameraController } from "../camera/CameraController";
import { StudioLighting } from "../lighting/StudioLighting";

export class NewAxis3DRenderer {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly textures = new TextureManager();
  readonly materials = new MaterialManager(this.textures);
  readonly cameraController: CameraController;
  readonly lighting: StudioLighting;
  onFaceSelected: ((face: FaceId | null) => void) | null = null;
  private readonly faces = new Map<FaceId, THREE.Mesh>();
  private readonly normalHelpers = new Map<FaceId, VertexNormalsHelper>();
  private readonly axes = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x58c4ff, transparent: true, opacity: .8, depthTest: false }));
  private readonly vertices = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xff5a45, size: .035, sizeAttenuation: true, depthTest: false }));
  private readonly crease = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xaeb7be, metalness: .8, roughness: .18, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  private readonly selection = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4b38, depthTest: false, transparent: true, opacity: .95 }));
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private geometryKey = "";
  private cameraKey = "";
  private state: NewAxis3DStudioState;
  private exporting = false;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly canvas: HTMLCanvasElement, initial: NewAxis3DStudioState) {
    this.state = structuredClone(initial); this.scene.add(this.root); this.root.add(this.axes, this.vertices, this.crease, this.selection);
    FACE_ORDER.forEach((id) => {
      const initialGeometry = new THREE.BufferGeometry(); initialGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)); initialGeometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      const mesh = new THREE.Mesh(initialGeometry, this.materials.materials.get(id)); mesh.name = id; mesh.userData.faceId = id; mesh.castShadow = true; mesh.receiveShadow = true; this.faces.set(id, mesh); this.root.add(mesh);
      const helper = new VertexNormalsHelper(mesh, .16, 0x62d9ff); helper.visible = false; this.normalHelpers.set(id, helper); this.scene.add(helper);
    });
    this.cameraController = new CameraController(canvas); this.lighting = new StudioLighting(this.scene, renderer);
    this.canvas.addEventListener("pointerup", this.onPointerUp); this.update(initial, 35 / 26, true);
  }

  update(state: NewAxis3DStudioState, aspect: number, forceCamera = false): void {
    this.state = structuredClone(state);
    const geometryKey = JSON.stringify([state.geometry, state.texture.projection]);
    if (geometryKey !== this.geometryKey) { this.rebuildGeometry(); this.geometryKey = geometryKey; }
    this.materials.update(state.material, state.texture, state.faceOverrides); this.lighting.update(state.lighting, state.output.transparent);
    const cameraKey = JSON.stringify(state.camera);
    this.cameraController.update(state.camera, aspect, forceCamera || cameraKey !== this.cameraKey); this.cameraKey = cameraKey;
    this.root.scale.setScalar(state.geometry.objectScale); this.root.rotation.set(...state.geometry.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]); this.root.position.fromArray(state.geometry.position);
    this.faces.forEach((mesh) => { const center = mesh.userData.center as THREE.Vector3; mesh.position.copy(center.clone().setZ(0).normalize().multiplyScalar(state.geometry.exploded)); const material = mesh.material as THREE.MeshPhysicalMaterial; material.wireframe = state.debug.wireframe; });
    this.axes.visible = state.debug.axes && !this.exporting; this.vertices.visible = state.debug.vertices && !this.exporting; this.crease.visible = state.geometry.crease.enabled; this.normalHelpers.forEach((helper) => { helper.visible = state.debug.normals && !this.exporting; helper.update(); });
    this.updateSelection();
  }

  render(target: THREE.WebGLRenderTarget, width: number, height: number): void {
    this.cameraController.update(this.state.camera, width / height, false); this.scene.updateMatrixWorld(true); this.normalHelpers.forEach((helper) => { if (helper.visible) helper.update(); }); this.renderer.setRenderTarget(target); this.renderer.clear(); this.renderer.render(this.scene, this.cameraController.camera);
  }

  tick(time: number): boolean { return this.cameraController.tick() || this.textures.animate(time, this.state.texture); }
  async uploadTexture(file: File, slot: TextureSlot): Promise<void> { await this.textures.upload(file, slot, this.state.texture); this.materials.update(this.state.material, this.state.texture, this.state.faceOverrides); }
  removeTexture(slot: TextureSlot): void { this.textures.remove(slot); this.materials.update(this.state.material, this.state.texture, this.state.faceOverrides); }
  hasTexture(slot: TextureSlot): boolean { return this.textures.hasUpload(slot); }
  inspect(): object { return { scene: this.scene.type, meshCount: this.faces.size, camera: this.cameraController.camera.type, lights: this.scene.children.filter((child) => child.type.endsWith("Light")).map((child) => child.type), faces: [...this.faces.entries()].map(([id, mesh]) => ({ id, geometry: mesh.geometry.type, vertices: mesh.geometry.getAttribute("position").count, normals: mesh.geometry.getAttribute("normal").count, material: (mesh.material as THREE.Material).type })) }; }
  setExporting(exporting: boolean): void {
    this.exporting = exporting; this.lighting.setExporting(exporting);
    this.axes.visible = this.state.debug.axes && !exporting; this.vertices.visible = this.state.debug.vertices && !exporting;
    this.normalHelpers.forEach((helper) => { helper.visible = this.state.debug.normals && !exporting; }); this.selection.visible = Boolean(this.state.selectedFaceId) && !exporting;
    this.faces.forEach((mesh) => { (mesh.material as THREE.MeshPhysicalMaterial).wireframe = this.state.debug.wireframe && !exporting; });
  }
  get cameraStatus(): string { const p = this.cameraController.position; return `${this.state.camera.mode.toUpperCase()}  ${p.map((v) => v.toFixed(2)).join(" / ")}`; }

  dispose(): void {
    this.canvas.removeEventListener("pointerup", this.onPointerUp); this.cameraController.dispose(); this.lighting.dispose(); this.materials.dispose(); this.textures.dispose();
    this.faces.forEach((mesh) => mesh.geometry.dispose()); this.normalHelpers.forEach((helper) => helper.dispose());
    this.axes.geometry.dispose(); (this.axes.material as THREE.Material).dispose(); this.vertices.geometry.dispose(); (this.vertices.material as THREE.Material).dispose(); this.crease.geometry.dispose(); (this.crease.material as THREE.Material).dispose(); this.selection.geometry.dispose(); (this.selection.material as THREE.Material).dispose();
  }

  private rebuildGeometry(): void {
    const records = createRadialFoldFaces(this.state.geometry, this.state.texture.projection);
    records.forEach((record) => { const mesh = this.faces.get(record.id); if (!mesh) return; mesh.geometry.dispose(); mesh.geometry = record.geometry; mesh.userData.center = record.center; const helper = this.normalHelpers.get(record.id); if (helper) helper.update(); });
    this.crease.geometry.dispose(); this.crease.geometry = createCreaseGeometry(this.state.geometry);
    const centerZ = this.state.geometry.centerDepth * this.state.geometry.depthScale * this.state.geometry.depthExaggeration; const linePositions: number[] = []; const pointPositions = [0, 0, centerZ];
    RAY_ORDER.forEach((id) => { const d = rayDirections[id]; const z = this.state.geometry.rayDepth[id] * this.state.geometry.outerRadius * this.state.geometry.depthScale * this.state.geometry.depthExaggeration; linePositions.push(0, 0, centerZ, d.x * this.state.geometry.outerRadius, d.y * this.state.geometry.outerRadius, z); pointPositions.push(d.x * this.state.geometry.outerRadius, d.y * this.state.geometry.outerRadius, z); });
    this.axes.geometry.dispose(); this.axes.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    this.vertices.geometry.dispose(); this.vertices.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pointPositions, 3));
    this.updateSelection();
  }

  private updateSelection(): void {
    this.selection.geometry.dispose(); const mesh = this.state.selectedFaceId ? this.faces.get(this.state.selectedFaceId) : null;
    this.selection.geometry = mesh ? new THREE.EdgesGeometry(mesh.geometry) : new THREE.BufferGeometry(); this.selection.visible = Boolean(mesh) && !this.exporting;
    if (mesh) { this.selection.position.copy(mesh.position); this.selection.rotation.copy(mesh.rotation); }
  }

  private onPointerUp = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.cameraController.camera); const hit = this.raycaster.intersectObjects([...this.faces.values()], false)[0];
    this.onFaceSelected?.(hit ? hit.object.userData.faceId as FaceId : null);
  };
}
