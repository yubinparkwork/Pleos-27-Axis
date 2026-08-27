# Pleos 27 Axis

PLEOS Axis의 승인된 30° 구조를 선분이 아니라 세 폐쇄형 광학 솔리드의 공유 꼭짓점으로 구성한 브라우저 기반 GPU path tracing study입니다. 기본 renderer는 Three.js와 [`gkjohnson/three-gpu-pathtracer`](https://github.com/gkjohnson/three-gpu-pathtracer)를 사용합니다.

## 실행

Node.js 22 이상과 WebGL2를 지원하는 최신 데스크톱 브라우저를 권장합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

```bash
npm run verify
npm run build
npm run qa
```

## 기본 화면

- `/`: Three.js `WebGLPathTracer` 기반 기본 production study
- `?renderer=raw`: 이전 Raw WebGL2 studio 비교 경로
- `?renderer=legacy`: 이전 checkpoint 캡처 경로

## Path tracing 구조

```text
Three.js scene
  → 세 개의 indexed rounded optical solid
  → 동일한 방사 방향 offset을 갖는 세 개의 corner
  → MeshPhysicalMaterial transmission / IOR / dispersion
  → 동적 Pleos brand light array + procedural equirect environment
  → three-mesh-bvh scene acceleration
  → Render 버튼으로 시작하는 WebGLPathTracer sample accumulation
  → subtle bloom → ACES filmic tone mapping → sRGB canvas
```

기본값:

- general bounces: `8`
- transmissive bounces: `12`
- render scale: `0.75`
- tiles: `2 × 2`
- dynamic low-resolution interaction preview: enabled
- default camera: orthographic isometric projection, no perspective convergence
- material modes: Clear / Prism / Smoked
- projected Axis angles: `30°, 90°, 150°, 210°, 270°, 330°`
- line primitives: `0`
- optical solids: `3`
- cube gap: `0` (세 육면체의 중심 꼭짓점이 정확히 접촉)
- target samples: `128 spp`

평상시에는 빠른 raster preview만 표시합니다. `빠른 렌더링`은 50% 내부 해상도, 4 bounces, 16 spp로 구도와 재질의 느낌을 빠르게 확인합니다. `고품질 렌더링`은 패널의 render scale, bounces, target spp 값을 그대로 사용합니다. 목표 spp에 도달하면 자동으로 멈추며, 카메라·재질·간격·렌더 설정을 바꾸면 진행 중인 렌더가 중단되고 미리보기 상태로 돌아갑니다.

기본 카메라는 원근 수렴이 없는 정면 직교 아이소메트릭 프리셋입니다. 화면에 투영되는 주요 축은 수직과 `±30°`를 유지하며 세 육면체의 윗면과 양 측면이 함께 보입니다. `OBJECT → CAMERA → 기준 아이소메트릭 시점`으로 언제든 이 구도를 복원할 수 있습니다.

패널 설정과 카메라 시점은 변경 즉시 브라우저 `localStorage`의 `pleos-27-axis-settings-v1` 항목에 저장됩니다. 개발 서버가 중단되거나 페이지를 닫은 뒤에도 같은 주소로 다시 접속하면 마지막 설정이 자동 복원됩니다.

## Pleos Lighting System

`LIGHTING`은 재질에 RGB를 칠하지 않고 무채색 optical glass 주변에 실제 광원을 배치합니다. 기본 `Pleos RGB` 장면은 White key/fill, Pleos Blue·Red·Green rim/side/back light 등 9개 광원으로 시작합니다. Rect Area, Physical Spot, Point, Directional light를 함께 지원하며 각 광원은 배열로 관리되어 개수 제한 없이 추가·복제·삭제·이름 변경·비활성화할 수 있습니다.

- Presets: `Pleos RGB`, `Pleos Blue`, `Pleos Prism`, `Dark Studio`, `Soft Glass`
- Global: master/environment intensity, exposure, bloom, reflection/refraction, saturation
- Per-light: transform, type, Pleos 공식 컬러 swatch, intensity/exposure, area size, spot falloff, shadow controls
- Gizmo: 선택 광원의 이동·회전, Rect plane 및 Spot cone 방향 표시
- Persistence: 조명 배열, 선택값, 프리셋 수정 결과까지 기존 자동 저장에 포함

패스 트레이서는 광원을 float texture에 패킹하고 MIS로 직접광을 샘플링합니다. 광원 값 변경은 BVH와 geometry를 다시 만들지 않고 `updateLights()`만 호출합니다. 편집 Gizmo는 별도의 overlay scene에 존재하므로 빠른 미리보기에서만 보이고 패스 트레이싱 및 PNG 출력에는 포함되지 않습니다. Bloom은 preview와 최종 path-traced canvas에 동일하게 합성됩니다.

## 조작

- 드래그: orbit
- 휠: zoom
- `Tab` 또는 `H`: Inspector 숨기기/표시
- Roughness / Dispersion: 광학 재질 변경
- Render scale: 패스 트레이싱 내부 해상도
- Bounces: 일반 및 투과 bounce budget
- Cube gap: 세 육면체를 중심에서 동일한 거리만큼 벌림
- Target spp: 수동 렌더의 종료 sample 수
- 빠른 렌더링: 고정된 경량 설정으로 짧은 확인 렌더
- 고품질 렌더링: 현재 패널 설정으로 최종 패스 트레이싱 시작/중지
- Save current frame: 현재 누적 결과 PNG 저장

모든 수치 항목은 우측 설정 패널에서 슬라이더로 조절하거나 숫자 입력칸에 직접 입력할 수 있으며, 두 값은 자동으로 동기화됩니다.

## Inspector UI

오른쪽 Inspector는 `OBJECT / MATERIAL / LIGHT / RENDER / EXPORT` 다섯 탭으로 분리됩니다. 각 탭의 설정은 얇은 divider 기반의 접이식 section으로 구성되어 필요한 정보만 열어둘 수 있습니다. Inspector를 닫으면 viewport와 카메라 렌더 영역이 자동으로 전체 폭에 맞춰 다시 계산됩니다.

숫자 입력은 키보드 입력과 좌우 드래그 scrub을 모두 지원합니다. 숫자 위에서 좌우로 드래그하면 해당 step 단위로 값이 변하고, `Shift + Drag`는 1/10 step으로 정밀 조정합니다. 활성 탭과 Inspector 열림 상태도 다른 렌더 설정과 함께 자동 저장됩니다.

`부분 렌더링 영역`의 X, Y, 너비, 높이는 현재 렌더 화면을 기준으로 픽셀 단위로 지정합니다. 패스 트레이서는 선택 프레임 크기만큼의 별도 캔버스와 camera view offset을 사용하므로 프레임 밖은 계산하지 않습니다. 부분 렌더 캔버스는 DPR 1로 고정되어 입력한 너비·높이와 저장되는 PNG 픽셀이 1:1로 일치합니다. `전체 화면` 버튼으로 언제든 전체 영역으로 복구할 수 있습니다.

영역 입력칸은 단위 없는 숫자와 `px`, `mm`, `cm`, `in`을 인식합니다. 예를 들어 기본 96 ppi에서 `100mm`는 약 `378px`로 변환됩니다. 변환 기준은 `단위 변환 기준`에서 36–1200 ppi로 변경할 수 있습니다. 변환 결과가 현재 화면 경계를 넘으면 가능한 최대 픽셀 값으로 맞춥니다. 새 버전에서 영역 위치를 처음 불러올 때는 프레임이 화면 정중앙에 배치되며, 이후 좌표는 자동 저장됩니다. `가운데` 버튼으로 언제든 다시 중앙 정렬할 수 있습니다.

영역 입력칸에 포커스한 상태에서 `↑`와 `↓`는 값을 1px씩, `Shift + ↑`와 `Shift + ↓`는 10px씩 증감합니다. 물리 단위가 입력된 상태라면 먼저 현재 PPI 기준 픽셀로 환산한 뒤 증감합니다.

## 72 / 150 / 300ppi 최종 출력

`부분 영역 PNG 출력`에서 72, 150, 300ppi를 선택할 수 있습니다. 출력 크기는 현재 영역의 물리 크기를 유지한 채 `출력 ppi ÷ 단위 변환 기준 ppi` 비율로 다시 계산합니다. 예를 들어 `640 × 480px @ 96ppi` 영역은 300ppi에서 `2000 × 1500px`로 렌더링됩니다.

최종 출력은 화면용 렌더와 달리 내부 render scale을 항상 100%로 사용합니다. 최소 품질은 72ppi `128 spp / 8 bounces`, 150ppi `192 spp / 10 bounces`, 300ppi `256 spp / 12 bounces`이며, 사용자가 설정한 고품질 값이 더 높으면 그 값을 우선합니다. 투과 반사는 일반 bounce보다 4회 더 계산합니다. 저장 PNG에는 `pHYs` 청크를 삽입해 선택한 실제 PPI 메타데이터를 기록합니다. 출력 크기가 GPU의 최대 texture 크기를 넘으면 렌더를 시작하지 않고 제한값을 안내합니다.

## 구현 위치

- `src/crystal/NewAxisCrystalApp.ts`: renderer, path tracer, accumulation, camera, UI
- `src/crystal/CrystalAssembly.ts`: 세 광학 솔리드와 material presets
- `src/crystal/LightingSystem.ts`: Pleos 팔레트, 동적 light data, presets, runtime lights와 gizmo helper
- `src/crystal/LightingPanel.ts`: LIGHTING 편집 UI
- `src/crystal/InspectorPanel.ts`: 상위 탭, view 전환, collapse 상태 관리
- `src/crystal/InspectorScrub.ts`: 재사용 가능한 숫자 입력 drag/scrub 동작
- `src/crystal/StudioEnvironment.ts`: path-traced neutral environment와 studio surfaces
- `scripts/verify-pathtracer.mjs`: active renderer와 geometry contract 검증
- `src/raw-webgl/`: 이전 직접 WebGL2 renderer; 비교 route에서만 사용

## 디자인 근거와 가정

- `Pleos 25 Design Guidelines.pdf`: PLEOS color, tone-on-tone, Axis 30°/45°, 20 × 20 grid 규칙의 근거
- `Pleos 27 Design Kickoff.pdf`: Axis DNA를 유지하면서 Material·Layer·Interaction·Motion을 확장하는 전략의 근거

PDF는 실행 asset이나 texture로 포함하지 않습니다. Z-depth, rounded bevel, IOR, bounce 수, 카메라와 조명 위치는 문서에 없는 구현 가정이며 `docs/implementation-assumptions.md`에서 분리 관리합니다.

## GitHub Pages

`main`에 push하면 `.github/workflows/deploy-pages.yml`이 검증과 production build를 실행한 뒤 GitHub Pages를 자동 갱신합니다.
