import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type CrystalLook = "clear" | "prism" | "smoked";
type CrystalMaterial = THREE.MeshPhysicalMaterial & { dispersion: number };

interface BasisDefinition {
  directions: [number, number, number];
  depthSigns: [number, number, number];
}

const CUBE_BASIS: BasisDefinition = { directions: [30, 90, 150], depthSigns: [1, -1, 1] };

// Every solid has the same physical orientation so all three show the same
// top face. Different local vertices are translated to the shared origin:
// lower-left uses a+b, lower-right uses b+c, and the upper cube uses 0.
const TOUCH_CORNERS: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 1, 0],
  [0, 1, 1],
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

function makeBasis(definition: BasisDefinition, span: number): THREE.Vector3[] {
  const depth = span / Math.sqrt(2);
  return definition.directions.map((angle, index) => {
    const radians = THREE.MathUtils.degToRad(angle);
    return new THREE.Vector3(Math.cos(radians) * span, Math.sin(radians) * span, definition.depthSigns[index] * depth);
  });
}

function transformOpticalCube(definition: BasisDefinition, span: number): THREE.BufferGeometry {
  // Keep a physically useful micro bevel for optical highlights without
  // cutting a visible triangular void where the three contact vertices meet.
  let geometry: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, 10, 0.018);
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

  const basis = makeBasis(definition, span);

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

function nearestGeometryVertex(geometry: THREE.BufferGeometry, target: THREE.Vector3): THREE.Vector3 {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const candidate = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  let nearestDistance = Infinity;
  for (let index = 0; index < position.count; index += 1) {
    candidate.set(position.getX(index), position.getY(index), position.getZ(index));
    const distance = candidate.distanceToSquared(target);
    if (distance < nearestDistance) { nearestDistance = distance; nearest.copy(candidate); }
  }
  return nearest;
}

export class CrystalAssembly extends THREE.Group {
  private readonly materials: CrystalMaterial[] = [];
  private readonly solids: THREE.Group[] = [];
  private look: CrystalLook = "prism";
  private gap = 0;
  private reflectionStrength = 1;
  private refractionStrength = 1;

  constructor() {
    super();
    this.name = "Pleos27AxisPathTracedSolids";
    const span = 1.35;
    const basis = makeBasis(CUBE_BASIS, span);
    TOUCH_CORNERS.forEach((corner, index) => {
      const material = makeOpticalMaterial(this.look);
      const geometry = transformOpticalCube(CUBE_BASIS, span);
      const solid = new THREE.Group();
      solid.name = `AxisCrystal${index + 1}`;
      const idealTouchCorner = new THREE.Vector3()
        .addScaledVector(basis[0], corner[0])
        .addScaledVector(basis[1], corner[1])
        .addScaledVector(basis[2], corner[2]);
      // RoundedBoxGeometry bevels every ideal corner inward. Align the actual
      // outermost mesh vertex instead of the mathematical cube corner so gap
      // zero is a true world-space contact with no residual layout offset.
      const touchCorner = nearestGeometryVertex(geometry, idealTouchCorner);
      const basePosition = touchCorner.clone().negate();
      const projectedCenter = geometry.boundingBox?.getCenter(new THREE.Vector3()).add(basePosition)
        ?? basis.reduce((sum, vector) => sum.add(vector), new THREE.Vector3()).multiplyScalar(0.5).add(basePosition);
      const gapDirection = new THREE.Vector3(projectedCenter.x, projectedCenter.y, 0).normalize();
      solid.userData.gapDirection = gapDirection;
      solid.userData.basePosition = basePosition;
      solid.userData.touchCorner = touchCorner;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "ClosedOpticalSolid";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      solid.add(mesh);
      this.materials.push(material);
      this.solids.push(solid);
      this.add(solid);
    });
  }

  setGap(value: number): void {
    this.gap = THREE.MathUtils.clamp(value, 0, 0.45);
    this.solids.forEach((solid) => {
      const direction = solid.userData.gapDirection as THREE.Vector3;
      const basePosition = solid.userData.basePosition as THREE.Vector3;
      solid.position.copy(basePosition).addScaledVector(direction, this.gap);
    });
    this.updateMatrixWorld(true);
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
      material.envMapIntensity = preset.envMapIntensity * this.reflectionStrength;
      material.transmission = THREE.MathUtils.clamp(preset.transmission * this.refractionStrength, 0, 1);
      material.needsUpdate = true;
    });
  }

  setRoughness(value: number): void {
    this.materials.forEach((material) => { material.roughness = value; });
  }

  setDispersion(value: number): void {
    this.materials.forEach((material) => { material.dispersion = value; });
  }

  setOpticalLighting(reflectionStrength: number, refractionStrength: number): void {
    this.reflectionStrength = THREE.MathUtils.clamp(reflectionStrength, 0, 3);
    this.refractionStrength = THREE.MathUtils.clamp(refractionStrength, 0, 1.25);
    const preset = LOOKS[this.look];
    this.materials.forEach((material) => {
      material.envMapIntensity = preset.envMapIntensity * this.reflectionStrength;
      material.transmission = THREE.MathUtils.clamp(preset.transmission * this.refractionStrength, 0, 1);
      material.specularIntensity = THREE.MathUtils.clamp(0.72 + this.reflectionStrength * 0.28, 0, 1);
      material.needsUpdate = true;
    });
  }

  inspect(): object {
    return {
      look: this.look,
      solids: this.children.length,
      gap: this.gap,
      sharedCorner: this.gap === 0 ? [0, 0, 0] : null,
      cornerPositions: this.solids.map((solid) => solid.position.clone().add(solid.userData.touchCorner as THREE.Vector3).toArray()),
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
  }
}
