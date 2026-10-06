import type { OpticalState } from './OpticalState';

const HISTORY_LIMIT = 100;

// The running clock is transport state, not an edit. Undoing a material or
// camera change must not jump to the frame at which that change was made.
function settingsDiffer(a: OpticalState, b: OpticalState): boolean {
  return (Object.keys(a) as Array<keyof OpticalState>)
    .some(key => key !== 'time' && key !== 'playing' && (
      key === 'cameraProfiles' || key === 'cameraDrafts'
        ? JSON.stringify(a[key]) !== JSON.stringify(b[key])
        : a[key] !== b[key]));
}

function withCurrentTransport(snapshot: OpticalState, current: OpticalState): OpticalState {
  return { ...snapshot, time: current.time, playing: current.playing };
}

/** Session-only edit history; persistent scene settings remain the source of truth. */
export class OpticalHistory {
  private readonly past: OpticalState[] = [];
  private readonly future: OpticalState[] = [];
  private transactionBefore?: OpticalState;

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.transactionBefore = undefined;
  }

  begin(current: OpticalState): void {
    if (!this.transactionBefore) this.transactionBefore = { ...current };
  }

  record(before: OpticalState, after: OpticalState): void {
    if (!settingsDiffer(before, after) || this.transactionBefore) return;
    this.push(before);
  }

  end(current: OpticalState): void {
    const before = this.transactionBefore;
    this.transactionBefore = undefined;
    if (before && settingsDiffer(before, current)) this.push(before);
  }

  undo(current: OpticalState): OpticalState | undefined {
    this.end(current);
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.future.push({ ...current });
    return withCurrentTransport(previous, current);
  }

  redo(current: OpticalState): OpticalState | undefined {
    this.end(current);
    const next = this.future.pop();
    if (!next) return undefined;
    this.past.push({ ...current });
    return withCurrentTransport(next, current);
  }

  private push(before: OpticalState): void {
    this.past.push({ ...before });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future.length = 0;
  }
}
