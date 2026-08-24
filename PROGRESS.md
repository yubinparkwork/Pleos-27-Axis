# New Axis 3D Studio — 완료 체크포인트

저장 시점: 2026-08-20

## 완료

- 기존 screen-space 셰이더 렌더를 잠긴 `baseline-2d` 모드로 보존
- `studio-3d`, `split-compare`, difference 비교 모드 구성
- 실제 `THREE.Scene`, 5개 `BufferGeometry`/`Mesh`, 독립 flat normal과 ray별 Z depth 구현
- Orthographic/Perspective 카메라, OrbitControls, 6개 카메라 프리셋 구현
- 실제 directional key/fill/rim light와 로컬 RoomEnvironment 구현
- 8개 MeshPhysicalMaterial 프리셋 구현
- 12개 로컬 procedural texture, 8개 texture slot, 업로드/교체/삭제, 3개 UV projection 구현
- 실제 crease strip geometry, wireframe/normal/vertex/axis 디버그, face raycast 선택 구현
- post-processing, preset/history/localStorage/variation, 고해상도 canvas-only export 구현
- 출력 aspect lock, preview quality, texture session 표시와 preview 추가
- type-check와 production build 통과
- 브라우저에서 orthographic, perspective 3/4, exploded/wireframe/normals 확인

## 보존 검증

- 구현 전 기준: `artifacts/baseline/before-render-2800x2080.png`
- 구현 후 기준: `artifacts/3d/baseline-after-2800x2080.png`
- 비교 보고서: `artifacts/3d/baseline-comparison.json`
- 2800×2080 MAE: `0.00000606685 / 255`
- 최대 채널 오차: `1`, 변경 픽셀: `106 / 5,824,000` (`0.00182%`)

## 현재 3D 결과

- 정면 고해상도 렌더: `artifacts/3d/orthographic-reference-2800x2080.png`
- 정면 브라우저 UI 원본: `artifacts/3d/ui-full-capture.jpg`
- 1440×900 UI 캡처 후보: `artifacts/3d/studio-ui-1440x900.png`

## 완료된 마무리 작업

1. 1440×900 UI 캡처 최종 확인
2. perspective/front/three-quarter, wireframe, normal, exploded, 좌우 조명 검증 캡처 저장
3. 8개 material 및 procedural/user texture 검증 캡처 저장
4. 현재 UI에 맞게 `scripts/verify-studio.mjs`와 캡처 스크립트 갱신
5. README를 실제 3D Studio 구조와 사용법으로 전면 갱신
6. 최종 type-check/build/browser console 재검증 완료

## 참고

- 업로드 texture binary는 의도적으로 localStorage에 저장하지 않고 세션 GPU texture로만 유지한다.
- `triplanar`는 아직 구현하지 않았으며, 현재 완성된 projection은 screen-continuous, world-planar, face-local이다.
- Git 작업 트리는 프로젝트 전체가 기존부터 dirty/untracked 상태이므로 reset/clean하지 않았다.
