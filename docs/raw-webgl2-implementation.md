# PLEOS Raw WebGL2 — Phase 1 Implementation Record

Status date: 2026-08-21
Runtime target: WebGL 2.0 / GLSL ES 3.00 / Vanilla TypeScript

## 1. Scope and evidence boundary

This document records the Phase 1 renderer architecture and its validation contract. It does not turn engineering choices into PLEOS brand rules and does not treat a planned screenshot as a rendered result.

Authority order:

1. `Pleos 25 Design Guidelines.pdf` for fixed color, Axis, grid, and Type B rules.
2. `Pleos 27 Design Kickoff.pdf` for the Keep/Expand strategy.
3. `docs/source-audit.md` for the page-by-page rule map.
4. `docs/implementation-assumptions.md` for explicitly labeled technical hypotheses.
5. The Phase 1 implementation brief for renderer and delivery requirements.

The PDFs and supplied JPG are reference-only. They are not public assets, textures, environment maps, shader inputs, or final composites. Production output is generated from code-owned geometry, material state, lighting state, camera state, and shaders.

## 2. Official versus experimental

### Source-confirmed constraints retained

- One center node and a ray topology using the documented 30-degree or 45-degree family.
- A center anchor on a 20 × 20 grid intersection.
- Approved Axis variation lists and a stable orthographic front projection.
- Type B material families: Black, Pleos Red, Pleos Blue, Pleos Green, and Pleos Gray.
- No text or logo in the raw key-visual renderer.
- Pleos Blue 2 remains limited to dark/black contexts; unrelated hue mixing and unspecified effects are not Brand Final by default.
- Axis, core color DNA, typography, and layout logic remain in the `Keep` category; Material, Layer, Interaction, and Motion are expansion areas.

### Implementation assumptions

- Raw WebGL2, framebuffer formats, shader models, camera values, depth, bevel, IOR, light positions, tone mapping, AA, and export sampling are engineering decisions because the PDFs do not specify them.
- Folded Surface and Closed Optical Solid share an Axis skeleton but use different topology appropriate to Matte and Prism rendering.
- Analytic reflection cards replace an image-based studio environment in Phase 1.
- Backface position plus frontface optical shading provides an approximate single-layer optical path; it is not a general path tracer.

### Experimental — review required

- `Full Spectrum Prism`, cross-hue cards, strong dispersion, and iridescence are explicitly experimental.
- The supplied spectral JPG guides optical energy and streak behavior only; it does not establish a PLEOS-approved color rule.
- Experimental status must remain visible in the UI and exported review metadata. It is not a Brand Final preset.

## 3. Runtime architecture

The production path owns the native objects instead of delegating them to a 3D engine:

```text
HTMLCanvasElement
  → WebGL2RenderingContext
  → capability gate
  → shader programs / UBOs
  → VAO + position/normal/UV/face-ID buffers + EBO
  → geometry/material pass chain
  → HDR or compatibility render targets
  → tone map + dither + AA
  → canvas or offscreen PNG readback
```

Primary modules:

- `src/raw-webgl/core/`: context negotiation, capability discovery, shader diagnostics, buffers, vertex arrays, uniform buffers, textures, framebuffers, targets, state cache, and disposal.
- `src/raw-webgl/math/`: minimal vectors, matrices, camera, and geometry helpers; no rendering abstraction.
- `src/raw-webgl/geometry/`: folded surface, closed optical solid, presets, interleaved attributes, bounds, and CPU topology validation.
- `src/raw-webgl/materials/`: real Matte/Prism uniform state and named presets.
- `src/raw-webgl/lighting/`: independent key/fill/rim lights and direction-dependent reflection cards.
- `src/raw-webgl/camera/`: orthographic/perspective matrices and local orbit input.
- `src/raw-webgl/passes/` and `src/raw-webgl/renderer/`: render responsibilities, render-on-demand, resize, and export orchestration. Individual responsibilities may be grouped when the live import graph proves the grouping is real; unused placeholder classes are not accepted.
- `src/raw-webgl/shaders/`: GLSL ES 3.00 entry shaders and reusable include fragments.
- `src/studio/`: serializable state and an external toolbar/preset/stage/inspector/status shell.

`npm run verify:raw` scans the live production source, not the archive, for forbidden engine imports and symbols. It also checks declared dependencies after final migration.

## 4. Context and capability contract

The primary request uses:

```ts
{
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: true
}
```

If it fails, the renderer retries WebGL2 once with `failIfMajorPerformanceCaveat: false` and labels the result Compatibility GPU Mode. It never silently falls back to WebGL1. The high-performance value is a request to the browser, not proof that a discrete GPU was selected.

The status bar reports observed values for `EXT_color_buffer_float`, anisotropic filtering, parallel shader compile, timer query, context-loss control, texture/renderbuffer/sample limits, and drawing-buffer size. When `EXT_color_buffer_float` is absent, HDR is reported disabled and the renderer uses an RGBA8 compatibility path rather than claiming RGBA16F.

Context loss stops drawing. Restoration rebuilds programs, buffers, vertex arrays, and render targets from retained CPU state, then redraws the current preset.

## 5. Geometry

### Shared Axis data

- Approved ray sets live in `src/raw-webgl/geometry/preset.ts`.
- The default raw geometry calibration is 30-degree Variation 1: `[-90, -30, 30, 90, 150, 210]`.
- The default center is `[0, 0, 0]`; UI grid anchor is `[10, 10]` on the 20 × 20 motif grid.
- Attribute contract: position, normal, UV, face ID, plus indexed triangles.
- GPU buffers are created when geometry changes, not every frame.

### Folded Surface

Matte uses open, nearly zero-thickness sector surfaces with independent face normals and sharp crease ownership. The center node is shared in projected space and must not form a crack.

### Closed Optical Solid

Prism uses two closed solid components corresponding to the reviewed two-cube Axis interpretation. Front, back, side, and bevel faces are included in indexed topology. CPU validation welds positional duplicates, inspects edge use and winding, checks normals and degeneracy, requires zero boundary/non-manifold edges, and confirms both components reach the shared center node.

Run the validation through:

```bash
npm run verify:raw
```

The generated report is `artifacts/verification/raw-webgl2.json`.

## 6. Matte shading

The Matte pass operates in linear RGB and combines:

- diffuse response;
- GGX normal distribution;
- Smith visibility/geometry term;
- Schlick Fresnel;
- energy-conserving diffuse/specular balance;
- face variation and subtle procedural micro-surface modulation;
- direct key/fill/rim lights and analytic studio cards.

Presets contain complete values rather than names only: Matte Reference, Matte Graphite, and Matte Pleos Blue. Matte Pleos Blue stays within the intended tone-on-tone family; it does not add rainbow dispersion.

## 7. Prism multipass pipeline

```text
1. Background / opaque environment
2. Prism backface world position
3. Prism frontface optical shading
4. HDR composite
5. Tone map → linear-to-sRGB → dither → FXAA
```

At the front face, the shader uses the sampled exit position and the front world position to estimate optical thickness. Absorption follows an exponential Beer–Lambert-style transmittance. Schlick Fresnel changes the reflection/refraction mix with view angle. Reflection and refraction sample an analytic direction-dependent studio environment; scene-color refraction is clamped at screen edges and may fall back toward the environment.

Dispersion changes the effective refractive index per spectral sample. It is not a final-frame RGB offset, CSS gradient, or image overlay. Preview presets use a restrained sample count; higher quality can use more wavelength samples. Iridescence is a separate, low-default term and becomes prominent only in the experimental Full Spectrum preset.

Known optical limits:

- Front/back screen-space thickness can become ambiguous with self-overlap or multiple exit layers.
- The renderer approximates one refractive traversal and does not simulate arbitrary internal bounces, volumetric caustics, polarization, or wavelength-accurate spectral integration.
- Analytic cards provide stable product-lighting response but are not a decoded HDR/EXR environment.
- Rough refraction is a bounded preview approximation; it is not offline path-traced transmission.

These limits must not be described as physically exact.

## 8. Color and finishing

Lighting, reflection, refraction, and absorption run in linear RGB. Presentation follows:

```text
linear HDR/compatibility color
  → Neutral or ACES-fitted tone mapping
  → linear-to-sRGB
  → subtle output-space dithering
  → FXAA when enabled
```

The preview context does not use browser MSAA. This avoids stacking browser AA with the explicit post chain. Final export may use separate supersampling/accumulation settings, subject to GPU size and memory limits.

## 9. Resize and export

`ResizeObserver` follows the center-stage container. CSS size, preview drawing-buffer size, and final output size remain separate. Preview DPR is capped by the selected quality limit.

PNG export does not depend on `preserveDrawingBuffer`. It creates an offscreen target at the requested dimensions, retains camera framing, renders, reads pixels, flips rows from GL bottom-left origin, encodes PNG, restores preview viewport/targets, and disposes export-only resources. Export fails clearly when width/height exceed reported texture or renderbuffer limits.

Supported UI sizes include 1400 × 1040, 2000 × 1486, 2800 × 2080, 3840 × 2160, 4096 × 4096, 5600 × 4160, and Custom. Large targets and supersampling can exceed mobile/integrated-GPU memory even when their raw dimensions are below `MAX_TEXTURE_SIZE`; use smaller sampling first.

## 10. UI and controls

The studio uses an external shell: top toolbar, left preset panel, center canvas stage, right inspector, and bottom status bar. It is not a floating GUI permanently covering the artwork.

Inspector tabs:

- Geometry: family, approved variation, grid anchor, mode, depth/thickness, bevel.
- Material: Matte presets and BRDF values.
- Prism: IOR, dispersion/spectral balance, Fresnel/reflection/refraction, absorption, rough refraction, iridescence.
- Lighting: presets plus independent key/fill/rim values.
- Cards: direction, rotation, size, softness, intensity, color.
- Camera: orthographic/perspective, pose, FOV/zoom, reset/fit/lock.
- Output: quality, exact dimensions, tone mapping, dither, AA, filename/export.
- Debug: shaded, wireframe, vertices, face normal, face ID, Axis ray, center node, depth, and thickness views.

Every visible control must mutate used geometry state, a shader uniform, camera state, render-target state, or export state. A disconnected placeholder is a defect.

## 11. Legacy path and migration boundary

The default production route is raw. `?renderer=raw` requests it explicitly. `?renderer=legacy` exists only as a migration/audit comparison and resolves to evidence retained under `archive/legacy-three/` and `artifacts/raw-webgl2/before-*`; it must not import Three.js into `src/` or the default production graph.

Legacy code belongs under `archive/`. Source-audit PDFs and the supplied reference remain outside the public graph. The verifier rejects Three.js, Babylon.js, regl, twgl, OGL, PixiJS, luma.gl, PlayCanvas, and related engine imports in production `src/`.

## 12. Implementation checklist

The verification command is the source of truth when this list and the working tree differ.

- [x] Raw WebGL2 context request, compatibility retry, and no WebGL1 fallback.
- [x] Capability discovery and RGBA16F/RGBA8 decision data.
- [x] Shader program diagnostics and GLSL ES 3.00 shader separation.
- [x] VAO/VBO/EBO/UBO/texture/framebuffer/resource wrappers.
- [x] Minimal local vector, matrix, and camera math.
- [x] Approved ray presets and 20 × 20 grid state.
- [x] Folded-surface and closed-solid CPU mesh builders.
- [x] CPU manifold, winding, normal, component, and center-node self-test.
- [x] Matte and Prism parameter presets; Full Spectrum marked experimental.
- [x] Key/fill/rim and analytic reflection-card presets.
- [x] External studio state and inspector shell.
- [ ] Live render-pass integration validated in a browser.
- [ ] Shader compile/link results validated on the target browser/GPU.
- [ ] Framebuffer completeness and RGBA16F fallback validated on the target browser/GPU.
- [ ] Context loss/restore tested with state retention.
- [ ] Resize, DPR, and panel-collapse cases visually validated.
- [ ] Offscreen PNG export dimensions and Y orientation validated.
- [ ] 2800 × 2080 and 4096 × 4096 render time measured on the target GPU.
- [ ] Required screenshot set captured with provenance in `artifacts/raw-webgl2/manifest.json`.

Items stay unchecked until observed evidence exists. Source presence alone is not runtime proof.

## 13. Verification commands

```bash
npm run lint
npm run verify:raw
npm run typecheck
npm run build
```

`lint` is intentionally the strict TypeScript source-hygiene check configured by `tsconfig.json`; the project does not claim to run ESLint when no ESLint configuration is installed.

To require every declared screenshot after a real capture pass:

```bash
RAW_WEBGL2_REQUIRE_ARTIFACTS=1 npm run verify:raw
```

Default verification deliberately reports pending artifacts without inventing them. Strict mode turns them into a failure only when a full capture pass is expected.
