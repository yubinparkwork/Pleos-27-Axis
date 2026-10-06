# PLEOS 27 Axis — Optical Studio

## A/B 통합안

**V4 · 열린 면의 반사광**: 아래 V3 구조에 넓은 광학 숄더와 어긋난 굴절광을 추가했습니다. `A/B 통합 재질`의 **면 반사 강도**(기본 0.7), **반사광 폭**(0.5), **굴절 중첩**(0.55)으로 조정합니다. 강도 0은 V3와 같은 표현입니다. 불투명 큐브나 추가 발광이 아니라 기존 RGB 광원을 샘플링하는 연출된 반사상이며, 최대 8개 층에만 넓은 반사를 추가합니다. 이전 V3는 `saved-20260922034933369`에 보존됩니다.

기본 구조는 **열린 내부 굴절(V3)** 입니다. `A/B 통합 재질 → 뒤쪽 개방`의 기본값은 1이며, A의 굴절층과 내부 반사 경로 자체를 공유 축의 반대쪽으로 함께 확장합니다. 0은 이전 V2의 닫힌 구조입니다. 축에 가까운 세 면은 이동하지 않고, 각 층의 곡률·간격·RGB 표현과 모션은 유지됩니다. 끝면을 가리는 화면 마스크가 아니라 3D 광학 영역을 한쪽으로 연장하는 연출입니다. 전체 광학 영역은 무한대가 아닌 제한된 크기이며, 먼 곳에서 부드럽게 감쇠합니다. 이전 V2는 `saved-20260921082636619`에 보존됩니다.

상단 버전 목록에서 **A/B 통합안 · 현재 조정**을 선택하거나 `http://127.0.0.1:5173/?look=hybrid-ab`를 엽니다. V2는 A의 실제 입사면 굴절·유한 큐브 내부 다중 반사와 둥근 가상 반사상을 사용하며, B의 얇은 축 경계와 모션을 결합합니다. 외부 첫 반사는 3.5%, 반사 없이 통과한 배경광은 12%로 억제하고 그 이후의 내부 반사는 유지합니다. 해석식 광선 추적과 연출된 반사상 조합이며 Monte Carlo 패스 트레이싱은 아닙니다. 기본 B 화면 `/`와 09.14 원본 A는 변경하지 않습니다.

- **A/B 통합 재질**: 내부 굴절은 외곽 축을 유지하면서 안쪽 반사상의 곡률을 조절합니다. 내부 광학 밀도는 층수를 늘리지 않고 안쪽 광량의 감쇠를 완화합니다. **RGB 혼합**은 색 반사의 겹침을 조절합니다. **광학 → 광선 추적 한도**는 V2에서 실제 내부 반사 횟수(1–16)를 조절합니다. 굴절을 복원한 만큼 V1보다 계산량과 시점 의존성이 큽니다.
- **정지 컬러 / 순환**: RGB 순환 또는 네 가지 고정 구성(RGB 균형·레드 우세·그린 우세·블루 우세)을 선택합니다. 고정은 컬러 비중만 고정하며 모션은 유지됩니다. 정지 컷은 원하는 시간에서 PNG로 저장합니다.
- **공간 깊이 테스트 (Hall D 도면 미반영)**: 화면 안쪽으로 층이 이어지는 개념 테스트입니다. 실제 화면 형상·치수·관람 위치를 반영한 현장 보정은 아닙니다.
- 첫 사용 시 현재 B 설정을 바탕으로 시작하고 이후 `pleos-optical-studio-v1:hybrid-ab`에 독립 저장합니다. 원본 A/B의 저장값을 덮어쓰지 않습니다. PNG 긴 변 3840px와 MP4 출력은 기존 출력 경로를 공유하며, 판형·모션·코덱 지원 조건도 동일하게 적용됩니다.

가는 Axis 반사선의 출력 품질을 위해 PNG는 64개 서브픽셀 샘플로 저장합니다. MP4의 **출력 → 프레임 품질**은 4/16/64 샘플 중 선택하며, 64 샘플은 16 샘플보다 계산량이 약 4배입니다. MP4의 가는 RGB 경계 보존을 위해 1080p 비트레이트 하한도 높였지만, 브라우저 H.264/HEVC의 4:2:0 색차 압축 때문에 무손실 PNG와 완전히 동일할 수는 없습니다.

[설계 기준·KV 및 인쇄 적용 방향](docs/HYBRID_AB_DIRECTION.md), [전용 검증 스크립트](scripts/verify-hybrid-ab.mjs). 로컬 서버 실행 후 `node scripts/verify-hybrid-ab.mjs`로 확인합니다. `PLEOS_HYBRID_4K=1`을 추가하면 네이티브 4K PNG와 짧은 MP4 출력도 검사합니다.

## 판형별 카메라 구도

### 이름 붙인 판형 배리에이션

오른쪽 **판형 배리에이션**에서 현재 화면의 판형과 카메라뿐 아니라 재질, 라이팅, 디멘션 레이어, 모션, RGB 타이밍, 출력 옵션까지 **한 번에 저장**합니다. 이름을 입력하고 **새로 저장**하면 현재 설정의 독립적인 복원 지점이 생깁니다. 저장본을 선택해 **불러오기**, 현재 값으로 **선택본 갱신**, **삭제**할 수 있습니다. 불러오기는 전체 장면 설정을 적용하며 ⌘Z/Ctrl+Z로 직전 작업 화면에 돌아갈 수 있습니다. 이후 슬라이더 편집은 현재 작업에 자동 저장되지만 이름 붙인 저장본은 **선택본 갱신** 전까지 바뀌지 않습니다.

화면 아래 **화면 비율 → 직접 입력**을 고르면 판형 배리에이션에서 가로:세로 비율을 지정할 수 있습니다. 저장본에는 이 비율과 현재 확대·이동·회전 구도가 함께 들어갑니다. PNG는 긴 변 3840px, MP4는 출력 패널의 긴 변 설정을 사용하므로 비율 입력 자체가 출력 픽셀 크기를 뜻하지는 않습니다. 기존 기본 판형의 **판형별 구도**는 그대로 유지됩니다. 새 배리에이션을 만들 때 그 판형의 현재 편집 구도를 계승하고, 다른 판형에 저장한 구도를 지우지 않습니다.

배리에이션은 현재 룩의 자동 저장 상태에 포함되어 같은 로컬 Vite 서버를 쓰는 Chrome/인앱브라우저 사이에서 공유됩니다. 로컬 서버가 없거나 정적 배포에서는 해당 브라우저의 로컬 저장소에만 남습니다. 기존 상단의 날짜별 사이트 버전과 이름 붙인 옛 설정은 별도 보관되며, 새 배리에이션이 이를 덮어쓰거나 자동 이전하지 않습니다. 회귀 검사: `npm run verify:optical-variations`.

화면 아래 **화면 비율**에서 판형을 선택하고 오른쪽 **카메라 → 판형별 구도**에서 확대·좌우 이동·수평/수직 회전을 조정한 뒤 **현재 구도 저장**을 누릅니다. 다른 판형으로 바꾸면 그 판형의 마지막 편집 구도를 불러오며, 저장된 구도로 돌아가려면 **저장 구도 복원**을 누릅니다. 아직 한 번도 사용하지 않은 판형은 현재 구도를 이어받습니다. 편집 중 값은 판형별 임시 구도로 자동 저장되므로 판형을 오가거나 페이지를 다시 열어도 사라지지 않습니다. 저장 버튼은 별도의 복원 지점을 지정합니다.

구도는 Look의 기존 로컬 저장 공간 안에서 판형별로 관리됩니다. 조명·재질·모션 설정은 공통이고, 모션이 있는 경우 판형 구도는 움직임의 기준 카메라입니다. 현재 선택한 판형과 구도가 PNG·MP4에 동일하게 적용됩니다. 기존에 저장된 설정은 현재 구도를 그대로 유지하며 다른 판형의 구도는 처음 선택할 때 만들어집니다. `npm run verify:camera-profiles`는 판형 전환, 임시/저장 구도, 새로고침, 출력 및 좁은 화면을 검사합니다.

## 25엑시스 → 디멘션 라이팅

A/B 통합안의 25엑시스 전환에서는 중심 Axis에서 바깥으로 회색 면이 짧게 걷히며 안쪽 RGB 반사층이 드러납니다. 회색 면의 퇴장 시간은 해당 위치의 컬러 밝기에 좌우되지 않아 어두운 영역만 늦게 남지 않습니다. 현재 세팅을 읽은 격리 브라우저 비교: `node scripts/verify-axis-carrier-release.mjs --baseline`으로 수정 전 프레임을 기록한 뒤, 수정 후 `node scripts/verify-axis-carrier-release.mjs`를 실행합니다. 이 비교는 로컬의 동일한 설정을 사용하며 공유 설정을 변경하지 않습니다.

A/B 통합안의 **25엑시스 → 디멘션 → 전환 순간 밝기**는 새로 생기는 컬러 빛의 전환 중간 밝기만 조절합니다. `1`은 기존 결과, `0`은 중간 광량을 최대 65% 낮추고 `2`는 높입니다. 25엑시스 회색 화면과 전환 완료 후 디멘션은 바뀌지 않습니다. 슬라이더·숫자 입력값은 자동 저장되며 PNG/MP4에도 동일하게 적용됩니다. `npm run verify:transition-brightness`는 전환 중 차이, 전후 화면 동일성, 키보드 조작과 새로고침 복원을 확인합니다.

A/B 통합안의 **RGB 메인 / 서브 비율 → 서브 컬러 각각**에서 서브 두 색의 비중을 0–33%로 조절합니다. 기본은 8%씩(메인 84%)이며 메인은 `100 − 서브 × 2`로 자동 계산합니다. RGB 순환의 빛 혼합 비중이며 화면 면적 비율은 아닙니다. 자동 저장·실행 취소·PNG/MP4에 동일하게 반영되고 고정 컬러와 이전 저장 사이트의 렌더러는 변경하지 않습니다.

**RGB 유지시간** 패널에서 `기존 자동 순환` 또는 `시간 직접 지정`을 선택합니다. 직접 지정 시 레드·그린·블루 유지(각 0–60초)와 색 전환(0.1–30초)을 슬라이더/숫자로 조절하며 자동 저장·실행 취소·출력에 동일하게 적용됩니다. 한 주기는 세 유지시간의 합 + 전환시간 × 3입니다. 직접 지정은 첫 디멘션 빛이 나타나는 시점부터 레드 유지를 셉니다. 층의 등장 중에도 시간이 흐르므로 층 수·스태거가 첫 레드 유지시간을 늘리지 않습니다. 기존 자동 순환의 시작 기준은 유지됩니다. 영상 길이를 늘리거나 시간을 압축하지 않으므로 영상이 먼저 끝나면 순환도 중간에서 끝납니다. 고정 컬러에서는 비활성화되며 저장값은 유지됩니다. 기존 저장본은 자동 순환으로 열립니다.

초반 얇은 25엑시스 선에는 원본 수치 추출 과정의 중심 여백을 제거해 같은 중심에서 만나도록 했습니다. 큐브 간격·디멘션 축 구조는 변경하지 않습니다. 검사: `node scripts/verify-rgb-holds-origin.mjs` (격리 서버 51756, 실제 사용자 설정 변경 없음).

현재 A/B 통합안(`?look=hybrid-ab`)은 회색 면을 중심 Axis에서 바깥으로 걷어 내고, 안쪽 디멘션 광량은 독립적으로 등장시킵니다. 넓은 흰 강조광 대신 좁은 컬러 하이라이트를 사용하고, 스태거로 등장한 각 층은 등장 완료 후 0.35초 유지 및 1초의 부드러운 연결을 거쳐 기존 페이드 루프로 들어갑니다. 전환 이후의 재질·RGB 순환 및 원본 A/B는 유지합니다. 전환 중 면 좌표가 늘어나는 곳에는 해당 픽셀의 크기를 반영해 필터링합니다.

회귀 비교: `node scripts/verify-identity-surface-handover.mjs`. `artifacts/identity-surface-handover/`의 이번 작업 전 기준 이미지·설정으로 시작/완료/전환 비활성 상태의 동일성, 전환 경계 연속성 및 밝은 무채색 중첩을 검사합니다. 기준 파일을 새로 만들 때만 `--baseline`을 사용합니다(5173의 설정을 읽기만 하고, 렌더는 격리된 51755에서 수행).

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
- 새 앱은 별도 키 `pleos-optical-studio-v1`에 세팅을 저장합니다. `npm run dev`의 같은 로컬 서버(`127.0.0.1:5173` 또는 `localhost:5173`)를 열면 Chrome·인앱브라우저의 설정을 `.pleos/optical-state/`에 자동 공유하고, 다시 열 때 최신 설정을 복원합니다. 값 조정 뒤 약 0.15초 후 저장되며, 보관 버전은 버전별 파일을 사용합니다. 기존 브라우저 저장값이 있으면 최초 한 번 가져오고, 다른 버전/출처/컴퓨터나 정적 배포에는 자동 공유되지 않습니다. `.pleos/`는 Git에 포함되지 않으므로 백업이 필요합니다.
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
다른 버전의 렌더러는 로드하지 않습니다. 각 버전의 설정도 분리되지만, 같은 로컬 서버에서 동일한 보관 버전을 열면 Chrome·인앱브라우저 간 설정이 공유됩니다.
보관 버전의 `장면 설정`에서는 패널·카메라 조정 후 `⌘Z`(`Ctrl+Z`)로 되돌리고 `⌘⇧Z`(`Ctrl+Shift+Z`)로 다시 적용할 수 있습니다. 헤더의 `되돌리기`·`다시` 버튼도 동일하게 작동합니다. 실행 취소 이력은 열린 탭의 작업 세션에만 유지되며, 저장된 설정과는 별개입니다.

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
## 축 면 분리 시안 (독립 비교 버전)

### 층 내부 밝기 변화

### A/B 통합안 · 축/베벨 반사 필터

A/B 통합안에서 출력 픽셀 크기와 베벨 곡률에 맞춰 반사 광원 샘플의 폭을 제한하고, RGB 경계 방향을 구조 텐서로 계산해 경계를 따라 최대 2px 범위에서 재구성합니다. 검은 틈과 지오메트리·베벨 수치는 변경하지 않으며 A안 원본과 다른 렌더러의 resolve는 유지합니다. PNG와 MP4는 같은 경로입니다. 영상 출력은 **4K · 긴 변 3840 / 64샘플 · 정밀**을 권장합니다. 64샘플은 16샘플보다 계산량이 약 4배이며, 시간축 누적이나 모션블러는 적용하지 않습니다. 잔떨림의 완전 제거를 보장하지는 않습니다. `npm run verify:bevel-filter`는 격리된 브라우저에서 이전 버전 대비 샘플 수 변화에 따른 차이와 실제 2716×3840·64샘플 PNG, 사용자 세팅 불변을 검사합니다.

상단 버전 메뉴 옆 **☆**를 눌러 선택한 사이트 버전을 표시합니다. 표시한 버전은 드롭다운 위쪽 **즐겨찾기**에 모이며 **★**를 다시 누르면 해제됩니다. 이름과 날짜, 렌더링 및 저장 설정은 바뀌지 않습니다. 같은 브라우저·같은 사이트 주소에서는 새로고침하거나 다른 아카이브를 열어도 표시를 공유합니다. 다른 브라우저/기기에는 자동 동기화되지 않습니다. 이름 붙여 저장한 수치 설정은 기존의 별도 그룹을 유지합니다.

### 0930 A조정안 · 겉면 그라데이션

A조정안의 **RGB 메인 / 서브 비율 → 서브 컬러 각각**에서 서브 광량을 0–33%로 조절합니다. 메인은 `100 − 서브 × 2`로 계산합니다(서브 8% → 메인 84%). 기본 10%는 원본의 80/10/10과 동일하며 A안의 기존 순환 순서·타이밍·광학 질감은 유지합니다. RGB 주도색 순환이 켜졌을 때만 적용됩니다. 값은 A안 전용 `cubeSubPercent`로 자동 저장되고 PNG/MP4에도 같은 계산을 사용합니다. `npm run verify:cube-rgb-ratio`로 원본 픽셀 보존·비율 합계·입력·저장·화면 크기를 검사합니다.

9월 14일 A안(`look=cube0914`)의 **겉면 그라데이션 → 겉면 빛 강도**를 0–2×로 조절합니다. 0은 면광 제거, 1은 기존 광량, 2는 두 배입니다. 첫 반사·투과만 조절하던 초기안과 달리, 면을 채우는 전체 `traceGlass` 경로(후속 물리 반사 포함)를 조절하며 별도 `dimensionLayers` 계산에는 곱하지 않습니다. 광원 자체·전체 노출·디멘션 형태는 변경하지 않습니다. 기존 두 계수는 저장 호환을 위해 내부에 유지하되 패널에는 하나의 강도만 노출합니다. 값은 자동 저장·되돌리기·판형 배리에이션·PNG/MP4에 반영됩니다. 원본 A안 아카이브와 A/B 통합안은 변경하지 않습니다. `npm run verify:cube-surface`는 원본 비교, 면광 제거, 디멘션 독립성, 키보드·저장, PNG/MP4를 검사합니다. 수정본은 드롭다운의 **0930 A조정안 · 겉면 빛 강도 수정**이며 로컬 아카이브는 GitHub 백업과 별개입니다.

### A/B 통합안 · 구조 라이팅

패널에는 기준 구도에서 보이는 두 면씩만 표시합니다: 상단 X/Z 수직면, 왼쪽 X 수직면/Y 수평면, 오른쪽 Y 수평면/Z 수직면. 보이지 않는 세 방향의 저장값은 삭제·초기화하지 않습니다. 카메라 회전 중에도 조절 대상이 바뀌거나 패널이 재배치되지 않습니다.

‘구조 라이팅’은 원래 큐브의 큰 벽/바닥 꺾임을 조절합니다. 상단/왼쪽/오른쪽 각각 X/Z 수직면과 Y 수평면의 광량을 0–3배로 조절하며, 그 큰 면에 보이는 기본 디멘션, 내부 반사·굴절, 넓은 반사광 모두에 동일한 무채색 gain을 적용합니다. 내부 반사 이미지의 면 방향을 조절하는 아래 ‘면별 디멘션 라이팅’과는 독립적입니다. 실제 입사 구조의 기하 법선을 사용하고 내부 광선/굴절 왜곡 및 카메라 기반 선택은 사용하지 않습니다. 베벨에서는 연속 가중치로 연결됩니다. 기본값은 모두 1배와 구조 명암 대비 0으로 기존 결과를 유지합니다. 대비를 높이면 수직면은 최대 1.35배, 수평면은 0.65배가 됩니다. 회전, RGB 순환, 축과 25엑시스 회색 캐리어는 변경하지 않습니다. 저장·undo·배리에이션·PNG/MP4는 기존 전체 상태를 재사용합니다. `npm run verify:structure-light`는 세 구조 방향 출력 변화, 중립 복원, 회색 캐리어 보존, undo/저장, 좁은 화면을 검증합니다.

### A/B 통합안 · 면별 디멘션 라이팅

현재 조정안 `?look=hybrid-ab`의 ‘면별 디멘션 라이팅’에서 상단/왼쪽/오른쪽 구조의 수직면 1(X), 수평면(Y), 수직면 2(Z)를 각각 0–3배로 조절합니다. 기본 1배는 기존 표현이고 0은 해당 방향의 내부 디멘션 광량 제거입니다. 동일 방향의 ±면은 같은 조절값을 사용하며, 화면상 위치가 아니라 3D 내부 반사면 법선에 연결됩니다. 베벨의 법선 가중치로 부드럽게 연결하므로 카메라 각도에 따른 선택면 스위칭은 추가하지 않습니다. ‘꺾임 대비’ 0–1은 수직면을 최대 1.35배, 수평면을 0.65배로 보정합니다. 현재 굴절/층/색/모션과 겉면 재질은 유지됩니다. 자동 저장, undo, 판형 배리에이션과 PNG/MP4 스냅샷에 포함됩니다. `npm run verify:face-dimensions`로 9개 면 방향 GPU 검사, 출력 변화, 저장/undo, 좁은 화면을 검증합니다.

### 중심향 흐름 컨트롤

오른쪽 패널의 **층 내부 밝기 변화**에서 `강약 대비`(0–1), `빛의 길이`(0.25–6×), `흐름 속도`(한 영상 루프당 0–6회)를 조절합니다. 세 영역과 모든 층이 같은 엑시스 중점을 향해 밝기가 흐릅니다. 이 흐름에는 영역·층별 시차를 넣지 않으며, 기존 층 등장/소멸 타이밍은 별도로 유지됩니다. 화면 중심이 아닌 3D Axis 원점 기준이라 카메라를 옮겨도 목표점이 바뀌지 않습니다. 대비 0은 이전 결과를 그대로 유지하고, 속도 0은 공간상의 강약만 남깁니다. 권장 시작값은 0.6 / 1.5 / 1입니다. 노출을 더하지 않고 기존 광량을 15–100% 범위로 변조하므로 기하·법선·RGB 순환은 바뀌지 않습니다. 기존 자동 저장, 되돌리기, 판형 배리에이션과 PNG/MP4의 고정 시간 렌더에 함께 반영됩니다. `npm run verify:layer-light`로 실제 GLSL의 중심향 이동, 무효과 보존, 강약·길이·시간, 루프 연결, 키보드와 재실행 저장을 검사합니다.

- 기존 조정안: `/?look=hybrid-ab` (셰이더 분기·저장 공간 유지).
- 새 시안: `/?look=hybrid-axis-split`. 상단 날짜별 버전 메뉴의 **A/B 통합안 · 축 면 분리 시안**으로 선택합니다.
- **A/B 통합 재질 → 면 분리 간격**: 0–0.15, 기본 0.025. 0은 기존 연결면과 같은 픽셀 결과입니다. 값은 월드 공간의 틈이며 카메라에 따라 화면상의 폭은 달라집니다.
- 기존의 경계 히트 삭제 방식은 제거했습니다. 이제 광학 영역마다 세 개씩, 총 9개의 분리된 얇은 유리판을 실제 3D 광선 교차 대상으로 사용합니다. 각 판은 앞면·뒷면·옆면·둥근 림을 가지며 서로 겹치지 않습니다. 판 사이의 빈 공간이 축을 드러냅니다. Three.js 메시가 아니라 GLSL에서 해석적으로 정의한 입체입니다.
- 판의 위치와 함께 가상 디멘션 이미지 좌표도 이동합니다. 디멘션 에너지는 연마된 끝부분에서 완만하게 줄고, 실제 림의 Fresnel 반사/굴절은 별도로 계산합니다. 기존 RGB·레이어·모션을 보존하기 위해 **내부의 반복 이미지는 여전히 기존 광학 프록시 기반의 표현적 근사**입니다. 전체를 물리적으로 정확한 다중 산란 시뮬레이션으로 바꾼 것은 아닙니다.
- 카메라에는 앞면과 앞쪽 림만 노출합니다. 틈 안에 또 다른 컬러 벽처럼 보이던 뒷면·두께면은 디멘션 이미지의 표시 대상에서 제외합니다. 앞면의 내부 굴절 계산을 위한 닫힌 경계는 유지하므로, 물리적인 유리판 전체를 삭제하는 기능과는 구분합니다. PNG/영상도 동일한 앞면 교차 경로를 사용합니다.
- 축에 붙은 기본 반사층은 고정된 평면 법선을 사용하고 광원 샘플 위치를 가장 가까운 직선 경계에 투영합니다. 경계에서 `0.01–0.04 × uHalf` 구간을 지나면 기존 반사 계산으로 돌아갑니다. 실제 면 끝에서 `0.005–0.035 × uHalf` 구간에 내부 굴절층을 부드럽게 연결해, 축 바로 옆에 내부의 둥근 반사상이 섞이지 않게 합니다. 그 안쪽 디멘션 굴절 계산은 유지합니다. 이 제한은 분리 시안의 양수 간격에서만 적용합니다.
- 두께는 베벨에 따라 0.024–0.06 월드 단위로 제한하고 림 반경은 두께의 45% 이하로 제한합니다. 간격 0은 기존 연결면으로 복귀합니다. 간격 0과 매우 작은 양수 사이에서 연결 구조가 바뀌므로, 간격 자체를 0을 가로질러 애니메이션하는 것은 권장하지 않습니다. 9개 판의 교차 계산으로 기존안보다 느릴 수 있습니다.
- 저장 키: `pleos-optical-studio-v1:hybrid-axis-split`. 기존 조정안과 독립적으로 자동 저장/되돌리기/판형 배리에이션을 사용합니다.
- 분리 전 실행본: `saved-20260930082750019` (**A/B 통합안 · 면 분리 전 보존**). 로컬 공유 설정도 별도로 복사했으며 기존 원본은 변경하지 않습니다. `public/versions/`와 `.pleos/`는 로컬 보관이며 GitHub 백업을 의미하지 않습니다.
- `npm run verify:axis-face-split`: 실제 GLSL의 앞면·뒷면·옆면·림 법선·빈 틈 광선·이미지 좌표 이동 검증 및 분리 전 렌더 비교, 0 복귀, 간격 변경, 각도·베벨·전환 프레임, 슬라이더/키보드/재실행, 원본 설정 불변 검사. `PLEOS_SPLIT_EXPORT=1`을 추가하면 4K PNG와 짧은 MP4도 실제 출력 검증합니다.
# 코엑스 D홀 디멘션 게이트

`npm run dev` 후 `http://127.0.0.1:5173/?look=coex-gate` 또는 상단 버전 메뉴의
**코엑스 D홀 · 디멘션 게이트**를 선택합니다. 기존 Axis 작업본은 변경되지 않습니다.

- 공식 공개 매뉴얼(2023, 8쪽): 5248×2112px 펼침 파일, 상단 576px, 양쪽 기둥 448px,
  중앙 통로 4352×1536px 제외, 물리 13.12×5.28m, 상단 15° 경사. 최신 매핑/송출 승인 사항은 운영사와 확인하세요.
- 세 LED 면의 연속 U 좌표와 `1-exp(-z*depth)` 투영으로 깊이를 만듭니다.
  HybridAB의 Gaussian shoulder/crest, 감쇠, 채널 분산과 동일한 톤 변환을 사용하는
  **아트 디렉션 광학 이미지**입니다. 원래 큐브 물리 광선 추적을 그대로 실행하거나 실제 볼륨을 계산하는 방식은 아닙니다.
- 검정에서 앞쪽 층부터 등장하고 이후 무한 재생합니다. 재생 끝점에서 검정으로 리셋하지 않습니다.
  RGB는 깊이를 따라 전달되며 R→G→B 유지 시간과 색상을 각각 조절할 수 있습니다.
- 게이트 설정은 독립 `pleos-coex-d-gate-v1` 브라우저 저장소에 자동 저장됩니다.
- ‘모서리 라운딩 (px)’은 0–320 범위, 기본 120px입니다. 0은 직각이고 깊이 쪽 반경은 앞쪽의 20%까지 줄어듭니다. ‘번짐 방향’은 −1(위·바깥쪽으로 풀어짐), 0(대칭), +1(위·바깥쪽에 선명하게 맺히고 아래·안쪽으로 풀어짐, 기본)입니다. Gaussian 반사층의 양쪽 폭을 비대칭으로 계산하며 ‘층 번짐’이 풀어지는 폭을 조절합니다. 신규 값도 자동 저장/undo/PNG/MP4에 반영되고 이전 저장값은 기존 수치를 유지한 채 신규 기본값만 채워집니다.
- ‘앞쪽 빛 폭 (px)’은 원본 판형 기준 Gaussian 반사층 폭(8–320px), ‘안쪽 좁아짐’은 깊이별 폭 감쇠(0–3)입니다. 0은 일정 폭이고 높을수록 안쪽이 가늘어집니다. 기본 120px / 1.2에서 깊이 0 / 0.5 / 1의 계산 폭은 120 / 22.4 / 4.2px이며, 화면의 서브픽셀 하한으로 먼 층의 깜빡임을 방지합니다. 층 번짐은 넓은 반사 shoulder를 조절합니다.
- 게이트는 기존 `optical.frag.glsl`의 `environmentProfile`에서 스튜디오 광원·반사 프로파일과 컬러 보정을 공유합니다. 단, 큐브 대각선용 negative-fill 마스크는 게이트 어댑터에서만 제외합니다. 하나의 열린 ㄷ자 거리장과 연속적인 contour-local 광학 프레임으로 모서리를 연결하며 폭도 가로·세로 모두 원본 px 단위로 계산합니다. Snell 굴절과 Fresnel을 게이트 가상 내부면에 적용합니다. 기존 큐브의 전체 물리 경로 추적을 복제한 것은 아니며, ㄷ자 디스플레이용 별도 광학 이미지 적분 방식입니다. 기존 Axis 셰이더와 저장값은 변경하지 않습니다.
  Ctrl+Z / ⌘Z 되돌리기, Ctrl+Shift+Z / ⌘⇧Z 및 Ctrl+Y 다시 실행을 지원합니다.
  드래그는 한 조작으로 묶고 재생 시간은 유지합니다. 복원한 설정도 자동 저장합니다.
  기존 광학 설정/이름 붙인 설정을 변경하지 않습니다. 게이트의 브라우저 간 공유 및 기존 이름 붙인 설정 메뉴 연결은 아직 지원하지 않습니다.
- PNG: 원본 5248×2112까지. MP4: 테스트/4K급/원본, 30fps 고정 시간 프레임, 기존 OPFS 인코딩 기반.
  인코더가 요청 크기를 지원하지 않으면 오류를 표시하며 숨겨서 축소하지 않습니다.
- `처음 등장 포함`: 지정 길이의 등장+흐름 영상. `등장 이후 완전한 순환 1회`:
  RGB 1주기 동안 Z 이동도 정수 회전으로 맞춰 이음매 없이 반복하는 클립입니다.
  이때만 출력 스냅샷의 흐름 속도를 가장 가까운 정수 주기로 맞추며 사용자 세팅은 바꾸지 않습니다.
- `node scripts/verify-coex-gate.mjs`: 검정 시작, 층 등장, 안쪽 흐름, 중앙 마스크,
  저장/복원, 좁은 화면, 원본 PNG, 실제 MP4 인코딩과 기존 A/B route 보존 테스트.
- `artifacts/coex-gate/`: 실제 렌더 캡처 및 검증 결과. 시안용 AI 이미지를 렌더에 사용하지 않습니다.
