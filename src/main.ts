import "./style.css";
import {
  RawStudioApp,
  loadPersistedRawStudioState,
  persistRawStudioState,
  type RawStudioStatus,
} from "./studio";
import { LegacyArchiveView } from "./studio/ui/LegacyArchiveView";
import {
  ThreeStudioRendererController,
  type EngineRendererStatus,
} from "./engine";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

function studioStatus(status: EngineRendererStatus): RawStudioStatus {
  return {
    renderer: status.renderer,
    gpuPreference: status.gpuPreference,
    hdr: status.hdrEnabled ? "Enabled" : "Disabled",
    floatColorBuffer: status.floatColorBuffer ? "Supported" : "Unsupported",
    maxTextureSize: status.maxTextureSize,
    maxRenderbufferSize: status.maxRenderbufferSize,
    maxSamples: status.maxSamples,
    drawingBuffer: status.drawingBuffer === null
      ? null
      : [status.drawingBuffer[0], status.drawingBuffer[1]],
    frameTimeMs: status.frameTimeMs,
    message: status.message,
    level: status.level,
  };
}

const rendererRoute = new URLSearchParams(window.location.search).get("renderer");

if (rendererRoute === "legacy") {
  new LegacyArchiveView(root);
} else {
  const initialState = loadPersistedRawStudioState();
  let studio: RawStudioApp | null = null;

  const controller = new ThreeStudioRendererController({
    state: initialState,
    onStatus: (status) => studio?.setStatus(studioStatus(status)),
    onError: (error) => studio?.setStatus({
      message: error.message,
      level: "error",
    }),
    onCameraChange: (camera) => {
      if (!studio) return;
      const nextState = studio.getState();
      nextState.camera = structuredClone(camera);
      studio.setState(nextState, { path: "camera", reason: "external" });
    },
  });

  studio = new RawStudioApp(root, controller, initialState, (state) => {
    persistRawStudioState(state);
  });
  studio.setStatus(studioStatus(controller.instance?.inspectStatus() ?? {
    renderer: "Three.js WebGPU",
    gpuPreference: "WebGPU 우선 · WebGL2 자동 폴백",
    hdrEnabled: true,
    floatColorBuffer: true,
    maxTextureSize: null,
    maxRenderbufferSize: null,
    maxSamples: null,
    drawingBuffer: null,
    frameTimeMs: null,
    contextLost: false,
    effectiveGeometryMode: null,
    message: "Three.js WebGPU 렌더러 초기화를 기다리고 있습니다.",
    level: "warning",
  }));

  const handleAnimationShortcut = (event: KeyboardEvent): void => {
    if (event.code !== "Space" || event.repeat || !studio) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || (target instanceof HTMLElement && target.isContentEditable)
    ) return;
    event.preventDefault();
    const nextState = studio.getState();
    nextState.engine.animationPaused = !nextState.engine.animationPaused;
    nextState.material.matte.texture.animationPaused = nextState.engine.animationPaused;
    studio.setState(nextState, { path: "engine.animationPaused", reason: "control" });
  };
  window.addEventListener("keydown", handleAnimationShortcut);

  window.addEventListener("beforeunload", () => {
    window.removeEventListener("keydown", handleAnimationShortcut);
    studio?.destroy();
    controller.dispose();
  }, { once: true });
}
