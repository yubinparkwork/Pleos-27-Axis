import { OpticalRenderer } from "./OpticalRenderer";
import { CUBE0914, CUBE0914_SOURCE } from './Cube0914';
import { HYBRID_AB, HYBRID_DEFAULTS, createHybridState, inspectHybrid } from './HybridAB';
import { mountOpticalPanel } from "./OpticalPanel";
import { OPTICAL_ASPECTS, OPTICAL_DEFAULTS, OPTICAL_SPACING_KEYS, opticalDimensions, opticalVideoDimensions, sanitizeOpticalState } from "./OpticalState";
import type { OpticalState } from "./OpticalState";
import type { OpticalVideoOptions, OpticalVideoResult } from './OpticalVideoExporter';
import { OPTICAL_CUBE_SCALE, getAxisCubes, getRenderAxisCubes } from "./AxisGeometry";
import { LUMINOUS_REFERENCE, BEFORE_LUMINOUS_STORAGE_KEY } from './LuminousReference';
import { inspectLightCycle } from './OpticalLighting';
import { identityLayerTiming } from './IdentityLayerTiming';
import { identityAxisAccent } from './IdentityAxisAccent';
import { opticalCameraPose } from './OpticalCameraMotion';
import { opticalCameraFloat } from './OpticalCameraFloat';
import { opticalAxisPose, writeWorldToAxis, transformAxisVector } from './OpticalAxisMotion';
import pleosB from './shared/pleos-b-20260911.json';

const STORAGE_KEY = "pleos-optical-studio-v1";
type VideoDownload = Omit<OpticalVideoResult, 'blob'> & { url: string };

export function mountOpticalStudio(root: HTMLElement): () => void {
  const sharedScene = new URLSearchParams(location.search).get('scene') === 'pleos-b-20260911';
  const identityScene = new URLSearchParams(location.search).get('sequence') === 'pleos25';
  const layeredScene = identityScene && new URLSearchParams(location.search).get('transition') === 'layered';
  // A shared scene has its own saved edits; never replace the local working scene.
  const storageKey = HYBRID_AB ? `${STORAGE_KEY}:hybrid-ab` : CUBE0914 ? `${STORAGE_KEY}:cube0914-motion` : layeredScene ? `${STORAGE_KEY}:identity25:layered` : identityScene ? `${STORAGE_KEY}:identity25` : sharedScene ? `${STORAGE_KEY}:pleos-b-20260911` : STORAGE_KEY;
  let saved: unknown;
  try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { /* Recover corrupted state without touching the old studio. */ }
  // First-time visitors start with the approved local Pleos B composition.
  // Existing personal edits remain authoritative on subsequent visits.
  let initial = saved;
  if (HYBRID_AB && !initial) {
    let source: unknown;
    try { source=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null'); } catch { /* Safe standalone default. */ }
    initial=createHybridState(source);
  }
  if (CUBE0914 && !initial) {
    let archived: unknown;
    try { archived = JSON.parse(localStorage.getItem(`${CUBE0914_SOURCE}:${STORAGE_KEY}`) ?? 'null'); } catch { /* Original defaults remain a safe fallback. */ }
    initial = { ...(archived ?? pleosB) as object, cameraMotion: 1, cameraOrbitHorizontal: -24,
      cameraOrbitVertical: 6, cameraMoveSeconds: 8, axisMotion: 0, cameraFloat: 0,
      identityTransition: 0, time: 0, playing: true };
  }
  if (layeredScene && !initial) {
    // Read only the explicitly selected predecessor. Its original namespace,
    // the engraving sequence and named saves remain untouched.
    const sourceVersion=new URLSearchParams(location.search).get('from');
    const sourceKey=sourceVersion && /^saved-\d+$/.test(sourceVersion)
      ? `${sourceVersion}:${STORAGE_KEY}:identity25` : `${STORAGE_KEY}:identity25`;
    try { initial=JSON.parse(localStorage.getItem(sourceKey)??'null'); } catch { /* Defaults if unreadable. */ }
    initial={...sanitizeOpticalState(initial??pleosB),identityTransition:1,identityEngraving:0,
      identityLayerStagger:1,identityCenterVersion:2,time:0,playing:true};
  }
  if (identityScene && !initial) {
    try { initial = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { /* Clone only readable settings. */ }
    initial = { ...sanitizeOpticalState(initial ?? pleosB), identityTransition: 1,
      identityHold: 5.3, identityDissolve: 3, duration: 15, time: 0, playing: true,
      panX: 0, identityCenterVersion: 2 };
  }
  if (!HYBRID_AB && identityScene && saved && sanitizeOpticalState(saved).identityCenterVersion < 2) {
    // Center only the old transition composition, once. Keep its raw previous
    // camera/state recoverable; subsequent intentional camera edits always win.
    try {
      const backupKey = `${STORAGE_KEY}:identity25:before-centered-light-v2`;
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(saved));
      initial = { ...sanitizeOpticalState(saved), panX: 0, identityCenterVersion: 2 };
    } catch { /* If backup is unavailable, preserve the existing camera. */ }
  }
  let state = sanitizeOpticalState(initial ?? pleosB);
  if (CUBE0914) { state.identityTransition=0; state.axisMotion=0; state.cameraFloat=0; }
  let renderer: OpticalRenderer | undefined;
  let dirty = true, disposed = false, exporting = false, frame = 0, lastTime = performance.now(), lastUi = 0;
  let width = 1, height = 1, frameMs = 0;
  let videoController: AbortController | undefined;
  let videoStatus = '대기 중', videoProgress = 0;
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  const releaseDownload = (url: string) => {
    clearTimeout(downloads.get(url)); downloads.delete(url); URL.revokeObjectURL(url);
  };
  const save = () => {
    try {
      if (saved && typeof saved === 'object' && !('lightColor' in saved) && !localStorage.getItem('pleos-optical-before-dimension-layers-v1')) {
        localStorage.setItem('pleos-optical-before-dimension-layers-v1', JSON.stringify({ savedAt: new Date().toISOString(), state: saved }));
      }
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
    catch { panel.status("브라우저 저장 공간이 부족합니다. 설정 자동 저장을 사용할 수 없습니다."); }
  };
  const set = (patch: Partial<OpticalState>) => {
    // A video uses one immutable scene snapshot. Ignore external state changes
    // as well as inspector input until output finishes or is cancelled.
    if (exporting || disposed) return;
    // Keep shared-spacing automation/capture callers compatible. New controls
    // supply only their cube key, so they never affect the other two values.
    const next = { ...state, ...patch };
    if (patch.lightCycle === true && !state.lightCycle && patch.lightCycleOffset === undefined) {
      // Start Red at the current timeline position; palette edits never reorder it.
      // Store the phase, not wall-clock time, so reload/export are identical.
      next.lightCycleOffset = next.time / next.duration;
    }
    if (typeof patch.dimensionSpacing === 'number' && Number.isFinite(patch.dimensionSpacing)) {
      for (const key of OPTICAL_SPACING_KEYS) if (!(key in patch)) next[key] = patch.dimensionSpacing;
    }
    state = sanitizeOpticalState(next);
    if (CUBE0914) { state.identityTransition=0; state.cameraFloat=0; state.axisMotion=0;
      for (const key of ['dimensionTop','dimensionLeft','dimensionRight'] as const) state[key]=Math.min(12,state[key]); }
    dirty = true; save(); panel.update(state); resize();
  };
  const capture = async (w: number, h: number, samples = 4) => {
    if (!renderer) throw new Error("렌더러가 준비되지 않았습니다.");
    if (exporting) throw new Error("이미 다른 파일을 내보내는 중입니다.");
    exporting = true;
    const snapshot = { ...state };
    try { return await renderer.capture(snapshot, w, h, samples, progress => panel.status(`고해상도 렌더링 · ${Math.round(progress * 100)}%`, true)); }
    finally { exporting = false; lastTime = performance.now(); dirty = true; panel.status("광학 렌더러 준비됨"); }
  };
  const exportVideo = async (options: Partial<OpticalVideoOptions> = {}, download = true): Promise<VideoDownload> => {
    if (!renderer || disposed) throw new Error('렌더러가 준비되지 않았습니다.');
    if (exporting) throw new Error('이미 다른 파일을 내보내는 중입니다. 완료하거나 취소한 뒤 다시 시도해 주세요.');
    const snapshot = { ...state };
    const [w, h] = opticalVideoDimensions(snapshot.aspect, snapshot.videoLongEdge);
    const settings: OpticalVideoOptions = {
      width: w, height: h, fps: snapshot.videoFps, samples: snapshot.videoSamples,
      start: 0, end: snapshot.duration, ...options,
    };
    const controller = new AbortController();
    videoController = controller; exporting = true;
    const progress = (message: string, fraction: number) => {
      videoStatus = message; videoProgress = Math.max(0, Math.min(1, fraction));
      if (!disposed) panel.videoProgress(message, videoProgress, true);
    };
    progress('영상 저장을 준비하는 중…', 0);
    try {
      // No encoder/muxer code is loaded during normal preview playback.
      const { exportOpticalVideo } = await import('./OpticalVideoExporter');
      const { blob, ...metadata } = await exportOpticalVideo(snapshot, settings, controller.signal, progress);
      if (controller.signal.aborted || disposed) throw new DOMException('영상 저장을 취소했습니다.', 'AbortError');
      const url = URL.createObjectURL(blob);
      downloads.set(url, setTimeout(() => releaseDownload(url), 10 * 60 * 1000));
      if (download) {
        const link = document.createElement('a');
        link.download = metadata.filename; link.href = url;
        document.body.append(link); link.click(); link.remove();
      }
      videoStatus = `${metadata.width} × ${metadata.height} · ${metadata.fps}fps · ${metadata.codecLabel} MP4 저장 완료`;
      videoProgress = 1;
      return { ...metadata, url };
    } catch (error) {
      videoStatus = error instanceof Error && error.name === 'AbortError'
        ? '영상 저장을 취소했습니다.' : `영상 저장 실패: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    } finally {
      videoController = undefined; exporting = false;
      // Export time never advances the interactive clock. Keep the user's
      // play/pause choice and return to the exact preview frame they left.
      lastTime = performance.now(); dirty = true;
      if (!disposed) { panel.update(state); panel.videoProgress(videoStatus, videoProgress, false); }
    }
  };
  const panel = mountOpticalPanel(root, state, {
    change: (key, value) => set({ [key]: value }),
    togglePlay: () => set({ playing: !state.playing, ...(state.identityTransition && state.time >= state.duration ? { time: 0 } : {}) }),
    reset: () => set({ ...(HYBRID_AB ? HYBRID_DEFAULTS : OPTICAL_DEFAULTS) }),
    applyReference: () => {
      // Keep the first pre-rebuild state even if the mood button is used again.
      try {
        if (!localStorage.getItem(BEFORE_LUMINOUS_STORAGE_KEY)) localStorage.setItem(BEFORE_LUMINOUS_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), state }));
      } catch { throw new Error('이전 세팅을 백업할 수 없어 무드 적용을 중단했습니다.'); }
      set({ ...LUMINOUS_REFERENCE });
    },
    exportPng: async () => {
      const [w, h] = opticalDimensions(state.aspect);
      const url = await capture(w, h, 16);
      const link = document.createElement("a"); link.download = `pleos-optical-${w}x${h}-${state.time.toFixed(2)}s.png`; link.href = url; link.click();
    },
    exportVideo: async () => { await exportVideo(); },
    cancelVideo: () => videoController?.abort(),
  });
  const canvas = root.querySelector<HTMLCanvasElement>("#optical-canvas")!;
  const viewport = root.querySelector<HTMLElement>(".optical-viewport")!;
  function resize() {
    const bounds = viewport.getBoundingClientRect();
    const [aw, ah] = opticalDimensions(state.aspect, 960);
    const fit = Math.min(Math.max(1, bounds.width - 32) / aw, Math.max(1, bounds.height - 32) / ah);
    canvas.style.width = `${aw * fit}px`; canvas.style.height = `${ah * fit}px`;
    // Supersample the displayed artboard, including 1× displays. Do not enlarge
    // the old 960px framebuffer when the viewport or zoom is large.
    const limit = state.playing ? 1280 : 1920;
    const resolution = Math.min(Math.max(devicePixelRatio, 1.5), 2, limit / Math.max(aw * fit, ah * fit));
    width = Math.max(1, Math.round(aw * fit * resolution)); height = Math.max(1, Math.round(ah * fit * resolution)); dirty = true;
  }
  const observer = new ResizeObserver(resize); observer.observe(viewport);
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    if (exporting) return;
    set({ zoom: state.zoom * Math.exp(-event.deltaY * (event.ctrlKey ? .012 : .0012)) });
  };
  viewport.addEventListener("wheel", wheel, { passive: false });
  const gesture = (event: Event) => event.preventDefault();
  viewport.addEventListener("gesturestart", gesture, { passive: false });
  viewport.addEventListener("gesturechange", gesture, { passive: false });
  let dragging = false, previousX = 0, previousY = 0;
  const pointerDown = (event: PointerEvent) => {
    if (exporting || event.button !== 0 || event.target !== canvas) return;
    dragging = true; previousX = event.clientX; previousY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    set({ azimuth: state.azimuth + (event.clientX - previousX) * .22, elevation: state.elevation + (event.clientY - previousY) * .22 });
    previousX = event.clientX; previousY = event.clientY;
  };
  const pointerUp = () => { dragging = false; };
  viewport.addEventListener("pointerdown", pointerDown); viewport.addEventListener("pointermove", pointerMove);
  viewport.addEventListener("pointerup", pointerUp); viewport.addEventListener("pointercancel", pointerUp);
  try { renderer = new OpticalRenderer(canvas); panel.status("광학 렌더러 준비됨"); }
  catch (error) { panel.status(error instanceof Error ? error.message : String(error)); }
  resize();
  const tick = (now: number) => {
    if (disposed) return;
    const delta = Math.min((now - lastTime) / 1000, .1); lastTime = now;
    if (!exporting && renderer) {
      if (state.playing) {
        // Loop transport only; deterministic seeking and export retain the
        // requested exact time. Preserve sub-frame overshoot at the boundary.
        state.time = (state.time + delta) % state.duration;
        dirty = true;
      }
      if (dirty) {
        try {
          const start = performance.now();
          // True spatial supersampling at macro zoom: four distinct rays per
          // display pixel in this same frame, never blended previous frames.
          renderer.draw(state, width, height, width, height, 0, 0, state.zoom > 2.4 ? 2 : 1);
          frameMs = performance.now() - start; dirty = false;
        }
        catch (error) { state.playing = false; panel.status(error instanceof Error ? error.message : String(error)); renderer = undefined; }
      }
      if (now - lastUi > 150) { panel.update(state); lastUi = now; }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const inspect = () => ({
    hybrid: HYBRID_AB ? inspectHybrid(state) : null,
    expressionSource: CUBE0914 ? { id: CUBE0914_SOURCE, look: 'cube0914', lighting: 'original selected-colour anchored reverse RGB cycle', maxLayers: 12 } : null,
    ready: Boolean(renderer), renderer: "WebGL2 analytic optical contours / linear HDR", projection: "orthographic",
    axis: { family: "30deg", sharedOrigin: state.gap === 0 && state.bevel === 0, sharedOriginContract: [0, 0, 0], surfacesTouch: state.gap === 0,
      bevelContactCompensation: true, contact: 'pairwise rounded-surface tangency; no volume overlap', renderedCenters: getRenderAxisCubes(state.gap, state.bevel).centers,
      canonicalProjectionAngles: [30, 90, 150, 210, 270, 330],
      cubeScale: OPTICAL_CUBE_SCALE, cubeEdgeLength: getAxisCubes(state.gap).halfSize * 2,
      projectionAngles: [0, 1, 2].flatMap(axis => {
        const pose = opticalCameraPose(state);
        const az = pose.azimuth * Math.PI / 180, el = pose.elevation * Math.PI / 180;
        const matrix = new Float32Array(9); writeWorldToAxis(state,matrix);
        const right = transformAxisVector(matrix,[Math.cos(az), 0, -Math.sin(az)]);
        const up = transformAxisVector(matrix,[-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)]);
        const angle = (Math.atan2(up[axis], right[axis]) * 180 / Math.PI + 360) % 360;
        return [angle, (angle + 180) % 360];
      }).sort((a, b) => a - b), cubeCount: 3, defaultProjection: [45, 35.264389682754654] },
    state: { ...state }, artboard: { preset: state.aspect, width: opticalDimensions(state.aspect)[0], height: opticalDimensions(state.aspect)[1], supportedFormats: OPTICAL_ASPECTS },
    motion: { time: state.time, duration: state.duration, playing: state.playing, deterministic: true, float: opticalCameraFloat(state), axis: opticalAxisPose(state), camera: opticalCameraPose(state), kind: state.identityTransition ? "pleos25-to-dimensions" : "optical-light-loop",
      identityTransition: { enabled: !!state.identityTransition, name: "25엑시스", sourceSegment: state.identityHold, lightingBuildSeconds: state.identityDissolve,
        layerAppearance: { ...identityLayerTiming(state), order: 'boundary nearest shared Axis first, then progressively inset images away from Axis' },
        axisAccent: identityAxisAccent(state),
        oneShot: false, loop: true, isolatedSettings: identityScene, center: "constant camera pan for every phase; sequence starts at panX zero; subsequent manual changes preserved",
        method: state.identityEngraving ? "co-moving affine faces; dimension contours engrave narrow light into gray carriers, open into gradients, then locally release the carrier around the marks; only late residual closure; no two-shot crossfade"
          : "co-moving gray carrier receives dimension reflection light; optional absolute-second layer arrivals from the shared Axis",
        source: "procedural six-plane fit; no video or reference texture" },
      dimensions: "fixed contours and normals; staggered whole-layer fades; outer anchor retains 25% visibility; period follows duration" },
    limits: { maxOutputDimension: 8192, maxOutputPixels: 34000000, maxInternalBounces: 16, maxTextureSize: renderer?.maxTextureSize },
    preview: { width, height, sampleScale: state.zoom > 2.4 ? 2 : 1, ...renderer?.bufferInfo, cpuSubmitMs: frameMs }, exporting,
    videoExport: { busy: !!videoController, status: videoStatus, progress: videoProgress,
      format: 'MP4 / H.264 preferred, HEVC Main8 fallback at unchanged resolution / sRGB 8-bit, no audio', deterministic: true,
      maxLongEdge: 3840, fps: [24, 30, 60], spatialSamples: [4, 16],
      method: 'sequential fixed-time guarded HDR tiles; bounded encoder queue; no screen recording or upscaling' },
    rendering: { expression: 'reflective-dimensions', primaryInternalReflection: "refracted virtual cubical light images", secondaryInterfaces: 0, spectralChannels: 3, emission: false, textureFeedback: false,
      shellRadiance: false, physicalRayBudgetActive: false, physicalIORActive: true,
      viewInvariantRadiance: false, visibilityNote: 'Restored studio reflections; projection, overlap, reflected direction and Fresnel vary with view.',
      axisFold: 'constant planar image rays and sharp virtual corners; straight emitter profiles; no spatial lens warp',
      dimensions: { top: state.dimensionTop, left: state.dimensionLeft, right: state.dimensionRight,
        spacing: { top: state.dimensionSpacingTop, left: state.dimensionSpacingLeft, right: state.dimensionSpacingRight }, softness: state.dimensionSoftness, falloff: state.dimensionFalloff,
        spread: 'spacing-linked asymmetric gradient tail away from shared world Axis origin; smooth face-tangent direction and bounded width',
        boundaryAnchor: 'near-origin planes and bevel fixed; light-image carriers extend outward without visible far caps; remaining images inset exponentially',
        openExterior: { enabled: true, extensionInHalfSizes: 8, radianceFadeHalfSizes: [2, 8], meaning: '3D expression carriers only; canonical cube centers and Axis gap remain unchanged' },
        meaning: 'continuous light-only virtual cubical reflection layers, fractional last-layer fade; physical-shell radiance excluded', physicalSimulation: false },
      hdr: renderer?.hdrSupported ?? false, resolve: 'linear spatial average → finite HDR bloom → tone mapping → sRGB → spatial AA',
      lighting: { rig: 'four smooth studio emitters with fixed world-space negative-fill apertures', color: state.lightColor,
        cycle: inspectLightCycle(state),
        controls: 'shared intensity; spatial RGB ribbons with smooth 80/10/10 power handover; continuous grazing optical projection; no material tint or object emission' },
      surfaceFigure: { amount: state.surfaceCurvature, model: 'static reflection-lobe concentration only; legacy state key retained; no image ray or contour curvature' },
      roughness: "emitter filtering on virtual image rays; scattered energy not fully integrated",
      ...(HYBRID_AB ? { expression:'hybrid-ab', physicalRayBudgetActive:true, shellRadiance:true,
        axisFold:'B single boundary anchor + one-sided open A rounded internal reflection images',
        dimensions:{top:state.dimensionTop,left:state.dimensionLeft,right:state.dimensionRight,max:50,openExterior:state.hybridOpening>0,opening:state.hybridOpening,openAxisAnchor:true},
        surfaceFigure:{ amount:state.hybridDistortion, model:'A refracted image rays and rounded local normals; one-sided optical domain extension, remote caps nonreflecting at full opening' },
        lighting:{ rig:'studio ribbons reflected through A optical paths; external mirror scale .035, direct transmission .12', color:state.lightColor,
          cycle:inspectHybrid(state), controls:'isolated RGB cycle / main balanced / three dominant static compositions' } } : {}),
      ...(CUBE0914 ? { expression: 'cube0914-original', physicalRayBudgetActive: true, shellRadiance: true,
        dimensions: { top:state.dimensionTop,left:state.dimensionLeft,right:state.dimensionRight,max:12,openExterior:false },
        lighting: { source:CUBE0914_SOURCE, color:state.lightColor, cycle:'chosen colour → reverse RGB', unchanged:true },
        surfaceFigure: { amount:state.surfaceCurvature, model:'original curved optical normal' } } : {}) },
  });
  window.__pleosOptical = { inspect, set, pause: () => set({ playing: false }), seek: time => set({ time, playing: false }), capture,
    exportVideo, cancelVideo: () => videoController?.abort(), reset: () => set({ ...(HYBRID_AB ? HYBRID_DEFAULTS : OPTICAL_DEFAULTS) }) };
  const unload = () => { videoController?.abort(); save(); }; addEventListener("beforeunload", unload);
  return () => {
    videoController?.abort();
    for (const url of downloads.keys()) releaseDownload(url);
    disposed = true; save(); cancelAnimationFrame(frame); observer.disconnect(); renderer?.dispose(); panel.dispose();
    removeEventListener("beforeunload", unload); viewport.removeEventListener("wheel", wheel); viewport.removeEventListener("gesturestart", gesture); viewport.removeEventListener("gesturechange", gesture);
    viewport.removeEventListener("pointerdown", pointerDown); viewport.removeEventListener("pointermove", pointerMove); viewport.removeEventListener("pointerup", pointerUp); viewport.removeEventListener("pointercancel", pointerUp);
    delete window.__pleosOptical;
  };
}

declare global {
  interface Window {
    __pleosOptical?: {
      inspect(): Record<string, unknown>; set(patch: Partial<OpticalState>): void; pause(): void; seek(time: number): void;
      capture(width: number, height: number, samples?: number): Promise<string>; reset(): void;
      exportVideo(options?: Partial<OpticalVideoOptions>, download?: boolean): Promise<VideoDownload>; cancelVideo(): void;
    };
  }
}
