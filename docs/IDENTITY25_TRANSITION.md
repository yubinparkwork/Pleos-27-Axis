# 25엑시스 → Dimension Lighting

## Usage

The version dropdown includes **25엑시스 — 빛 새김 전환 (최신)** and **25엑시스 — 라이팅 형성 (새김 직전)** as independently runnable local snapshots. The immediate predecessor retains the final easing and 4–5 second hold fix, but uses the pre-engraving light-formation shader. Both catalog entries explicitly open `?sequence=pleos25`; returning to the current work preserves this sequence route. Browser settings remain isolated per version, and named user settings stay separate. These local snapshots are not automatically backed up or published to GitHub.

Open `/?sequence=pleos25` for the sequence. On its first visit it clones this browser's current Optical Studio settings into an isolated namespace, with horizontal pan centered at zero. Existing `/` settings and named versions are not overwritten. Later visits restore the sequence's own edited settings, including any manual camera repositioning.

The first version had a pan-dependent drift during the dissolve. Old sequence settings without `identityCenterVersion: 2` are backed up verbatim to `pleos-optical-studio-v1:identity25:before-centered-light-v2`, then centered once. Only `panX` and the migration version change. A failed backup leaves the saved state untouched. Root camera settings never migrate.

The existing inspector's **25엑시스 → 디멘션** section controls:

- **전환 사용**: 0 = unchanged dimension loop, 1 = repeating identity-to-dimension sequence.
- **25엑시스 구간**: screen time assigned to the reference's opening 5.3 seconds. Default 5.3 s.
- **빛 전환 시간**: time in which reflection light develops on those faces. Default 3 s. The stored key `identityDissolve` remains compatible with existing saves.
- The existing timeline controls play, pause and seeking. Playback repeats from zero at its endpoint until explicitly paused; the fractional frame overshoot is retained. Pause holds the exact current time, and resume continues from it. Saved pause/play state is respected on reload. Seeking and PNG capture still support the exact final time without wrapping. Default sequence duration is 15 s. In the original engraving variant without stagger, short durations proportionally compress the transition intervals.

## Axis-first layer appearance

Open `/?sequence=pleos25&transition=layered&from=saved-20260915065311136` for the saved **라이팅 형성 (새김 직전)** expression with sequential layer appearance. The first visit copies that archive's browser settings read-only into `pleos-optical-studio-v1:identity25:layered`; camera, optics, counts, spacing and lighting are preserved. The prior engraving sequence and all immutable archives retain their own settings. `from` is only used when initializing this new namespace, not on later visits.

**등장 스태거 (초)** controls the delay between starts, default **1 second**, range 0–5 seconds. Zero reveals every layer together. Layer order is tied to the shared Axis, not the screen camera: order 0 touches the Axis boundary, subsequent inset reflection contours recede from it. For layer order `i`, appearance starts at `identityHold + i × identityLayerStagger`, with a smooth `min(0.8, identityDissolve)` second fade. This gate remains active after the gray carrier is gone and uses absolute time during seeking, playback and PNG export. No contour is moved or bent.

The existing **층별 시차** and **영역별 타이밍** controls still affect the ongoing brightness loops, not this one-shot appearance delay. The total duration automatically extends to include the final layer and gray transition (up to 300 seconds), never compressing the requested stagger. A longer duration also lengthens the existing duration-based lighting loop. Disabling the transition leaves the regular dimension loop unchanged.

`IdentityLayerTiming.ts` is the inspectable timing contract; the renderer uploads it to the same shader used by preview and output. `identityEngraving: 0` selects the preserved light-formation style for this new scene. Missing values default to `identityEngraving: 1, identityLayerStagger: 0`, preserving old engraving saves.

Test: `npm run verify:identity-layer-stagger`. Artifacts are in `artifacts/identity-layer-stagger/`. The test covers actual rendered future-layer exclusion, frame determinism, default 1-second timing, three arms, zero delay, 50-layer duration extension, numeric/keyboard persistence, narrow UI and original storage preservation.

Save this variant with `node scripts/save-site-version.mjs --sequence pleos25 --transition layered "이름"`; the dropdown and return-to-current action retain its route. Local executable snapshots do not include personal browser settings or automatically publish to GitHub.

## Reference and construction

Reference: [Pleos25 website](https://pleos.ai/pleos25/), background `img/videos/main_kv_video.mp4` (1920×1080, 30 fps, 9.333 s).

The original media is used for offline observation only and is not shipped or used as a texture. The first 5.3 seconds are reconstructed with three continuously rotating analytic axes, six neutral grayscale planes, cubic angular/radial lighting and line reveal ranges. `identity25-keyframes.json` stores only 90 low-dimensional numeric parameter keys, not pixels. The fit approximates rather than exactly duplicates the source: fine grain, motion blur and some spatial gradients differ.

The grayscale graphic is called **25엑시스**. Its opening is preserved through source time 3.8 s. From there, a velocity-matched quintic handover carries the rotating planes into the camera axes, bypassing the reference's held 4.2–4.5 s pose as well as the former 5.3 s stop/restart. Neutral lighting retains its own source clock and slows from source time 4.8 s to its final lit parameters. With default timing, geometric settling ends at 7.25 s with zero velocity and acceleration; colored lighting still begins at 5.3 s and finishes at 8.3 s. Custom timing scales this handover proportionally. Fixed cyclic axis correspondence, center and final camera pose are unchanged. The dimensional material is evaluated in piecewise affine face coordinates, so both responses follow the same folds throughout the settling motion. Linear mappings preserve straight contours; there is no polar warp or curved-light deformation.

All requested layers already exist at their final positions. During the handover, those same optical contours first form narrow light engravings on the gray faces. A shallow dark relief makes the incisions legible while the carrier remains present. Light arrival has a small layer-depth and box-aligned travel offset, so it follows the cubical folds from the Axis rather than a circular screen wipe. The narrow lobes then open into the existing soft dimension gradients. After a delay, gray carrier removal grows outward from the engraved contours, leaving the reflected light behind. A late residual closure handles gray pixels without a dimension carrier, such as gaps or zero-layer regions. Engraving temporarily keeps authored layers visible, then restores their normal motion envelopes before completion. Lighting power still comes from the existing environment, not a new emissive mesh. This is an art-directed shader/material reveal, not physical material destruction or two complete images crossfaded in post-processing.

The shared origin stays fixed throughout playback. `panX` is applied identically to both source and target at every time; moving it manually changes the entire sequence's composition, not the transition trajectory. At completion the existing dimension lighting, layer count, spacing and camera values are used without a transition modifier.

Both expressions use the same linear-HDR resolve, spatial supersampling and guarded PNG tiles. No new renderer dependency, brand geometry replacement or source video composite is introduced. Disabling the feature takes the ordinary dimension shader branch; final enabled and disabled frames are checked for identical pixels at matching camera settings.

The geometric handover also has a monotone slow–fast–slow time warp: its middle clock speed is 1.75×, versus approximately 0.53× in the early/late portions. Endpoint velocity and acceleration remain continuous with the previous handover. Lighting development uses quintic smootherstep for a gentler onset and finish; timing controls, source opening and the final dimension state are unchanged.

## Files and testing

- `Identity25.ts`: deterministic timing, key interpolation and fixed last-lit axis correspondence.
- `identity25.glsl`: procedural six-plane grayscale identity and straight face-coordinate transport.
- `OpticalRenderer.ts` / `optical.frag.glsl`: uniform upload, reflected-light power and neutral-to-specular material response.
- `OpticalState.ts`, `OpticalStudio.ts`, `OpticalPanel.ts`: compatible defaults, isolated sequence settings and existing inspector controls.
- `scripts/analyze-pleos25.mjs`: optional offline parameter analysis of a locally supplied source video; requires ffmpeg, not part of build/runtime.
- `npm run verify:identity-transition`: hardware Chrome verification of grayscale opening, angle continuity, constant pan at five phases, deterministic PNGs, exact endpoint, tile boundaries, old-camera backup, one-time migration, manual-pan persistence, settings isolation, keyboard input, narrow UI and repeat/pause/resume playback. Requires a local dev server (default 5173).
- `node scripts/verify-identity-engraving.mjs`: focused stage captures and transition checks in a disposable browser context; outputs under `artifacts/identity-engraving/`.

The current Optical Studio still provides PNG export, not production MP4 export. A low-resolution verification movie from the capture script is a QA artifact, not a new export feature.
