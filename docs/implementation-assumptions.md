# PLEOS 27 Axis Implementation Assumptions

## 1. What this document is

This file records decisions required to turn the official 2D brand rules and 2027 direction into a working 3D application. Every item below is an engineering hypothesis or delivery requirement unless it explicitly points back to a source-audit rule.

The authoritative distinction is:

- **Official rule**: stated or shown in G25/K27 and recorded in `source-audit.md`.
- **Implementation assumption**: a chosen method for satisfying an official rule where the PDFs provide no numeric or technical answer.
- **Experimental option**: a valid exploration that needs explicit review and must not be exported as Brand Final when it violates a compliance gate.

The pasted implementation brief is treated as the requested product specification. It does not convert its technical recommendations into official PLEOS brand rules.

## 2. Missing values in the source documents

Neither PDF supplies the following production values:

- Original 3D model or editable motion source.
- Vertex positions, Z depth, per-ray depth, face inclination, face normals, bevel, or physical thickness.
- Camera position, target, field of view, orthographic frustum, lens behavior, or clipping planes.
- Light position, size, intensity, environment map, exposure, shadow settings, or tone mapper.
- Roughness, metalness, anisotropy, clearcoat, transmission, IOR, attenuation, or texture scale.
- Motion timing, easing, duration, loop seam, interaction mapping, or motion-blur settings.
- Exact normalized crop values for Cut 01-05 or for 2027 media.
- Browser renderer, framework, shader language, export format, supersampling, or EXR pipeline.

Values introduced for those fields must be stored as presets and identified as calibrated implementation data, never as guideline values.

## 3. Assumption register

| ID | Implementation assumption | Reason / source relationship | Target module | Validation | Status |
|---|---|---|---|---|---|
| IA-01 | Build one immutable `AxisDefinition` core and attach geometry, material, layer, motion, and interaction modules to it. | Direct architectural interpretation of K27-02/03. | `axis/AxisDefinition.ts`, module registries | Disable modules and confirm the same Axis identity remains. | `ACCEPTED_BASELINE` |
| IA-02 | Treat the reference state as a real folded surface built with `THREE.BufferGeometry` and flat face normals, not a fullscreen shader or transformed image. | G25 shows a 3D result but does not prescribe technology; real geometry is a delivery requirement. | `geometry/FoldSurfaceBuilder.ts`, `renderer/Pleos3DRenderer.ts` | Perspective parallax, light-dependent normals, depth-buffer inspection. | `ACCEPTED_BASELINE` |
| IA-03 | Use a ray graph: intersect each ray with the reference frame, sort rays, construct sector polygons including intervening frame corners, then calculate each sector on a plane defined by center and adjacent ray endpoints. | Preserves the front-projected Axis while allowing true depth. | `axis/AxisGraph.ts`, `axis/frameIntersection.ts`, `geometry/SectorPolygonBuilder.ts` | No center crack, continuous shared creases, exact front projection. | `ACCEPTED_BASELINE` |
| IA-04 | Default to `strict-projection-lock`: lock center XY, endpoint XY, ray topology, and angle family; expose Z depth as the main fold variable. | Engineering interpretation of immutable Axis DNA and the need for motion-derived cuts. | `axis/AxisConstraintService.ts`, `motion/MotionEngine.ts` | Per-frame projection diff remains within the stated test tolerance. | `ACCEPTED_BASELINE` |
| IA-05 | Add `anchored-3d` exploration that may rotate the object/camera but never curves rays, creates another center, or edits the approved topology. Hero frames must be able to return to the reference projection. | Allows K27 Material/Layer/Interaction/Motion expansion without redefining Axis. | `camera/CameraController.ts`, motion constraints | Compliance warning outside reference view; deterministic return bookmark. | `EXPERIMENTAL_CAPABLE` |
| IA-06 | Represent mathematical direction families as candidates `30deg = [-90,-30,30,90,150,210]` and `45deg = [-135,-90,-45,0,45,90,135,180]`, with coordinate conversion isolated in one utility. | The PDFs name angle systems but do not enumerate signed directions. This normalization comes from the implementation brief and must be checked against G25 diagrams. | `axis/angleFamilies.ts` | Vector trace against G25 pp.22, 24, 26; tests cover screen-Y inversion. | `PENDING_VECTOR_TRACE` |
| IA-07 | Register only the Basic Form and Variation combinations visibly approved on G25 pp.24 and 26. Do not generate arbitrary ray subsets from the family lists. | G25 permits adding/removing strokes but presents specific forms; a conservative Brand Final registry avoids overclaiming approval. | `axis/AxisPresetRegistry.ts` | Overlay every preset on a local page render/vector trace. | `PENDING_VECTOR_TRACE` |
| IA-08 | Store anchors as integer coordinates from 0 through 20 on each axis and derive normalized coordinates by division by 20. | Direct implementation of G25-A06. | `axis/GridAnchorService.ts` | Serialization/unit tests reject non-intersections. | `REQUIRED` |
| IA-09 | Scale the 1 px display reference as `outputWidth / 1920`; render it with a screen-space strip/ribbon rather than relying on platform `lineWidth`. | Practical resolution-independent implementation of G25-A04. | `renderer/AxisGuideRenderer.ts` | Pixel inspection at 1920, 2800, and 3840 widths. | `REQUIRED` |
| IA-10 | Use a front-facing orthographic camera for the reference view. Perspective cameras are exploration-only. | The PDFs do not specify a camera. Orthographic projection is the simplest way to preserve G25 angles and grid placement under Z changes. | `camera/cameraPresets.ts` | Front render matches Type A projection independent of ray Z. | `ACCEPTED_BASELINE` |
| IA-11 | Model Cut 01-05 as bookmarks on one scene/timeline, each storing time, fold, camera, lighting, and crop state. | G25-B01/02 describes cuts derived from motion; exact values are absent. | `state/StaticCutBookmark.ts`, `motion/Timeline.ts` | Local overlay against G25 p.32; same scene identity for all cuts. | `PENDING_VISUAL_CALIBRATION` |
| IA-12 | Calibrate Cut 01-05 in this order: center, ray projection, plane area/direction, dark-plane placement, face luminance, soft shadow, crop, total composition. | Engineering QA order derived from the brief, not a documented brand sequence. | Visual-regression scripts and debug comparison | Store metrics and calibrated parameters separately from official tokens. | `PENDING_VISUAL_CALIBRATION` |
| IA-13 | Separate `Raw 3D KV` from `Layout Preview`. Raw output contains no logo or typography; the preview may show grids, safe areas, and approved assets only. | Satisfies the user's text-free engine requirement while retaining G25 layout rules. | `renderer/Pleos3DRenderer.ts`, `layout/LayoutPreviewRenderer.ts` | Raw export inspection contains no DOM/text/logo layer. | `REQUIRED` |
| IA-14 | Use a physical-material abstraction (initially Three.js PBR) for matte, metal, polymer, glass/acrylic, coating, and paper explorations. | K27 permits Material expansion; the PDFs specify no PBR model or numeric material values. | `materials/PleosMaterialFactory.ts`, preset registry | Same geometry/camera under controlled neutral lighting; compliance per preset. | `IMPLEMENTATION_CHOICE` |
| IA-15 | In Brand Final, use neutral white or same-hue lighting/environment, fixed exposure, and palette-token base colors. Put iridescence, dispersion, cross-hue reflection, and colored lights behind Experimental review. | Conservative engineering interpretation of G25-C03/04 and G25-B07. | `lighting/EnvironmentManager.ts`, `materials/MaterialCompliance.ts` | Rendered hue-distance test and compliance status. | `REQUIRED` |
| IA-16 | Build three expression levels: restrained, balanced, active, plus direct/indirect metadata. Level changes adjust depth, camera range, motion, layers, elements, material complexity, and post intensity rather than applying one global multiplier. | K27 p.10 requests multiple strengths/directions but gives no count or numeric thresholds. | `state/expressionLevel.ts`, preset registry | Visual review shows distinct options while Axis tests still pass. | `IMPLEMENTATION_CHOICE` |
| IA-17 | Bind grids, nodes, connections, circuits, arrows, loops, orbits, arrays, cycles, and data-flywheel elements to the Axis center, rays, faces, or grid. Do not use generic decorative particles as the default. | Turns K27 p.9 keywords into a coherent Axis-dependent system. | `elements/ElementRegistry.ts` | Every element serializes an axis/face/grid binding. | `IMPLEMENTATION_CHOICE` |
| IA-18 | Prefer WebGPU when stable in the installed Three.js version and provide a WebGL 2 path for core geometry, materials, motion, upload, PNG export, and compliance. | Technology is absent from the PDFs; this is a delivery architecture proposed by IB. | renderer adapter/backend capability layer | Capability test in WebGPU-off environment; no fake UI controls. | `CAPABILITY_DEPENDENT` |
| IA-19 | Use linear working calculations, sRGB presentation, and role-correct texture color spaces. Treat half-float intermediate buffers, accumulation, tiled export, and EXR as quality features, not brand rules. | Engineering choice for reliable PBR and high-resolution masters. | `renderer/RenderQualityManager.ts`, `export/` | Color-chart tests, exact dimensions, no tile seams, readable EXR metadata. | `CAPABILITY_DEPENDENT` |
| IA-20 | Uploaded texture data remains local; URLs, GPU textures, render targets, and caches are explicitly disposed. Binary uploads are not automatically placed in localStorage. | Delivery privacy/resource rule from IB, not a PDF rule. | `textures/TextureUploader.ts`, `textures/TextureManager.ts` | Network inspection shows no upload; lifecycle/resource tests pass. | `REQUIRED` |
| IA-21 | Brand Final export is blocked on compliance `fail`; Experimental export may proceed with warnings embedded in JSON metadata. | Practical enforcement of source priority and K27 level-based exploration. | `compliance/ComplianceService.ts`, export adapters | Automated pass/warn/fail scenarios. | `REQUIRED` |
| IA-22 | Treat the G25 cover/closing-page version mismatch as unresolved and record source page numbers in all calibration metadata. | Prevents silently choosing 25.1 or 25.2 as a newer authoritative edition. | metadata/source manifest | Metadata test includes filename, PDF page, and audit version. | `REQUIRED` |
| IA-23 | Interpret each visible Axis ray as the exact shared hard edge of two closed sector cells. Extrude cells behind the projection plane without moving their shared XY vertices; keep the former sheet renderer only as a comparison mode. | The PDFs define Axis projection and angle families but do not prescribe solid topology. This implements the requested cube/hexahedron junction while preserving the official 2D DNA. | `geometry/SolidAxisCellBuilder.ts`, `state.structure` | Guides off: front projection retains approved rays; perspective view exposes closed side walls and body depth; adjacent cells share bit-identical ray vertices. | `IMPLEMENTATION_CHOICE` |
| IA-24 | For the full 30° six-ray form, construct two true equal-edge cubes that touch only at the Axis origin. Use orthogonal 3D basis vectors whose front projections are left `[90,150,210]°` and right `[-90,30,-30]°`; use closed sector cells for reduced ray subsets. | Direct implementation of the requested left/right cube-corner junction. The PDFs approve the 30° rays but do not define this solid construction. | `geometry/CornerCubeAssemblyBuilder.ts` | Automated test checks two cubes, eight unique vertices each, 12 triangles each, equal edge lengths, pairwise orthogonality, shared origin, and exact six projected angles. | `IMPLEMENTATION_CHOICE` |

## 4. Target module and state map

This table is the implementation contract at rebuild start. `Planned` does not claim the corresponding file already exists.

| Area | Primary responsibility | Required state | Initial status |
|---|---|---|---|
| `brand/` | Exact PLEOS tokens, tone-on-tone matrices, Blue 2 restriction, color compliance | selected family, background token, export mode | `Planned` |
| `axis/` | Axis family, approved variation, center, rays, frame intersections, grid anchor | family, preset ID, integer grid X/Y, line reference | `Planned` |
| `geometry/` | Sector polygons, planar folds, shared creases, optional real bevel/solid | center Z, ray-depth map, crease/thickness settings | `Planned` |
| `camera/` | Reference orthographic lock and perspective exploration | mode, position, target, FOV/zoom, lock | `Planned` |
| `materials/` | PBR creation and independent material presets | token color, physical parameters, compliance class | `Planned` |
| `textures/` | Procedural/uploaded/data textures and projection | source, slot, color space, projection, transform, seed | `Planned` |
| `lighting/` | Neutral/same-hue lighting and environments | key/fill/rim/environment/background | `Planned` |
| `layers/` | Axis-inheriting surface/layer stacks | type, count, spacing, offsets, material, bindings | `Planned` |
| `elements/` | Axis-bound grid/node/connection/circuit/orbit/data elements | type, ray/face/grid binding, density, seed, color token | `Planned` |
| `motion/` | Registry, deterministic timeline, projection-safe modules, cut bookmarks | fixed time, modules, easing, loop, seed, bookmarks | `Planned` |
| `interaction/` | Bounded pointer/scroll/touch/data mappings with deterministic rest | mapping enablement, limits, reduced-motion state | `Planned` |
| `layout/` | Optional logo/content grids, safe areas, crop/media previews | media preset, content mode, safe areas, asset refs | `Planned` |
| `compliance/` | Axis/color/composition/motion checks and export policy | pass/warning/fail with rule IDs | `Planned` |
| `renderer/` | Raw 3D, optional layout preview, comparison, backend/quality | renderer mode, quality, backend, compare state | `Planned` |
| `export/` | Deterministic still/motion output and metadata | dimensions, samples, format, timestep, warnings | `Planned` |
| `state/` | Versioned presets, undo/redo, A-D variations, locked bases | all independent subsystem states and seed | `Planned` |

## 5. Compliance classification

| Class | Meaning | Export behavior |
|---|---|---|
| `Brand Compliant` | Satisfies all source-audit constraints and uses reviewed assumptions. | Allowed in Brand Final and Experimental. |
| `Experimental - Review Required` | Preserves Axis topology but uses an unapproved material, camera, reflection, post effect, or expression range. | Experimental only, with metadata warnings. |
| `Invalid` | Breaks the angle family, approved topology, single center, 20 x 20 anchor logic, palette/tone rule, or content prohibitions. | Blocked. |

No technical choice can reclassify an `Invalid` result as compliant simply because it looks similar to a reference image.

## 6. Calibration data policy

The following values may be measured or fitted during implementation, but must live in versioned calibration presets rather than source-rule constants:

- Cut 01-05 fold depth, camera, lighting, crop, and luminance parameters.
- Material roughness/metalness/transmission/anisotropy values.
- Shadow softness and environment intensity.
- Motion durations, easing curves, amplitudes, and interaction bounds.
- Media-specific crop and safe-area values not explicitly dimensioned by G25.

Every calibrated value should include:

- `sourceDocument`
- `sourcePage`
- `calibrationVersion`
- `assumptionId`
- `reviewStatus`
- visual-regression artifact path or metric

## 7. Reference and production boundary

- The PDFs and rasterized pages are not application assets.
- Do not place them in the production public directory, bundle graph, shader textures, environment maps, material textures, or final compositing path.
- Do not upload them to remote services.
- Local debug overlays may reference a developer-supplied file only when an explicit debug flag is enabled.
- A missing reference must disable comparison cleanly; it must never change the procedural output.
- Production output is generated solely from code-owned geometry, brand tokens, materials, lights, layers, motion, interaction, and data.
