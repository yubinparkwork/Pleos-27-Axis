import "./style.css";
import type { ArtboardState } from "./artboard/ArtboardState";
import type { MotionPresetId, MotionStrengthMode } from "./motion/types";
import type { CrystalLook } from "./crystal/CrystalAssembly";
import type { SpectralFlowPresetId, SpectralFlowState } from "./crystal/materials/SpectralFlowMaterial";
import type { SoftSpectralPresetId, SoftSpectralState } from "./crystal/materials/SoftSpectralMaterial";
import type { PrismStyleId } from "./crystal/presets/PrismStylePresets";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

async function mount(): Promise<void> {
  const route = new URLSearchParams(location.search).get("renderer");
  if (route === "raw") {
    const [{ RawStudioApp, createDefaultRawStudioState }, { RawStudioRendererController }] = await Promise.all([
      import("./studio"), import("./raw-webgl/renderer"),
    ]);
    const initialState = createDefaultRawStudioState();
    const controller = new RawStudioRendererController({ initialState });
    const studio = new RawStudioApp(root!, controller, initialState);
    addEventListener("beforeunload", () => { studio.destroy(); controller.dispose(); }, { once: true });
    return;
  }
  if (route === "legacy") {
    const { LegacyArchiveView } = await import("./studio/ui/LegacyArchiveView");
    new LegacyArchiveView(root!);
    return;
  }
  const { MotionStudioApp } = await import("./crystal/MotionStudioApp");
  const app = new MotionStudioApp(root!);
  addEventListener("beforeunload", () => app.dispose(), { once: true });
  window.__pleos27Axis = {
    inspect: () => app.inspect(),
    setLook: (look) => app.setLook(look),
    setPrismStyle: (style) => app.setPrismStyle(style),
    applyVariation: (id) => app.applyVariation(id),
    listVariations: () => app.listVariations(),
    setSpectralFlow: (settings) => app.setSpectralFlow(settings),
    setSpectralFlowPreset: (preset) => app.setSpectralFlowPreset(preset),
    setSoftSpectral: (settings) => app.setSoftSpectral(settings),
    setSoftSpectralPreset: (preset) => app.setSoftSpectralPreset(preset),
    setMotionPreset: (preset) => app.setMotionPreset(preset),
    setMotionStrength: (strength) => app.setMotionStrength(strength),
    configureMotion: (settings) => app.configureMotion(settings),
    play: () => app.play(), pause: () => app.pause(), resetMotion: () => app.resetMotion(),
    seek: (time) => app.seek(time), stepFrame: (frames = 1) => app.stepFrame(frames),
    setArtboard: (state) => app.setArtboard(state),
    setRenderRegion: (state) => app.setRenderRegion(state),
    renderPreview: (quality = "fast") => app.renderPreview(quality),
    renderCurrentFrame: (download = false) => app.renderCurrentFrame(download),
    renderPrintFrame: (download = false) => app.renderPrintFrame(download),
    exportPng: (download = false) => app.exportPng(download),
    getMotionState: () => app.getMotionState(),
  };
}

void mount();

declare global {
  interface Window {
    __pleos27Axis?: {
      inspect(): object;
      setLook(look: CrystalLook): void;
      setPrismStyle(style: PrismStyleId): void;
      applyVariation(id: string): void;
      listVariations(): Array<{ id: string; label: string; builtin: boolean }>;
      setSpectralFlow(settings: Partial<SpectralFlowState>): void;
      setSpectralFlowPreset(preset: SpectralFlowPresetId): void;
      setSoftSpectral(settings: Partial<SoftSpectralState>): void;
      setSoftSpectralPreset(preset: SoftSpectralPresetId): void;
      setMotionPreset(preset: MotionPresetId): void;
      setMotionStrength(strength: MotionStrengthMode | number): void;
      configureMotion(settings: { duration?: number; fps?: number; seed?: number; speed?: number; loop?: boolean; constraint?: "strict" | "anchored" | "experimental" }): void;
      play(): void; pause(): void; resetMotion(): void; seek(time: number): void; stepFrame(frames?: number): void;
      setArtboard(state: Partial<ArtboardState>): void;
      setRenderRegion(state: Partial<{ enabled: boolean; x: number; y: number; width: number; height: number; unitPpi: number }>): void;
      renderPreview(quality?: "fast" | "high"): Promise<string>;
      renderCurrentFrame(download?: boolean): Promise<string>;
      renderPrintFrame(download?: boolean): Promise<string>;
      exportPng(download?: boolean): Promise<string>;
      getMotionState(): object;
    };
  }
}
