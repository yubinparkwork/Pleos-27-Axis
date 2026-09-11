type Point3 = [number, number, number];
type Matrix3 = [number, number, number, number, number, number, number, number, number];

export const OPTICAL_CUBE_SCALE = 2;

export interface AxisCubes {
  /** Canonical world centers, ordered upper, lower-left, lower-right. */
  centers: Point3[];
  /** Column-major local-to-world rotation, shared by every cube. */
  rotation: Matrix3;
  halfSize: number;
}

/**
 * The renderer-independent, sharp-cornered Axis brand geometry.
 *
 * Cubes are axis aligned in a right-handed world with +Y up. View the origin
 * orthographically from normalize([1, 1, 1]), using [0, 1, 0] as camera up.
 * Screen right is [1, 0, -1] / sqrt(2); screen up is [-1, 2, -1] / sqrt(6).
 * This gives the approved 30 / 90 / 150 degree edge directions. A camera with
 * 30 degree elevation gives 26.565 degree diagonal edges and is not equivalent.
 *
 * CrystalAssembly's legacy basis has projected span 1.35 and depth 1.35/sqrt(2).
 * Its three basis vectors are perpendicular, with length 1.35*sqrt(3/2).
 * Keeping that physical edge length reproduces the same unrounded silhouette
 * without importing legacy geometry, materials, or rendering dependencies.
 *
 * At gap zero all three cubes have a corner at [0, 0, 0]. Each pair shares an
 * edge; the intersection of all three is exactly that one common Axis vertex.
 * Gap moves the cubes in the image plane along 90 / 210 / 330 degree rays,
 * preserving their orientation, camera depth, and collective centroid. Bevels
 * are an optical surface treatment; they must not change this brand contract.
 */
export function getAxisCubes(gap: number, scale = OPTICAL_CUBE_SCALE): AxisCubes {
  if (!Number.isFinite(gap)) throw new RangeError("Axis gap must be finite.");
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Axis scale must be positive and finite.");
  // Scale each cube about its common sharp corner, not about its center:
  // doubling edge length must not introduce overlaps or lose the shared Axis.
  const halfSize = 1.35 * Math.sqrt(3 / 2) / 2 * scale;
  const offset = Math.max(0, gap) / Math.sqrt(6);

  return {
    centers: [
      [-halfSize - offset, halfSize + 2 * offset, -halfSize - offset],
      [-halfSize - offset, -halfSize - offset, halfSize + 2 * offset],
      [halfSize + 2 * offset, -halfSize - offset, -halfSize - offset],
    ],
    rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    halfSize,
  };
}

/** Rounded solids touch pairwise at zero gap, without overlapping their volumes.
 * A rounded box is its inset sharp box plus a sphere of radius b. Along each
 * pair's separating diagonal, the rounding removes (2-sqrt(2))*b. Moving each
 * center inward by that amount / sqrt(3/2) restores tangency. Canonical sharp
 * geometry remains unchanged; orientation, depth and assembly centroid persist.
 */
export function getRenderAxisCubes(gap: number, bevel: number): AxisCubes {
  if (!Number.isFinite(bevel) || bevel < 0) throw new RangeError('Bevel must be finite and non-negative.');
  const geometry = getAxisCubes(gap);
  const b = Math.min(bevel, geometry.halfSize);
  const correction = b * (2 - Math.SQRT2) / 3;
  const directions: Point3[] = [[-1, 2, -1], [-1, -1, 2], [2, -1, -1]];
  geometry.centers.forEach((center, i) => {
    for (let axis = 0; axis < 3; axis++) center[axis] -= directions[i][axis] * correction;
  });
  return geometry;
}
