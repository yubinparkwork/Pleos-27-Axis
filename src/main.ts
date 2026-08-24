import "./style.css";
import {
  RawStudioApp,
  createDefaultRawStudioState,
  type RawStudioStatus,
} from "./studio";
import { LegacyArchiveView } from "./studio/ui/LegacyArchiveView";
import {
  RawStudioRendererController,
  type RawRendererStatus,
} from "./raw-webgl/renderer";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

function studioStatus(status: RawRendererStatus): RawStudioStatus {
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
  const initialState = createDefaultRawStudioState();
  let studio: RawStudioApp | null = null;

  const controller = new RawStudioRendererController({
    initialState,
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

  studio = new RawStudioApp(root, controller, initialState);
  studio.setStatus(studioStatus(controller.instance?.inspectStatus() ?? {
    renderer: "Raw WebGL2",
    gpuPreference: "Unavailable",
    hdrEnabled: false,
    floatColorBuffer: false,
    maxTextureSize: null,
    maxRenderbufferSize: null,
    maxSamples: null,
    drawingBuffer: null,
    frameTimeMs: null,
    contextLost: false,
    effectiveGeometryMode: null,
    message: "Raw WebGL2 renderer initialization pending.",
    level: "warning",
  }));

  window.addEventListener("beforeunload", () => {
    studio?.destroy();
    controller.dispose();
  }, { once: true });
}
