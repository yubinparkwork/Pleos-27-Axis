# Pleos mixed-light reflections

This refinement belongs to the existing Dimention R3F mode. The reference images inform soft luminous cores, overlapping colored penumbras and dark negative space—not new geometry or bitmap textures.

## Changes

- Removed the incidence-only `surfaceTransmission` face fill from the supplemental optical shader. This response had tinted broad surfaces even away from a reflected highlight.
- Added `SpectralSoftboxes.ts`: six spatial banks of three finite, overlapping emitters, using the existing Pleos RGB light colors, enabled states, intensities and position controls. Colors add in linear light; intermediate hues are mixtures, not extra palette entries.
- Both environment capture and local reflection use the same softbox positions and continuous emission profile. Environment support is deliberately low to avoid uniform per-face color on planar glass.
- Local reflections intersect the reflected view ray with finite source planes. This adds spatial falloff across a planar surface instead of assigning a color to a face. Orthographic camera rays are correctly parallel.
- A Fresnel-weighted secondary path approximates a transmitted/internal contribution. This is a real-time analytic approximation, **not a new physical path tracer or complete caustics simulation**.
- Physical glass base and attenuation colors are neutral white. Geometry, bevel, camera, cube motion and per-cube dimension controls remain unchanged. The recursive FBO captures the new reflections through the existing system.

No reference image is loaded by the renderer. No noise, full-screen RGB overlay, colored albedo animation or new mode is introduced. Existing user numeric settings are retained; the pre-change record is backed up at `.pleos/pre-mixed-light-state.json` (local only). The named draft is untouched.

## Validation

`node scripts/verify-simultaneous-rgb.mjs --mixed --4k` reads the local backup on an isolated browser origin. It captures seven deterministic frames, checks hue presence, checks that disabled emitters have zero energy and that position edits do not alter emitter color, then exports a native 2160 × 3840 PNG. Results: `artifacts/mixed-light/validation.json` and PNGs. This test needs the local backup fixture; it does not modify live settings.

The provided references use flowing/curved surfaces; the preserved flat cube faces will produce straighter reflected bands. Relative hue area still depends on orientation, Fresnel reflection and current user settings. Full-suite validation results are recorded separately in `docs/AI_HANDOFF.md`.
