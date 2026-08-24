import * as THREE from "three";
import type { AxisGraphLike } from "../geometry/FoldSurfaceBuilder";
import type { ColorFamily, ElementSettings, FoldState } from "../state/studioState";

const COLORS: Record<ColorFamily, string> = {
  grayscale: "#ffffff",
  red: "#ffcdd7",
  green: "#b4ffd2",
  blue: "#cddcff",
};

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function depthAtRay(fold: FoldState, rayId: string, amount: number): number {
  return THREE.MathUtils.lerp(fold.centerZ, fold.rayDepth[rayId] ?? 0, amount) + 0.025;
}

function tubeBetween(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, 5, false), material);
}

export class ElementSystem {
  readonly group = new THREE.Group();
  private nodeMesh: THREE.InstancedMesh | null = null;
  private nodeBindings: Array<{ rayId: string; phase: number }> = [];
  private orbitGroup: THREE.Group | null = null;
  private graph: AxisGraphLike | null = null;
  private fold: FoldState | null = null;

  rebuild(graph: AxisGraphLike, fold: FoldState, settings: ElementSettings, family: ColorFamily): void {
    this.clear();
    this.graph = graph;
    this.fold = fold;
    const color = new THREE.Color(COLORS[family]);
    const lineMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: settings.opacity, depthWrite: false });

    if (settings.grid) this.buildGrid(graph, settings, color);
    if (settings.connections || settings.arrows) {
      graph.rays.forEach((ray, index) => {
        if (!settings.connections && index % 2 !== 0) return;
        const start = new THREE.Vector3(graph.origin.x, graph.origin.y, fold.centerZ + 0.02);
        const end = new THREE.Vector3(ray.endpoint.x, ray.endpoint.y, (fold.rayDepth[ray.id] ?? 0) + 0.02);
        const tube = tubeBetween([start, end], 0.0045, lineMaterial.clone());
        tube.userData.kind = "connection";
        this.group.add(tube);
        if (settings.arrows && index % 2 === 0) {
          const direction = end.clone().sub(start).normalize();
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), lineMaterial.clone());
          cone.position.copy(start.clone().lerp(end, 0.72));
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          this.group.add(cone);
        }
      });
    }
    if (settings.circuit) this.buildCircuit(graph, fold, settings, lineMaterial);
    if (settings.nodes) this.buildNodes(graph, fold, settings, color);
    if (settings.orbit) this.buildOrbit(graph, fold, settings, color);
  }

  private buildGrid(graph: AxisGraphLike, settings: ElementSettings, color: THREE.Color): void {
    const points: THREE.Vector3[] = [];
    const { minX, maxX, minY, maxY } = graph.frame;
    for (let index = 0; index <= 20; index += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, index / 20);
      const y = THREE.MathUtils.lerp(minY, maxY, index / 20);
      points.push(new THREE.Vector3(x, minY, 0.03), new THREE.Vector3(x, maxY, 0.03));
      points.push(new THREE.Vector3(minX, y, 0.03), new THREE.Vector3(maxX, y, 0.03));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: settings.opacity * 0.14, depthWrite: false });
    this.group.add(new THREE.LineSegments(geometry, material));
  }

  private buildCircuit(graph: AxisGraphLike, fold: FoldState, settings: ElementSettings, material: THREE.MeshBasicMaterial): void {
    const count = Math.max(2, Math.round(3 + settings.density * 8));
    for (let index = 0; index < count; index += 1) {
      const ray = graph.rays[index % graph.rays.length];
      const startAmount = 0.12 + (index % 4) * 0.06;
      const endAmount = 0.5 + (index % 3) * 0.13;
      const start = new THREE.Vector3(
        THREE.MathUtils.lerp(graph.origin.x, ray.endpoint.x, startAmount),
        THREE.MathUtils.lerp(graph.origin.y, ray.endpoint.y, startAmount),
        depthAtRay(fold, ray.id, startAmount),
      );
      const end = new THREE.Vector3(
        THREE.MathUtils.lerp(graph.origin.x, ray.endpoint.x, endAmount),
        THREE.MathUtils.lerp(graph.origin.y, ray.endpoint.y, endAmount),
        depthAtRay(fold, ray.id, endAmount),
      );
      const tangent = end.clone().sub(start).normalize();
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);
      const elbow = start.clone().lerp(end, 0.58).add(normal.multiplyScalar((index % 2 ? 1 : -1) * 0.06));
      const tube = tubeBetween([start, elbow, end], 0.0035, material.clone());
      tube.userData.kind = "circuit";
      this.group.add(tube);
    }
  }

  private buildNodes(graph: AxisGraphLike, fold: FoldState, settings: ElementSettings, color: THREE.Color): void {
    const perRay = Math.max(2, Math.round(2 + settings.density * 6));
    const count = perRay * graph.rays.length;
    const geometry = new THREE.SphereGeometry(0.018, 12, 8);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.12, emissive: color, emissiveIntensity: 0.08, transparent: true, opacity: settings.opacity });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodeMesh = mesh;
    this.nodeBindings = [];
    let instance = 0;
    const matrix = new THREE.Matrix4();
    graph.rays.forEach((ray, rayIndex) => {
      for (let index = 0; index < perRay; index += 1) {
        const amount = (index + 1) / (perRay + 1);
        const position = new THREE.Vector3(
          THREE.MathUtils.lerp(graph.origin.x, ray.endpoint.x, amount),
          THREE.MathUtils.lerp(graph.origin.y, ray.endpoint.y, amount),
          depthAtRay(fold, ray.id, amount),
        );
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(instance, matrix);
        this.nodeBindings.push({ rayId: ray.id, phase: amount + rayIndex * 0.11 });
        instance += 1;
      }
    });
    this.group.add(mesh);
  }

  private buildOrbit(graph: AxisGraphLike, fold: FoldState, settings: ElementSettings, color: THREE.Color): void {
    const orbit = new THREE.Group();
    orbit.position.set(graph.origin.x, graph.origin.y, fold.centerZ + 0.16);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: settings.opacity * 0.48, depthWrite: false });
    const radii = [0.25, 0.38, 0.54];
    radii.forEach((radius, index) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0035, 5, 96), material.clone());
      mesh.rotation.x = 0.18 + index * 0.21;
      mesh.rotation.y = -0.22 + index * 0.16;
      orbit.add(mesh);
    });
    this.orbitGroup = orbit;
    this.group.add(orbit);
  }

  update(time: number, speed: number, fold?: FoldState): void {
    if (fold) this.fold = fold;
    if (this.orbitGroup) {
      this.orbitGroup.rotation.z = time * Math.PI * 2 * 0.12 * speed;
      this.orbitGroup.rotation.x = Math.sin(time * Math.PI * 2 * 0.18) * 0.12;
    }
    if (!this.nodeMesh || !this.graph || !this.fold) return;
    const matrix = new THREE.Matrix4();
    this.nodeBindings.forEach((binding, index) => {
      const ray = this.graph?.rays.find((item) => item.id === binding.rayId);
      if (!ray || !this.graph || !this.fold || !this.nodeMesh) return;
      const amount = (binding.phase + time * speed * 0.22) % 1;
      const pulse = 0.7 + Math.sin((time + binding.phase) * Math.PI * 2) * 0.16;
      const position = new THREE.Vector3(
        THREE.MathUtils.lerp(this.graph.origin.x, ray.endpoint.x, amount),
        THREE.MathUtils.lerp(this.graph.origin.y, ray.endpoint.y, amount),
        depthAtRay(this.fold, ray.id, amount),
      );
      matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(pulse, pulse, pulse));
      this.nodeMesh.setMatrixAt(index, matrix);
    });
    this.nodeMesh.instanceMatrix.needsUpdate = true;
  }

  private clear(): void {
    disposeObject(this.group);
    this.group.clear();
    this.nodeMesh = null;
    this.nodeBindings = [];
    this.orbitGroup = null;
  }

  dispose(): void { this.clear(); }
}
