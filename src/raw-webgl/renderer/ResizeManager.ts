export interface ResizeMeasurement {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

export class ResizeManager {
  private observer: ResizeObserver | null = null;
  private readonly abortController = new AbortController();

  constructor(
    private readonly element: HTMLElement,
    private readonly onResize: (measurement: ResizeMeasurement) => void,
  ) {}

  start(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.element);
    } else {
      window.addEventListener("resize", this.measure, { signal: this.abortController.signal });
    }
    this.measure();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.abortController.abort();
  }

  readonly measure = (): void => {
    const bounds = this.element.getBoundingClientRect();
    this.onResize({
      cssWidth: Math.max(1, bounds.width),
      cssHeight: Math.max(1, bounds.height),
      devicePixelRatio: window.devicePixelRatio || 1,
    });
  };
}
