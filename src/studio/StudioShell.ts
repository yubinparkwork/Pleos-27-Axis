import { ModeRegistry } from "./ModeRegistry";
import type { StudioModeContext, StudioModeInstance, StudioVariationSummary } from "./ModeTypes";
import { createStudioState, type StudioState } from "./StudioState";

const STORAGE_KEY = "pleos-27-axis-studio-state-v2";
const MANUAL_STORAGE_KEY = "pleos-27-axis-manual-save-v1";

interface ManualStudioSave {
  version: 1;
  savedAt: string;
  state: StudioState;
}

function parseState(value: unknown, registry: ModeRegistry): StudioState | null {
  const candidate = value as Partial<StudioState> | null;
  if (candidate?.version !== 2 || !candidate.activeModeId) return null;
  try { registry.get(candidate.activeModeId); } catch { return null; }
  return {
    version: 2,
    activeModeId: candidate.activeModeId,
    modeStates: candidate.modeStates && typeof candidate.modeStates === "object" ? candidate.modeStates : {},
    shared: candidate.shared && typeof candidate.shared === "object" ? candidate.shared : {},
  };
}

function loadState(initialModeId: string, registry: ModeRegistry): StudioState {
  const fallback = createStudioState(initialModeId);
  try {
    const automatic = parseState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"), registry);
    if (automatic) return automatic;
    const manual = JSON.parse(localStorage.getItem(MANUAL_STORAGE_KEY) ?? "null") as Partial<ManualStudioSave> | null;
    return parseState(manual?.state, registry) ?? fallback;
  } catch {
    try {
      const manual = JSON.parse(localStorage.getItem(MANUAL_STORAGE_KEY) ?? "null") as Partial<ManualStudioSave> | null;
      return parseState(manual?.state, registry) ?? fallback;
    } catch { return fallback; }
  }
}

export class StudioShell {
  private readonly state: StudioState;
  private active: StudioModeInstance | null = null;
  private modeHost: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private saveStatus: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private persistTimer = 0;
  private saveFeedbackTimer = 0;
  private transportTimer = 0;

  constructor(private readonly root: HTMLElement, private readonly registry: ModeRegistry, initialModeId = "glass-3d") {
    this.state = loadState(initialModeId, registry);
  }

  mount(): void {
    this.root.innerHTML = this.template();
    this.shellElement()?.classList.toggle("studio-inspector-collapsed", this.state.shared.inspectorCollapsed === true);
    this.modeHost = this.root.querySelector<HTMLElement>("[data-studio-mode-host]");
    this.status = this.root.querySelector<HTMLElement>("[data-studio-status]");
    this.saveStatus = this.root.querySelector<HTMLElement>("[data-shell-save-status]");
    this.saveButton = this.root.querySelector<HTMLButtonElement>("[data-shell-save]");
    this.bindShellUi();
    this.activate(this.state.activeModeId);
    this.showSaveStatus("자동 저장됨");
    this.transportTimer = window.setInterval(() => this.refreshTransport(), 100);
  }

  switchMode(id: string): void { if (this.active?.id !== id) this.activate(id); }
  remountActiveMode(): void { this.activate(this.state.activeModeId, true); }

  applyVariation(modeId: string, variationId: string): void {
    if (this.state.activeModeId !== modeId) this.activate(modeId);
    if (!this.active?.applyVariation) throw new Error(`Studio mode does not support variations: ${modeId}`);
    this.active.applyVariation(variationId);
    this.captureActiveState();
    this.refreshShellUi();
  }

  applyVariationById(variationId: string): void {
    const current = this.active?.listVariations?.().find((item) => item.id === variationId);
    if (current) return this.applyVariation(current.modeId, variationId);
    const owner = this.registry.list().find((definition) => definition.ownsVariation?.(variationId));
    if (!owner) throw new Error(`Unknown Studio variation: ${variationId}`);
    this.applyVariation(owner.id, variationId);
  }

  listVariations(): StudioVariationSummary[] { return this.active?.listVariations?.() ?? []; }
  listModes(): Array<{ id: string; label: string }> { return this.registry.list().map(({ id, label }) => ({ id, label })); }
  getActiveModeId(): string { return this.state.activeModeId; }
  command(name: string, payload?: unknown): unknown { return this.active?.command?.(name, payload); }
  getCurrentState(): unknown { return this.active?.getState() ?? null; }

  saveNow(): { savedAt: string; activeModeId: string } {
    this.captureActiveState();
    const savedAt = new Date().toISOString();
    const manual: ManualStudioSave = { version: 1, savedAt, state: this.state };
    try {
      this.persistNow();
      localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(manual));
      const time = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(savedAt));
      this.showSaveStatus(`${time} 저장됨`, "saved");
      return { savedAt, activeModeId: this.state.activeModeId };
    } catch (error) {
      this.showSaveStatus("저장 실패", "error");
      throw error;
    }
  }

  get activeMode(): StudioModeInstance {
    if (!this.active) throw new Error("Studio mode is not mounted.");
    return this.active;
  }

  inspect(): object {
    const definition = this.registry.get(this.state.activeModeId);
    return {
      activeMode: definition.id,
      modeLabel: definition.label,
      capabilities: { ...definition.capabilities },
      registeredModes: this.registry.list().map(({ id, label, description, capabilities }) => ({ id, label, description, capabilities })),
      lifecycle: { mounted: Boolean(this.active), canvasCount: this.modeHost?.querySelectorAll("canvas").length ?? 0 },
      sharedState: { artboard: this.state.shared.artboard ?? null },
      persistence: { version: this.state.version, storageKey: STORAGE_KEY, modeNamespaces: Object.keys(this.state.modeStates) },
      mode: this.active?.inspect?.() ?? null,
    };
  }

  dispose(): void {
    window.clearTimeout(this.persistTimer);
    window.clearTimeout(this.saveFeedbackTimer);
    window.clearInterval(this.transportTimer);
    this.captureActiveState();
    this.persistNow();
    if (this.active) { this.active.unmount(); this.active.dispose(); this.active = null; }
    this.root.replaceChildren();
  }

  private activate(id: string, force = false): void {
    if (!force && this.active?.id === id) return;
    const definition = this.registry.get(id);
    if (this.active) {
      this.captureActiveState();
      this.active.unmount();
      this.active.dispose();
      this.active = null;
    }
    const host = this.requireHost();
    host.replaceChildren();
    const context: StudioModeContext = {
      root: host,
      listModes: () => this.registry.list(),
      requestMode: (nextId) => this.switchMode(nextId),
      requestVariation: (modeId, variationId) => this.applyVariation(modeId, variationId),
      notifyStateChange: () => { this.captureActiveState(); this.schedulePersist(); },
      requestUiRefresh: () => this.refreshShellUi(),
    };
    const instance = definition.create(context);
    this.state.activeModeId = id;
    this.active = instance;
    try {
      instance.mount();
      const cached = this.state.modeStates[id];
      if (cached !== undefined) instance.restore(cached);
      if (Object.keys(this.state.shared).length) instance.setSharedState?.(this.state.shared);
      else this.captureSharedState(instance);
      this.showStatus("");
    } catch (error) {
      this.showStatus(error instanceof Error ? error.message : String(error));
      throw error;
    }
    this.refreshShellUi();
    this.schedulePersist();
  }

  private captureActiveState(): void {
    if (!this.active) return;
    this.state.modeStates[this.active.id] = this.active.serialize();
    this.captureSharedState(this.active);
  }

  private captureSharedState(instance: StudioModeInstance): void {
    const shared = instance.getSharedState?.();
    if (shared) this.state.shared = { ...this.state.shared, ...shared };
  }

  private template(): string {
    return `<section class="studio-shell motion-studio">
      <header class="topbar studio-shell-topbar">
        <div class="wordmark"><strong>PLEOS 27 AXIS</strong></div>
        <div class="studio-context"><label><span>모드</span><select data-shell-mode aria-label="스튜디오 모드"></select></label><label><span>변형</span><select data-shell-variation aria-label="현재 모드 변형"></select></label></div>
        <div class="topbar-actions"><span class="studio-save-status" data-shell-save-status role="status" aria-live="polite"></span><button class="topbar-state-save" data-shell-save aria-label="현재 패널 설정 저장">설정 저장</button><button class="topbar-export" data-shell-export>내보내기</button><button class="inspector-icon" data-shell-inspector aria-label="Inspector 표시 또는 숨기기">◫</button><span class="studio-shell-status" data-studio-status role="status" aria-live="polite"></span></div>
      </header>
      <div class="studio-mode-host" data-studio-mode-host></div>
      <footer class="motion-transport studio-shell-transport" data-shell-transport><div class="transport-buttons"><button data-shell-play aria-label="재생">▶</button><button data-shell-pause aria-label="일시 정지">Ⅱ</button></div><time data-shell-time>0.00 / 0.00s</time><input type="range" data-shell-timeline min="0" max="1" step="0.001" aria-label="모션 타임라인"><span data-shell-motion-meta>LOOP</span></footer>
    </section>`;
  }

  private bindShellUi(): void {
    this.root.querySelector<HTMLSelectElement>("[data-shell-mode]")?.addEventListener("change", (event) => this.switchMode((event.currentTarget as HTMLSelectElement).value));
    this.root.querySelector<HTMLSelectElement>("[data-shell-variation]")?.addEventListener("change", (event) => {
      const id = (event.currentTarget as HTMLSelectElement).value;
      if (id) this.applyVariationById(id);
    });
    this.saveButton?.addEventListener("click", () => this.saveNow());
    this.root.querySelector<HTMLButtonElement>("[data-shell-export]")?.addEventListener("click", () => this.active?.focusExport?.());
    this.root.querySelector<HTMLButtonElement>("[data-shell-inspector]")?.addEventListener("click", () => {
      const shell = this.shellElement();
      const collapsed = shell?.classList.toggle("studio-inspector-collapsed") ?? false;
      this.state.shared.inspectorCollapsed = collapsed;
      this.active?.resize(this.root.clientWidth, this.root.clientHeight);
      this.schedulePersist();
    });
    this.root.querySelector<HTMLButtonElement>("[data-shell-play]")?.addEventListener("click", () => this.command("play"));
    this.root.querySelector<HTMLButtonElement>("[data-shell-pause]")?.addEventListener("click", () => this.command("pause"));
    this.root.querySelector<HTMLInputElement>("[data-shell-timeline]")?.addEventListener("input", (event) => this.command("seek", Number((event.currentTarget as HTMLInputElement).value)));
  }

  private refreshShellUi(): void {
    const mode = this.root.querySelector<HTMLSelectElement>("[data-shell-mode]");
    if (mode) mode.innerHTML = this.registry.list().map(({ id, label }) => `<option value="${id}" ${id === this.state.activeModeId ? "selected" : ""}>${label}</option>`).join("");
    const variation = this.root.querySelector<HTMLSelectElement>("[data-shell-variation]");
    if (variation) {
      const items = this.listVariations();
      variation.innerHTML = `<option value="">현재 설정</option>${items.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}`;
      variation.disabled = items.length === 0;
    }
    const capabilities = this.registry.get(this.state.activeModeId).capabilities;
    const transport = this.root.querySelector<HTMLElement>("[data-shell-transport]");
    if (transport) transport.hidden = !capabilities.motion;
    this.refreshTransport();
  }

  private refreshTransport(): void {
    const state = this.active?.command?.("getMotionState") as { time?: number; duration?: number; fps?: number; playing?: boolean; preview?: string } | undefined;
    if (!state) return;
    const time = Number(state.time ?? 0); const duration = Math.max(.001, Number(state.duration ?? 1));
    const output = this.root.querySelector<HTMLElement>("[data-shell-time]"); if (output) output.textContent = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
    const timeline = this.root.querySelector<HTMLInputElement>("[data-shell-timeline]"); if (timeline) { timeline.max = String(duration); if (document.activeElement !== timeline) timeline.value = String(time); }
    const preview = state.preview === "realtime-optical" ? " · 실시간 광학 프리뷰" : "";
    const meta = this.root.querySelector<HTMLElement>("[data-shell-motion-meta]"); if (meta) meta.textContent = `${state.fps ?? 30} FPS${preview} · ${state.playing ? "PLAY" : "PAUSE"}`;
  }

  private schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.showSaveStatus("저장 중…", "saving");
    this.persistTimer = window.setTimeout(() => {
      try { this.persistNow(); this.showSaveStatus("자동 저장됨"); }
      catch { this.showSaveStatus("저장 실패", "error"); }
    }, 160);
  }
  private persistNow(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
  private showSaveStatus(message: string, state = "idle"): void {
    if (this.saveStatus) { this.saveStatus.textContent = message; this.saveStatus.dataset.state = state; }
    if (this.saveButton) {
      this.saveButton.dataset.state = state;
      this.saveButton.textContent = state === "saved" ? "저장 완료" : "설정 저장";
    }
    window.clearTimeout(this.saveFeedbackTimer);
    if (state === "saved") this.saveFeedbackTimer = window.setTimeout(() => this.showSaveStatus("자동 저장됨"), 2200);
  }
  private showStatus(message: string): void { if (this.status) this.status.textContent = message; }
  private shellElement(): HTMLElement | null { return this.root.querySelector<HTMLElement>(".studio-shell"); }
  private requireHost(): HTMLElement { if (!this.modeHost) throw new Error("Studio Shell mode host is unavailable."); return this.modeHost; }
}
