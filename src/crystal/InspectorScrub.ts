export function bindScrubbableNumbers(container: ParentNode): void {
  container.querySelectorAll<HTMLInputElement>("input[type='number'][data-scrub]").forEach((input) => {
    if (input.dataset.scrubBound === "true") return;
    input.dataset.scrubBound = "true";
    input.addEventListener("pointerdown", (downEvent) => {
      if (downEvent.button !== 0) return;
      const startX = downEvent.clientX;
      const startValue = Number(input.value);
      if (!Number.isFinite(startValue)) return;
      const step = Number(input.step) || 1;
      const minimum = input.min === "" ? -Infinity : Number(input.min);
      const maximum = input.max === "" ? Infinity : Number(input.max);
      let dragging = false;
      const move = (moveEvent: PointerEvent): void => {
        const delta = moveEvent.clientX - startX;
        if (!dragging && Math.abs(delta) < 3) return;
        dragging = true;
        document.body.classList.add("scrubbing-number");
        const precision = moveEvent.shiftKey ? 0.1 : 1;
        const next = Math.min(maximum, Math.max(minimum, startValue + delta * step * precision));
        const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length + (moveEvent.shiftKey ? 1 : 0));
        input.value = Number(next.toFixed(Math.min(decimals, 6))).toString();
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const up = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.classList.remove("scrubbing-number");
        if (dragging) input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    });
  });
}
