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
- Active application: MotionStudioApp
- Renderer: Three.js WebGLRenderer + three-gpu-pathtracer
- Preview: Three.js raster + EffectComposer + UnrealBloomPass
- Camera: orthographic (OrthographicCamera)
- Main scene: 3 closed optical solids meeting at one shared vertex
- Legacy routes: `?renderer=raw` and `?renderer=legacy` — Legacy / reference only

## Axis Identity

- Axis family: 30deg
- Shared origin valid: Yes
- Shared-origin contract: [0, 0, 0]
- Projected directions: 30°, 90°, 150°, 210°, 270°, 330°
- Geometry relationship: three closed optical solids meet at one shared vertex.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Clear

- Role: Neutral clear optical glass
- Implementation: MeshPhysicalMaterial preset
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

### Prism

- Role: Primary optical prism expression
- Implementation: MeshPhysicalMaterial with dispersion
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

### Spectral Flow

- Role: Axis-driven moving spectral light field
- Implementation: MeshPhysicalMaterial.onBeforeCompile custom GLSL
- Main file: `src/crystal/materials/SpectralFlowMaterial.ts`
- Render strategy: high-resolution-raster
- Motion support: Yes, via the shared Motion system

### Smoked

- Role: Dark smoked optical glass
- Implementation: MeshPhysicalMaterial preset
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

## Motion System

- Runtime: `MotionEngine` + `MotionClock`
- Current preset: `spectral-axis-sweep`
- Available presets: spectral-axis-sweep — 6s, strict; shared-vertex-pulse — 4s, strict; explode-rejoin — 4.5s, anchored
- Determinism: absolute-time evaluation; fixed export time is `frameIndex / fps`.
- Current duration / FPS: 6s / 30 fps
- Playback: realtime raster preview.
- Sequence export: fixed-timestep raster PNG frames.
- Path-traced stills: current absolute motion frame is synchronized before accumulation.

## Artboard / Export

- Virtual artboard: Yes; framing is independent from viewport and Inspector width.
- Supported formats: Square 1:1 (1080 × 1080); Instagram 4:5 (1080 × 1350); Portrait 3:4 (1080 × 1440); Landscape 16:9 (1920 × 1080); Vertical 9:16 (1080 × 1920); Custom (1080 × 1080)
- Raster PNG: exact artboard or render-region pixels.
- Path-traced still: Clear, Prism, and Smoked.
- High-resolution raster: Spectral Flow.
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- SETUP — Axis state, cube gap, bevel, camera lock/reset.
- LOOK — Clear, Prism, Spectral Flow, Smoked and expression-specific controls.
- MOTION — preset, strength, duration, FPS, timeline, loop and transport.
- FORMAT — virtual artboard size, fit, scale, preview zoom, safe guide and transparency.
- EXPORT — raster, path-traced still, print and motion-sequence controls.
- ADVANCED — path-tracing settings, pixel render region, unit conversion, PPI metadata and individual lights.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Production route selection and browser inspection/export API |
| `src/crystal/MotionStudioApp.ts` | Active scene, renderer lifecycle, UI binding, motion and export strategy |
| `src/crystal/CrystalAssembly.ts` | Three-solid Axis geometry, physical Looks and shared-origin contract |
| `src/crystal/materials/SpectralFlowMaterial.ts` | Independent Spectral Flow shader expression |
| `src/crystal/PrismMotionAdapter.ts` | Applies deterministic motion patches to the three solids |
| `src/crystal/LightingSystem.ts` | Dynamic studio lighting and Pleos lighting presets |
| `src/crystal/StudioEnvironment.ts` | Environment and studio reflection setup |
| `src/crystal/ui/StudioPanel.ts` | Active Inspector markup and controls |
| `src/crystal/CrystalApp.css` | Production application and Inspector styling |
| `src/motion/MotionEngine.ts` | Absolute-time motion evaluation |
| `src/motion/MotionClock.ts` | Realtime and fixed-frame time source |
| `src/motion/MotionPresetRegistry.ts` | Active motion preset registry |
| `src/axis/angles.ts` | Canonical Axis direction families |
| `src/artboard/FormatPresetRegistry.ts` | Supported output formats |
| `src/artboard/CompositionAdapter.ts` | Viewport-independent artboard framing |
| `scripts/render-motion-sequence.mjs` | Fixed-timestep PNG sequence exporter |
| `scripts/update-ai-handoff.mjs` | Generates this handoff, runtime state and latest previews |

## Latest Task

- User request: Publish current PLEOS 27 Axis work and AI handoff
- What changed: Validated Motion Studio, Spectral Flow, retained render/export tools, and generated deterministic AI handoff artifacts for GitHub.
- Why: Synchronize the active source, runtime metadata, and latest visual previews for reliable ChatGPT handoff.
- Main implementation decisions: Preserve the approved Axis structure and current visual output; publish only the PLEOS repository scope; keep unrelated parent-workspace changes untouched.

## Files Changed

- `docs/AI_HANDOFF.md` — Current project handoff
- `artifacts/latest/runtime-state.json` — Machine-readable runtime snapshot
- `artifacts/latest/preview-main.png` — Main preview
- `artifacts/latest/preview-4x5.png` — 4:5 preview
- `artifacts/latest/preview-9x16.png` — 9:16 preview

## Visual Changes

- No intentional visual changes; deterministic representative previews refreshed.

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 1080 × 1080 | prism | 3s |
| `artifacts/latest/preview-4x5.png` | 1080 × 1350 | prism | 3s |
| `artifacts/latest/preview-9x16.png` | 1080 × 1920 | prism | 3s |

## Validation

- npm run typecheck — PASS
- npm run verify — PASS
- npm run build — PASS
- Browser console — PASS

Validation values are generated from commands executed during this handoff. `NOT-RUN` is never treated as PASS.

## Known Issues

None known

## Next Recommended Work

- Review the three latest previews after meaningful visual work.
- Run handoff:full at the end of completed implementation work.

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for machine-readable branch, runtime, Look, motion, artboard, preview and validation state.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Treat `src/crystal/MotionStudioApp.ts` as the active production renderer; raw and legacy routes are reference only.
- Compare `src/crystal/materials/SpectralFlowMaterial.ts` with physical Look handling in `src/crystal/CrystalAssembly.ts`.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
