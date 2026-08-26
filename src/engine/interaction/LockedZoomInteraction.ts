export class LockedZoomInteraction {
  private readonly abortController = new AbortController();

  constructor(private readonly onZoom: (multiplier: number) => void) {}

  mount(host: HTMLElement): void {
    host.addEventListener("wheel", this.handleWheel, {
      passive: false,
      signal: this.abortController.signal,
    });
  }

  dispose(): void {
    this.abortController.abort();
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.onZoom(Math.exp(-event.deltaY * 0.0012));
  };
}
