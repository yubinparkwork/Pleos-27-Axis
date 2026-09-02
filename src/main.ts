import "./style.css";
import "./crystal/CrystalApp.css";
import "./modes/axis-habitat/AxisHabitat.css";
import "./modes/axis-megastructure/AxisMegastructure.css";
import "./modes/dimention-r3f/DimentionR3F.css";
import type { ArtboardState } from "./artboard/ArtboardState";
import type { StudioExportQuality } from "./studio/ModeTypes";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

async function mount(): Promise<void> {
  const route = new URLSearchParams(location.search).get("renderer");
  if (route === "raw") {
    const [{ RawStudioApp, createDefaultRawStudioState }, { RawStudioRendererController }] = await Promise.all([import("./studio"), import("./raw-webgl/renderer")]);
    const initialState = createDefaultRawStudioState();
    const controller = new RawStudioRendererController({ initialState });
    const studio = new RawStudioApp(root!, controller, initialState);
    addEventListener("beforeunload", () => { studio.destroy(); controller.dispose(); }, { once: true });
    return;
  }
  if (route === "legacy") {
    const { LegacyArchiveView } = await import("./studio/ui/LegacyArchiveView");
    new LegacyArchiveView(root!); return;
  }
  const [{ StudioShell }, { ModeRegistry }, { GLASS_3D_MODE }, { DIMENTION_R3F_MODE }, { LIGHT_FIELD_MODE }, { GLASS_PRISM_MODE }, { KINETIC_GLASS_MODE }, { AXIS_TRAILS_MODE }, { AXIS_HABITAT_MODE }, { AXIS_MEGASTRUCTURE_MODE }] = await Promise.all([
    import("./studio/StudioShell"), import("./studio/ModeRegistry"), import("./modes/glass-3d/Glass3DMode"), import("./modes/dimention-r3f/DimentionR3FMode"), import("./modes/light-field/LightFieldMode"), import("./modes/glass-prism/GlassPrismMode"), import("./modes/kinetic-glass/KineticGlassMode"), import("./modes/axis-trails/AxisTrailsMode"), import("./modes/axis-habitat/AxisHabitatMode"), import("./modes/axis-megastructure/AxisMegastructureMode"),
  ]);
  const registry = new ModeRegistry().register(GLASS_3D_MODE).register(DIMENTION_R3F_MODE).register(LIGHT_FIELD_MODE).register(GLASS_PRISM_MODE).register(KINETIC_GLASS_MODE).register(AXIS_TRAILS_MODE).register(AXIS_HABITAT_MODE).register(AXIS_MEGASTRUCTURE_MODE);
  const shell = new StudioShell(root!, registry, "glass-3d");
  shell.mount();
  const command = (name: string, payload?: unknown) => shell.command(name, payload);
  const glassCommand = (name: string, payload?: unknown) => { if (shell.getActiveModeId() !== "glass-3d") shell.switchMode("glass-3d"); return shell.command(name, payload); };
  const inspect = () => ({ ...(shell.activeMode.inspect?.() ?? {}), studioMode: shell.inspect() });
  addEventListener("beforeunload", () => shell.dispose(), { once: true });
  window.__pleos27Axis = {
    inspect,
    listModes: () => shell.listModes(),
    getActiveMode: () => shell.getActiveModeId(),
    switchMode: (id) => shell.switchMode(id),
    remountMode: () => shell.remountActiveMode(),
    listVariations: () => shell.listVariations(),
    applyVariation: (id) => shell.applyVariationById(id),
    getSettings: () => shell.getCurrentState(),
    saveSettings: () => shell.saveNow(),
    setArtboard: (state) => command("setArtboard", state),
    export: (options) => shell.activeMode.exportAdapter.exportStill(options),
    exportFrame: (frame, fps = 30, download = false) => Promise.resolve(command("exportFrame", { frame, fps, download }) as Promise<string>),
    modeApi: (id) => ({ inspect: () => id === shell.getActiveModeId() ? shell.activeMode.inspect?.() ?? {} : { active: false, id }, command: (name, payload) => { if (id !== shell.getActiveModeId()) throw new Error(`Mode is not active: ${id}`); return command(name, payload); } }),
    setLightFieldPreset: (id) => { if (shell.getActiveModeId() !== "light-field") shell.switchMode("light-field"); command("setPreset", id); },
    setGlassPrismPreset: (id) => { if (shell.getActiveModeId() !== "glass-prism") shell.switchMode("glass-prism"); command("setPreset", id); },
    setKineticGlassPreset: (id) => { if (shell.getActiveModeId() !== "kinetic-glass") shell.switchMode("kinetic-glass"); command("setPreset", id); },
    setAxisTrailsPreset: (id) => { if (shell.getActiveModeId() !== "axis-trails") shell.switchMode("axis-trails"); command("setPreset", id); },
    setAxisHabitatPreset: (id) => { if (shell.getActiveModeId() !== "axis-habitat") shell.switchMode("axis-habitat"); command("setPreset", id); },
    setAxisMegastructurePreset: (id) => { if (shell.getActiveModeId() !== "axis-megastructure") shell.switchMode("axis-megastructure"); command("setPreset", id); },
    setLook: (look) => glassCommand("setLook", look), setPrismStyle: (style) => glassCommand("setPrismStyle", style),
    setSpectralFlow: (settings) => glassCommand("setSpectralFlow", settings), setSpectralFlowPreset: (preset) => glassCommand("setSpectralFlowPreset", preset),
    setSoftSpectral: (settings) => glassCommand("setSoftSpectral", settings), setSoftSpectralPreset: (preset) => glassCommand("setSoftSpectralPreset", preset),
    setMotionPreset: (preset) => glassCommand("setMotionPreset", preset), setMotionStrength: (strength) => glassCommand("setMotionStrength", strength), configureMotion: (settings) => glassCommand("configureMotion", settings),
    play: () => command("play"), pause: () => command("pause"), resetMotion: () => command("resetMotion"), seek: (time) => command("seek", time), stepFrame: (frames = 1) => command("stepFrame", frames),
    setRenderRegion: (state) => glassCommand("setRenderRegion", state), renderPreview: (quality = "fast") => Promise.resolve(command("renderPreview", quality) as Promise<string>),
    renderCurrentFrame: (download = false) => shell.getActiveModeId() === "glass-3d" ? Promise.resolve(command("renderCurrentFrame", download) as Promise<string>) : shell.activeMode.exportAdapter.exportStill({ renderer: "raster", quality: "high", download }),
    renderPrintFrame: (download = false) => shell.getActiveModeId() === "glass-3d" ? Promise.resolve(command("renderPrintFrame", download) as Promise<string>) : shell.activeMode.exportAdapter.exportStill({ renderer: "raster", quality: "print", download }),
    exportPng: (download = false) => shell.getActiveModeId() === "glass-3d" ? Promise.resolve(command("exportPng", download) as Promise<string>) : shell.activeMode.exportAdapter.exportStill({ renderer: "raster", quality: "custom", download }),
    getMotionState: () => command("getMotionState") ?? (shell.activeMode.inspect?.() as { motion?: object } | undefined)?.motion ?? {},
  };
}

void mount();

declare global {
  interface Window {
    __pleos27Axis?: {
      inspect(): Record<string, unknown>;
      listModes(): Array<{ id: string; label: string }>;
      getActiveMode(): string;
      switchMode(id: string): void;
      remountMode(): void;
      listVariations(): Array<{ id: string; label: string; builtin: boolean; modeId: string }>;
      applyVariation(id: string): void;
      getSettings(): unknown;
      saveSettings(): { savedAt: string; activeModeId: string };
      setArtboard(state: Partial<ArtboardState>): unknown;
      export(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string>;
      exportFrame(frame: number, fps?: number, download?: boolean): Promise<string>;
      modeApi(id: string): { inspect(): object; command(name: string, payload?: unknown): unknown };
      setLightFieldPreset(id: "iridescent-pulse" | "violet-membrane" | "spectral-white"): void;
      setGlassPrismPreset(id: "clear-glass" | "rgb-prism" | "frosted-prism" | "dark-crystal"): void;
      setKineticGlassPreset(id: "clear-attraction" | "pleos-prism" | "dark-mass"): void;
      setAxisTrailsPreset(id: "pleos-blue" | "spectral-signal" | "white-axis"): void;
      setAxisHabitatPreset(id: "frosted-formation" | "obsidian-signal" | "blue-archive"): void;
      setAxisMegastructurePreset(id: "abyssal-core" | "violet-foundry" | "cold-archive"): void;
      setLook(look: string): unknown; setPrismStyle(style: string): unknown; setSpectralFlow(settings: object): unknown; setSpectralFlowPreset(preset: string): unknown; setSoftSpectral(settings: object): unknown; setSoftSpectralPreset(preset: string): unknown;
      setMotionPreset(preset: string): unknown; setMotionStrength(strength: string | number): unknown; configureMotion(settings: object): unknown;
      play(): unknown; pause(): unknown; resetMotion(): unknown; seek(time: number): unknown; stepFrame(frames?: number): unknown;
      setRenderRegion(state: object): unknown; renderPreview(quality?: "fast" | "high"): Promise<string>; renderCurrentFrame(download?: boolean): Promise<string>; renderPrintFrame(download?: boolean): Promise<string>; exportPng(download?: boolean): Promise<string>; getMotionState(): object;
    };
  }
}
