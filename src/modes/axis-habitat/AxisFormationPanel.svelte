<script lang="ts">
  import { get, type Writable } from "svelte/store";
  import type { AxisHabitatMotionEase, AxisHabitatMotionOrder, AxisHabitatPresetId, AxisHabitatQuality, AxisHabitatState } from "./AxisHabitatState";

  type Metrics = { fps?: number; dpr?: number; drawCalls?: number; quality?: string; stage?: string; fragments?: number };
  type NumericControl = { label: string; path: string; min: number; max: number; step: number };
  type PanelView = "motion" | "look" | "output";

  export let stateStore: Writable<AxisHabitatState>;
  export let metricsStore: Writable<Metrics>;
  export let onChange: (path: string) => void;
  export let onPreset: (id: AxisHabitatPresetId) => void;
  export let onReset: () => void;
  export let onResetMotion: () => void;
  export let onExport: () => Promise<void>;

  let activeView: PanelView = "motion";
  let busy = false;
  let error = "";

  const timingControls: NumericControl[] = [
    { label: "선 드로잉", path: "motion.timing.draw", min: .2, max: 3, step: .05 },
    { label: "조각 조립", path: "motion.timing.assemble", min: .2, max: 4, step: .05 },
    { label: "드로잉 겹침", path: "motion.timing.drawAssembleOverlap", min: 0, max: 1.5, step: .05 },
    { label: "재질 형성", path: "motion.timing.materialize", min: .15, max: 2.5, step: .05 },
    { label: "조립 겹침", path: "motion.timing.assembleMaterialOverlap", min: 0, max: 1.5, step: .05 },
    { label: "재질 유지", path: "motion.timing.materialHold", min: 0, max: 3, step: .05 },
    { label: "분해", path: "motion.timing.explode", min: .2, max: 4, step: .05 },
    { label: "분해 유지", path: "motion.timing.suspended", min: 0, max: 3, step: .05 },
    { label: "재결합", path: "motion.timing.return", min: .2, max: 4, step: .05 },
    { label: "결합 유지", path: "motion.timing.returnHold", min: 0, max: 2.5, step: .05 },
    { label: "재질 소거", path: "motion.timing.dissolve", min: .15, max: 2.5, step: .05 },
    { label: "리셋 겹침", path: "motion.timing.dissolveResetOverlap", min: 0, max: 1.5, step: .05 },
    { label: "와이어 리셋", path: "motion.timing.reset", min: .15, max: 2.5, step: .05 },
    { label: "빈 프레임", path: "motion.timing.resetHold", min: 0, max: 2, step: .05 },
  ];
  const dynamicsControls: NumericControl[] = [
    { label: "조립 스태거", path: "motion.dynamics.assembleStagger", min: 0, max: .65, step: .01 },
    { label: "분해 스태거", path: "motion.dynamics.explodeStagger", min: 0, max: .65, step: .01 },
    { label: "생성 범위", path: "motion.dynamics.spawnSpread", min: .15, max: 2.4, step: .05 },
    { label: "부유 진폭", path: "motion.dynamics.turbulence", min: 0, max: .3, step: .005 },
    { label: "부유 속도", path: "motion.dynamics.turbulenceSpeed", min: .05, max: 3, step: .05 },
    { label: "복귀 오버슈트", path: "motion.dynamics.returnOvershoot", min: 0, max: .6, step: .01 },
    { label: "전체 호흡", path: "motion.dynamics.floatAmount", min: 0, max: .18, step: .005 },
    { label: "호흡 속도", path: "motion.dynamics.floatSpeed", min: .05, max: 2, step: .05 },
    { label: "분해 투명도", path: "motion.dynamics.surfaceFade", min: 0, max: .85, step: .01 },
    { label: "카메라 풀백", path: "motion.dynamics.cameraPullback", min: 0, max: .5, step: .01 },
    { label: "연결선 지연", path: "motion.dynamics.connectorDelay", min: 0, max: .9, step: .01 },
    { label: "연결선 유지", path: "motion.dynamics.connectorPersistence", min: 0, max: .9, step: .01 },
  ];
  const structureControls: NumericControl[] = [
    { label: "조각 분할", path: "structure.subdivisions", min: 3, max: 6, step: 1 },
    { label: "조각 간격", path: "structure.fragmentGap", min: .01, max: .16, step: .005 },
    { label: "분해 거리", path: "structure.explodeDistance", min: .4, max: 4.5, step: .05 },
    { label: "분해 회전", path: "structure.twist", min: 0, max: 1.8, step: .02 },
    { label: "연결선 밀도", path: "structure.connectorDensity", min: .05, max: .8, step: .01 },
  ];
  const materialControls: NumericControl[] = [
    { label: "거칠기", path: "material.roughness", min: .05, max: .9, step: .01 },
    { label: "금속성", path: "material.metalness", min: 0, max: .8, step: .01 },
    { label: "클리어코트", path: "material.clearcoat", min: 0, max: 1, step: .01 },
    { label: "표면 요철", path: "material.bump", min: 0, max: .4, step: .01 },
    { label: "투과", path: "material.transmission", min: 0, max: .45, step: .01 },
  ];
  const lineControls: NumericControl[] = [
    { label: "설계선", path: "lines.scaffoldOpacity", min: .05, max: 1, step: .01 },
    { label: "연결선", path: "lines.connectorOpacity", min: .05, max: 1, step: .01 },
    { label: "선광", path: "lines.glow", min: 0, max: 1.8, step: .02 },
  ];
  const luminousStructureControls: NumericControl[] = [
    { label: "구조 밀도", path: "luminous.structureDensity", min: .15, max: 1, step: .01 },
    { label: "장거리 선", path: "luminous.longLineProbability", min: 0, max: .65, step: .01 },
    { label: "삼각 연결", path: "luminous.triangleProbability", min: 0, max: .8, step: .01 },
    { label: "격자 규칙성", path: "luminous.gridRegularity", min: 0, max: 1, step: .01 },
    { label: "깊이 분산", path: "luminous.depthSpread", min: .2, max: 1.4, step: .01 },
    { label: "공간 불규칙성", path: "luminous.randomness", min: 0, max: 1, step: .01 },
  ];
  const luminousLineControls: NumericControl[] = [
    { label: "코어 두께", path: "luminous.coreWidth", min: .003, max: .035, step: .001 },
    { label: "코어 광도", path: "luminous.coreIntensity", min: .5, max: 30, step: .1 },
    { label: "글로우 두께", path: "luminous.glowWidth", min: .01, max: .12, step: .002 },
    { label: "글로우 광도", path: "luminous.glowIntensity", min: .2, max: 12, step: .1 },
    { label: "외부 헤일로", path: "luminous.haloWidth", min: .025, max: .3, step: .005 },
    { label: "선 투명도", path: "luminous.lineOpacity", min: .05, max: 1, step: .01 },
    { label: "분광 색상", path: "luminous.colorVariation", min: 0, max: 1, step: .01 },
    { label: "밝기 편차", path: "luminous.brightnessRandomness", min: 0, max: 1, step: .01 },
    { label: "두께 편차", path: "luminous.widthRandomness", min: 0, max: 1, step: .01 },
    { label: "리빌 편차", path: "luminous.revealRandomness", min: 0, max: 1, step: .01 },
    { label: "라이트 트레일", path: "luminous.trailLength", min: 0, max: 1, step: .01 },
  ];
  const luminousOpticalControls: NumericControl[] = [
    { label: "노드 플래시", path: "luminous.flashIntensity", min: 0, max: 30, step: .1 },
    { label: "플레어 확률", path: "luminous.flareProbability", min: 0, max: .55, step: .01 },
    { label: "가로 스트릭", path: "luminous.anamorphicStreak", min: 0, max: 1.5, step: .01 },
    { label: "색수차 분산", path: "luminous.chromaticDispersion", min: 0, max: 1, step: .01 },
    { label: "Bloom 임계", path: "luminous.bloomThreshold", min: .25, max: 1.6, step: .01 },
    { label: "Bloom 반경", path: "luminous.bloomRadius", min: .05, max: 1, step: .01 },
    { label: "비네트", path: "luminous.vignette", min: 0, max: .7, step: .01 },
    { label: "필름 그레인", path: "luminous.grain", min: 0, max: .16, step: .005 },
  ];
  const cameraLightControls: NumericControl[] = [
    { label: "정면 프레이밍", path: "camera.distance", min: 8, max: 18, step: .05 },
    { label: "포인터 이동", path: "camera.parallax", min: 0, max: .5, step: .01 },
    { label: "노출", path: "lighting.exposure", min: .45, max: 2, step: .01 },
    { label: "키 라이트", path: "lighting.key", min: .2, max: 7, step: .05 },
    { label: "림 라이트", path: "lighting.rim", min: 0, max: 7, step: .05 },
    { label: "환경광", path: "lighting.ambient", min: .1, max: 3, step: .05 },
    { label: "블룸", path: "lighting.bloom", min: 0, max: .8, step: .01 },
  ];

  function value(path: string): number {
    return Number(path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], get(stateStore)));
  }
  function booleanValue(path: string): boolean {
    return Boolean(path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], get(stateStore)));
  }
  function setPath(path: string, nextValue: number | boolean | string): void {
    const next = get(stateStore);
    const keys = path.split(".");
    const target = keys.slice(0, -1).reduce<Record<string, unknown>>((current, key) => current[key] as Record<string, unknown>, next as unknown as Record<string, unknown>);
    target[keys[keys.length - 1]] = nextValue;
    stateStore.set(next);
    onChange(path);
  }
  async function exportPng(): Promise<void> {
    if (busy) return;
    busy = true;
    error = "";
    try { await onExport(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
</script>

<aside class="control-dock light-field-panel axis-habitat-panel" data-mode-panel="axis-habitat">
  <header class="inspector-header">
    <div><strong>FORMATION LOOP</strong><span>SVELTE · THREE.JS · WEBGL2</span></div>
    <small aria-live="polite">{$metricsStore.stage ?? "READY"} · {Math.round($metricsStore.fps ?? 0)} FPS</small>
  </header>
  <nav class="formation-tabs" aria-label="Formation 설정 범주">
    <button class:active={activeView === "motion"} aria-pressed={activeView === "motion"} on:click={() => activeView = "motion"}>모션</button>
    <button class:active={activeView === "look"} aria-pressed={activeView === "look"} on:click={() => activeView = "look"}>비주얼</button>
    <button data-formation-tab="output" class:active={activeView === "output"} aria-pressed={activeView === "output"} on:click={() => activeView = "output"}>출력</button>
  </nav>

  <div class="inspector-views formation-views" aria-label={activeView === "motion" ? "모션 설정" : activeView === "look" ? "비주얼 설정" : "출력 설정"}>
    {#if activeView === "motion"}
      <section class="studio-section formation-status">
        <header><h2>형성 상태</h2><p>현재 단계와 루프의 핵심 재생값을 먼저 조절합니다</p></header>
        <div class="formation-readout"><span><i></i>{$metricsStore.stage ?? "READY"}</span><b>{$metricsStore.fragments ?? 0} FRAGMENTS</b></div>
        <div class="formation-stage-map" aria-label="모션 단계 순서"><span>WIRE</span><span>BUILD</span><span>MATTER</span><span>BREAK</span><span>RETURN</span></div>
        <label class="toggle-row primary-toggle"><span>모션 활성화</span><input aria-label="모션 활성화" type="checkbox" checked={booleanValue("motion.enabled")} on:change={(event) => setPath("motion.enabled", (event.currentTarget as HTMLInputElement).checked)}></label>
        <div class="property-row formation-property"><label for="motion.speed">재생 배속</label><input id="motion.speed" aria-label="재생 배속" type="range" min=".1" max="3" step=".05" value={value("motion.speed")} on:input={(event) => setPath("motion.speed", Number((event.currentTarget as HTMLInputElement).value))}><input aria-label="재생 배속 값" type="number" min=".1" max="3" step=".05" value={value("motion.speed")} on:change={(event) => setPath("motion.speed", Number((event.currentTarget as HTMLInputElement).value))}></div>
        <div class="property-row formation-property"><label for="motion.duration">루프 길이</label><input id="motion.duration" aria-label="루프 길이" type="range" min="4" max="30" step=".1" value={value("motion.duration")} on:input={(event) => setPath("motion.duration", Number((event.currentTarget as HTMLInputElement).value))}><input aria-label="루프 길이 초" type="number" min="4" max="30" step=".1" value={value("motion.duration")} on:change={(event) => setPath("motion.duration", Number((event.currentTarget as HTMLInputElement).value))}></div>
        <label class="select-row"><span>조각 순서</span><select aria-label="조각 모션 순서" value={$stateStore.motion.order} on:change={(event) => setPath("motion.order", (event.currentTarget as HTMLSelectElement).value as AxisHabitatMotionOrder)}><option value="clustered">클러스터 랜덤</option><option value="center-out">중심에서 바깥</option><option value="solid-cascade">육면체 순차</option></select></label>
        <label class="select-row"><span>이징 성격</span><select aria-label="모션 이징 성격" value={$stateStore.motion.ease} on:change={(event) => setPath("motion.ease", (event.currentTarget as HTMLSelectElement).value as AxisHabitatMotionEase)}><option value="cinematic">시네마틱</option><option value="smooth">부드럽게</option><option value="snappy">빠르고 선명하게</option><option value="elastic">탄성 복귀</option></select></label>
        <button class="wide-button" on:click={onResetMotion}>모션값 초기화</button>
      </section>
      <details class="field-details formation-motion-group" open>
        <summary><span><strong>단계 타이밍</strong><small>각 구간의 상대 길이와 겹침</small></span></summary>
        <div>{#each timingControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</div>
      </details>
      <details class="field-details formation-motion-group" open>
        <summary><span><strong>조각 다이내믹스</strong><small>스태거·부유·오버슈트·카메라 반응</small></span></summary>
        <div>{#each dynamicsControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</div>
      </details>
    {:else if activeView === "look"}
      <section class="studio-section luminous-primary-controls">
        <header><h2>발광 공간 구조</h2><p>세 형태의 골격 안에서 불규칙한 광선망과 외곽 확장선을 생성합니다</p></header>
        {#each luminousStructureControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}
      </section>
      <details class="field-details formation-motion-group" open><summary><span><strong>HDR 필라멘트</strong><small>white-hot core · spectral glow · outer halo</small></span></summary><div>{#each luminousLineControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</div></details>
      <details class="field-details formation-motion-group" open><summary><span><strong>광학 후처리</strong><small>선택 Bloom · flare · dispersion · grain</small></span></summary><div>{#each luminousOpticalControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</div></details>
      <section class="studio-section">
        <header><h2>프리셋과 구조</h2><p>공유 원점은 유지하고 조각 수·간격·분해 규모를 조절합니다</p></header>
        <label class="select-row"><span>프리셋</span><select aria-label="Formation 프리셋" value={$stateStore.preset} on:change={(event) => onPreset((event.currentTarget as HTMLSelectElement).value as AxisHabitatPresetId)}><option value="frosted-formation">Frosted Formation</option><option value="obsidian-signal">Obsidian Signal</option><option value="blue-archive">Blue Archive</option></select></label>
        <button class="wide-button" on:click={onReset}>현재 프리셋 초기화</button>
        {#each structureControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}
      </section>
      <section class="studio-section"><header><h2>실재 재질</h2><p>절차형 표면과 환경 반사의 물성을 조절합니다</p></header>{#each materialControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</section>
      <details class="field-details" open><summary>선과 공간</summary><div>{#each lineControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}<div class="property-row formation-property"><label for="atmosphere.dust">미세 입자</label><input id="atmosphere.dust" aria-label="미세 입자" type="range" min="0" max="800" step="10" value={value("atmosphere.dust")} on:input={(event) => setPath("atmosphere.dust", Number((event.currentTarget as HTMLInputElement).value))}><input aria-label="미세 입자 값" type="number" min="0" max="800" step="10" value={value("atmosphere.dust")} on:change={(event) => setPath("atmosphere.dust", Number((event.currentTarget as HTMLInputElement).value))}></div></div></details>
      <details class="field-details"><summary>카메라와 라이팅</summary><div>{#each cameraLightControls as control}<div class="property-row formation-property"><label for={control.path}>{control.label}</label><input id={control.path} aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:input={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}><input aria-label={control.label + " 값"} type="number" min={control.min} max={control.max} step={control.step} value={value(control.path)} on:change={(event) => setPath(control.path, Number((event.currentTarget as HTMLInputElement).value))}></div>{/each}</div></details>
    {:else}
      <section class="studio-section"><header><h2>실시간 품질</h2><p>{$metricsStore.quality ?? "AUTO"} · DPR {($metricsStore.dpr ?? 1).toFixed(2)} · {$metricsStore.drawCalls ?? 0} CALLS</p></header><label class="select-row"><span>품질</span><select aria-label="실시간 품질" value={$stateStore.performance.quality} on:change={(event) => setPath("performance.quality", (event.currentTarget as HTMLSelectElement).value as AxisHabitatQuality)}><option value="auto">AUTO</option><option value="performance">LOW</option><option value="balanced">MEDIUM</option><option value="quality">HIGH</option><option value="ultra">ULTRA</option></select></label><label class="toggle-row"><span>적응형 해상도</span><input aria-label="적응형 해상도" type="checkbox" checked={booleanValue("performance.adaptiveDpr")} on:change={(event) => setPath("performance.adaptiveDpr", (event.currentTarget as HTMLInputElement).checked)}></label><label class="toggle-row"><span>후처리</span><input aria-label="후처리" type="checkbox" checked={booleanValue("performance.postprocessing")} on:change={(event) => setPath("performance.postprocessing", (event.currentTarget as HTMLInputElement).checked)}></label></section>
      <section class="studio-section" data-habitat-output><header><h2>현재 프레임</h2><p>현재 루프 위치를 정확한 아트보드 크기로 저장합니다</p></header><div class="export-summary"><span>PNG · WEBGL2 · 4× MSAA</span><b>{$stateStore.artboard.width} × {$stateStore.artboard.height}px</b></div><button class="wide-button primary" disabled={busy} aria-busy={busy} on:click={exportPng}>{busy ? "PNG 생성 중…" : "PNG 내보내기"}</button>{#if error}<p class="formation-error" role="status">{error}</p>{/if}</section>
    {/if}
  </div>
</aside>
