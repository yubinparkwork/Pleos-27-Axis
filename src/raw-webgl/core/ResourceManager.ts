import type { GLContext } from "./GLContext";

export interface ManagedGLResource {
  readonly label?: string;
  readonly disposed: boolean;
  readonly restorePriority?: number;
  restore(): void;
  dispose(): void;
}

export class ResourceManager {
  private readonly resources = new Set<ManagedGLResource>();
  private readonly detachRestoredListener: (() => void) | null;
  private disposed = false;

  public constructor(context?: GLContext) {
    this.detachRestoredListener = context
      ? context.onContextRestored(() => this.restoreAll())
      : null;
  }

  public track<T extends ManagedGLResource>(resource: T): T {
    if (this.disposed) {
      resource.dispose();
      throw new Error("Cannot track a resource after ResourceManager disposal.");
    }
    this.resources.add(resource);
    return resource;
  }

  public untrack(resource: ManagedGLResource): boolean {
    return this.resources.delete(resource);
  }

  public restoreAll(): void {
    if (this.disposed) return;
    const ordered = [...this.resources]
      .filter((resource) => !resource.disposed)
      .sort((a, b) => (a.restorePriority ?? 0) - (b.restorePriority ?? 0));
    const errors: unknown[] = [];
    for (const resource of ordered) {
      try {
        resource.restore();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} WebGL resource(s) failed to restore.`);
    }
  }

  public disposeAll(): void {
    const ordered = [...this.resources]
      .sort((a, b) => (b.restorePriority ?? 0) - (a.restorePriority ?? 0));
    const errors: unknown[] = [];
    for (const resource of ordered) {
      if (resource.disposed) continue;
      try {
        resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.resources.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} WebGL resource(s) failed to dispose.`);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachRestoredListener?.();
    this.disposeAll();
  }
}
