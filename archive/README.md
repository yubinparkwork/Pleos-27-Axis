# Archive boundary

이 폴더는 이전 구현과 비교 자산을 **삭제하지 않고 보존**하는 비활성 영역입니다.

- `legacy-source/`: 이전 렌더러와 UI 소스
- `legacy-scripts/`: 이전 `window.__newAxis` API를 대상으로 하던 캡처·비교 자동화
- `legacy-assets/`: 새 production graph에서 참조하지 않는 과거 reference 자산

`src/`, `index.html`, `public/`, 활성 `scripts/` 또는 Vite import graph가 이 폴더를 참조해서는 안 됩니다. 필요한 과거 항목은 복사해 재사용하지 말고, 현재 Axis/brand API에 맞춰 새로 구현합니다.
