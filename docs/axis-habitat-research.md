# Formation Loop — Igloo Reference Research and PLEOS Implementation Record

## 범위

이 기록은 [Mesh3D의 Igloo 소개 페이지](https://mesh3d.gallery/website/igloo-inc)와 공개된 프리뷰 영상을 관찰해, 그 형성 언어를 PLEOS의 고정 3-solids 구조로 번역한 근거를 정리한다. Igloo의 모델, 텍스처, 카피, 음향, 브랜드 구성은 복제하지 않는다.

## 프레임 단위 관찰

공개 프리뷰는 1920×1440, 약 20.1초의 사전 렌더 MP4다. 초반 약 9초에서 다음 순서를 확인했다.

1. 어두운 빈 공간에서 짧은 선분과 구조선이 순차적으로 나타난다.
2. 선이 공간의 부피와 블록 경계를 먼저 설명한다.
3. 같은 구조 위에 밝은 물리 재질과 환경광이 점진적으로 올라온다.
4. 완성된 물체를 잠시 유지해 형태와 표면을 읽게 한다.
5. 블록이 한꺼번에 사라지지 않고 구역별로 분리되며 주변 선과 관계를 만든다.
6. 분해된 상태는 다음 장면으로 연결되는 전환 구간으로 사용된다.

이 구현은 위의 시간 구조만 차용하고, 대상은 `CrystalAssembly`가 정의한 PLEOS의 세 육면체로 고정한다.

## 확인한 기술 스택과 역할

갤러리 표기에는 Svelte, GSAP, WebGL, Three.js, `three-mesh-bvh`가 포함되어 있다. 라이브 사이트의 공개 번들에서도 별도 3D 청크, Three.js 렌더링, 후처리, 인스턴싱, BVH, GLTF/KTX2/Draco/Meshopt 계열 로더가 확인됐다. 이것은 제작 전략을 보여 주지만, 공개 영상의 각 픽셀이 특정 클래스에서 나왔다고 단정하는 근거는 아니다.

| 기술 | Formation Loop에서 맡는 실제 역할 |
| --- | --- |
| Svelte | 모드 전용 Inspector, 상태 표시, 프리셋과 제작 파라미터, 정확한 PNG 출력 UI |
| Three.js | 카메라, 물리 재질, 조명, 그림자, 환경 반사, 인스턴스 조각, 후처리와 리소스 수명주기 |
| WebGL2 | Three.js의 실시간 렌더 백엔드와 직접 작성한 구조선·입자 셰이더 |
| GSAP | DRAWING → ASSEMBLING → MATERIALIZING → DISASSEMBLING → SUSPENDED → REASSEMBLING의 결정론적 루프 |
| three-mesh-bvh | 세 고정 PLEOS 솔리드의 보이지 않는 정적 프록시와 first-hit 포인터 레이캐스트 |

## PLEOS 형상 계약

Formation Loop는 별도 3D 모델 파일을 사용하지 않는다. `src/crystal/CrystalAssembly.ts`와 동일한 값을 코드로 공유한다.

- cube basis screen directions: `30° / 90° / 150°`
- depth signs: `+ / − / +`
- local touch corners: `[0,0,0]`, `[1,1,0]`, `[0,1,1]`
- separation directions: `90° / 210° / 330°`
- span: `1.35`
- 결과: 세 솔리드는 같은 방향의 affine cube basis를 사용하고 원점의 한 꼭짓점을 공유한다.

각 솔리드는 기본 5×5×5 셀로 나뉘어 총 375개의 조각이 된다. 셀은 개별 인스턴스로 렌더되지만 분해 벡터·회전축·딜레이는 2×2×2 계열의 클러스터를 공유해 작은 덩어리처럼 움직인다.

## 모션 제어 구조

- 전체 루프는 절대 시간과 GSAP progress로 평가하므로 실시간 재생과 특정 프레임 PNG가 같은 결과를 만든다.
- 선 드로잉, 조립, 재질 형성/유지, 분해/유지, 재결합/유지, 재질 소거, 와이어 리셋, 빈 프레임을 개별 조절한다. 인접 단계의 겹침도 별도 값이다.
- 조각 순서는 클러스터 랜덤, 중심에서 바깥, 육면체 순차 중 선택한다. 시네마틱, 부드럽게, 스내피, 탄성 이징이 같은 타이밍 데이터에 다른 속도 곡선을 적용한다.
- 조립/분해 스태거, 생성 범위, 국소 부유, 복귀 오버슈트, 전체 호흡, 분해 중 표면 감쇠, 카메라 풀백, 연결선 지연/유지를 프레임마다 결정론적으로 계산한다.
- Inspector는 모션, 비주얼, 출력의 세 범주로 나뉘며 모션을 기본 작업 화면으로 사용한다. 고급 타이밍과 다이내믹스는 접을 수 있지만 현재 단계와 핵심 재생값은 항상 먼저 보인다.
- 비주얼 패널은 세 형태의 크기와 위치를 바꾸지 않고 내부 구조 밀도, 장거리 선과 삼각 연결 확률, 격자 규칙성, 깊이 분산, 선별 밝기·두께·색·리빌 편차, 플레어·Bloom·색수차·비네트·그레인을 조정한다.

## 렌더 구조

1. 빛 골격: PLEOS의 세 육면체 범위 안에 부분 경계선, 축 직선, 대각선, 삼각 연결을 놓고 일부는 범위 밖으로 길게 연장한다. 완전한 박스 edge는 노출하지 않아 큐브는 보이는 와이어가 아니라 생성 규칙이 된다.
2. HDR 필라멘트: 각 선분을 white-hot core, 가산 혼합 spectral glow, 넓은 outer halo의 세 `LineSegments` shader 레이어로 렌더한다. 선별 밝기 분포를 비선형으로 두어 다수는 사라지고 소수만 강하게 읽힌다.
3. 플레어와 후처리: 선택된 종점에만 절차형 point flare와 가로 스트릭을 놓는다. HIGH는 내부 multi-mip selective Bloom, ULTRA는 추가 sharp/wide Bloom을 사용하고, 하이라이트 주변에만 색 분산을 적용한 뒤 비네트·그레인·SMAA를 더한다.
4. 물질 힌트: 솔리드마다 하나의 `InstancedMesh`와 절차형 컬러·범프·러프니스 텍스처, clearcoat, transmission, PMREM 환경을 유지하지만 불투명도를 낮게 제한한다. 셀은 형태의 주역이 아니라 재질 형성과 분해 구간의 부피 힌트다.
5. 관계선과 공간: 선택된 셀의 home/current 위치를 동적 `LineSegments`로 연결하고, 낮은 명도의 30° 배경 구조선, GPU `Points`, FogExp2로 깊이를 보조한다.
6. 조명 위계: 완전한 검정 공간 위에 세 형태의 밝은 필라멘트, 선택된 플레어, 반투명 물질, 배경 구조선·입자 순으로 대비 위계를 둔다. key/rim/hemisphere/area/grazing 조명과 ACES tone mapping은 물질 힌트에만 보조적으로 작용한다.
7. 성능: 조각은 인스턴싱하고 필라멘트는 3개 shader draw로 묶는다. LOW·MEDIUM·HIGH·ULTRA 품질 프로필이 subdivision·network density·dust·DPR·shadow map·Bloom pass를 제한하며, 적응형 DPR은 지속 프레임 저하에 반응한다.
8. 출력: GSAP timeline을 절대 시간으로 seek한 뒤 4× MSAA와 동일한 후처리를 적용해 1080×1080 등 정확한 drawing buffer에서 불투명 PNG를 생성한다.

## 공식 구현 근거

| 출처 | 적용 판단 |
| --- | --- |
| [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | 반복 셀을 솔리드별 표면/와이어 인스턴스로 묶어 draw call을 제한한다. |
| [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) | pixel ratio를 품질별로 제한하고 `renderer.info`를 Inspector와 런타임 테스트에 노출한다. |
| [Three.js texture guide](https://threejs.org/manual/en/textures.html) | V1은 작은 절차형 canvas texture만 사용한다. 이후 외부 에셋은 KTX2와 명시적인 VRAM 예산을 전제로 한다. |
| [Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html) | 모드 전환 시 geometry, material, texture, BVH, composer와 renderer를 명시적으로 해제한다. |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 애니메이션 조각마다 BVH를 갱신하지 않고, 세 개의 정적 솔리드 프록시에만 BVH를 구축한다. |
| [GSAP timeline](https://gsap.com/docs/v3/GSAP/Timeline/) | UI 재생 시간과 고정 프레임 출력이 같은 timeline progress를 평가하도록 한다. |
| [Svelte runtime API](https://svelte.dev/docs/svelte/imperative-component-api) | 모드 mount/unmount에 맞춰 Inspector 컴포넌트를 생성하고 해제한다. |
| [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | 무제한 devicePixelRatio 대신 상한·적응형 해상도·draw-call 검증을 둔다. |

## 한계와 다음 자산 단계

- 현재는 PLEOS 형상을 유지하는 절차형 구현이며 Igloo의 독점 에셋을 포함하지 않는다.
- 실제 촬영 기반 재질과 복잡한 환경이 필요해지면 GLB + Meshopt/Draco, KTX2 컬러/노멀/러프니스/AO, EXR 환경을 별도 예산으로 추가한다.
- 이 단계에서도 인스턴싱, 정적 BVH 범위, shader warm-up, 명시적 disposal 원칙은 유지한다.
