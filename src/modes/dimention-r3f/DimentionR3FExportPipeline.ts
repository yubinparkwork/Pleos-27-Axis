import { BufferTarget, StreamTarget, type StreamTargetChunk } from "mediabunny";

export type DimentionVideoResolution = "4k" | "custom";

export interface DimentionVideoDimensions {
  width: number;
  height: number;
  label: string;
}

export interface DimentionVideoSink {
  readonly target: BufferTarget | StreamTarget;
  readonly storage: "opfs" | "memory";
  complete(): Promise<{ blob: Blob; size: number }>;
  cancel(): Promise<void>;
}

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);

export function resolveVideoDimensions(
  artboardWidth: number,
  artboardHeight: number,
  resolution: DimentionVideoResolution,
  customWidth: number,
  customHeight: number,
): DimentionVideoDimensions {
  if (resolution === "custom") {
    const width = even(Math.max(16, Math.min(8192, customWidth)));
    const height = even(Math.max(16, Math.min(8192, customHeight)));
    return { width, height, label: `사용자 지정 ${width}×${height}` };
  }
  const aspect = Math.max(1, artboardWidth) / Math.max(1, artboardHeight);
  const width = aspect >= 1 ? 3840 : even(3840 * aspect);
  const height = aspect >= 1 ? even(3840 / aspect) : 3840;
  return { width, height, label: `4K 판형 유지 ${width}×${height}` };
}

export async function createVideoSink(): Promise<DimentionVideoSink> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (typeof storage.getDirectory === "function") {
    try {
      const root = await storage.getDirectory();
      const directory = await root.getDirectoryHandle("pleos-axis-exports", { create: true });
      const name = `render-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}.mp4`;
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      const target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true, chunkSize: 8 * 1024 * 1024 });
      let settled = false;
      const remove = async () => { try { await directory.removeEntry(name); } catch { /* already removed */ } };
      return {
        target,
        storage: "opfs",
        async complete() {
          if (settled) throw new Error("동영상 출력 스트림이 이미 종료되었습니다.");
          settled = true;
          const file = await handle.getFile();
          const blob = file.slice(0, file.size, "video/mp4");
          window.setTimeout(() => { void remove(); }, 5 * 60_000);
          return { blob, size: file.size };
        },
        async cancel() { if (!settled) settled = true; await remove(); },
      };
    } catch (error) {
      console.warn("OPFS 동영상 스트리밍을 사용할 수 없어 메모리 출력으로 전환합니다.", error);
    }
  }

  const target = new BufferTarget();
  return {
    target,
    storage: "memory",
    async complete() {
      if (!target.buffer) throw new Error("MP4 메모리 버퍼를 만들지 못했습니다.");
      return { blob: new Blob([target.buffer], { type: "video/mp4" }), size: target.buffer.byteLength };
    },
    async cancel() { /* Output.cancel() releases the encoder and buffer. */ },
  };
}

export function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 100 * 1024 * 1024 ? 1 : 0)}MB`;
}
