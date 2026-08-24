# PLEOS 27 Axis Source Audit

## 1. Purpose and authority

This audit separates rules that are explicitly present in the supplied PLEOS documents from engineering choices proposed for the rebuilt web tool. It is a source contract for the rebuild, not a claim that every mapped module is already complete.

Sources reviewed in full:

- **G25** - `Pleos 25 Design Guidelines.pdf`, PDF pages 1-38.
- **K27** - `Pleos 27 Design Kickoff.pdf`, PDF pages 1-13.
- **IB** - the pasted implementation brief. IB is a user-authored delivery specification and interpretation layer; it is **not** evidence that a rule appears in either official PDF.

Page references below use the PDF file page index (`p.1` is the first page in the file). All PDF pages were raster-rendered and visually reviewed, with extracted text used only as a cross-check. The G25 cover says `Version 25.1`, while its closing page says `Version 25.2`; no further version inference is made here.

Source precedence for the rebuild:

1. G25 brand rules.
2. K27 extension strategy.
3. Existing application behavior only where it does not conflict with 1-2.
4. IB and new engineering hypotheses.

K27's `Expand` direction does not cancel G25 rules. A new feature that cannot satisfy G25 must be marked `Experimental - Review Required` or `Invalid`, rather than silently presented as brand-compliant.

### Status legend

| Build status | Meaning |
|---|---|
| `REQUIRED` | Must be implemented in the new build before brand-final export. |
| `REFERENCE_VALIDATION` | Source is verified, but a visual/vector calibration pass is still required. |
| `LAYOUT_PREVIEW_ONLY` | Applies to the optional composition preview, not the raw 3D KV render. |
| `STRATEGY` | Directs exploration and product structure; it is not a numeric rendering constraint. |
| `OUT_OF_SCOPE_FOR_RAW_KV` | Retained as a system rule but excluded from the text-free raw key visual. |

## 2. Pleos 27 strategic direction

| ID | Official rule or direction | Source | Target implementation | Build status |
|---|---|---|---|---|
| K27-01 | Current brand and conference awareness and design-system maturity are low; large changes risk identity confusion and increased learning cost. Identity reinforcement and recognition take priority over arbitrary variation. | K27 p.7 | `brand/brandRules.ts`, `compliance/ComplianceService.ts` | `STRATEGY` |
| K27-02 | Keep: Logo, Axis DNA, Typography, Core Color DNA (RGB), Layout Logic. | K27 p.8 | Immutable brand tokens and constraints across `brand/`, `axis/`, and `layout/` | `REQUIRED` |
| K27-03 | Expand: Material, Layer, Interaction, Motion. | K27 p.8 | Independent registries in `materials/`, `layers/`, `interaction/`, `motion/` | `STRATEGY` |
| K27-04 | Visual keywords include In Action/Motion, Touchable, Interactive, Arrow, Accuracy, Precision, Data Flywheel, Pleos Ecosystem, Grid, Array, Connection, Nodes, Loop, Circuit, Orbit, and Cycle. | K27 p.9 | `elements/ElementRegistry.ts`, `motion/MotionRegistry.ts`; every element must remain Axis-bound | `STRATEGY` |
| K27-05 | Proposals should be split across multiple levels of expression, including active/restrained and direct/indirect options; an appropriate level is preferred over excessive experimentation. | K27 p.10 | `state/expressionLevel.ts`, compliance limits per level | `REQUIRED` |
| K27-06 | Pleos 27 exploration must address interpretation of Color and Axis, physical reproduction of RGB, motion, venue-linked design using space/light/material, level-separated proposals, and references from other events. | K27 p.11 | Mode/preset taxonomy, media previews, physical-output warnings | `STRATEGY` |
| K27-07 | The baseline scope spans physical spaces, digital venue screens, print, merchandise, keynote/track/live/replay assets, and online/offline promotion; additional necessary applications may be proposed. | K27 p.12 | `layout/MediaPresetRegistry.ts`, crop/safe-area previews | `STRATEGY` |

## 3. Pleos 25 fixed brand system

### 3.1 Brand colors

The RGB/HEX values below are transcribed from G25 p.3. They are the only default design tokens for brand-final output.

| Token | RGB | HEX | Source |
|---|---:|---|---|
| Pleos Black | 0, 0, 0 | `#000000` | G25 p.3 |
| Pleos White | 255, 255, 255 | `#FFFFFF` | G25 p.3 |
| Pleos Dark Gray 1 | 38, 38, 38 | `#262626` | G25 p.3 |
| Pleos Dark Gray 2 | 77, 77, 77 | `#4D4D4D` | G25 p.3 |
| Pleos Dark Gray 3 | 153, 153, 153 | `#999999` | G25 p.3 |
| Pleos Light Gray 1 | 242, 242, 242 | `#F2F2F2` | G25 p.3 |
| Pleos Light Gray 2 | 229, 229, 229 | `#E5E5E5` | G25 p.3 |
| Pleos Light Gray 3 | 204, 204, 204 | `#CCCCCC` | G25 p.3 |
| Pleos Red 1 | 255, 205, 215 | `#FFCDD7` | G25 p.3 |
| Pleos Red 2 | 250, 41, 60 | `#FA293C` | G25 p.3 |
| Pleos Red 3 | 85, 17, 14 | `#55110E` | G25 p.3 |
| Pleos Green 1 | 180, 255, 210 | `#B4FFD2` | G25 p.3 |
| Pleos Green 2 | 10, 220, 145 | `#0ADC91` | G25 p.3 |
| Pleos Green 3 | 5, 60, 50 | `#053C32` | G25 p.3 |
| Pleos Blue 1 | 205, 220, 255 | `#CDDCFF` | G25 p.3 |
| Pleos Blue 2 | 70, 100, 255 | `#4664FF` | G25 p.3 |
| Pleos Blue 3 | 35, 80, 255 | `#2350FF` | G25 p.3 |
| Pleos Blue 4 | 15, 35, 90 | `#0F235A` | G25 p.3 |

| ID | Official rule | Source | Target implementation | Build status |
|---|---|---|---|---|
| G25-C01 | Pleos Blue 2 is limited to dark or black environments and must not be offered as an unrestricted solid-area background. | G25 p.3 | `brand/pleosColors.ts`, `brand/toneOnTone.ts`, color compliance | `REQUIRED` |
| G25-C02 | Grayscale usage follows the documented tone-on-tone combinations and priority order. | G25 pp.4-5 | `brand/toneOnTone.ts`, grayscale preset validator | `REQUIRED` |
| G25-C03 | RGB usage follows same-hue Red, Green, or Blue tone-on-tone combinations and the documented priority order. | G25 pp.6-7 | `brand/toneOnTone.ts`, material/background validator | `REQUIRED` |
| G25-C04 | Do not mix unrelated hue families, use unspecified gradients/effects, reduce logo/type legibility, or introduce colors outside the palette. | G25 p.8 | `brand/ColorCompliance.ts`, export blocker in Brand Final | `REQUIRED` |

PBR lighting may create luminance variation inside a selected color family. Permission for cross-hue reflections, iridescence, dispersion, colored lights, or cinematic tone mapping is **not** stated in G25; those are implementation assumptions and require an experimental label.

### 3.2 Typography and composition

| ID | Official rule | Source | Target implementation | Build status |
|---|---|---|---|---|
| G25-T01 | English brand typeface: Denim INK Wide. Korean brand typeface: Hyundai Sans Text Pro. | G25 p.9 | `layout/TypographyPreview.ts`; use only when licensed font assets are available | `OUT_OF_SCOPE_FOR_RAW_KV` |
| G25-T02 | Type hierarchy and color usage follow the documented title/subtitle/body rules and legibility constraints. | G25 pp.10-11 | Optional layout-preview validators | `LAYOUT_PREVIEW_ONLY` |
| G25-L01 | The design structure combines Brand Mark, optional Graphic Motif, and Background under separate rules. | G25 p.12 | Separate raw KV renderer from optional layout preview | `REQUIRED` |
| G25-L02 | Margin and logo sizing begin from the logo-height relationship; logo/DCH placement determines the content area. | G25 pp.13-19 | `layout/CompositionRuleService.ts` | `LAYOUT_PREVIEW_ONLY` |
| G25-L03 | Logo is principally at upper-left or lower-left; DCH/HMG placement and content-area relationships follow the illustrated layouts. | G25 pp.14-20 | Composition presets and safe-area overlays | `LAYOUT_PREVIEW_ONLY` |

The raw 3D KV must remain text- and logo-free. The system must not synthesize a logo with plain text when an approved asset is unavailable.

## 4. New Axis rules

### 4.1 Type A - Line

| ID | Official rule | Source | Target implementation | Build status |
|---|---|---|---|---|
| G25-A01 | New Axis expresses tension created by contrasting straight lines and spatial depth created by their intersections, positioning Pleos as the central axis of a new mobility ecosystem. | G25 p.21 | `axis/AxisDefinition.ts`, semantic comments and compliance rationale | `REQUIRED` |
| G25-A02 | For static use, the line type maintains one of two angle systems: 30 degrees or 45 degrees. | G25 pp.22-23 | `axis/AxisConstraintService.ts`, angle quantization and validation | `REQUIRED` |
| G25-A03 | The motif may be scaled and rotated, and strokes may be added or removed, while preserving the selected angle system. | G25 pp.24, 26 | `axis/AxisPresetRegistry.ts`; approved Basic/Variation presets only | `REFERENCE_VALIDATION` |
| G25-A04 | Default display line width is 1 px at 1920 x 1080. Default offline line width is 1 pt at approximately A3-A5, adjustable for application size. | G25 pp.24-27 | Screen-space ribbon/strip sizing; output-scale function | `REQUIRED` |
| G25-A05 | Axis location may change with layout conditions while remaining aligned to the grid. Illustrated locations include Center/Center Right, Left, Up, and Down. | G25 pp.25, 27 | `axis/GridAnchorService.ts`, named anchor presets | `REQUIRED` |
| G25-A06 | Divide every format into a 20 x 20 motif grid and place the motif origin at a horizontal/vertical grid intersection. | G25 p.28 | integer grid coordinates `0...20` in `GridAnchorService` | `REQUIRED` |
| G25-A07 | Application order: place required logo/content with the basic grid, resize/locate New Axis with the motif grid without overlap, then combine. | G25 p.29 | layout preview workflow and overlap warnings | `LAYOUT_PREVIEW_ONLY` |
| G25-A08 | Tone-on-tone color may be used inside the content area where needed. | G25 p.30 | composition preset validation | `LAYOUT_PREVIEW_ONLY` |

The text on pp.24 and 26 authorizes the illustrated form variations, but it does not enumerate their ray arrays numerically. Their exact active-ray lists must be digitized from the diagrams. An arbitrary combination that merely belongs to the same mathematical angle family is not automatically an approved variation.

### 4.2 Type B - 3D

| ID | Official rule | Source | Target implementation | Build status |
|---|---|---|---|---|
| G25-B01 | Type B New Axis 3D is for consistent visual communication and can use cuts derived from motion as backgrounds or content elements. | G25 p.31 | one scene/motion system with saved cut bookmarks | `REQUIRED` |
| G25-B02 | Five static cuts are provided. They are cuts derived from motion, not described as five unrelated models. | G25 p.32 | `motion/Timeline.ts`, `state/StaticCutBookmark.ts` | `REFERENCE_VALIDATION` |
| G25-B03 | When cropping, the left side of the axis should contain a dark region or a broad plane so attention can remain on left-positioned headline copy. | G25 p.32 | `layout/CropCompliance.ts`, headline-left crop presets | `REFERENCE_VALIDATION` |
| G25-B04 | Every 3D cut may use five color variants: Black, Pleos Red, Pleos Blue, Pleos Green, Pleos Gray. | G25 p.33 | `materials/MaterialPresetRegistry.ts`, token-bound color families | `REQUIRED` |
| G25-B05 | Type B can be used either in a content area or full-screen. | G25 pp.34-36 | composition/media presets | `LAYOUT_PREVIEW_ONLY` |
| G25-B06 | Do not place another image on top of a 3D cut. | G25 p.37 | layer/content-image prohibition in Brand Final | `REQUIRED` |
| G25-B07 | With a colored cut, the background is restricted to the same hue family, white, or black. | G25 p.37 | background/material compliance | `REQUIRED` |
| G25-B08 | Do not overlap the visually complex part of a cut with primary content. | G25 p.37 | edge-density/crease safe-area warning | `LAYOUT_PREVIEW_ONLY` |

## 5. Source-confirmed constraints versus strategy

| Category | Fixed by G25 | Expanded by K27 | Not specified by either PDF |
|---|---|---|---|
| Axis | Straight-line intersection concept, 30/45-degree static families, approved visual variations, 20 x 20 grid anchoring, line-width baseline | Axis interpretation may be extended, but Axis DNA remains in `Keep` | Exact normalized ray coordinates, exact 3D topology, Z depths |
| Color | Exact tokens, tone-on-tone use, Blue 2 restriction, Type B five color families, background restrictions | Core Color DNA remains in `Keep`; RGB physical translation is a 2027 task | PBR environment, tone mapper, exposure, reflection color limits in numeric form |
| 3D | Type B purpose, five motion-derived cuts, crop and content rules | Material and Layer are explicit expansion areas | Camera, FOV, face slopes, normals, bevel, thickness, light positions, material values |
| Motion/interaction | Cuts may be derived from motion | Motion and Interaction are explicit expansion areas; several visual keywords suggest directions | Timing, easing, duration, input mapping, motion amplitudes |
| Media/layout | Content-area/full-screen use and layout logic | Physical, digital, print, keynote, live, promotional scope | Exact crop values and output resolution for each 2027 medium |
| Technology | None | None | Three.js/WebGPU/WebGL, PBR class, half-float targets, TAA, EXR, UI architecture |

## 6. Reference asset policy

- Both PDFs are **reference-only inputs**.
- The original PDFs, extracted page images, crops, fonts, logos, and embedded assets must not be copied into `public/`, bundled by Vite, uploaded to an external server, or used as final textures.
- Temporary raster pages may be generated locally for measurement and visual comparison, then kept outside the production graph.
- If debug comparison is needed, it must be a local, opt-in development path that fails closed when the reference is absent.
- Production rendering must be generated from Axis geometry, materials, lighting, and procedural/data modules.

## 7. Audit gates for the rebuilt application

| Gate | Evidence required | Related source |
|---|---|---|
| Axis family | Unit tests reject non-30/45-family rays in Brand Final | G25 pp.22-27 |
| Approved variation | Preset ray list matches a vector trace of Basic/Variation diagrams | G25 pp.24, 26 |
| Grid anchor | Origin serializes as an integer intersection on a 20 x 20 grid | G25 p.28 |
| Color compliance | Tokens and tone-on-tone/background rules pass; Blue 2 restriction enforced | G25 pp.3-8, 33, 37 |
| Static cuts | Cut 01-05 match the supplied visual references without using them as production textures | G25 p.32 |
| Composition | Content-area/full-screen rules and complex-region/headline warnings work in preview | G25 pp.32, 34-37 |
| Keep/Expand | Axis, color, type, and layout remain constrained while material/layer/interaction/motion are modular | K27 p.8 |
| Expression levels | At least restrained and active/direct and indirect options are reviewable | K27 p.10 |
