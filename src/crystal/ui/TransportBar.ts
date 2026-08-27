export function transportTemplate(): string {
  return `<footer class="motion-transport" data-transport>
    <div class="transport-buttons"><button data-action="motion-reset" aria-label="첫 프레임">↺</button><button data-action="frame-prev" aria-label="이전 프레임">‹</button><button class="play-button" data-action="play-toggle" aria-label="재생 또는 일시정지">▶</button><button data-action="frame-next" aria-label="다음 프레임">›</button></div>
    <time data-output="motion-time">00:00:00 / 00:06:00</time>
    <input data-motion="timeline" type="range" min="0" max="6" step="0.001" value="0" aria-label="모션 타임라인">
    <label><input data-motion="transport-loop" type="checkbox" checked> 반복</label><span data-output="motion-fps">30 fps</span>
  </footer>`;
}
