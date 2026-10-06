import type { OpticalState } from './OpticalState';

interface StoredOpticalState {
  version: 1;
  updatedAt: number;
  state: OpticalState;
}

function isStored(value: unknown): value is StoredOpticalState {
  const record = value as Partial<StoredOpticalState> | null;
  return record?.version === 1 && typeof record.updatedAt === 'number'
    && Number.isFinite(record.updatedAt) && !!record.state && typeof record.state === 'object';
}

/** Shares the active optical scene through the local Vite server, never a cloud endpoint. */
export class OpticalSharedSettings {
  private readonly endpoint: string;
  private available = false;
  private hydrating = true;
  private editedDuringHydration = false;
  private pending: OpticalState | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing = false;
  private disposed = false;
  private lastTimestamp = 0;
  status = 'browser-only';

  constructor(
    key: string,
    private readonly restore: (state: OpticalState) => void,
    private readonly notify: (message: string) => void,
  ) {
    this.endpoint = `/__pleos/optical-state?key=${encodeURIComponent(key)}`;
  }

  async hydrate(localSaved: OpticalState | null): Promise<void> {
    if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
      this.hydrating = false;
      return;
    }
    try {
      const response = await fetch(this.endpoint, { cache: 'no-store' });
      if (response.status !== 204 && (!response.ok || !response.headers.get('content-type')?.includes('application/json'))) return;
      this.available = true;
      this.status = 'local-shared';
      if (response.status === 200) {
        const remote: unknown = await response.json();
        if (!isStored(remote)) throw new Error('Invalid shared optical settings');
        this.lastTimestamp = remote.updatedAt;
        if (!this.editedDuringHydration && !this.disposed) {
          this.restore(remote.state);
          this.notify('이 컴퓨터의 공유 설정을 불러왔습니다.');
        }
      } else if (localSaved && !this.editedDuringHydration) {
        // Only an existing browser save may seed a missing file. An empty IAB
        // must never replace the user's already tuned Chrome scene with defaults.
        this.pending = { ...localSaved };
        await this.drain(true);
      }
    } catch {
      this.status = 'browser-only';
      this.notify('설정은 이 브라우저에 저장됩니다. 로컬 공유 저장을 확인할 수 없습니다.');
    } finally {
      this.hydrating = false;
      if (this.pending) this.scheduleWrite();
    }
  }

  schedule(state: OpticalState): void {
    if (this.disposed) return;
    this.pending = { ...state };
    if (this.hydrating) { this.editedDuringHydration = true; return; }
    if (this.available) this.scheduleWrite();
  }

  flush(): void {
    clearTimeout(this.timer);
    if (!this.available || !this.pending || this.disposed) return;
    const state = this.pending;
    this.pending = null;
    const updatedAt = this.nextTimestamp();
    void fetch(this.endpoint, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, updatedAt, state }), keepalive: true,
    }).catch(() => undefined);
  }

  dispose(): void {
    this.flush();
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private scheduleWrite(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.drain(false); }, 150);
  }

  private nextTimestamp(): number {
    this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    return this.lastTimestamp;
  }

  private async drain(migration: boolean): Promise<void> {
    if (this.writing || !this.available || this.disposed) return;
    this.writing = true;
    try {
      while (this.pending && !this.disposed) {
        const state = this.pending;
        this.pending = null;
        const updatedAt = migration ? 0 : this.nextTimestamp();
        const response = await fetch(this.endpoint, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 1, updatedAt, migration, state }), keepalive: true,
        });
        migration = false;
        if (response.status === 409) {
          const remote: unknown = await response.json();
          if (isStored(remote)) {
            this.lastTimestamp = Math.max(this.lastTimestamp, remote.updatedAt);
            if (!this.pending && !this.editedDuringHydration && !this.disposed) {
              this.restore(remote.state);
              this.notify('다른 브라우저의 최신 설정을 불러왔습니다.');
            }
          }
          continue;
        }
        if (!response.ok) throw new Error(`Shared settings save failed (${response.status})`);
        this.status = 'local-shared';
        this.notify('설정 자동 저장됨 · 로컬 브라우저 간 공유');
      }
    } catch {
      this.status = 'browser-only';
      this.available = false;
      this.notify('브라우저에는 저장됐지만 로컬 공유 저장에 실패했습니다.');
    } finally {
      this.writing = false;
      if (this.pending && this.available && !this.hydrating) this.scheduleWrite();
    }
  }
}
