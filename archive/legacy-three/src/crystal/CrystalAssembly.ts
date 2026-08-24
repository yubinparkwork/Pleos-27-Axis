import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type CrystalLook = "clear" | "prism" | "smoked";
type CrystalMaterial = THREE.MeshPhysicalMaterial & { dispersion: number };

interface BasisDefinition {
  directions: [number, number, number];
  depthSigns: [number, number, number];
}

const CUBES: BasisDefinition[] = [
  { directions: [90, 150, 210], depthSigns: [1, -1, 1] },
  // Negating the depth row preserves the same 2D Axis angles while presenting
  // the exterior (convex) corner to the reference camera. The previous signs
  // produced a valid closed solid but read as a concave/open Necker cube.
  { directions: [-90, 30, -30], depthSigns: [-1, -1, 1] },
];

const LOOKS: Record<CrystalLook, {
  color: number; attenuation: number; roughness: number; transmission: number;
  thickness: number; dispersion: number; iridescence: number;
  attenuationDistance: number; envMapIntensity: number;
}> = {
  clear: { color: 0xf4f7f7, attenuation: 0xdce8e8, roughness: 0.045, transmission: 0.98, thickness: 2.1, dispersion: 0.045, iridescence: 0.06, attenuationDistance: 4.8, envMapIntensity: 2.25 },
  prism: { color: 0xf7f6f1, attenuation: 0xdde7e5, roughness: 0.038, transmission: 0.96, thickness: 2.45, dispersion: 0.16, iridescence: 0.14, attenuationDistance: 3.8, envMapIntensity: 2.5 },
  smoked: { color: 0x9da5a4, attenuation: 0x25302f, roughness: 0.08, transmission: 0.82, thickness: 2.8, dispersion: 0.055, iridescence: 0.035, attenuationDistance: 1.25, envMapIntensity: 2.65 },
};

function makeOpticalMaterial(look: CrystalLook): CrystalMaterial {
  const preset = LOOKS[look];
  const material = new THREE.MeshPhysicalMaterial({
    color: preset.color,
    metalness: 0,
    roughness: preset.roughness,
    transmission: preset.transmission,
    thickness: preset.thickness,
    ior: 1.52,
    attenuationColor: new THREE.Color(preset.attenuation),
    attenuationDistance: preset.attenuationDistance,
    clearcoat: 0.34,
    clearcoatRoughness: 0.035,
    iridescence: preset.iridescence,
    iridescenceIOR: 1.31,
    iridescenceThicknessRange: [120, 410],
    envMapIntensity: preset.envMapIntensity,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    side: THREE.FrontSide,
  }) as CrystalMaterial;
  material.dispersion = preset.dispersion;
  return material;
}

function transformOpticalCube(definition: BasisDefinition, span: number): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, 12, 0.055);
  geometry.translate(0.5, 0.5, 0.5);
  geometry = mergeVertices(geometry, 1e-5);

  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const nearest = new THREE.Vector3();
  let nearestDistance = Infinity;
  for (let index = 0; index < position.count; index += 1) {
    const point = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index));
    if (point.lengthSq() < nearestDistance) {
      nearestDistance = point.lengthSq();
      nearest.copy(point);
    }
  }

  const depth = span / Math.sqrt(2);
  const basis = definition.directions.map((angle, index) => {
    const radians = THREE.MathUtils.degToRad(angle);
    return new THREE.Vector3(
      Math.cos(radians) * span,
      Math.sin(radians) * span,
      definition.depthSigns[index] * depth,
    );
  });

  // One of the approved cube bases is mirrored in screen projection. A
  // negative basis determinant reverses every triangle after the affine
  // transform; FrontSide transmission then culls the exterior and makes the
  // solid look open. Reverse the indexed winding once so both meshes retain
  // outward-facing caps and remain physically closed.
  const basisMatrix = new THREE.Matrix3().set(
    basis[0].x, basis[1].x, basis[2].x,
    basis[0].y, basis[1].y, basis[2].y,
    basis[0].z, basis[1].z, basis[2].z,
  );
  if (basisMatrix.determinant() < 0) {
    const index = geometry.getIndex();
    if (!index) throw new Error("Optical cube must be indexed before winding correction");
    for (let offset = 0; offset < index.count; offset += 3) {
      const second = index.getX(offset + 1);
      index.setX(offset + 1, index.getX(offset + 2));
      index.setX(offset + 2, second);
    }
    index.needsUpdate = true;
  }

  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    local.set(position.getX(index) - nearest.x, position.getY(index) - nearest.y, position.getZ(index) - nearest.z);
    world.set(0, 0, 0)
      .addScaledVector(basis[0], local.x)
      .addScaledVector(basis[1], local.y)
      .addScaledVector(basis[2], local.z);
    position.setXYZ(index, world.x, world.y, world.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class CrystalAssembly extends THREE.Group {
  private readonly materials: CrystalMaterial[] = [];
  private readonly boundaryMaterials: THREE.MeshPhysicalMaterial[] = [];
  private look: CrystalLook = "prism";

  constructor() {
    super();
    this.name = "PleosNewAxisCrystal";
    CUBES.forEach((definition, index) => {
      const material = makeOpticalMaterial(this.look);
      const geometry = transformOpticalCube(definition, 1.52);
      const solid = new THREE.Group();
      solid.name = `AxisCrystal${index + 1}`;
      const boundaryMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xe7eeee,
        metalness: 0,
        roughness: 0.2,
        transmission: 0,
        transparent: true,
        opacity: 0.065,
        side: THREE.BackSide,
        depthWrite: false,
        envMapIntensity: 0.8,
      });
      const boundary = new THREE.Mesh(geometry, boundaryMaterial);
      boundary.name = "ExitBoundary";
      boundary.renderOrder = index * 2;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "EntryBoundary";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = index * 2 + 1;
      solid.add(boundary, mesh);
      this.materials.push(material);
      this.boundaryMaterials.push(boundaryMaterial);
      this.add(solid);
    });
  }

  setLook(look: CrystalLook): void {
    this.look = look;
    const preset = LOOKS[look];
    this.materials.forEach((material) => {
      material.color.setHex(preset.color);
      material.attenuationColor.setHex(preset.attenuation);
      material.roughness = preset.roughness;
      material.transmission = preset.transmission;
      material.thickness = preset.thickness;
      material.dispersion = preset.dispersion;
      material.iridescence = preset.iridescence;
      material.attenuationDistance = preset.attenuationDistance;
      material.envMapIntensity = preset.envMapIntensity;
      material.needsUpdate = true;
    });
    const boundaryOpacity = look === "smoked" ? 0.11 : look === "prism" ? 0.065 : 0.045;
    this.boundaryMaterials.forEach((material) => { material.opacity = boundaryOpacity; });
  }

  setRoughness(value: number): void {
    this.materials.forEach((material) => { material.roughness = value; });
  }

  setDispersion(value: number): void {
    this.materials.forEach((material) => { material.dispersion = value; });
  }

  inspect(): object {
    return {
      look: this.look,
      solids: this.children.length,
      sharedCorner: [0, 0, 0],
      projectedAxisAngles: [30, 90, 150, 210, 270, 330],
      linePrimitives: 0,
      material: this.materials.map((material) => ({
        ior: material.ior,
        transmission: material.transmission,
        roughness: material.roughness,
        thickness: material.thickness,
        dispersion: material.dispersion,
      })),
    };
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    this.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.boundaryMaterials.forEach((material) => material.dispose());
  }
}
