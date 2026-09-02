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
- Renderer: Three.js WebGPU preview + native WebGPU wavefront path tracer
- Preview: Three.js WebGL compatibility preview
- Projection: orthographic (OrthographicCamera)
- Main structure: 3 closed optical solids meeting at one shared vertex
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

### Dimention R3F

- Role: fast, noise-free optical-glass version of the canonical Glass 3D composition
- Implementation: React Three Fiber MeshTransmissionMaterial, Environment Lightformers, moving Pleos RGB RectAreaLights, N8AO, MSAA and restrained Bloom
- Main files: `src/modes/dimention-r3f/DimentionR3FMode.ts`, `DimentionR3FScene.tsx`, `DimentionR3FRenderer.tsx`
- Geometry: cloned from `CrystalAssembly`, including its shared-corner and bevel-aware screen-gap compensation
- Render strategy: realtime Three.js WebGL raster; no Monte Carlo accumulation and no path tracing
- Presets: PLEOS Prism, Clear Studio, Dark Glass
- Motion support: Yes, deterministic RGB/white light orbit with timeline playback and seek

### Light Field

- Role: Cables-inspired iridescent membrane mapped across the canonical three-cube Axis structure
- Implementation: independent WebGL2 rounded-cube ray intersection with a world-space warped void, white crest, spectral layers and deterministic periodic motion
- Main files: `src/modes/light-field/LightFieldMode.ts`, `LightFieldRenderer.ts`, `shaders/field.frag.glsl`
- Render strategy: realtime raster WebGL2; no Three.js and no path tracing
- Presets: Iridescent Pulse, Violet Membrane, Spectral White
- Motion support: Yes, absolute-time configurable 8–16 second loop

### Glass Prism

- Role: three-solid optical refraction of editable background typography
- Implementation: independent Raw WebGL2 ray-box renderer using front/back thickness, RGB Snell refraction and Fresnel response
- Main files: `src/modes/glass-prism/GlassPrismMode.ts`, `GlassPrismRenderer.ts`, `shaders/prism.frag.glsl`
- Render strategy: realtime raster WebGL2 with deterministic exact-size PNG output
- Presets: Clear Glass, RGB Prism, Frosted Prism, Dark Crystal
- Motion support: Yes, rotation, shared-corner pulse and explode/rejoin

### Kinetic Glass

- Role: interactive optical-glass expression of the canonical PLEOS three-cube structure
- Implementation: Three.js MeshPhysicalMaterial with zero-gravity Rapier rigid bodies, bounded pointer repulsion and spring return
- Main files: `src/modes/kinetic-glass/KineticGlassMode.ts`, `KineticGlassRenderer.ts`, `KineticGlassPanel.ts`
- Render strategy: realtime Three.js raster, PMREM studio environment and restrained bloom
- Presets: Clear Attraction, PLEOS Prism, Dark Mass
- Motion support: Yes, live pointer interaction with stable return to the approved 30° rest positions

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
- Path-traced still: Glass 3D Clear, Prism, and Smoked only; absent from Light Field workflow.
- High-resolution raster: Spectral Flow and Soft Spectral.
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- Top bar — Mode, Variation and the primary Export action.
- Active Inspector — Style, Material, Lighting and Motion essentials in one continuous panel.
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
| `src/modes/dimention-r3f/DimentionR3FMode.ts` | Independent realtime R3F mode lifecycle, state and export |
| `src/modes/dimention-r3f/DimentionR3FScene.tsx` | Transmission glass, Lightformer studio, RGB light motion, N8AO and Bloom |
| `src/modes/dimention-r3f/DimentionR3FState.ts` | Presets and isolated serializable realtime mode state |
| `src/modes/light-field/LightFieldMode.ts` | Independent Light Field lifecycle, state, motion and variations |
| `src/modes/light-field/LightFieldRenderer.ts` | Raw WebGL2 fullscreen renderer and exact-size raster output |
| `src/modes/light-field/PngMetadata.ts` | Print PPI metadata injection for Light Field PNG output |
| `src/modes/light-field/shaders/field.frag.glsl` | Continuous inward field, spectral response, seams and origin compression |
| `src/modes/glass-prism/GlassPrismMode.ts` | Glass Prism lifecycle, state, variations, camera interaction and export |
| `src/modes/glass-prism/GlassPrismRenderer.ts` | Raw WebGL2 thickness-aware RGB refraction renderer |
| `src/modes/glass-prism/shaders/prism.frag.glsl` | Ray-box intersections, Snell refraction, Fresnel and dispersion |
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

- User request: Dimention R3F 모드에 광원별 모양·위치·크기·움직임을 슬라이더와 숫자 입력으로 조절하는 상세 조명 패널 추가
- What changed: 상세 조명 리그 상태, 실제 R3F 광원 연결, 접이식 한글 조명 편집 UI, 저장 마이그레이션, 자동 검증을 추가했다.
- Why: 사용자가 브랜드 조명의 형태와 공간 배치, 크기, 모션을 렌더 결과를 보며 직접 정밀 조정할 수 있게 하기 위해서다.
- Main implementation decisions: 기존 전체 밝기/RGB/화이트/속도는 마스터로 유지하고 화이트 키, RGB 3색, 화이트 면광원, 후면 광원을 독립 리그로 확장했다. 기존 저장값은 sanitize fallback으로 안전하게 마이그레이션한다.

## Files Changed

- `src/modes/dimention-r3f/DimentionR3FState.ts;src/modes/dimention-r3f/DimentionR3FScene.tsx;src/modes/dimention-r3f/DimentionR3FPanel.ts;src/crystal/CrystalApp.css;scripts/verify-dimention-r3f.mjs` — Changed in the latest task

## Visual Changes

- 화이트 키를 스포트/사각 면광원으로 전환 가능;RGB 반사광을 원형/타원/링으로 전환하고 개별 위치·크기·궤도를 조절 가능;고정형 화이트/후면 광원의 형태·회전·크기 조절 가능

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

- None known

## Next Recommended Work

- 광원 프리셋 저장/불러오기;선택 광원 뷰포트 기즈모;광원 그룹 복제/삭제

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for machine-readable branch, runtime, Look, motion, artboard, preview and validation state.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with `src/studio/StudioShell.ts`, then compare `src/modes/glass-3d/Glass3DMode.ts` and `src/modes/light-field/LightFieldMode.ts` as independent production Modes.
- Compare `src/crystal/materials/SpectralFlowMaterial.ts` with physical Look handling in `src/crystal/CrystalAssembly.ts`.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
