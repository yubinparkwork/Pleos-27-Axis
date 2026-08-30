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
- Active application: Glass3DMode / MotionStudioApp
- Renderer: Three.js WebGLRenderer + three-gpu-pathtracer
- Preview: Three.js raster + EffectComposer + UnrealBloomPass
- Camera: orthographic (OrthographicCamera)
- Main scene: 3 closed optical solids meeting at one shared vertex
- Studio mode: Glass 3D (renderer lifecycle owned by the active Mode)
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

### Soft Spectral

- Role: Soft center-led optical field with blue/cyan spectral response
- Implementation: Independent MeshPhysicalMaterial.onBeforeCompile custom GLSL
- Main file: `src/crystal/materials/SoftSpectralMaterial.ts`
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
- Available presets: spectral-axis-sweep — 7.2s, strict; shared-vertex-pulse — 5.6s, strict; explode-rejoin — 6.4s, anchored
- Determinism: absolute-time evaluation; fixed export time is `frameIndex / fps`.
- Current duration / FPS: 7.2s / 30 fps
- Playback: realtime raster preview.
- Sequence export: fixed-timestep raster PNG frames.
- Path-traced stills: current absolute motion frame is synchronized before accumulation.

## Artboard / Export

- Virtual artboard: Yes; framing is independent from viewport and Inspector width.
- Supported formats: 정사각형 1:1 (1080 × 1080); 인스타그램 4:5 (1080 × 1350); 세로형 3:4 (1080 × 1440); 가로형 16:9 (1920 × 1080); 세로형 9:16 (1080 × 1920); 사용자 설정 (1080 × 1080)
- Raster PNG: exact artboard or render-region pixels.
- Path-traced still: Clear, Prism, and Smoked.
- High-resolution raster: Spectral Flow.
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- Top bar — Mode, Variation and the primary Export action.
- Glass 3D Inspector — Style, Material, Lighting and Motion essentials in one continuous panel.
- Contextual details — material, lighting, geometry, camera, motion, output, render region and print metadata.
- Output — format, size, background, transparency and Mode-adapted export.
- Technical values stay collapsed until explicitly requested.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Production route selection and browser inspection/export API |
| `src/studio/StudioShell.ts` | Common Mode lifecycle and active Mode state ownership |
| `src/studio/ModeRegistry.ts` | Registered production Mode definitions |
| `src/studio/ModeTypes.ts` | Mode instance, capability and export-adapter contracts |
| `src/modes/glass-3d/Glass3DMode.ts` | First production Mode; owns the current Three.js optical environment |
| `src/modes/glass-3d/Glass3DExportAdapter.ts` | Maps common output intent to Glass 3D render strategies |
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

- User request: Direct render controls
- What changed: Removed redundant quality presets and fast/high render buttons so PNG export directly uses the user-entered render scale, bounce count, and sample count
- Why: The same quality decision should not be repeated through presets, buttons, and numeric controls
- Main implementation decisions: Keep one PNG export action|Honor exact sample and bounce values for print output|Keep PPI pixel scaling independent from sampling quality|Hide path-tracing controls when raster or motion output is selected

## Files Changed

- `src/crystal/ui/StudioPanel.ts` — Direct render controls without quality presets
- `src/crystal/MotionStudioApp.ts` — Single export workflow honoring manual values
- `scripts/verify-design-polish.mjs` — Direct-control regression checks
- `docs/AI_HANDOFF.md` — Generated current-state handoff
- `artifacts/latest/runtime-state.json` — Generated validation and preview state

## Visual Changes

- Quality dropdown and fast/high buttons removed
- Render scale bounces and samples are directly visible
- Single PNG export button remains

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 1080 × 1080 | prism | 3.6s |
| `artifacts/latest/preview-4x5.png` | 1080 × 1350 | prism | 3.6s |
| `artifacts/latest/preview-9x16.png` | 1080 × 1920 | prism | 3.6s |

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
- Start with `src/studio/StudioShell.ts` and `src/modes/glass-3d/Glass3DMode.ts`; `MotionStudioApp` is the current Glass 3D implementation.
- Compare `src/crystal/materials/SpectralFlowMaterial.ts` with physical Look handling in `src/crystal/CrystalAssembly.ts`.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
