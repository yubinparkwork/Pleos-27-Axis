# PLEOS 27 Axis — Motion Studio V1

현재 production route는 Three.js optical Prism과 deterministic motion runtime을 결합한 Motion Studio입니다.

## 완료

- gap 0의 세 solid shared vertex origin 유지
- canonical 30° Axis 기반 3개 motion preset
- Play / Pause / Seek / frame step / seamless loop
- playback raster preview와 current-frame path-traced still 분리
- SETUP / LOOK / MOTION / FORMAT / EXPORT Inspector
- Advanced light / physical render controls
- global motion transport와 keyboard shortcuts
- viewport 독립 virtual artboard 6종
- exact-pixel raster PNG와 fixed-timestep sequence script
- 기존 Still Studio의 빠른/고품질 누적 렌더 복원
- pixel 부분 렌더 영역, 가운데/전체 정렬, mm/cm/in 입력 및 방향키 조절 복원
- 일반 PNG PPI metadata와 물리 크기 유지 인쇄 출력 분리
- localStorage settings V2 및 V1 migration
- default route에서 legacy renderer lazy-load
- automated type, path-tracer, motion, retained render-tool, build verification

상세 구현과 검증 상태는 `docs/motion-v1-current-state.md`를 참고합니다.
# SPECTRAL FLOW Look (2026-08-27)

- CLEAR / PRISM / SMOKED를 유지한 채 독립형 `spectral-flow` Look 추가
- 기존 3-solid geometry, shared vertex, canonical 30° Axis, orthographic camera 재사용
- `MeshPhysicalMaterial.onBeforeCompile` 기반 realtime raster optical field 구현
- world/local position, normal, view/camera, Axis origin/direction, MotionClock time uniform 연결
- SUBTLE / BALANCED / ACTIVE와 FLOW / SPECTRUM / LIGHT / SURFACE UI 추가
- 6초 seamless boundary 수치 검증, path trace와 raster 출력 전략 분리
- 고해상도 current frame / print / fixed-frame sequence가 동일 래스터 셰이더 사용
- 9종 QA 캡처 및 0/25/50/75/100% 비교 자동화 스크립트 추가
- `npm run verify:spectral-flow`, `npm run typecheck`, `npm run build` 통과
