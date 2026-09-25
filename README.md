# PLEOS 27 Axis — Optical Studio

## A/B 통합안

**V4 · 열린 면의 반사광**: 아래 V3 구조에 넓은 광학 숄더와 어긋난 굴절광을 추가했습니다. `A/B 통합 재질`의 **면 반사 강도**(기본 0.7), **반사광 폭**(0.5), **굴절 중첩**(0.55)으로 조정합니다. 강도 0은 V3와 같은 표현입니다. 불투명 큐브나 추가 발광이 아니라 기존 RGB 광원을 샘플링하는 연출된 반사상이며, 최대 8개 층에만 넓은 반사를 추가합니다. 이전 V3는 `saved-20260922034933369`에 보존됩니다.

기본 구조는 **열린 내부 굴절(V3)** 입니다. `A/B 통합 재질 → 뒤쪽 개방`의 기본값은 1이며, A의 굴절층과 내부 반사 경로 자체를 공유 축의 반대쪽으로 함께 확장합니다. 0은 이전 V2의 닫힌 구조입니다. 축에 가까운 세 면은 이동하지 않고, 각 층의 곡률·간격·RGB 표현과 모션은 유지됩니다. 끝면을 가리는 화면 마스크가 아니라 3D 광학 영역을 한쪽으로 연장하는 연출입니다. 전체 광학 영역은 무한대가 아닌 제한된 크기이며, 먼 곳에서 부드럽게 감쇠합니다. 이전 V2는 `saved-20260921082636619`에 보존됩니다.

상단 버전 목록에서 **A/B 통합안 · 현재 조정**을 선택하거나 `http://127.0.0.1:5173/?look=hybrid-ab`를 엽니다. V2는 A의 실제 입사면 굴절·유한 큐브 내부 다중 반사와 둥근 가상 반사상을 사용하며, B의 얇은 축 경계와 모션을 결합합니다. 외부 첫 반사는 3.5%, 반사 없이 통과한 배경광은 12%로 억제하고 그 이후의 내부 반사는 유지합니다. 해석식 광선 추적과 연출된 반사상 조합이며 Monte Carlo 패스 트레이싱은 아닙니다. 기본 B 화면 `/`와 09.14 원본 A는 변경하지 않습니다.

- **A/B 통합 재질**: 내부 굴절은 외곽 축을 유지하면서 안쪽 반사상의 곡률을 조절합니다. 내부 광학 밀도는 층수를 늘리지 않고 안쪽 광량의 감쇠를 완화합니다. **RGB 혼합**은 색 반사의 겹침을 조절합니다. **광학 → 광선 추적 한도**는 V2에서 실제 내부 반사 횟수(1–16)를 조절합니다. 굴절을 복원한 만큼 V1보다 계산량과 시점 의존성이 큽니다.
- **정지 컬러 / 순환**: RGB 순환 또는 네 가지 고정 구성(RGB 균형·레드 우세·그린 우세·블루 우세)을 선택합니다. 고정은 컬러 비중만 고정하며 모션은 유지됩니다. 정지 컷은 원하는 시간에서 PNG로 저장합니다.
- **공간 깊이 테스트 (Hall D 도면 미반영)**: 화면 안쪽으로 층이 이어지는 개념 테스트입니다. 실제 화면 형상·치수·관람 위치를 반영한 현장 보정은 아닙니다.
- 첫 사용 시 현재 B 설정을 바탕으로 시작하고 이후 `pleos-optical-studio-v1:hybrid-ab`에 독립 저장합니다. 원본 A/B의 저장값을 덮어쓰지 않습니다. PNG 긴 변 3840px와 MP4 출력은 기존 출력 경로를 공유하며, 판형·모션·코덱 지원 조건도 동일하게 적용됩니다.

[설계 기준·KV 및 인쇄 적용 방향](docs/HYBRID_AB_DIRECTION.md), [전용 검증 스크립트](scripts/verify-hybrid-ab.mjs). 로컬 서버 실행 후 `node scripts/verify-hybrid-ab.mjs`로 확인합니다. `PLEOS_HYBRID_4K=1`을 추가하면 네이티브 4K PNG와 짧은 MP4 출력도 검사합니다.

## 25엑시스 → 디멘션 라이팅

**축에서 순차 등장** 버전은 `http://127.0.0.1:5173/?sequence=pleos25&transition=layered&from=saved-20260915065311136`에서 열립니다. 열어두었던 새김 직전 버전의 설정을 최초 한 번 복사하고, 이후에는 별도로 자동 저장합니다. 오른쪽 **25엑시스 → 디멘션 → 등장 스태거 (초)**에서 층 간 등장 간격을 조절합니다. 기본 1초, 범위 0–5초이며 0초는 동시 등장입니다. 축에 가장 가까운 층부터 부드럽게 등장하고, 마지막 층까지 보이도록 재생 길이가 자동 확장됩니다. 기존 반복 모션의 ‘층별 시차’와는 독립적입니다. 검증: `npm run verify:identity-layer-stagger`.

`http://127.0.0.1:5173/?sequence=pleos25`에서 공식 25년도 영상의 축·회색 면인 **25엑시스**에 반사광이 점차 맺히며 현재 디멘션으로 이어지는 모션을 확인합니다. 원본 영상을 깔지 않고 수치와 셰이더로 생성합니다. 첫 방문에는 현재 설정을 복사하되 중심을 정중앙으로 맞추고, 이후 전환용 설정은 별도로 저장합니다. 이전 전환 설정의 카메라는 백업 후 한 번만 중앙 정렬하며, 나중에 직접 조정한 구도는 그대로 유지합니다.

오른쪽 **25엑시스 → 디멘션**에서 사용 여부, **25엑시스 구간**, **빛 전환 시간**을 조절합니다. 카메라가 전환 중 자동 이동하지 않으며, 두 화면의 페이드 대신 같은 면의 반사광과 산란 응답이 변합니다. 아래 타임라인으로 재생·일시정지·구간 확인이 가능합니다. [설계·사용법·재현 한계](docs/IDENTITY25_TRANSITION.md), 전용 검증: `npm run verify:identity-transition`.

## 현재 기본 웹: Optical Studio

기본 `/`는 세 큐브의 Axis 구조를 유지하는 **직접 WebGL2 선형 HDR 광학 렌더러**입니다. R3F/Three.js나 이전 화면 피드백 효과를 사용하지 않습니다. 실제 닫힌 큐브·베벨에 광선을 교차시켜 Snell 굴절, Fresnel, RGB 분산, 내부 반사를 계산합니다. 네 개의 부드러운 Pleos 스튜디오 광원과 고정된 방향성 negative fill이 반사를 만들며, 유리는 무채색·비발광 상태입니다. 선택적인 `면 곡률`은 외곽을 바꾸지 않는 렌즈 법선 근사이며 오프라인 패스 트레이서나 체적 코스틱은 아닙니다.

- 실행: `npm run dev` → `http://127.0.0.1:5173/`
- 이전 개발 스튜디오: `http://127.0.0.1:5173/?renderer=studio` (기존 코드·저장값 유지)
- 검증: `npm run verify` (새 기본 앱), `npm run verify:legacy` (이전 모드 전체)
- `npm run handoff:full`은 새 기본 앱의 검증·빌드·실제 캡처를 갱신합니다. 이전 앱은 `--mode dimention-r3f` 등으로 명시합니다.
- 디멘션 레이어: 상단·왼쪽·오른쪽 큐브마다 0~12겹, 소수 입력으로 마지막 층이 부드럽게 나타납니다. 굴절된 광선으로 내부의 가상 반사상 윤곽을 샘플링하는 연출이며, 불투명 큐브를 추가하거나 물리 반사 횟수만 제한하지 않습니다. `층의 형태 조정`에서 간격·풀림·깊이 감쇠를 조절합니다.
- 조명: 하나의 색상 선택기/HEX/Pleos 스와치와 강도로 네 방향 광원을 함께 제어합니다. 화이트에서 프리즘 분산이 가장 잘 보입니다. 이전 RGB 값은 한 색상으로 변환되며 최초 저장 전 원본은 `pleos-optical-before-dimension-layers-v1`에 보존됩니다.
- `디멘션 레이어 → 층의 형태 조정`: 상단·왼쪽·오른쪽 층 간격을 각각 조절하고 자동 저장합니다. 기존 공통 간격은 세 값에 그대로 이어받습니다. 층 풀림·깊이 감쇠는 공통입니다.
- 4K PNG: 현재 판형의 긴 변 3840px, 4×4(16개) 서브픽셀을 선형 광량으로 평균한 가드 타일 렌더링. FP16 HDR → bloom → 톤 매핑 → sRGB 순이며, 표시용 RGB 이미지를 확대하거나 평균하지 않습니다. FP16 미지원 시 범위 압축 RGBA8 폴백은 정밀도가 낮습니다.
- `광학 → 레퍼런스 무드 적용`은 카메라·간격·판형을 남기고 유리/조명 표현을 변경합니다. 최초 적용 전 설정은 별도의 로컬 백업 키에 보존합니다.
- 새 앱은 별도 키 `pleos-optical-studio-v1`에 세팅을 저장합니다. 이전 세팅이나 저장된 초안을 덮어쓰지 않습니다. 브라우저/출처가 달라지면 localStorage는 공유되지 않습니다.
- 4K MP4: 오른쪽 `출력`에서 영상 해상도(긴 변 3840/1920px), 24/30/60fps, 공간 샘플 4/16개를 선택하고 `4K MP4 저장`을 누릅니다. 현재 카메라·판형·25엑시스 전환·층별 스태거 그대로 0초부터 재생 길이까지 저장합니다. 진행률·남은 시간·취소를 지원하며 완료/취소 후 이전 재생 상태로 돌아옵니다.
- MP4는 실제 해상도로 매 프레임을 다시 계산합니다. 4:5는 3072×3840, 16:9는 3840×2160입니다. 16샘플은 가장자리 품질을 높이지만 오래 걸립니다. 저장 중 탭을 닫거나 다른 버전으로 이동하지 마세요. 해당 해상도의 브라우저 인코더 지원이 필요하며, 미지원 시 작은 영상으로 대신 저장하지 않습니다.
- MP4는 H.264를 우선 사용하며, 현재4:5처럼 픽셀 수가 많은 판형은 기기에 따라 HEVC Main8 MP4로 저장합니다. HEVC 지원 플레이어가 필요합니다. 불투명8bit sRGB·무음·손실압축이며 무손실/HDR 영상은 아닙니다. 이전 패스 트레이싱 출력은 **이전 스튜디오**에 그대로 남아 있습니다. 전용 실제 영상 검증은 `npm run verify:optical-video`입니다.

엔진 선택 이유, 레퍼런스 해석, 광학 근사·출력 한계는 [Optical Studio 안내](docs/OPTICAL_STUDIO.md)를 참고하세요.

## 아래는 이전 스튜디오의 기능 문서 — Legacy / reference only

## 디멘션 / 네이티브 4K 출력

`Dimention R3F → 디멘션`에서 세 큐브의 내부 반사층을 각각 0–24로 조절하고 자동 저장합니다. PNG·MP4의 `4K · 현재 판형 유지` 옵션은 확대 보간이 아닌 네이티브 출력입니다. 안전 한도(16MP)를 넘는 이미지는 축소 렌더 후 확대하지 않고 안내합니다. 설정, 품질 구조와 제한은 [디멘션 품질 안내](docs/DIMENSION_QUALITY.md)를 참고하세요.

전용 검증: `npm run verify:dimension-quality` (기본), `npm run verify:dimension-quality -- --4k` (4K PNG + 짧은 MP4 포함).

Production Modes include `Glass 3D` (Three.js optical solids with native WebGPU wavefront path tracing), `Dimention R3F` (noise-free realtime R3F transmission glass with Lightformer studio reflections and N8AO), `Light Field` (raw WebGL2 continuous spectral field), `Glass Prism` (raw WebGL2 thickness-aware RGB refraction), `Kinetic Glass` (Three.js physical glass with Rapier rigid-body interaction), `Axis Trails` (cursor-following 30° signal lines), and `Formation Loop` (three PLEOS forms rebuilt as a nonuniform HDR light network with Svelte controls, GSAP motion, WebGL shaders, instanced ghost fragments, and BVH interaction). Each preserves the canonical three-part Axis identity and shares the Shell-owned artboard, Variation, motion transport, and export entry point.

하나의 PLEOS Axis Identity를 공유하면서 레퍼런스에 맞는 독립적인 제작 환경을 선택할 수 있는 Mode 기반 제작 도구입니다. 첫 production Mode인 `Glass 3D`는 Three.js WebGPU 실시간 렌더러와 `three-gpu-pathtracer` WebGPU wavefront compute 고품질 렌더러를 사용하며, 세 optical solid가 하나의 공유 꼭짓점에서 만나는 30° 구조, 결정론적 모션, virtual artboard와 고품질 렌더를 유지합니다. WebGPU를 사용할 수 없는 브라우저에서는 기존 WebGL2 패스 트레이서로 폴백합니다.

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
npm run verify:webgpu-glass
npm run verify:dimention-r3f
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

`Dimention R3F`는 기존 `Glass 3D`를 변경하지 않는 별도 실시간 모드입니다. `CrystalAssembly`의 3큐브, 공유 꼭짓점, 30° 투영, 베벨·갭 보정을 그대로 복제하고, 누적 패스 트레이싱 대신 R3F `MeshTransmissionMaterial`, Environment Lightformer, 움직이는 Pleos Red/Green/Blue 면광원, N8AO, MSAA, 제한적인 Bloom을 사용합니다. 프리셋은 PLEOS Prism / Clear Studio / Dark Glass이며 현재 판형의 PNG와 투명 PNG를 즉시 출력합니다.

이 모드의 왼쪽 `카메라` 패널은 아이소메트릭 방향을 고정한 채 미리보기 확대, 수평·수직 평행 이동, Axis 기준점과 그래픽 크기를 조절합니다. 카메라 이동은 오브젝트나 조명을 변형하지 않으며 실시간 미리보기와 PNG 출력에 동일하게 적용됩니다. 패널은 헤더의 화살표로 46px 레일 상태까지 접을 수 있습니다.

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

- 재생과 scrub: Clear / Prism / Smoked는 WebGPU + TSL bloom을 사용. WebGPU 미지원 브라우저와 GLSL 기반 Spectral Look은 기존 WebGL preview로 자동 복귀
- 빠른 렌더링: 16spp · 50% render scale · 4 bounce
- 고품질 렌더링: Advanced의 sample / render scale / bounce 사용
- Raster PNG: 현재 time의 artboard를 정확한 pixel dimension으로 출력
- High Quality PNG: 재생을 멈추고 현재 time을 path tracer에 한 번 동기화한 후 sample을 누적
- Path-traced MP4: `출력 → 렌더 → 유형: 영상 · MP4`에서 현재 모션의 0초부터 끝까지 모든 프레임을 고정 시간으로 평가하고, 설정한 sample / render scale / bounce로 누적·디노이즈한 뒤 브라우저에서 H.264 MP4로 저장. 진행률과 취소를 지원하며 최신 Chrome/Edge의 WebCodecs를 사용
- 부분 렌더링: Advanced에서 artboard pixel 기준 X / Y / W / H 설정, 가운데/전체 정렬, `px/mm/cm/in` 입력
- 인쇄용 PNG: `Output PPI / 단위 변환 기준 PPI` 비율로 부분 영역 pixel을 확장하고 PNG pHYs metadata 기록. 인쇄 출력은 설정된 미리보기 Render Scale과 무관하게 100% 네이티브 해상도, 최소 512 spp, 12 bounces, firefly 억제와 edge-aware denoise로 저장
- Motion sequence: Playwright 기반 fixed-timestep PNG sequence

브라우저 MP4 내보내기는 실시간 화면 녹화가 아닙니다. 각 프레임의 패스트레이싱이 끝난 다음 인코딩하므로 영상 길이와 FPS는 정확하지만, 512 spp 같은 고품질 설정은 프레임 수에 비례해 오래 걸립니다. 렌더링 중에는 탭을 닫거나 백그라운드 절전 상태로 두지 마세요.

> WebGPU 범위: 실시간 Glass 3D, TSL post-processing, 고품질 PNG/MP4 샘플 누적이 모두 native WebGPU입니다. 고품질 경로는 `three-gpu-pathtracer` 공식 `webgpu-pathtracer` 브랜치의 wavefront compute 백엔드를 특정 commit으로 고정해 사용합니다. 런타임에서 native WebGPU adapter가 없으면 기존 WebGL2 패스 트레이서로 자동 폴백합니다. 현재 upstream WebGPU 경로의 명시적 한계로 RGB dispersion은 폴백 경로에서만 지원됩니다.

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
window.__pleos27Axis.switchMode("dimention-r3f");
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

SPECTRAL FLOW의 빠른/고품질/인쇄/시퀀스 출력은 path tracing 누적 대신 같은 custom shader를 artboard 또는 부분 렌더 영역의 정확한 pixel dimension으로 다시 그립니다. 따라서 viewport와 device pixel ratio에 독립적이고 Monte Carlo 노이즈가 없습니다. CLEAR / PRISM / SMOKED의 고품질 출력은 WebGPU wavefront path tracer를 사용하고, WebGPU 미지원 환경에서만 WebGL2 폴백을 사용합니다.

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
# 날짜별 버전 보관함

상단 `날짜별 사이트 버전`에서 현재 작업본과 보관 버전 사이를 이동합니다.
보관 버전은 `versions.json`의 Git SHA 또는 별도 저장한 로컬 실행본입니다. 선택한 페이지만 실행되며
다른 버전의 렌더러는 로드하지 않습니다. 각 버전의 브라우저 설정도 분리됩니다.

`npm run versions:build`로 보관 파일을 생성합니다. `npm run dev`와 `npm run build`도
이를 자동 실행합니다. 생성된 `public/versions/`는 Git에 넣지 않습니다.
캐시가 없는 최초 생성에는 빌드 시간과 디스크 공간이 추가로 필요합니다.

새 보관 시점은 커밋 후 `versions.json`에 고유 id, 전체 commit SHA, 날짜/이름(label),
설정 보관 범위(note)를 추가합니다. 이미 등록한 SHA는 바꾸지 않고 새 항목을 추가하세요.
현재 작업의 실행본은 `node scripts/save-site-version.mjs "이름"`으로 보관합니다.
25엑시스 전환 버전은 `node scripts/save-site-version.mjs --sequence pleos25 "이름"`으로 저장하면 드롭다운에서 전환 화면으로 바로 열립니다. 별도로 검증한 이전 소스의 빌드 결과를 보관할 때는 `--from-build /절대경로/dist`를 함께 사용할 수 있습니다. 이 명령은 현재 작업 소스를 교체하지 않습니다.
이미 있는 실행본을 새 이름으로 따로 보관하려면
`node scripts/save-site-version.mjs --from 저장본ID "이름"`을 사용합니다.
새 저장본은 상대 경로로 빌드하여 다른 경로에서도 자체 CSS와 모듈을 로드합니다.
기존 로컬 저장본은 원본을 수정하지 않고 `*-compatible` 파생 실행본에서 배포 경로만
보정합니다. 드롭다운은 생성된 catalog의 `routeId`로 연결하며 기존 설정 namespace는 유지합니다.
`node scripts/verify-version-archive.mjs`는 전체 버전 전환, CSS 응답 형식, 패널 스타일,
설정 분리·재방문, 좁은 화면을 검증합니다. 기본 서버는 127.0.0.1:5173입니다.
브라우저에만 있던 과거 수치는 Git만으로 복구되지 않습니다.
로컬 실행본과 파생 실행본 모두 Git 추적 대상이 아니므로 별도 파일 백업이 필요합니다.
모든 대화를 자동 복구하는 기능은 아니며, 별도 초안 스냅샷은 아직 이 메뉴에 등록하지 않았습니다.
