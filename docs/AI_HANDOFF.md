# PLEOS 27 Axis — AI Handoff

## Project Intent

PLEOS 27 Axis is a corporate-promotion key-visual production tool.
The core brand asset is not an individual cube, but the Axis origin, approved angles, and intersection relationship.
Expression is not limited to conventional 3D rendering.
The same Axis identity can support prism 3D, realtime shaders, 2D graphics, motion, and future data-driven expressions.
The system must preserve the shared structural identity while allowing optical and material variation.
Export across square, portrait, landscape, social, and print-oriented formats is a primary requirement.
Production geometry and expression layers should remain separable so new Looks do not erode the Axis contract.

## Active Application

- Entry point: `src/main.ts`
- Default route: `/`
- Active application: OpticalStudio
- Runtime capture: available
- Renderer: WebGL2 analytic dielectric ray integrator / linear HDR
- Projection: orthographic
- Main structure: three analytically intersected rounded cubes in the approved Axis relationship.
- Browser API: `window.__pleosOptical` — inspect, set, seek, pause, capture and reset.
- Preserved previous application: `?renderer=studio`; prior Dimention R3F and the other studio modes are available there.
- Other reference routes: `?renderer=raw` and `?renderer=legacy`.
- Named draft: `../pleos-snapshots/pleos-dimension-draft-20260910-155444/` is immutable and separate from this active application.

## Axis Identity

- Axis family: 30deg
- Cube count: 3
- Shared origin valid: No; inspect the current gap setting
- Projected directions: 9.31640830154197°, 90°, 103.90944952658475°, 189.316408301542°, 270°, 283.90944952658475°
- Geometry source: `src/optical-studio/AxisGeometry.ts`; the geometry module preserves the approved unrounded legacy silhouette and common vertex at zero gap.
- Render geometry uses bevel-aware inward radial compensation: at zero gap all three rounded-cube pairs touch without volume overlap. Positive pair clearance is sqrt(3) times gap regardless of bevel. Orientation, canonical depth and assembly centroid are preserved. Pairwise tangency is not a common rounded triple vertex; inspect runtime renderedCenters and surfacesTouch.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Optical Studio

- Role: editable optical glass with colored light reflecting and refracting through the canonical three cubes.
- Implementation: independent Raw WebGL2 renderer, analytic rounded-cube intersections, iterative Snell refraction and Fresnel reflection, and wavelength-dependent RGB dispersion.
- Lighting: four smooth studio emitters share one user-selected HEX colour in manual mode. Optional RGB cycle evaluates three spatially separate colour ribbons per emitter, with 80/10/10 power handover and Pleos secondary colours. Existing negative-fill apertures remain. No surface albedo tint or object emission. Legacy RGB weights are converted once with an original-state backup before overwrite.
- Radiance pipeline: linear FP16 render targets, linear subpixel averaging, bounded highlight bloom, tone mapping, sRGB conversion and spatial AA. Range-compressed RGBA8 is a lower-precision fallback, not equivalent HDR quality.
- Floating render targets active in this capture: Yes.
- `surfaceCurvature` changes an optical shading normal to approximate a polished lens face. It does not deform the actual cube silhouette, intersection geometry or Axis structure; zero preserves flat-face normals.
- Per-cube dimension layers: continuous 0–12 virtual cubical reflection-image layers sampled along rays refracted through the real shell. They are light-only contour fields, not opaque nested solids or new physical interfaces. Fractional last-layer activation fades smoothly; layer positions do not change with count. Spacing, softness and depth falloff are separately adjustable. Some layers can be hidden by angle, occlusion or absorption.
- Real split-ray depth is independent of dimension count. The layer model and its radiance balance are art-directed approximations, not an energy-conserving full spectral path tracer. Secondary transmitted paths through neighbouring cubes stop after at most eight interfaces.
- Main files: `src/optical-studio/OpticalRenderer.ts`, `src/optical-studio/optical.frag.glsl` and `src/optical-studio/OpticalResolve.ts`.
- Settings: the complete captured settings object is preserved in `artifacts/latest/runtime-state.json` under `runtime.state`.
- The active optical renderer does not use React Three Fiber or the previous studio's material pipeline.
- Optical transport uses finite bounce counts and RGB wavelength sampling; it is not an offline/full spectral path tracer and does not calculate volumetric caustics. No temporal random-noise accumulation is used.

## Motion System

- Runtime: absolute-time optical light loop.
- Optional RGB lead cycle uses a saved phase anchor, quintic transitions and one full green/red/blue sequence per duration. Fractions are incident-light weights, not screen coverage. Default is disabled to preserve existing looks.
- Current duration: 15 seconds.
- Deterministic: Yes, reported by the runtime.
- Captured hero time: 7.5 seconds; playback is paused before each export.
- Playback state after capture: paused.
- `seek(time)` supports deterministic frame inspection. The default loop is 15 seconds.
- OpticalStudio MP4/video and automatic PNG sequence export are not implemented.
- Dimension amounts are continuous animation-ready state, but automatic layer-count modulation has not been added.
- Layer spacing is independently controlled per cube by dimensionSpacingTop / dimensionSpacingLeft / dimensionSpacingRight (0.06–0.3). Missing fields inherit the old shared spacing without a visual reset. Softness and depth falloff remain shared.
- Increasing spacing also widens the gradient tail away from the shared world-space Axis origin. Smooth face-tangent directions avoid medial-axis seams; peak radiance and maximum width are bounded to avoid flat face fill. No new motion or UI control is added.

## Artboard / Export

- Captured artboard: 3072 × 3840 (4x5).
- Raster export: exact-size PNG via `capture(width, height, samples)` with tiled high-resolution rendering.
- The interface exposes native long-edge 3840px PNG with 4×4 (16) spatial samples averaged in linear light before tone mapping. Canvas2D assembles final pixels only, without display-RGB supersample averaging. Latest handoff previews below use their recorded pixel dimensions and four samples.
- Both preview and export render off-artboard guard bands covering the scaled bloom footprint and spatial-AA reach, then crop. Outer image boundaries and internal tile seams use the same lighting support; output is not an enlarged preview screenshot.
- Main preview retains the active artboard aspect with a maximum long edge of 1080 pixels. Portrait previews default to 1080 × 1350 and 1080 × 1920.
- `--preview-long-edge` or `PLEOS_HANDOFF_PREVIEW_LONG_EDGE` can reduce preview dimensions; decoded PNG dimensions are recorded and checked.
- Captured renderer limits: `{"maxOutputDimension":8192,"maxOutputPixels":34000000,"maxInternalBounces":16,"maxTextureSize":16384}`.
- MP4 is unsupported in this application; no video export is claimed by this handoff.
- PNG is opaque 8-bit sRGB; the new optical engine has no transparent/PPI-aware print or video export UI. Those existing workflows remain in the preserved studio instead.

## Inspector / UI

- OpticalStudio owns a fresh Korean interface with monochrome application controls.
- Collapsible sections: 형태, 디멘션 레이어, 광학, 조명, 카메라, 출력. The bottom transport controls time, loop length, motion extent and artboard aspect.
- 디멘션 레이어 owns three independent fractional slider/number controls and a collapsed spacing/softness/falloff group. 조명 owns a colour picker/HEX/Pleos swatch, optional RGB-cycle checkbox and live power fractions, plus intensity, width, exposure and highlight bloom. 광학 distinguishes lens-normal curvature from geometric bevel and ray budget.
- 레퍼런스 무드 적용 changes optical appearance while retaining the current camera, gap and artboard; the first pre-application local setting is preserved in `pleos-optical-before-luminous-v1` rather than replacing the named draft.
- Material, light, motion and output controls edit the independent optical state in `pleos-optical-studio-v1`. Browser origins do not share localStorage automatically.
- The artboard and export controls belong to OpticalStudio; prior mode selectors and legacy settings remain in the preserved studio route.
- Main files: `OpticalStudio.ts`, `OpticalPanel.ts` and `OpticalStudio.css` inside `src/optical-studio/`.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Default OpticalStudio and preserved reference route selection |
| `src/optical-studio/OpticalStudio.ts` | Active application lifecycle and browser inspection/export API |
| `src/optical-studio/OpticalRenderer.ts` | Independent WebGL2 renderer and tiled PNG capture |
| `src/optical-studio/optical.frag.glsl` | Rounded-cube intersection, optical transport and colored illumination |
| `src/optical-studio/OpticalResolve.ts` | Linear HDR targets, supersample averaging, highlight bloom and display resolve |
| `src/optical-studio/OpticalState.ts` | Independent optical settings and defaults |
| `src/optical-studio/OpticalLighting.ts` | Deterministic RGB lead weights and linear emitter palette |
| `src/optical-studio/LuminousReference.ts` | Appearance-only reference mood and pre-application backup key |
| `src/optical-studio/AxisGeometry.ts` | Canonical three-cube coordinates and separation |
| `src/optical-studio/OpticalPanel.ts` | Korean editing and export controls |
| `src/optical-studio/OpticalStudio.css` | Monochrome application layout and appearance |
| `scripts/verify-optical-geometry.mjs` | Geometry, common vertex and original silhouette checks |
| `scripts/verify-optical-dimensions.mjs` | Continuous layers, unified colour, curvature, persistence and guarded HDR tile verification |
| `scripts/verify-optical-light-cycle.mjs` | RGB power continuity, loop, manual roundtrip, UI persistence and captures |
| `scripts/update-ai-handoff.mjs` | Dispatches production or explicitly requested legacy handoff |
| `scripts/optical-handoff.mjs` | Production runtime capture, validation and current handoff |
| `src/studio/StudioShell.ts` | Previous multi-mode studio preserved at ?renderer=studio |

## Latest Task

- User request: Use current Pleos B settings on first visit
- What changed: Default route loads the approved local snapshot; make lighting test phase explicit
- Why: All new visitors should start at the same local composition
- Main implementation decisions: Preserve saved edits and seed only first visits

## Files Changed

- `src/optical-studio/OpticalStudio.ts` — Initial state
- `scripts/verify-optical-light-cycle.mjs` — Independent test phase

## Visual Changes

- First visit uses the saved 4x5 composition

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 864 × 1080 | optical-glass | 7.5s |
| `artifacts/latest/preview-4x5.png` | 1080 × 1350 | optical-glass | 7.5s |
| `artifacts/latest/preview-9x16.png` | 1080 × 1920 | optical-glass | 7.5s |

All previews were captured in this handoff run.

## Validation

- npm run typecheck — PASS
- npm run verify — PASS
- npm run build — PASS
- Browser console — PASS
- Runtime inspection and three PNG captures — PASS

Validation values are generated from commands executed during this handoff. `NOT-RUN` is never treated as PASS. A failed command remains failed even if runtime capture succeeds; `npm run verify` may stop at its first failing subcommand.



## Known Issues

- OpticalStudio currently exports PNG stills only; MP4/video and an automatic motion-sequence exporter are unsupported.
- Optical transport is bounded and art-directed: surface curvature uses a shading-normal approximation, secondary paths stop after eight interfaces, and no volumetric caustic/offline path-tracer equivalence is claimed.

## Next Recommended Work

- Review the three latest previews after meaningful visual work.
- Resolve any failed validation commands before treating the full suite as passing.

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for branch, complete optical settings, Axis, motion, artboard, preview dimensions and validation evidence.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with `src/optical-studio/OpticalStudio.ts`, `OpticalRenderer.ts` and `optical.frag.glsl` for the active application.
- Inspect `OpticalResolve.ts` before evaluating output quality; FP16 averaging and bloom occur before display encoding. Dimension sliders bound reflected ray orders, not physical cube count.
- Compare `surfaceCurvature` with geometric bevel: the former is an explicit lens-normal approximation and must not be described as physical geometry deformation.
- Use `window.__pleosOptical` on the default route. The older `window.__pleos27Axis` API belongs to `?renderer=studio`.
- Refresh production handoff without `--mode`, or with `--mode optical`. Pass an explicit prior mode only when intentionally documenting the preserved studio.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
