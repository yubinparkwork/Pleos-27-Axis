# Motion Studio V1 — Current State

## 기준 상태

- 작업 전 HEAD: `bca21b9662f1b18fd2c68478b57722c9bb04674b`
- 작업 전 `typecheck`, `verify`, `build`: 통과
- 작업 전 캡처: `artifacts/motion-v1/before/prism-static.png`
- 렌더 기능 보존 재작업 전 캡처: `artifacts/motion-v1/before/current-replaced-site.png`
- 기존 워크스페이스의 다른 변경 파일은 수정하거나 제거하지 않음

## 구현 상태

- 절대 시간 기반 MotionClock / MotionEngine
- strict / anchored / experimental constraint
- Spectral Axis Sweep / Shared Vertex Pulse / Explode & Rejoin
- SharedVertexPivot → SolidOffsetGroup 구조
- playback 중 raster preview, 현재 frame path-traced still
- virtual artboard preset 6종
- V1 → V2 localStorage migration
- Playwright fixed-timestep PNG sequence
- SETUP / LOOK / MOTION / FORMAT / EXPORT Inspector
- Advanced drawer와 global transport
- 기존 Still Studio의 16spp 빠른 렌더와 설정 기반 고품질 누적 렌더
- artboard pixel 기준 부분 렌더, 가운데 정렬, px/mm/cm/in 변환, 방향키 증감
- PPI metadata 일반 출력과 PPI 비율 기반 인쇄 출력

## 검증

- `npm run qa`: 통과
- 기본 optical solid: 3
- line primitive: 0
- gap 0 shared corner: `[0, 0, 0]`
- 기본 light: 9
- 6초 × 30fps sequence rule: 180 frames
- smoke sequence: 96 × 120px, 3 frames
- retained render smoke: raster 160 × 120px, fast path 160 × 120px
- browser 수동 검증: 50mm → 189px, 331 × 240px 부분 영역 fast/high 16spp 완료
- browser console 신규 error: 없음

## 알려진 제한

- Motion Studio V1의 sequence는 raster 전용이다. path-traced motion sequence는 범위 밖이다.
- current-frame path tracing은 GPU 성능과 output pixel dimension에 따라 시간이 크게 달라진다.
- `three-mesh-bvh` dependency가 출력하는 `maxLeafTris` deprecation warning은 upstream 라이브러리 경고이며 런타임 실패가 아니다.
