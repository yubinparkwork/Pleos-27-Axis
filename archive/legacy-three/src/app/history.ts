export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private current: T, private readonly limit = 80) {}

  push(next: T): T {
    this.past.push(structuredClone(this.current));
    if (this.past.length > this.limit) this.past.shift();
    this.current = structuredClone(next);
    this.future = [];
    return structuredClone(this.current);
  }

  replace(next: T): void {
    this.current = structuredClone(next);
  }

  undo(): T | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(structuredClone(this.current));
    this.current = previous;
    return structuredClone(this.current);
  }

  redo(): T | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(structuredClone(this.current));
    this.current = next;
    return structuredClone(this.current);
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
}
