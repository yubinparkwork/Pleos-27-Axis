import "./style.css";
import { NewAxisCrystalApp } from "./crystal/NewAxisCrystalApp";
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
const appRoot: HTMLElement = root;

function studioStatus(status: RawRendererStatus): RawStudioStatus {
  return {
    renderer: status.renderer,
    gpuPreference: status.gpuPreference,
    hdr: status.hdrEnabled ? "Enabled" : "Disabled",
    floatColorBuffer: status.floatColorBuffer ? "Supported" : "Unsupported",
    maxTextureSize: status.maxTextureSize,
    maxRenderbufferSize: status.maxRenderbufferSize,
    maxSamples: status.maxSamples,
    drawingBuffer: status.drawingBuffer === null ? null : [status.drawingBuffer[0], status.drawingBuffer[1]],
    frameTimeMs: status.frameTimeMs,
    message: status.message,
    level: status.level,
  };
}

function mountRawStudio(): void {
  const initialState = createDefaultRawStudioState();
  let studio: RawStudioApp | null = null;
  const controller = new RawStudioRendererController({
    initialState,
    onStatus: (status) => studio?.setStatus(studioStatus(status)),
    onError: (error) => studio?.setStatus({ message: error.message, level: "error" }),
    onCameraChange: (camera) => {
      if (!studio) return;
      const nextState = studio.getState();
      nextState.camera = structuredClone(camera);
      studio.setState(nextState, { path: "camera", reason: "external" });
    },
  });
  studio = new RawStudioApp(appRoot, controller, initialState);
  window.addEventListener("beforeunload", () => {
    studio?.destroy();
    controller.dispose();
  }, { once: true });
}

const rendererRoute = new URLSearchParams(window.location.search).get("renderer");

if (rendererRoute === "raw") {
  mountRawStudio();
} else if (rendererRoute === "legacy") {
  new LegacyArchiveView(appRoot);
} else {
  const app = new NewAxisCrystalApp(appRoot);
  window.addEventListener("beforeunload", () => app.dispose(), { once: true });
  window.__pleos27Axis = {
    inspect: () => app.inspect(),
    setLook: (look) => app.setLook(look),
    exportPng: () => app.exportPng(),
  };
}

declare global {
  interface Window {
    __pleos27Axis?: {
      inspect(): object;
      setLook(look: "clear" | "prism" | "smoked"): void;
      exportPng(): Promise<void>;
    };
  }
}
