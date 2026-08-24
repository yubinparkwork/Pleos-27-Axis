# Pleos 27 Axis

PLEOS Axis의 한 중심 노드와 승인된 30°/45° ray topology를 유지하면서, Matte 제품 렌더와 실제 두께를 가진 Prism을 생성하는 Vanilla TypeScript 기반 로컬 스튜디오입니다. 기본 production renderer는 Three.js가 아닌 `WebGL2RenderingContext`와 GLSL ES 3.00으로 동작합니다.

## 실행

Vite 7 요구사항에 맞는 Node.js 20.19+ 또는 22.12+와 WebGL2를 지원하는 최신 데스크톱 브라우저를 권장합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

```bash
npm run lint
npm run verify:raw
npm run typecheck
npm run build
```

`npm run verify:raw`은 production `src/`의 Three.js 및 다른 3D 엔진 참조, 필수 raw WebGL 파일, GLSL ES 3.00 버전과 include 해석, 컨텍스트 설정, 렌더 책임, 그리고 두 geometry mode의 CPU topology self-test를 검사합니다. 브라우저/GPU에서만 알 수 있는 확장 지원과 shader compile 결과는 하단 상태 바와 실제 브라우저 QA로 별도 확인해야 합니다.

현재 `lint`는 별도 ESLint 설정을 흉내 내지 않고, strict TypeScript의 unused/fallthrough 검사를 포함한 source-hygiene typecheck를 실행합니다.

## 빠른 사용법

왼쪽에서 완성된 scene preset을 선택하고, 오른쪽 inspector에서 세부 값을 조절합니다.

- Matte Reference / Graphite / Pleos Blue: 면 normal과 넓은 제품광을 읽는 비투과 재질.
- Clear / Smoked / Pleos Blue Prism: closed optical solid의 반사, 굴절, 두께, absorption을 확인하는 프리즘 재질.
- Full Spectrum Prism: 강한 dispersion과 iridescence 연구용. `EXPERIMENTAL — COLOR REVIEW REQUIRED`이며 Brand Final 기본값이 아닙니다.
- 드래그: perspective camera orbit.
- 휠: zoom.
- 상단 `Matte` / `Prism`: geometry와 material mode 전환.
- 상단 `Quality`: preview 비용과 spectral/refraction 품질 선택.
- `Export PNG`: Output 탭의 크기와 파일명으로 offscreen export.

Inspector 탭은 Geometry, Material, Prism, Lighting, Cards, Camera, Output, Debug로 나뉩니다. slider와 number input은 같은 실제 state 값을 변경합니다. Debug에서는 wireframe, vertex, face normal/ID, Axis ray, center node, depth, thickness를 점검합니다.

## 화면 구조

```text
Top Toolbar
Left Preset Panel | Center WebGL Canvas | Right Inspector
Bottom Renderer / GPU / HDR / Buffer Status
```

canvas는 패널 위에 떠 있는 GUI가 아니라 가운데 stage의 실제 크기를 `ResizeObserver`로 추적합니다. CSS 표시 크기, preview drawing buffer, final export 크기는 서로 분리됩니다.

## 렌더 구조

```text
raw WebGL2 context
  → capability gate
  → VAO / VBO / EBO / UBO
  → Folded Surface 또는 Closed Optical Solid
  → Matte BRDF 또는 Prism backface/frontface optical passes
  → RGBA16F HDR target (지원 시) / RGBA8 compatibility target
  → Neutral 또는 ACES-fitted tone mapping
  → linear-to-sRGB → dither → FXAA
  → canvas / offscreen PNG export
```

핵심 책임은 다음 위치에 있습니다.

- `src/raw-webgl/core/`: context, capability, shader, buffer, framebuffer, target, resource lifecycle.
- `src/raw-webgl/geometry/`: approved rays, folded surface, closed solid, manifold/winding validation.
- `src/raw-webgl/materials/`: Matte/Prism 실데이터 preset.
- `src/raw-webgl/lighting/`: key/fill/rim과 방향 기반 analytic reflection cards.
- `src/raw-webgl/camera/`: orthographic/perspective와 외부 라이브러리 없는 orbit.
- `src/raw-webgl/passes/`, `renderer/`, `shaders/`: multipass rendering, resize, export, GLSL.
- `src/studio/`: 직렬화 가능한 state와 외부 UI shell.

Matte는 diffuse + GGX + Smith + Schlick 조합을 linear RGB에서 계산합니다. Prism은 backface world position과 frontface position 차이로 optical thickness를 근사하고, view-dependent Fresnel, refraction, analytic environment reflection, Beer–Lambert 계열 absorption, IOR 기반 spectral dispersion을 합성합니다. 이는 실시간 단일 통과 광학 근사이며 offline path tracing 또는 다중 내부반사 시뮬레이션은 아닙니다.

### 기본 geometry 값

- design frame: `2.8 × 2.08`
- center node: 20 × 20 grid의 `[10, 10]` → world `[0, 0, 0]`
- default Axis: `30-v1`, rays `[-90, -30, 30, 90, 150, 210]`
- folded depth: `0.42`
- optical projected edge: `1.2`
- optical depth ratio: `sqrt(1/2) = 0.7071067811865476`; 30° projected basis가 3D에서 서로 직교하여 기본 Prism은 skewed box가 아닌 두 개의 정육면체로 시작합니다.
- Prism bevel: enabled, width `0.018`, segments `3`, curvature `0.58`; 중앙 접점은 exact shared node로 유지합니다.

Prism은 항상 canonical `30-v1` closed solid을 사용합니다. Matte에서는 문서에 승인된 30°/45° Basic·Variation 1–3 조합 8개를 선택할 수 있습니다.

## 브라우저와 GPU 조건

- WebGL2가 필요합니다. WebGL1로 조용히 fallback하지 않습니다.
- 우선 `powerPreference: "high-performance"`를 요청하지만, 이는 고성능 GPU 배정을 보장하지 않습니다.
- 첫 요청이 major performance caveat로 실패하면 WebGL2 compatibility request를 한 번 시도하고 상태 바에 표시합니다.
- `EXT_color_buffer_float`가 있으면 RGBA16F HDR target을 사용합니다. 없으면 RGBA8로 낮추고 HDR Disabled 경고를 표시합니다.
- 최대 export 크기는 `MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE`, 가용 GPU 메모리의 영향을 받습니다. 4096² 또는 5600 × 4160 supersampling은 일부 기기에서 실패할 수 있습니다.
- preview context는 `preserveDrawingBuffer: false`입니다. PNG는 별도 offscreen target에서 읽어 Y축을 뒤집어 저장합니다.

## 공식 문서와 구현 가정

두 PDF는 앱이 따라야 하는 디자인 근거이지만 실행 asset이 아닙니다.

- `Pleos 25 Design Guidelines.pdf`: PLEOS 색상, tone-on-tone, Axis 30°/45°, 20 × 20 grid, Type B 사용 규칙의 근거.
- `Pleos 27 Design Kickoff.pdf`: Axis·Core Color·Typography·Layout은 유지하고 Material·Layer·Interaction·Motion을 확장한다는 전략의 근거.
- raw WebGL2, geometry Z/depth/bevel, BRDF, IOR, light 위치, reflection cards, tone mapper, AA, export sampling은 PDF에 없는 구현 가정입니다.
- Full Spectrum, cross-hue reflection, 강한 iridescence는 문서 승인 색상으로 간주하지 않고 Experimental로 분리합니다.

자세한 출처 분리는 `docs/source-audit.md`, 기술 가정은 `docs/implementation-assumptions.md`, 현재 구현과 한계는 `docs/raw-webgl2-implementation.md`를 확인하세요. PDF와 첨부 JPG를 `public/`으로 복사하거나 production texture/합성에 사용하면 안 됩니다.

## Legacy 비교

- `/` 또는 `?renderer=raw`: 기본 Raw WebGL2 renderer.
- `?renderer=legacy`: 마이그레이션 감사용 legacy 비교 경로. `archive/legacy-three/`에 보존한 구현 기록과 `artifacts/raw-webgl2/before-*` 캡처를 가리키는 정적 비교만 사용하며 production `src/`에 Three.js를 다시 연결하지 않습니다.

과거 Three.js 소스는 `archive/legacy-three/`, 이전 비교 코드와 자동화는 기존 `archive/legacy-source/` 및 `archive/legacy-scripts/` 아래에 보존합니다. archive는 production import graph에 포함하지 않습니다. legacy 결과는 기준과 provenance 확인에만 쓰며 raw 결과처럼 표기하지 않습니다.

## QA 아티팩트

필수 캡처 이름과 출처 정책은 `artifacts/raw-webgl2/manifest.json`에 있습니다. 실제 browser capture 또는 raw offscreen export가 없으면 파일을 만들지 않습니다. 기본 검증은 누락 목록을 보고하고, 전체 캡처 후에는 아래처럼 엄격 검사할 수 있습니다.

```bash
RAW_WEBGL2_REQUIRE_ARTIFACTS=1 npm run verify:raw
```

정적 소스가 존재한다고 해서 browser shader compile, framebuffer completeness, GPU 확장, FPS, export 시간까지 통과한 것으로 간주하지 않습니다.
