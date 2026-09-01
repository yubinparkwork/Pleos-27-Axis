# PLEOS 27 Axis — Multi-Mode Creative Studio

Production Modes include `Glass 3D` (Three.js optical solids and supported path-traced stills), `Light Field` (raw WebGL2 continuous spectral field), `Glass Prism` (raw WebGL2 thickness-aware RGB refraction), `Kinetic Glass` (Three.js physical glass with Rapier rigid-body interaction), `Axis Trails` (cursor-following 30° signal lines), and `Formation Loop` (three PLEOS forms rebuilt as a nonuniform HDR light network with Svelte controls, GSAP motion, WebGL shaders, instanced ghost fragments, and BVH interaction). Each preserves the canonical three-part Axis identity and shares the Shell-owned artboard, Variation, motion transport, and export entry point.

하나의 PLEOS Axis Identity를 공유하면서 레퍼런스에 맞는 독립적인 제작 환경을 선택할 수 있는 Mode 기반 제작 도구입니다. 첫 production Mode인 `Glass 3D`는 Three.js와 `three-gpu-pathtracer`를 사용하며, 세 optical solid가 하나의 공유 꼭짓점에서 만나는 30° 구조, 결정론적 모션, virtual artboard와 고품질 렌더를 유지합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

```bash
npm run typecheck
npm run verify
npm run verify:motion
npm run verify:light-field
npm run verify:glass-prism
npm run verify:kinetic-glass
npm run verify:axis-habitat
npm run verify:axis-habitat-runtime
npm run build
npm run qa
```

## Mode Studio

The common top bar is owned by `StudioShell`: Mode, Variation, primary Export, Inspector collapse and motion transport remain stable while renderers switch. `Light Field` owns one WebGL2 canvas, its own Inspector and Iridescent Pulse / Violet Membrane / Spectral White presets; it does not instantiate Three.js or the path tracer. Its world-space membrane field keeps warped spectral bands continuous across rounded cube faces. Mode-specific state is persisted in separate namespaces while the artboard remains shared.

Light Field verification and evidence:

```bash
npm run verify:light-field
npm run capture:light-field
npm run render:light-field -- --preset iridescent-pulse --width 1080 --height 1350
```

Glass Prism verification and evidence:

```bash
npm run verify:glass-prism
npm run capture:glass-prism
npm run render:glass-prism -- --preset rgb-prism --width 1080 --height 1350
```

상단의 `Mode`가 렌더링 환경을 결정합니다. 각 Mode는 별도 renderer·Inspector·Export adapter를 소유합니다. Glass Prism은 기존 3개 큐브와 공유 꼭지점을 유지하며 배경을 큐브 실루엣 안에서만 굴절합니다. Kinetic Glass는 같은 3큐브 구조를 Rapier 물리 바디로 만들고, 커서가 밀어낸 큐브를 승인된 30° 축의 원래 위치로 복귀시킵니다. Formation Loop는 정확히 같은 PLEOS 기저와 공유 원점을 유지하되, 총 375개의 셀은 투명한 부피 힌트와 분해 모션에만 사용합니다. 형태의 주역은 큐브 내부의 불규칙한 부분 경계선·직선·대각선·삼각 연결·외곽 확장선을 white-hot core, spectral glow, outer halo의 3겹으로 렌더한 HDR 빛 골격입니다. 선 드로잉·재질 형성·클러스터 분해·관계선·재결합을 반복하며, Motion Inspector에서 전체 길이·배속·조각 순서·이징과 14개 단계 타이밍, 12개 조각 다이내믹스를 조절합니다. Visual Inspector에서는 구조 밀도, 길이·삼각 선 확률, 규칙성, 깊이, 불규칙성, 필라멘트, 플레어, 선택 Bloom, 색수차, 비네트, 그레인을 나눠 조정합니다. HIGH의 multi-mip Bloom과 ULTRA의 추가 sharp/wide pass, SMAA, 정확한 PNG의 4× MSAA를 지원합니다. Svelte, Three.js, WebGL2, GSAP, `three-mesh-bvh`는 각각 Inspector, 렌더, 셰이더, 타임라인, 정적 솔리드 상호작용에 실제로 사용됩니다. 기본 프리셋은 Frosted Formation, Obsidian Signal, Blue Archive입니다. 세부 리서치와 근거 매핑은 [`docs/axis-habitat-research.md`](docs/axis-habitat-research.md)에 기록됩니다.

우측 Inspector는 영구 탭 없이 `Style / Material / Lighting / Motion / Output`의 핵심값만 먼저 보여줍니다. 물리 재질, 개별 조명, Geometry, Camera, render region, PPI 같은 기술 옵션은 같은 패널의 contextual details에서 필요할 때만 엽니다. 자세한 구조는 [`docs/MODE_ARCHITECTURE.md`](docs/MODE_ARCHITECTURE.md)를 참고하세요.

SETUP의 `모델링 → 베벨 반경`에서 `0–0.15` 범위로 세 광학 육면체의 모서리를 조절합니다. 값 변경 시 폐쇄형 geometry를 재생성하고 실제 bevel 꼭지점을 원점에 재정렬하므로, `큐브 간격 0`에서는 베벨 값과 관계없이 세 모델이 정확히 맞닿습니다. 양수 간격은 베벨된 바운딩 중심이 아닌 승인된 화면 축 `90° / 210° / 330°`를 사용해 세 방향의 시각적 간격을 동일하게 유지합니다.

기본 카메라는 `Z = -12`에서 원점을 바라보며, 조명 프리셋과 studio rear plane도 같은 시점을 기준으로 배치됩니다. 이전 `+Z` 카메라 기준으로 저장된 lighting state는 로드 시 한 번만 `-Z` 메인 카메라 기준으로 자동 변환됩니다.

Motion preset:

- Spectral Axis Sweep — 중심 white pulse와 canonical 30° Axis 방향의 optical sweep
- Shared Vertex Pulse — 공유 꼭짓점을 원점에 고정한 미세 scale pulse
- Explode & Rejoin — radial 방향으로 분리된 후 정확한 rest pose로 복귀

모든 모션은 이전 프레임 값을 누적하지 않고 `time`, `duration`, `fps`, `seed`로 절대 평가합니다. fixed mode의 시간은 `frameIndex / fps`입니다.

키보드:

- `Space`: 재생/일시정지
- `← / →`: 1 frame 이동
- `Shift + ← / →`: 10 frame 이동
- `Home / End`: 첫/마지막 frame
- `R`: motion reset
- `Tab` 또는 `H`: Inspector 표시/숨김

입력 필드에 focus가 있을 때 shortcut은 실행되지 않습니다.

## Virtual Artboard

FORMAT에서 출력 구도를 viewport와 독립적으로 설정합니다.

- Square 1:1 — 1080 × 1080
- Instagram Portrait 4:5 — 1080 × 1350
- Portrait 3:4 — 1080 × 1440
- Landscape 16:9 — 1920 × 1080
- Vertical 9:16 — 1080 × 1920
- Custom

Inspector를 접거나 창 크기를 변경해도 출력 pixel dimension과 artboard framing은 유지됩니다. PPI는 화질 제어와 분리된 print metadata 값이며, 기존 Still Studio의 물리 크기 유지 출력은 별도 `PPI 기준 최종 렌더·저장` 버튼으로 남아 있습니다.

## Render와 Export

- 재생과 scrub: raster preview만 사용
- 빠른 렌더링: 16spp · 50% render scale · 4 bounce
- 고품질 렌더링: Advanced의 sample / render scale / bounce 사용
- Raster PNG: 현재 time의 artboard를 정확한 pixel dimension으로 출력
- High Quality PNG: 재생을 멈추고 현재 time을 path tracer에 한 번 동기화한 후 sample을 누적
- Path-traced MP4: `출력 → 렌더 → 유형: 영상 · MP4`에서 현재 모션의 0초부터 끝까지 모든 프레임을 고정 시간으로 평가하고, 설정한 sample / render scale / bounce로 누적·디노이즈한 뒤 브라우저에서 H.264 MP4로 저장. 진행률과 취소를 지원하며 최신 Chrome/Edge의 WebCodecs를 사용
- 부분 렌더링: Advanced에서 artboard pixel 기준 X / Y / W / H 설정, 가운데/전체 정렬, `px/mm/cm/in` 입력
- 인쇄용 PNG: `Output PPI / 단위 변환 기준 PPI` 비율로 부분 영역 pixel을 확장하고 PNG pHYs metadata 기록. 인쇄 출력은 설정된 미리보기 Render Scale과 무관하게 100% 네이티브 해상도, 최소 512 spp, 12 bounces, firefly 억제와 edge-aware denoise로 저장
- Motion sequence: Playwright 기반 fixed-timestep PNG sequence

브라우저 MP4 내보내기는 실시간 화면 녹화가 아닙니다. 각 프레임의 패스트레이싱이 끝난 다음 인코딩하므로 영상 길이와 FPS는 정확하지만, 512 spp 같은 고품질 설정은 프레임 수에 비례해 오래 걸립니다. 렌더링 중에는 탭을 닫거나 백그라운드 절전 상태로 두지 마세요.

부분 렌더링 입력에서는 `↑ / ↓`로 1px, `Shift + ↑ / ↓`로 10px씩 조절합니다. 예를 들어 단위 기준이 96ppi일 때 `50mm`는 189px로 변환됩니다.

```bash
npm run render:motion -- \
  --preset spectral-axis-sweep \
  --width 1080 \
  --height 1350 \
  --fps 30 \
  --duration 6 \
  --quality raster \
  --out artifacts/motion/spectral-axis-sweep-4x5 \
  --seed 27 \
  --strength 0.65
```

PNG sequence를 영상으로 변환하는 예:

```bash
ffmpeg -framerate 30 -i frame-%06d.png -c:v libx264 -pix_fmt yuv420p pleos-axis.mp4
```

`ffmpeg`는 프로젝트 dependency에 포함하지 않습니다.

## Browser Automation API

```ts
window.__pleos27Axis.inspect();
window.__pleos27Axis.switchMode("glass-3d");
window.__pleos27Axis.switchMode("light-field");
window.__pleos27Axis.applyVariation("light-field-violet-membrane");
window.__pleos27Axis.remountMode(); // lifecycle QA
window.__pleos27Axis.setLook("prism");
window.__pleos27Axis.setMotionPreset("spectral-axis-sweep");
window.__pleos27Axis.setMotionStrength("balanced");
window.__pleos27Axis.configureMotion({ fps: 30, duration: 6, seed: 27 });
window.__pleos27Axis.play();
window.__pleos27Axis.pause();
window.__pleos27Axis.seek(1.5);
window.__pleos27Axis.stepFrame(1);
window.__pleos27Axis.setArtboard({ id: "instagram-portrait" });
window.__pleos27Axis.setRenderRegion({ enabled: true, x: 120, y: 160, width: 640, height: 480, unitPpi: 96 });
await window.__pleos27Axis.renderPreview("fast");
await window.__pleos27Axis.exportPng(false);
await window.__pleos27Axis.renderCurrentFrame(false);
await window.__pleos27Axis.renderPrintFrame(false);
await window.__pleos27Axis.exportFrame(0, 30); // deterministic active-Mode frame
```

## State migration

The common Studio state is stored under `pleos-27-axis-studio-state-v2`. Shared artboard and Shell UI state are stored once; each production Mode receives an isolated serialized namespace. Light Field user variations are stored under `pleos-27-axis-light-field-variations-v2`.

현재 설정은 `pleos-27-axis-settings-v2`에 저장됩니다. V2가 없을 때 기존 `pleos-27-axis-settings-v1`의 look, roughness, dispersion, gap, lighting, render scale, bounce, sample, 부분 렌더 영역, 단위 기준 PPI, 출력 PPI와 Inspector 접힘 상태를 가져옵니다. 재생 timestamp와 per-frame override는 저장하지 않습니다.

## 구조

```text
src/axis       canonical Axis direction과 graph
src/motion     deterministic clock, engine, constraint, preset
src/artboard   virtual format과 composition
src/crystal    Prism adapter, renderer lifecycle, professional UI
scripts        검증과 fixed-timestep sequence 출력
```

기본 route는 Motion Studio만 동적으로 불러옵니다. 과거 raw renderer와 legacy UI는 각각 `?renderer=raw`, `?renderer=legacy`에서 필요할 때만 lazy-load됩니다.

## SPECTRAL FLOW Look

`LOOK → Spectral Flow`는 CLEAR / PRISM / SMOKED와 같은 세 육면체, shared vertex, 30° Axis, 기준 카메라를 그대로 사용하고 광학 표현만 교체합니다. 기존 PRISM 물리 재질과 분리된 `SpectralFlowMaterial`이 `MeshPhysicalMaterial.onBeforeCompile`에서 world/local position, world normal, view/camera, canonical Axis 방향과 MotionClock time을 사용합니다.

- `FLOW`: 위치, Axis 방향, 속도, 폭, 부드러움
- `SPECTRUM`: 확산, 파장 분리, 채도, 지연
- `LIGHT`: white core 강도/폭, falloff, bloom
- `SURFACE`: edge 반응, 반사, optical black 깊이
- 프리셋: `SUBTLE`, `BALANCED`, `ACTIVE`

Motion은 기존 MOTION 탭과 6초 fixed-time 루프를 사용합니다. Motion이 꺼져 있을 때는 `Flow Position`으로 정적 상태를 직접 확인할 수 있습니다. Motion이 켜지면 0초와 6초의 spectral envelope가 동일하게 0으로 수렴합니다.

SPECTRAL FLOW의 빠른/고품질/인쇄/시퀀스 출력은 path tracing 누적 대신 같은 custom shader를 artboard 또는 부분 렌더 영역의 정확한 pixel dimension으로 다시 그립니다. 따라서 viewport와 device pixel ratio에 독립적이고 Monte Carlo 노이즈가 없습니다. CLEAR / PRISM / SMOKED의 고품질 출력은 기존 path tracer를 유지합니다.

```bash
npm run render:motion -- \
  --look spectral-flow \
  --preset spectral-axis-sweep \
  --width 1080 --height 1920 --fps 30 --duration 6 \
  --quality raster --out artifacts/motion/spectral-flow-9x16

npm run verify:spectral-flow
npm run capture:spectral-flow
```

Browser API:

```ts
window.__pleos27Axis.setLook("spectral-flow");
window.__pleos27Axis.setSpectralFlowPreset("balanced");
window.__pleos27Axis.setSpectralFlow({ flowDirection: "axis-150", edgeAttraction: 1.6 });
```

## SOFT SPECTRAL Look

`LOOK → Soft Spectral`은 기존 세 육면체와 shared origin을 그대로 유지하면서, geometry가 아니라 중심·Axis·normal·view direction에 반응하는 넓은 광학 필드를 입힙니다. 흰색/옅은 보라 중심광, Blue/Cyan 우세 스펙트럼, 제한된 Magenta를 사용하며 warm accent는 5% 미만입니다. 기본 motion은 `spectral-axis-sweep`, 8초 seamless loop이고 육면체 위치·회전·크기는 움직이지 않습니다.

- Primary: Glow, Spectrum, Edge, Darkness, Motion Depth
- Style: Subtle, Balanced, Active
- Variation: 07–09 Soft Spectral
- 출력: 고해상도/인쇄용 raster PNG, 부분 렌더, fixed-timestep PNG sequence, transparency

```bash
npm run verify:soft-spectral
npm run capture:soft-spectral
npm run handoff:full -- --look soft-spectral --motion spectral-axis-sweep --hero-time 4
```

Browser API:

```ts
window.__pleos27Axis.setLook("soft-spectral");
window.__pleos27Axis.setSoftSpectralPreset("balanced");
window.__pleos27Axis.setSoftSpectral({ glow: 1.2, edge: .6, motionDepth: .5 });
```

## AI Collaboration / Handoff

이 기능은 production 렌더 결과가 아니라 개발자·ChatGPT·Codex 사이에서 현재 프로젝트 상태를 공유하기 위한 infrastructure입니다.

작업 중 빠른 handoff:

```bash
npm run handoff
```

작업 완료 검증 + handoff:

```bash
npm run handoff:full
```

대표 Look·Motion·시점을 지정해 handoff preview를 만들 수도 있습니다.

```bash
npm run handoff:full -- --look spectral-flow --motion spectral-axis-sweep --hero-time 3
```

## Design Polish workflow

- Inspector 상단 `Variation`에서 9개의 완성형 KV 조합을 즉시 불러옵니다.
- `+ 저장`은 현재 Look, 조명, Motion hero frame, 판형, 카메라를 사용자 Variation으로 로컬 저장합니다.
- Prism은 `Clean`, `RGB Edge`, `Immersive`를 먼저 고른 뒤 Primary controls만 조정합니다.
- Spectral은 `Subtle`, `Balanced`, `Active`로 시작하며 세부 shader 값은 Advanced에 있습니다.
- 판형 버튼은 해상도뿐 아니라 각 비율에 맞는 Axis 위치와 scale도 함께 적용합니다.
- QA 이미지 재생성: `npm run capture:design-polish`

생성 결과:

- `docs/AI_HANDOFF.md` — 사람이 읽는 현재 상태와 최신 작업 요약
- `artifacts/latest/runtime-state.json` — 실제 production runtime의 machine-readable inspect 결과
- `artifacts/latest/preview-main.png`
- `artifacts/latest/preview-4x5.png`
- `artifacts/latest/preview-9x16.png`

두 명령 모두 실제 `window.__pleos27Axis.inspect()`와 `exportPng(false)`를 사용합니다. 빠른 handoff는 검증 상태를 `not-run`으로 명시하며, `handoff:full`만 typecheck·verify·build 결과를 PASS/FAIL로 기록합니다. 최신 작업 문맥을 더 정확히 남기려면 다음처럼 설명을 함께 전달할 수 있습니다.

```bash
npm run handoff:full -- \
  --task "요청 요약" \
  --changed "구현 내용" \
  --why "구현 이유" \
  --decisions "핵심 결정" \
  --files "src/example.ts:역할|README.md:문서" \
  --visual "No intentional visual changes"
```
