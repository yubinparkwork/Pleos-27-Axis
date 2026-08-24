# PLEOS Raw WebGL2 Migration — Legacy Render Audit

Audit date: 2026-08-21 (Asia/Seoul)
Audited URL: `http://127.0.0.1:5173/`
Audited entry point: `src/main.ts` → `src/crystal/NewAxisCrystalApp.ts`

## 1. Scope and source boundary

This is a technical snapshot immediately before the requested raw WebGL2 migration. It uses `docs/source-audit.md` and `docs/implementation-assumptions.md` to keep official PLEOS constraints separate from implementation choices. The PLEOS PDFs and supplied JPG remain reference-only; no attached image is in the production render graph.

The repository contains two materially different Three.js implementations:

1. **Active legacy baseline:** the optical-crystal application imported by `src/main.ts`. This is what the URL renders and what `?renderer=legacy` must initially preserve.
2. **Dormant studio implementation:** `src/renderer/PleosRenderer.ts` plus `src/axis/`, `src/geometry/`, `src/materials/`, `src/export/`, `src/ui/`, and related modules. These files contain richer Axis graphs, approved variants, folded/solid geometry, state, texture, comparison, and offscreen-export work, but they are not reachable from the current entry point.

Calling the dormant studio “the current renderer” would be inaccurate. Its data is useful migration input, but the browser baseline is `NewAxisCrystalApp`.

## 2. Runtime and toolchain

| Item | Observed state |
|---|---|
| Application | Vite + Vanilla TypeScript; no React |
| Three.js | `three@0.180.0` installed and locked; manifest range `^0.180.0` |
| Renderer | `THREE.WebGLRenderer` |
| Active abstractions | Three core, `OrbitControls`, `RoundedBoxGeometry`, `BufferGeometryUtils`, `RoomEnvironment`, `RectAreaLightUniformsLib` |
| Context request | `antialias: true`, `alpha: false`, `powerPreference: "high-performance"`, `precision: "highp"`, `preserveDrawingBuffer: true` |
| Output transform | `SRGBColorSpace`, `ACESFilmicToneMapping`, exposure `1.08` |
| Shadows | enabled, `PCFSoftShadowMap` |
| Clear/background | opaque `#050607` |
| Render scheduling | unconditional continuous `requestAnimationFrame` |
| Active build graph | Vite reported 15 transformed modules |
| Production JS | 770.36 kB minified / 235.25 kB gzip; >500 kB warning |

The active application does not perform WebGL2-only context negotiation, capability/extension auditing, a compatibility retry, framebuffer-completeness checks, or WebGL1 rejection. `WebGLRenderer` owns context selection and state.

## 3. Live-browser baseline

The page was opened and visually inspected in the in-app browser.

| Item | Observed result |
|---|---|
| Page title | `Pleos New Axis Crystal` |
| Viewport | 1280 × 720 CSS px during this audit |
| Device pixel ratio | 2 |
| Canvas CSS size | 1280 × 720 |
| Drawing buffer | 2560 × 1440 |
| Default look | Prism |
| Controls | Clear / Prism / Smoked, Roughness, Dispersion, Reset view, Save 2800 × 2080 |
| Console | zero errors and zero warnings; only Vite debug connection messages |

Required migration captures belong at:

- `artifacts/raw-webgl2/before-ui-1440x900.png`
- `artifacts/raw-webgl2/before-render.png`

They were intentionally not created by this documentation-only audit; the capture/QA pass should create them from the untouched legacy route.

## 4. Active geometry

### 4.1 Construction

`src/crystal/CrystalAssembly.ts` builds two closed rounded boxes. Each starts as:

```text
RoundedBoxGeometry(1, 1, 1, 12, 0.055)
translate(+0.5, +0.5, +0.5)
mergeVertices(tolerance = 1e-5)
```

The nearest rounded-box sample to local zero is treated as the common contact point. Every vertex is affinely transformed by three equal-length, mutually perpendicular 3D basis vectors. A negative basis determinant triggers index-winding reversal before normals are recomputed. Both transformed solids share `(0, 0, 0)` at one sampled point.

At the installed Three.js version, one merged source box has 4,052 vertices, 22,500 indices, and 7,500 triangles. Each solid is drawn twice using the same geometry: a translucent `BackSide` exit-boundary mesh and a `FrontSide` optical mesh. The two solids therefore store 15,000 unique geometry triangles but submit 30,000 geometry triangles per frame before the backdrop, cards, and floor.

### 4.2 Exact active Axis basis and depth

The active geometry does **not** consume `AxisGraph`. It hard-codes a full six-direction 30-degree family. `span = 1.52`, `depth = span / sqrt(2) = 1.0748023074035522`, and each 3D edge length is `1.8616122045152153`.

| Solid | Projected direction | Basis vector `[x, y, z]` |
|---|---:|---|
| Left | 90° | `[0, 1.52, 1.0748023074035522]` |
| Left | 150° | `[-1.3163586137523469, 0.76, -1.0748023074035522]` |
| Left | 210° | `[-1.3163586137523466, -0.76, 1.0748023074035522]` |
| Right | -90° / 270° | `[0, -1.52, -1.0748023074035522]` |
| Right | 30° | `[1.3163586137523469, 0.76, -1.0748023074035522]` |
| Right | -30° / 330° | `[1.3163586137523469, -0.76, 1.0748023074035522]` |

There is no line primitive. The cube edges incident to the shared point project to `[30, 90, 150, 210, 270, 330]` degrees.

### 4.3 Preserved but inactive Axis data

The richer source-of-truth data remains in `src/axis/`:

- 30-degree family: `[-90, -30, 30, 90, 150, 210]`
- 45-degree family: `[-135, -90, -45, 0, 45, 90, 135, 180]`
- 30 Basic: `[-90, -30, 30, 90, 210]`
- 30 Variation 1: all six 30-degree rays
- 30 Variation 2: `[-30, 30, 90, 210]`
- 30 Variation 3: `[-30, 30, 90]`
- 45 Basic: `[-135, -45, 0, 45, 135, 180]`
- 45 Variation 1: `[-135, -90, -45, 45, 90, 135, 180]`
- 45 Variation 2: `[-135, 45, 180]`
- 45 Variation 3: `[-135, -90, 0, 45, 90]`
- center anchor: 20 × 20 grid intersection `(10, 10)`, normalized `(0.5, 0.5)`
- reference line-width rule: `outputWidth / 1920`

The dormant default fold calibration is `centerZ = 0.06`, with `{ up: 0.03, down: -0.10, upperRight: 0.17, lowerRight: -0.15, lowerLeft: 0.11, upperLeft: -0.04, right: 0.08, left: -0.07 }`. Its default structure is `corner-cubes`, `depth = 0.42`, `cubeScale = 0.42`.

These data are more appropriate raw-WebGL inputs than re-deriving Axis from the current rounded boxes. The active boxes correspond to six-ray 30-degree Variation 1, not five-ray 30-degree Basic.

## 5. Camera

The active scene has one `PerspectiveCamera`:

| Parameter | Value |
|---|---|
| FOV | 32° |
| Near / far | `0.05 / 60` |
| Position | `[0.22, 0.20, 11.20]` |
| Orbit target | `[0, 0.02, 0]` |
| Pan | disabled |
| Damping | enabled, factor `0.055` |
| Distance bounds | `7.2 .. 16` |
| Polar bounds | `0.31π .. 0.69π` |

Aspect follows stage dimensions. The active route has no orthographic reference camera, projection lock, fit/lock controls, FOV control, camera presets, or legacy/raw projection comparison. A more complete but inactive orthographic/perspective implementation exists in `PleosRenderer.ts`.

## 6. Material

The optical surface is built-in `MeshPhysicalMaterial`, not a custom GLSL multipass optical material.

Common values: metalness `0`, IOR `1.52`, clearcoat `0.34`, clearcoat roughness `0.035`, white specular intensity `1`, iridescence IOR `1.31`, iridescence thickness `120..410`, `FrontSide`.

| Look | Color | Attenuation | Roughness | Transmission | Shader thickness | Dispersion | Iridescence | Attenuation distance | Env intensity |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| Clear | `#F4F7F7` | `#DCE8E8` | 0.045 | 0.98 | 2.10 | 0.045 | 0.06 | 4.80 | 2.25 |
| Prism | `#F7F6F1` | `#DDE7E5` | 0.038 | 0.96 | 2.45 | 0.16 | 0.14 | 3.80 | 2.50 |
| Smoked | `#9DA5A4` | `#25302F` | 0.08 | 0.82 | 2.80 | 0.055 | 0.035 | 1.25 | 2.65 |

The exit-boundary material is `#E7EEEE`, roughness `0.2`, transmission `0`, `BackSide`, transparent, `depthWrite = false`, and opacity `0.045 / 0.065 / 0.11` for Clear / Prism / Smoked.

The dormant registry contains useful starting values for reference matte, graphite, metal, chrome, glass, acrylic, clearcoat, polymer, paper, and experimental surfaces. Its `SpectralCausticMaterial` is still a Three.js `ShaderMaterial`; it must not be relabeled as raw WebGL.

## 7. Lighting and environment

`src/crystal/StudioEnvironment.ts` installs:

- `RoomEnvironment` prefiltered by `PMREMGenerator` with sigma `0.03`;
- a 1024 × 768 Canvas2D radial-gradient backdrop on a 20 × 14 plane at `z = -5.2`;
- cool card `#E9F6F7`, size `0.16 × 1.72`, rotation `0.22`, at `[-1.28, 1.12, -2.65]`;
- warm card `#FFE5C9`, size `0.14 × 1.58`, rotation `-0.36`, at `[1.25, -1.02, -2.65]`;
- white RectArea key: intensity `7.5`, size `3.8 × 7.5`, position `[-4.2, 3.8, 4.2]`;
- cool RectArea light `#D8F1F3`: intensity `5.2`, size `2.4 × 5.8`, position `[4.5, 1.6, 2.2]`;
- warm RectArea light `#FFE2C5`: intensity `3.1`, size `2.3 × 4.2`, position `[-1.4, -2.7, -3.4]`;
- white spot rim: intensity `65`, distance `18`, angle `0.2π`, penumbra `0.92`, decay `1.3`, position `[1.5, 5.2, 5.6]`, 2048 shadow map;
- floor: 28 × 28 at `y = -3.15`, roughness `0.24`, metalness `0.05`.

No active UI control is connected to any light, card, environment, background, or exposure value. The PMREM environment does not include the cards added afterward. Colored cards/lights are implementation choices requiring Experimental review under the source-audit color rules.

## 8. Color, post-processing, and anti-aliasing

- Three.js performs lighting and output conversion; the app does not own a documented linear/HDR framebuffer chain.
- Presentation is sRGB with built-in ACES Filmic at exposure `1.08`.
- There is no `EffectComposer`, custom post pass, bloom, dither, FXAA, temporal accumulation, or selectable tone mapper on the active route.
- Anti-aliasing is the browser context requested by `antialias: true`; preview DPR is capped at 2.
- There is no active explicit `RGBA16F` target, float-buffer gate, or framebuffer completeness validation.

## 9. UI and state

One template string inside `NewAxisCrystalApp` creates a full-canvas scene with floating top and lower-left overlays. State is local and minimal: `look`, two direct material mutations, orbit state, `H` to hide the dock, and a source-level `window.__newAxisCrystal` inspection/set/export facade.

There is no serializable central state, persistence, undo/redo, Matte/Prism geometry split, material/lighting/card/camera/output/debug inspectors, slider-number pairs, or `?renderer=legacy|raw` switch. The richer `StudioState` and `AppShell` are inactive.

## 10. Resize, render lifecycle, and resilience

- `ResizeObserver` correctly observes `.crystal-stage`; retain this behavior conceptually.
- CSS size and drawing-buffer size are separated with `setSize(width, height, false)` and DPR `min(devicePixelRatio, 2)`.
- Rendering continues even when nothing changes.
- `preserveDrawingBuffer` stays enabled to support canvas export.
- The active renderer has no `webglcontextlost`, `webglcontextrestored`, or `webglcontextcreationerror` path.
- Disposal exists for controls, geometry, materials, environment, observer, and renderer, but no navigation lifecycle currently calls it.

## 11. Export

`Save 2800 × 2080` temporarily resizes the visible renderer to 2800 × 2080 at DPR 1, changes camera aspect, renders once, uses `canvas.toBlob("image/png")`, downloads the file, then restores preview size/DPR/aspect.

Limitations: fixed size and PNG only; no offscreen framebuffer; `preserveDrawingBuffer` required; live renderer/camera mutation; no GPU limit check; no supersampling, accumulation, downsample, Y-flip/readback, transparency, custom filename, or cancellation.

Dormant `StillExporter.ts` demonstrates offscreen raster targets, MSAA/supersampling, async readback, Y flip, PNG/JPEG/WebP, half-float EXR, Halton accumulation, and deterministic PNG-sequence ZIP. Preserve the behavior and tests, not the Three.js target/exporter implementation.

## 12. Why the current image looks technically weak

1. **Approved Axis is disconnected.** The active route bypasses `AxisGraph`, approved presets, 20 × 20 anchoring, folded sectors, and strict reference projection.
2. **The silhouette was replaced.** Two isolated rounded cubes do not reproduce the broad connected Type B planes or motion-derived crop; Axis reads as incidental contact.
3. **The camera is product-demo perspective only.** No orthographic baseline exists for screen-space ray/crop fidelity.
4. **Bevel is uniformly soft.** Radius `0.055` with 12 segments weakens precise hard creases and creates a generic consumer-glass shape.
5. **Optics are built-in approximations.** There is no backface position/depth pass, fragment exit point, optical path, wavelength loop, scene/environment refraction composite, or rough-refraction quality model.
6. **The duplicate boundary shell is a workaround.** Transparent BackSide plus FrontSide rendering can create order-dependent dark rims, self-layering, or a hollow-shell read.
7. **Cards overpower transmission.** High environment intensity, white specular, clearcoat, and narrow white cards produce broad opaque stripes; on black the result reads as polished gray plastic/metal.
8. **Lighting is fixed and synthetic.** Cards/lights are not editable, the Canvas2D backdrop is not a direction-dependent environment, and the floor dominates the lower frame.
9. **Finishing is thin.** Direct-to-canvas fixed ACES provides no owned HDR composite, neutral roll-off, black lift, dither, or deliberate AA chain.
10. **Export and preview share one fragile path.** Live resize plus drawing-buffer preservation prevents separate interaction and final quality.
11. **Static work pays continuous cost.** Permanent redraw and preserved buffer waste GPU time/memory without motion.
12. **The UI cannot diagnose geometry or rendering.** Normal, thickness, face, ray, center, capability, framebuffer, and performance views are absent.

Raw WebGL2 alone will not correct these problems. Geometry, optics, lighting, framebuffer finishing, and output all need replacement while retaining Axis constraints.

## 13. Migration disposition

### Preserve unchanged as authoritative data

| Item | Source / reason |
|---|---|
| PLEOS source audit and assumptions | `docs/source-audit.md`, `docs/implementation-assumptions.md` |
| Angle families and approved subsets | `src/axis/angles.ts`, `src/axis/presets.ts` |
| 20 × 20 grid/anchor conversion | `src/axis/grid.ts` |
| Frame intersection and sector topology | `src/axis/frame.ts`, `src/axis/AxisGraph.ts` |
| Active legacy baseline | `src/crystal/*`, guarded by `?renderer=legacy` during migration |
| Reference assets | local, opt-in debug comparison only; never production texture/composite |

### Migrate as data/behavior, not Three.js objects

| Item | Migration action |
|---|---|
| Six-ray cube bases | Keep as one reviewed closed-solid preset; rebuild as raw indexed geometry and validate manifold/winding |
| Fold/per-ray Z values | Store in versioned raw geometry presets, not shader constants |
| Orthographic/perspective concepts | Reimplement matrices/orbit locally; restore orthographic default |
| Material values | Use as calibration starts for custom Matte/Prism uniform blocks; recalibrate in linear space |
| Light/card values | Use as starting studio calibration; evaluate cards analytically by direction and expose controls |
| ResizeObserver semantics | Retain container sizing while separating CSS, preview buffer, and export sizes |
| Dormant exporter semantics | Rebuild with custom FBO/readPixels/Y flip/PNG and GPU-limit handling |
| Existing state taxonomy | Reduce and reconnect to real raw geometry/uniform groups; keep versioned presets/compliance metadata |
| Disposal expectations | Reimplement in the raw resource manager and context-restoration path |

### Remove from final raw production after parity

| Item | Reason |
|---|---|
| Production `three` / `three/addons` imports | Explicit raw WebGL2 requirement |
| `WebGLRenderer`, scenes, cameras, meshes, lights, PMREM, render targets | Replace with owned GL resources/passes |
| `MeshPhysicalMaterial` dispersion/iridescence | Required optics must be explicit and inspectable |
| `RoundedBoxGeometry` / `mergeVertices` | Replace with explicit folded-surface and closed-solid VAO/VBO/EBO plus controllable bevel |
| `OrbitControls` | Replace with local pointer/orbit implementation |
| Duplicate translucent boundary mesh | Replace with backface position/depth pass |
| Canvas2D gradient backdrop as optical structure | Replace with analytic environment/cards; never use JPG/PDF texture |
| `preserveDrawingBuffer: true` and canvas export | Replace with offscreen export target |
| Unconditional RAF | Use dirty render-on-demand; continuous only for active motion |
| Floating UI over canvas | Move controls to external toolbar/panels/status shell |
| Generic crystal/effect experiments | Archive or explicit Experimental route; never replace Axis geometry |

“Remove” means only after legacy/raw comparison, projection parity, Matte/Prism verification, export verification, and raw-default cutover. Do not delete legacy source at migration start.

## 14. Parity gates before Three.js removal

1. Raw consumes the existing Axis definition and reproduces center, rays, frame intersections, crop, and orthographic silhouette.
2. Folded Matte and closed Prism share one skeleton but use separate validated meshes.
3. Closed Prism has no open boundary, reversed winding, center crack, or missing side wall; bevel stays within projection tolerance.
4. `?renderer=legacy` remains while `?renderer=raw` is calibrated.
5. Capability/status output reports actual WebGL2/extensions and the RGBA16F/RGBA8 decision.
6. Matte lighting, Prism backface/frontface, HDR composite, tone map, dither/AA, and export are independently inspectable.
7. Remove Three imports from production only after raw acceptance and explicit legacy archival/removal.

## 15. Verification results

Executed from `new-axis-procedural` on 2026-08-21:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS; no diagnostics |
| `npm run build` | PASS; Vite 7.3.6, 15 modules, 699 ms reported |
| Build warning | JS chunk 770.36 kB minified / 235.25 kB gzip (>500 kB) |
| Lint | NOT AVAILABLE; no `lint` script (`npm pkg get scripts.lint` returned `{}`) |
| Browser console | PASS; zero error/warning entries at baseline |

No runtime source, package manifest, or existing artifact was intentionally modified by this audit. The existing build command refreshed normal generated build output (`dist/` and TypeScript build metadata).

## 16. Git-status caveat

The Git top level is the parent `ae-mcp-student` workspace. At audit start, all of `new-axis-procedural/` appeared untracked (`?? ./` from inside it), while the parent already had unrelated modified, deleted, and untracked paths. Therefore:

- Git cannot provide a file-level clean/dirty baseline for this app.
- Existing files and artifacts must be treated as user-owned.
- No `reset`, `checkout`, `clean`, `revert`, or deletion is safe.
- Migration must maintain its own touched-file list and never treat the untracked app as disposable.
