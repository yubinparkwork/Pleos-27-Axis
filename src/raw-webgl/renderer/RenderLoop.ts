export class RenderLoop {
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(private readonly render: () => void) {}

  request(): void {
    if (this.disposed || this.frameHandle !== null) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = null;
      if (!this.disposed) this.render();
    });
  }

  cancel(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}
