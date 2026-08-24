import type { DisjointTimerQueryExtension } from "../core";

export class PerformanceMonitor {
  private activeQuery: WebGLQuery | null = null;
  private readonly pending: WebGLQuery[] = [];
  private cpuStart = 0;
  private cpuFrameMs: number | null = null;
  private gpuFrameMs: number | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly extension: DisjointTimerQueryExtension | null,
  ) {}

  get frameTimeMs(): number | null { return this.gpuFrameMs ?? this.cpuFrameMs; }

  begin(): void {
    this.poll();
    this.cpuStart = performance.now();
    if (!this.extension || this.activeQuery) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.activeQuery = query;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
  }

  end(): void {
    this.cpuFrameMs = performance.now() - this.cpuStart;
    if (!this.extension || !this.activeQuery) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.activeQuery);
    this.activeQuery = null;
  }

  dispose(): void {
    if (this.activeQuery) this.gl.deleteQuery(this.activeQuery);
    this.pending.forEach((query) => this.gl.deleteQuery(query));
    this.pending.length = 0;
    this.activeQuery = null;
  }

  private poll(): void {
    if (!this.extension || this.pending.length === 0) return;
    const query = this.pending[0];
    const available = Boolean(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE));
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    if (!available) return;
    if (!disjoint) {
      const nanoseconds = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
      if (Number.isFinite(nanoseconds)) this.gpuFrameMs = nanoseconds / 1_000_000;
    }
    this.gl.deleteQuery(query);
    this.pending.shift();
  }
}
