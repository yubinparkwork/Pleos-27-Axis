/** Full-frame budgets: screen-space refraction cannot be tiled without seams.
 * Never pretend that an upscaled bitmap is a native high-resolution render.
 * 16 MP admits all long-edge-3840 artboards, including a square.
 */
export const MAX_CAPTURE_PIXELS = 16_000_000;
export const MAX_REFLECTION_PIXELS = 8_400_000;

export function planDimentionCapture(width: number, height: number, requestedScale: number, maximum: number) {
  if (![width, height].every(v => Number.isInteger(v) && v > 0)) throw new Error("출력 픽셀 크기는 양의 정수여야 합니다.");
  if (width > maximum || height > maximum || width * height > MAX_CAPTURE_PIXELS) {
    throw new Error(`요청한 ${width}×${height}px는 원본 해상도 렌더 한도를 넘습니다. 출력 크기를 ‘4K · 현재 판형 유지’로 선택하거나 1,600만 픽셀 이하로 낮춰 주세요. 확대 저장은 하지 않습니다.`);
  }
  const scale = Math.max(1, Math.min(2, Number.isFinite(requestedScale) ? requestedScale : 1, maximum / width, maximum / height, Math.sqrt(MAX_CAPTURE_PIXELS / (width * height))));
  return { width, height, scale, renderWidth: Math.floor(width * scale), renderHeight: Math.floor(height * scale), upscaled: false as const };
}
