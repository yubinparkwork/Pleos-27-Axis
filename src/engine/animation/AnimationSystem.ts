import * as THREE from "three/webgpu";

export interface AnimationFrameSample {
  deltaSeconds: number;
  elapsedSeconds: number;
}

export class AnimationSystem {
  private readonly timer = new THREE.Timer();

  connect(ownerDocument: Document): void {
    this.timer.connect(ownerDocument);
  }

  sample(paused: boolean): AnimationFrameSample {
    this.timer.update();
    return {
      deltaSeconds: paused ? 0 : Math.min(0.05, this.timer.getDelta()),
      elapsedSeconds: this.timer.getElapsed(),
    };
  }

  dispose(): void {
    this.timer.dispose();
  }
}
