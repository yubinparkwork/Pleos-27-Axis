import type { MotionClockMode } from "./types";

export class MotionClock {
  mode: MotionClockMode = "realtime";
  time = 0;
  frame = 0;
  playing = false;
  private lastTimestamp = 0;

  play(timestamp = performance.now()): void { this.playing = true; this.lastTimestamp = timestamp; }
  pause(): void { this.playing = false; }
  reset(): void { this.pause(); this.seek(0, 30); }
  seek(time: number, fps: number): void { this.time = Math.max(0, time); this.frame = Math.round(this.time * fps); }
  setFixedFrame(frame: number, fps: number): void { this.mode = "fixed"; this.frame = Math.max(0, Math.round(frame)); this.time = this.frame / fps; }
  setRealtime(): void { this.mode = "realtime"; }
  step(deltaFrames: number, fps: number, duration: number): void { this.seek(Math.min(duration, Math.max(0, this.time + deltaFrames / fps)), fps); }
  tick(timestamp: number, speed: number, duration: number, fps: number, loop: boolean): boolean {
    if (!this.playing || this.mode !== "realtime") return false;
    const delta = Math.min(0.1, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    let next = this.time + delta * speed;
    if (loop) next = ((next % duration) + duration) % duration;
    else if (next >= duration) { next = duration; this.pause(); }
    this.seek(next, fps);
    return true;
  }
}
