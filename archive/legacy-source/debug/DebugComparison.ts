import type { NewAxisRenderer } from "../NewAxisRenderer";
import { exportPreset } from "../presets/types";
import type { NewAxisPreset, Point } from "../presets/types";

type ViewMode = "render" | "reference" | "overlay" | "difference";

const TEXT_MASK = { x1: 780, y1: 920, x2: 2020, y2: 1110 };

export class DebugComparison {
  private readonly overlay: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly panel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly image = new Image();
  private mode: ViewMode = "render";
  private panelVisible = false;
  private guidesVisible = false;
  private planeVisible = false;
  private overlayOpacity = 0.5;
  private referenceReady = false;
  private textureVisible: boolean;

  constructor(
    private readonly host: HTMLElement,
    private readonly renderer: NewAxisRenderer,
    private readonly preset: NewAxisPreset,
  ) {
    this.textureVisible = preset.texture.enabled;
    this.overlay = document.createElement("canvas");
    this.overlay.className = "comparison-canvas";
    this.overlay.hidden = true;
    const context = this.overlay.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D comparison canvas is unavailable");
    this.context = context;
    this.host.append(this.overlay);

    this.status = document.createElement("output");
    this.status.className = "debug-status";
    this.status.textContent = "Render only";
    this.status.hidden = true;
    this.host.append(this.status);

    this.panel = this.createPanel();
    this.host.append(this.panel);

    this.image.onload = () => {
      this.referenceReady = true;
      this.refresh();
    };
    this.image.onerror = () => {
      this.status.textContent = "Reference unavailable — render remains procedural";
    };
    this.image.src = "/reference/pleos-3d-new-axis.png";

    addEventListener("resize", () => this.refresh());
    addEventListener("keydown", (event) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key.toLowerCase()) {
      case "r":
        this.setMode(this.mode === "overlay" ? "render" : "overlay");
        break;
      case "d":
        this.setMode(this.mode === "difference" ? "render" : "difference");
        break;
      case "p":
        this.planeVisible = !this.planeVisible;
        this.renderer.setPlaneDebug(this.planeVisible);
        this.status.hidden = !this.planeVisible && !this.panelVisible;
        this.status.textContent = this.planeVisible ? "Plane ID view" : "Render only";
        break;
      case "g":
        this.panelVisible = !this.panelVisible;
        this.guidesVisible = this.panelVisible;
        this.panel.hidden = !this.panelVisible;
        this.renderer.setGuides(this.guidesVisible);
        this.status.hidden = !this.panelVisible && this.mode === "render" && !this.planeVisible;
        break;
      case "t":
        this.setTextureVisible(!this.textureVisible);
        break;
      case "s":
        this.renderer.downloadPNG();
        break;
    }
  }

  private setTextureVisible(visible: boolean): void {
    this.textureVisible = visible;
    this.renderer.setTextureEnabled(visible);
    this.status.hidden = false;
    this.status.textContent = visible ? "Error-map texture on" : "Grayscale baseline";
    window.setTimeout(() => {
      if (!this.panelVisible && this.mode === "render" && !this.planeVisible) {
        this.status.hidden = true;
      }
    }, 900);
  }

  private setMode(mode: ViewMode): void {
    this.mode = mode;
    this.overlay.hidden = mode === "render";
    this.status.hidden = mode === "render" && !this.panelVisible && !this.planeVisible;
    this.renderer.setFitMode(mode === "render" ? "cover" : "contain");
    this.refresh();
  }

  private sizeOverlay(): void {
    if (this.overlay.width === this.renderer.canvas.width && this.overlay.height === this.renderer.canvas.height) return;
    this.overlay.width = this.renderer.canvas.width;
    this.overlay.height = this.renderer.canvas.height;
  }

  private referenceRect(): { x: number; y: number; width: number; height: number } {
    const width = this.overlay.width;
    const height = this.overlay.height;
    const scale = Math.min(width / 2800, height / 2080);
    const targetWidth = 2800 * scale;
    const targetHeight = 2080 * scale;
    return {
      x: (width - targetWidth) / 2,
      y: (height - targetHeight) / 2,
      width: targetWidth,
      height: targetHeight,
    };
  }

  refresh(): void {
    if (this.mode === "render" || !this.referenceReady) return;
    this.sizeOverlay();
    const ctx = this.context;
    const rect = this.referenceRect();
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (this.mode === "reference" || this.mode === "overlay") {
      ctx.globalAlpha = this.mode === "reference" ? 1 : this.overlayOpacity;
      ctx.drawImage(this.image, rect.x, rect.y, rect.width, rect.height);
      ctx.globalAlpha = 1;
      this.status.textContent = this.mode === "reference"
        ? "Reference only (debug)"
        : `Reference overlay ${Math.round(this.overlayOpacity * 100)}%`;
      return;
    }

    this.drawDifference(rect);
  }

  private drawDifference(rect: { x: number; y: number; width: number; height: number }): void {
    const width = this.overlay.width;
    const height = this.overlay.height;
    const refCanvas = document.createElement("canvas");
    refCanvas.width = width;
    refCanvas.height = height;
    const refContext = refCanvas.getContext("2d", { willReadFrequently: true });
    if (!refContext) return;
    refContext.drawImage(this.image, rect.x, rect.y, rect.width, rect.height);

    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = width;
    renderCanvas.height = height;
    const renderContext = renderCanvas.getContext("2d", { willReadFrequently: true });
    if (!renderContext) return;
    renderContext.drawImage(this.renderer.canvas, 0, 0, width, height);

    const reference = refContext.getImageData(0, 0, width, height);
    const rendered = renderContext.getImageData(0, 0, width, height);
    const output = this.context.createImageData(width, height);
    const scaleX = width / 2800;
    const scaleY = height / 2080;
    let total = 0;
    let count = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const masked = x >= TEXT_MASK.x1 * scaleX && x <= TEXT_MASK.x2 * scaleX
          && y >= TEXT_MASK.y1 * scaleY && y <= TEXT_MASK.y2 * scaleY;
        const difference = masked ? 0 : Math.abs(reference.data[index] - rendered.data[index]);
        output.data[index] = Math.min(255, difference * 5);
        output.data[index + 1] = Math.min(255, Math.max(0, difference * 5 - 128));
        output.data[index + 2] = 0;
        output.data[index + 3] = 255;
        if (!masked) {
          total += difference;
          count += 1;
        }
      }
    }
    this.context.putImageData(output, 0, 0);
    this.status.textContent = `Absolute difference · MAE ${(total / Math.max(count, 1)).toFixed(2)}/255 · text masked`;
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement("aside");
    panel.className = "debug-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "New Axis debug controls");

    const title = document.createElement("h1");
    title.textContent = "New Axis / pleos-original";
    panel.append(title);

    const viewButtons = document.createElement("div");
    viewButtons.className = "button-row";
    for (const mode of ["render", "reference", "overlay", "difference"] as ViewMode[]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mode;
      button.addEventListener("click", () => this.setMode(mode));
      viewButtons.append(button);
    }
    panel.append(viewButtons);

    const textureButton = document.createElement("button");
    textureButton.type = "button";
    const syncTextureLabel = (): void => {
      textureButton.textContent = `Error-map texture: ${this.textureVisible ? "on" : "off"}`;
    };
    syncTextureLabel();
    textureButton.addEventListener("click", () => {
      this.setTextureVisible(!this.textureVisible);
      syncTextureLabel();
    });
    panel.append(textureButton);

    this.addRange(panel, "Texture amount", 0, 1.5, 0.01, () => this.preset.texture.amount, (value) => {
      this.preset.texture.amount = value;
    });
    this.addRange(panel, "Texture scale", 0.35, 3, 0.01, () => this.preset.texture.scale, (value) => {
      this.preset.texture.scale = value;
    });
    this.addRange(panel, "Seam intensity", 0, 2, 0.01, () => this.preset.texture.seamIntensity, (value) => {
      this.preset.texture.seamIntensity = value;
    });

    this.addRange(panel, "Overlay opacity", 0, 1, 0.01, () => this.overlayOpacity, (value) => {
      this.overlayOpacity = value;
      this.refresh();
    });

    this.addPointControls(panel, "Origin", this.preset.origin);
    this.addPointControls(panel, "Top", this.preset.rays.top);
    this.addPointControls(panel, "Main left", this.preset.rays.mainLeft);
    this.addPointControls(panel, "Main right", this.preset.rays.mainRight);
    this.addPointControls(panel, "Right down", this.preset.rays.rightDown);
    this.addPointControls(panel, "Soft down", this.preset.rays.softDown);

    this.addRange(panel, "Top-right luminance", 0, 255, 1, () => this.preset.luminance.topRight, (value) => {
      this.preset.luminance.topRight = value;
    });
    this.addRange(panel, "Right-middle luminance", 0, 255, 1, () => this.preset.luminance.rightMiddle, (value) => {
      this.preset.luminance.rightMiddle = value;
    });
    this.addRange(panel, "Bottom-left luminance", 0, 255, 1, () => this.preset.luminance.bottomLeft, (value) => {
      this.preset.luminance.bottomLeft = value;
    });
    this.addRange(panel, "Left-plane luminance", 0, 255, 1, () => this.preset.luminance.leftMiddle, (value) => {
      this.preset.luminance.leftMiddle = value;
    });
    this.addRange(panel, "Left transition", 1, 260, 1, () => this.preset.lighting.leftShadowWidth, (value) => {
      this.preset.lighting.leftShadowWidth = value;
    });
    this.addRange(panel, "Fold start width", 1, 220, 1, () => this.preset.lighting.softDownWidthStart, (value) => {
      this.preset.lighting.softDownWidthStart = value;
    });
    this.addRange(panel, "Fold end width", 1, 260, 1, () => this.preset.lighting.softDownWidthEnd, (value) => {
      this.preset.lighting.softDownWidthEnd = value;
    });

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy preset JSON";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(exportPreset(this.preset));
      this.status.textContent = "Preset JSON copied";
    });
    panel.append(copy);

    const hint = document.createElement("p");
    hint.className = "key-hint";
    hint.textContent = "T texture · R overlay · D difference · P planes · G panel/guides · S PNG";
    panel.append(hint);
    return panel;
  }

  private addPointControls(panel: HTMLElement, label: string, point: Point): void {
    const group = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    this.addRange(group, "x", 0, 2800, 0.1, () => point[0], (value) => { point[0] = value; });
    this.addRange(group, "y", 0, 2080, 0.1, () => point[1], (value) => { point[1] = value; });
    panel.append(group);
  }

  private addRange(
    parent: HTMLElement,
    labelText: string,
    min: number,
    max: number,
    step: number,
    read: () => number,
    write: (value: number) => void,
  ): void {
    const label = document.createElement("label");
    const text = document.createElement("span");
    const value = document.createElement("output");
    const input = document.createElement("input");
    text.textContent = labelText;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(read());
    value.textContent = Number(read()).toFixed(step < 1 ? 1 : 0);
    input.addEventListener("input", () => {
      const next = Number(input.value);
      write(next);
      value.textContent = next.toFixed(step < 1 ? 1 : 0);
      this.renderer.updatePreset();
      this.refresh();
    });
    label.append(text, value, input);
    parent.append(label);
  }
}
