import type { OpticalState } from './OpticalState';

/** Lighting/material only. Never moves the camera, Axis, gap, or artboard. */
export const LUMINOUS_REFERENCE: Readonly<Partial<OpticalState>> = Object.freeze({
  bevel: .32, ior: 1.5, roughness: .12, surfaceCurvature: .065, dispersion: .045, absorption: .04,
  lightIntensity: .9, lightSpread: 1, reflection: 1, lightColor: '#FFFFFF',
  exposure: 1, bloom: .18, bounces: 16,
  dimensionTop: 3, dimensionLeft: 4, dimensionRight: 3,
  dimensionSpacing: .14, dimensionSoftness: .55, dimensionFalloff: .55,
  dimensionSpacingTop: .14, dimensionSpacingLeft: .14, dimensionSpacingRight: .14,
});

export const BEFORE_LUMINOUS_STORAGE_KEY = 'pleos-optical-before-luminous-v1';
