import { OpticalRenderer } from "./OpticalRenderer";
import { mountOpticalPanel } from "./OpticalPanel";
import { OPTICAL_DEFAULTS, OPTICAL_SPACING_KEYS, opticalDimensions, sanitizeOpticalState } from "./OpticalState";
import type { OpticalState } from "./OpticalState";
import { OPTICAL_CUBE_SCALE, getAxisCubes, getRenderAxisCubes } from "./AxisGeometry";
import { LUMINOUS_REFERENCE, BEFORE_LUMINOUS_STORAGE_KEY } from './LuminousReference';
import { inspectLightCycle } from './OpticalLighting';

const STORAGE_KEY = "pleos-optical-studio-v1";

export function mountOpticalStudio(root: HTMLElement): () => void {
  let saved: unknown;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { /* Recover corrupted state without touching the old studio. */ }
  let state = sanitizeOpticalState(saved);
  let renderer: OpticalRenderer | undefined;
  let dirty = true, disposed = false, exporting = false, frame = 0, lastTime = performance.now(), lastUi = 0;
  let width = 1, height = 1, frameMs = 0;
  const save = () => {
    try {
      if (saved && typeof saved === 'object' && !('lightColor' in saved) && !localStorage.getItem('pleos-optical-before-dimension-layers-v1')) {
        localStorage.setItem('pleos-optical-before-dimension-layers-v1', JSON.stringify({ savedAt: new Date().toISOString(), state: saved }));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch { panel.status("브라우저 저장 공간이 부족합니다. 설정 자동 저장을 사용할 수 없습니다."); }
  };
  const set = (patch: Partial<OpticalState>) => {
    // Keep shared-spacing automation/capture callers compatible. New controls
    // supply only their cube key, so they never affect the other two values.
    const next = { ...state, ...patch };
    if (patch.lightCycle === true && !state.lightCycle && patch.lightCycleOffset === undefined) {
      // Start with the current chosen colour at the current timeline position.
      // Store the phase, not wall-clock time, so reload/export are identical.
      next.lightCycleOffset = next.time / next.duration;
    }
    if (typeof patch.dimensionSpacing === 'number' && Number.isFinite(patch.dimensionSpacing)) {
      for (const key of OPTICAL_SPACING_KEYS) if (!(key in patch)) next[key] = patch.dimensionSpacing;
    }
    state = sanitizeOpticalState(next); dirty = true; save(); panel.update(state); resize();
  };
  const capture = async (w: number, h: number, samples = 4) => {
    if (!renderer) throw new Error("렌더러가 준비되지 않았습니다.");
    if (exporting) throw new Error("이미지를 내보내는 중입니다.");
    exporting = true;
    const snapshot = { ...state };
    try { return await renderer.capture(snapshot, w, h, samples, progress => panel.status(`고해상도 렌더링 · ${Math.round(progress * 100)}%`, true)); }
    finally { exporting = false; lastTime = performance.now(); dirty = true; panel.status("광학 렌더러 준비됨"); }
  };
  const panel = mountOpticalPanel(root, state, {
    change: (key, value) => set({ [key]: value }),
    togglePlay: () => set({ playing: !state.playing }),
    reset: () => set({ ...OPTICAL_DEFAULTS }),
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
      if (state.playing) { state.time = (state.time + delta) % state.duration; dirty = true; }
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
    ready: Boolean(renderer), renderer: "WebGL2 analytic dielectric ray integrator / linear HDR", projection: "orthographic",
    axis: { family: "30deg", sharedOrigin: state.gap === 0 && state.bevel === 0, sharedOriginContract: [0, 0, 0], surfacesTouch: state.gap === 0,
      bevelContactCompensation: true, contact: 'pairwise rounded-surface tangency; no volume overlap', renderedCenters: getRenderAxisCubes(state.gap, state.bevel).centers,
      canonicalProjectionAngles: [30, 90, 150, 210, 270, 330],
      cubeScale: OPTICAL_CUBE_SCALE, cubeEdgeLength: getAxisCubes(state.gap).halfSize * 2,
      projectionAngles: [0, 1, 2].flatMap(axis => {
        const az = state.azimuth * Math.PI / 180, el = state.elevation * Math.PI / 180;
        const right = [Math.cos(az), 0, -Math.sin(az)];
        const up = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)];
        const angle = (Math.atan2(up[axis], right[axis]) * 180 / Math.PI + 360) % 360;
        return [angle, (angle + 180) % 360];
      }).sort((a, b) => a - b), cubeCount: 3, defaultProjection: [45, 35.264389682754654] },
    state: { ...state }, artboard: { preset: state.aspect, width: opticalDimensions(state.aspect)[0], height: opticalDimensions(state.aspect)[1] },
    motion: { time: state.time, duration: state.duration, playing: state.playing, deterministic: true, kind: "optical-light-loop" },
    limits: { maxOutputDimension: 8192, maxOutputPixels: 34000000, maxInternalBounces: 16, maxTextureSize: renderer?.maxTextureSize },
    preview: { width, height, sampleScale: state.zoom > 2.4 ? 2 : 1, ...renderer?.bufferInfo, cpuSubmitMs: frameMs }, exporting,
    rendering: { primaryInternalReflection: "deterministic split rays", secondaryInterfaces: 8, spectralChannels: 3, emission: false, textureFeedback: false,
      dimensions: { top: state.dimensionTop, left: state.dimensionLeft, right: state.dimensionRight,
        spacing: { top: state.dimensionSpacingTop, left: state.dimensionSpacingLeft, right: state.dimensionSpacingRight }, softness: state.dimensionSoftness, falloff: state.dimensionFalloff,
        spread: 'spacing-linked asymmetric gradient tail away from shared world Axis origin; smooth face-tangent direction and bounded width',
        meaning: 'continuous light-only virtual cubical reflection layers, fractional last-layer fade; independent of physical ray depth', physicalSimulation: false },
      hdr: renderer?.hdrSupported ?? false, resolve: 'linear spatial average → finite HDR bloom → tone mapping → sRGB → spatial AA',
      lighting: { rig: 'four smooth studio emitters with fixed world-space negative-fill apertures', color: state.lightColor,
        cycle: inspectLightCycle(state),
        controls: 'shared intensity; optional spatial RGB ribbons with 80/10/10 power handover; no material tint or object emission' },
      surfaceFigure: { amount: state.surfaceCurvature, model: 'smooth lens-like shading-normal approximation; geometric silhouette and medium offsets unchanged' },
      roughness: "path-dependent emitter filtering and coherent reflection attenuation; scattered energy not fully integrated" },
  });
  window.__pleosOptical = { inspect, set, pause: () => set({ playing: false }), seek: time => set({ time, playing: false }), capture, reset: () => set({ ...OPTICAL_DEFAULTS }) };
  const unload = () => save(); addEventListener("beforeunload", unload);
  return () => {
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
    };
  }
}
