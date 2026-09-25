import { OpticalFrameCapture } from './OpticalRenderer';
import type { OpticalState } from './OpticalState';
import type { Output, StreamTarget, StreamTargetChunk } from 'mediabunny';

export interface OpticalVideoOptions {
  width: number; height: number; fps: number; samples: number; start: number; end: number;
}

export interface OpticalVideoResult {
  blob: Blob; width: number; height: number; fps: number;
  frames: number; duration: number; filename: string;
  codec: 'h264' | 'hevc'; codecLabel: string;
}

type MediaBunny = typeof import('mediabunny');
interface VideoSink {
  target: StreamTarget;
  storage: 'opfs' | 'memory';
  complete(): Promise<Blob>;
  cancel(): Promise<void>;
}

// The encoded file is streamed to disk when possible. The fallback is deliberately
// small: its Blob finalization may briefly require a second copy of these bytes.
const MEMORY_LIMIT = 256 * 1024 * 1024;
const MEMORY_PAGE = 1024 * 1024;
const aborted = () => new DOMException('동영상 내보내기를 취소했습니다.', 'AbortError');
const checkAbort = (signal: AbortSignal) => { if (signal.aborted) throw aborted(); };

function validate(state: Readonly<OpticalState>, options: OpticalVideoOptions): void {
  const { width, height, fps, samples, start, end } = options;
  if (![width, height].every(n => Number.isInteger(n) && n >= 16 && n <= 3840 && n % 2 === 0)) {
    throw new Error('MP4 크기는 가로·세로 16–3840px의 짝수여야 합니다.');
  }
  if (![24, 30, 60].includes(fps)) throw new Error('동영상 프레임은 24, 30, 60fps 중 선택해 주세요.');
  if (![4, 16].includes(samples)) throw new Error('영상 샘플은 4 또는 16으로 설정해 주세요.');
  if (![start, end, state.duration].every(Number.isFinite) || start < 0 || end <= start || end > state.duration) {
    throw new Error('내보낼 구간은 0초부터 현재 재생 길이 사이이며, 끝 시간이 시작 시간보다 커야 합니다.');
  }
}

function encodingSettings(options: OpticalVideoOptions) {
  const { width, height, fps } = options;
  // 60 Mbps at UHD/30, scaled by actual pixels and frame rate. This is a target
  // bitrate, not an upscaling step or a claim of lossless H.264 output.
  const bitrate = Math.round(Math.min(180_000_000, Math.max(12_000_000,
    60_000_000 * width * height / (3840 * 2160) * (fps / 30))));
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = macroblocks * fps;
  // Include macroblocks/second; checking only frame size can accept 4K/60 with
  // a Level 5.1 declaration that is only suitable for 4K/30.
  const level = macroblocks <= 8192 && rate <= 245760 && bitrate <= 50_000_000 ? 0x29
    : macroblocks <= 22080 && rate <= 589824 && bitrate <= 135_000_000 ? 0x32
    : macroblocks <= 36864 && rate <= 983040 ? 0x33
    : macroblocks <= 36864 && rate <= 2073600 ? 0x34 : 0x3c;
  return {
    bitrate, avcCodec: `avc1.6400${level.toString(16).padStart(2, '0')}`,
    // HEVC Main/8-bit is an MP4-compatible alternative when a device's H.264
    // encoder cannot cover a 4:5/square 3840px frame. These levels accommodate
    // the actual pixels, frame rate AND target bitrate; no hidden downscaling.
    hevcCodec: `hvc1.1.6.L${bitrate <= 120_000_000 ? 183 : 186}.B0`,
  };
}

async function selectEncoder(
  mb: MediaBunny, options: OpticalVideoOptions, quality: InstanceType<MediaBunny['Quality']>,
  signal: AbortSignal,
) {
  const { width, height, fps } = options;
  const { bitrate, avcCodec, hevcCodec } = encodingSettings(options);
  const preferences = ['no-preference', 'prefer-software'] as const;
  for (const codec of ['avc', 'hevc'] as const) {
    const fullCodecString = codec === 'avc' ? avcCodec : hevcCodec;
    for (const hardwareAcceleration of preferences) {
      checkAbort(signal);
      const support = await VideoEncoder.isConfigSupported({
        codec: fullCodecString, width, height, framerate: fps, bitrate, bitrateMode: 'variable',
        latencyMode: 'quality', hardwareAcceleration, alpha: 'discard',
      }).catch(() => ({ supported: false }));
      checkAbort(signal);
      if (!support.supported) continue;
      const encodes = await mb.canEncodeVideo(codec, {
        width, height, quality, fullCodecString, latencyMode: 'quality', hardwareAcceleration,
      }).catch(() => false);
      checkAbort(signal);
      if (encodes) return {
        codec, fullCodecString, hardwareAcceleration,
        resultCodec: codec === 'avc' ? 'h264' as const : 'hevc' as const,
        label: codec === 'avc' ? 'H.264' : 'HEVC (H.265)',
      };
    }
  }
  throw new Error(`이 브라우저에서 ${width}×${height} · ${fps}fps MP4를 만들 수 있는 H.264/HEVC 인코더가 없습니다. 해상도는 임의로 낮추지 않았습니다. Chrome 하드웨어 가속을 확인하거나 출력 해상도·fps를 변경해 주세요.`);
}

async function createSink(mb: MediaBunny, estimatedBytes: number, signal: AbortSignal): Promise<VideoSink> {
  checkAbort(signal);
  let directory: FileSystemDirectoryHandle | undefined;
  let fileName: string | undefined;
  let writable: FileSystemWritableFileStream | undefined;
  let writerClosed = false;
  const remove = async () => {
    if (directory && fileName) await directory.removeEntry(fileName).catch(() => undefined);
  };
  const closeWriter = async () => {
    if (!writerClosed && writable) {
      // StreamTarget closes its own wrapper writer. This forwards that close to
      // the actual file writer, committing OPFS before getFile() is called.
      writerClosed = true;
      await writable.close();
    }
  };
  if (typeof navigator.storage?.getDirectory === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      checkAbort(signal);
      if (estimate.quota !== undefined && estimatedBytes > estimate.quota - (estimate.usage ?? 0)) {
        throw new Error('브라우저의 임시 저장 공간이 부족합니다. 출력 구간을 줄이거나 저장 공간을 확보해 주세요.');
      }
      const root = await navigator.storage.getDirectory();
      checkAbort(signal);
      directory = await root.getDirectoryHandle('pleos-optical-video-exports', { create: true });
      checkAbort(signal);
      fileName = `optical-${Date.now()}-${crypto.randomUUID()}.mp4`;
      const file = await directory.getFileHandle(fileName, { create: true });
      checkAbort(signal);
      writable = await file.createWritable();
      checkAbort(signal);
      const target = new mb.StreamTarget(new WritableStream<StreamTargetChunk>({
        async write(chunk) { checkAbort(signal); await writable!.write(chunk); },
        close: closeWriter,
        async abort(reason) {
          if (!writerClosed) { writerClosed = true; await writable!.abort(reason).catch(() => undefined); }
        },
      }), { chunked: true, chunkSize: 4 * 1024 * 1024 });
      return {
        target, storage: 'opfs',
        async complete() {
          checkAbort(signal);
          if (!writerClosed) throw new Error('MP4 파일의 디스크 기록이 아직 완료되지 않았습니다.');
          const result = await file.getFile();
          checkAbort(signal);
          if (result.size === 0) throw new Error('MP4 파일이 비어 있습니다. 다시 내보내 주세요.');
          // File-backed Blob avoids reading the entire 4K movie into JavaScript.
          // Keep its backing file alive through the download, then remove only it.
          window.setTimeout(() => { void remove(); }, 30 * 60_000);
          return result.slice(0, result.size, 'video/mp4');
        },
        async cancel() {
          if (!writerClosed) {
            writerClosed = true;
            await writable!.abort().catch(() => undefined);
          }
          await remove();
        },
      };
    } catch (error) {
      if (writable && !writerClosed) {
        writerClosed = true;
        await writable.abort().catch(() => undefined);
      }
      await remove();
      checkAbort(signal);
      if (estimatedBytes > MEMORY_LIMIT) {
        if (error instanceof Error && /저장 공간/.test(error.message)) throw error;
        throw new Error('브라우저 임시 디스크를 사용할 수 없습니다. 이 길이의 4K 영상은 메모리로 안전하게 만들 수 없으니, Chrome 일반 창에서 열거나 출력 구간을 줄여 주세요.');
      }
    }
  }
  if (estimatedBytes > MEMORY_LIMIT) {
    throw new Error('임시 디스크를 지원하지 않아 메모리 출력은 약 256MB까지만 가능합니다. Chrome 일반 창에서 열거나 출력 구간을 줄여 주세요.');
  }

  // Seek-capable paged sink: enforce the cap BEFORE allocation, including MP4
  // metadata rewrites. BufferTarget only reports writes after growing its buffer.
  const pages = new Map<number, Uint8Array<ArrayBuffer>>();
  let length = 0;
  let closed = false;
  const target = new mb.StreamTarget(new WritableStream<StreamTargetChunk>({
    write({ data, position }) {
      checkAbort(signal);
      const end = position + data.byteLength;
      if (end > MEMORY_LIMIT) throw new Error('영상이 메모리 출력 한도(256MB)를 넘었습니다. 출력 구간을 줄이거나 Chrome 일반 창의 임시 디스크를 사용해 주세요.');
      for (let offset = 0; offset < data.byteLength;) {
        const absolute = position + offset;
        const pageIndex = Math.floor(absolute / MEMORY_PAGE);
        let page = pages.get(pageIndex);
        if (!page) { page = new Uint8Array(MEMORY_PAGE); pages.set(pageIndex, page); }
        const inPage = absolute % MEMORY_PAGE;
        const count = Math.min(MEMORY_PAGE - inPage, data.byteLength - offset);
        page.set(data.subarray(offset, offset + count), inPage);
        offset += count;
      }
      length = Math.max(length, end);
    },
    close() { closed = true; },
    abort() { pages.clear(); },
  }), { chunked: true, chunkSize: 1024 * 1024 });
  return {
    target, storage: 'memory',
    async complete() {
      checkAbort(signal);
      if (!closed || !length) throw new Error('MP4 메모리 파일을 완성하지 못했습니다.');
      const parts: BlobPart[] = [];
      for (let offset = 0; offset < length; offset += MEMORY_PAGE) {
        const page = pages.get(offset / MEMORY_PAGE) ?? new Uint8Array(MEMORY_PAGE);
        parts.push(page.subarray(0, Math.min(MEMORY_PAGE, length - offset)));
      }
      const blob = new Blob(parts, { type: 'video/mp4' });
      pages.clear();
      return blob;
    },
    async cancel() { pages.clear(); },
  };
}

/** Offline, deterministic MP4 export. Does not mutate the live scene or settings. */
export async function exportOpticalVideo(
  state: Readonly<OpticalState>, options: OpticalVideoOptions, signal: AbortSignal,
  onProgress: (message: string, fraction: number) => void,
): Promise<OpticalVideoResult> {
  const requested = { ...options };
  const frameState: OpticalState = { ...state, playing: false };
  validate(frameState, requested);
  checkAbort(signal);
  if (typeof VideoEncoder !== 'function' || !globalThis.isSecureContext) {
    throw new Error('이 브라우저는 MP4 인코딩을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 localhost나 HTTPS 주소로 열어 주세요.');
  }
  const { width, height, fps, samples, start, end } = requested;
  const frames = Math.max(1, Math.ceil((end - start) * fps - 1e-7));
  const duration = frames / fps;
  const { bitrate } = encodingSettings(requested);
  onProgress(`${width}×${height} · MP4 인코더 확인 중…`, 0);
  const mb = await import('mediabunny').catch(error => {
    checkAbort(signal);
    throw new Error('영상 인코더를 불러오지 못했습니다. 페이지 연결 상태를 확인하고 다시 시도해 주세요.', { cause: error });
  });
  checkAbort(signal);
  const quality = new mb.Quality({ bitrate, bitrateMode: 'variable' });
  const encoder = await selectEncoder(mb, requested, quality, signal);
  checkAbort(signal);

  let sink: VideoSink | undefined;
  let capture: OpticalFrameCapture | undefined;
  let output: Output | undefined;
  let cancelPromise: Promise<void> | undefined;
  let success = false;
  const cancelOutput = () => {
    if (output && output.state !== 'finalized' && output.state !== 'finalizing' && !cancelPromise) {
      cancelPromise = output.cancel().catch(() => undefined);
    }
  };
  signal.addEventListener('abort', cancelOutput, { once: true });
  try {
    sink = await createSink(mb, bitrate / 8 * duration * 1.4 + 8 * 1024 * 1024, signal);
    checkAbort(signal);
    onProgress(`${width}×${height} · ${encoder.label} · ${samples}샘플 · ${sink.storage === 'opfs' ? '임시 디스크에 기록' : '메모리 출력'} 준비 중…`, 0);
    capture = new OpticalFrameCapture(width, height, samples);
    let source: InstanceType<MediaBunny['CanvasSource']> | undefined;
    const started = performance.now();
    for (let frame = 0; frame < frames; frame++) {
      checkAbort(signal);
      // Evaluate the scene at source time, but encode from timestamp zero. The
      // endpoint is excluded so a looping clip never duplicates its first frame.
      frameState.time = start + frame / fps;
      const canvas = await capture.render(frameState, signal, tileFraction => {
        onProgress(`영상 렌더링 ${frame + 1}/${frames} · 현재 프레임 ${Math.round(tileFraction * 100)}%`,
          (frame + tileFraction) / frames * .98);
      });
      checkAbort(signal);
      if (!source) {
        source = new mb.CanvasSource(canvas, {
          codec: encoder.codec, fullCodecString: encoder.fullCodecString, quality, keyFrameInterval: 1,
          latencyMode: 'quality', hardwareAcceleration: encoder.hardwareAcceleration, alpha: 'discard',
        });
        output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'reserve' }), target: sink.target });
        output.addVideoTrack(source, { frameRate: fps, maximumPacketCount: frames });
        await output.start();
        checkAbort(signal);
      }
      // Awaiting each add propagates both encoder and disk backpressure: no
      // unbounded VideoFrame queue, no real-time recording or dropped frames.
      await source.add(frame / fps, 1 / fps);
      checkAbort(signal);
      const complete = frame + 1;
      const remaining = Math.max(0, Math.ceil((performance.now() - started) / 1000 / complete * (frames - complete)));
      const eta = remaining >= 60 ? `${Math.ceil(remaining / 60)}분` : `${remaining}초`;
      onProgress(`영상 렌더링 ${complete}/${frames} · 약 ${eta} 남음`, complete / frames * .98);
      // Keep the cancel button responsive even when a small frame renders and
      // encodes faster than the browser normally yields to input events.
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }
    checkAbort(signal);
    onProgress('MP4 파일을 마무리하는 중…', .99);
    await output!.finalize();
    checkAbort(signal);
    const blob = await sink.complete();
    checkAbort(signal);
    success = true;
    onProgress(`완료 · ${width}×${height} · ${encoder.label} · ${fps}fps · ${(blob.size / (1024 * 1024)).toFixed(1)}MB`, 1);
    return {
      blob, width, height, fps, frames, duration, codec: encoder.resultCodec, codecLabel: encoder.label,
      filename: `pleos-27-axis-${width}x${height}-${fps}fps-${start.toFixed(2)}-${end.toFixed(2)}s-${samples}spp-${encoder.resultCodec}.mp4`,
    };
  } catch (error) {
    if (signal.aborted) throw aborted();
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('영상 저장 중 브라우저 임시 공간이 부족해졌습니다. 저장 공간을 확보하거나 출력 구간을 줄여 주세요.');
    }
    if (error instanceof Error && !/[가-힣]/.test(error.message)) {
      throw new Error(`영상 내보내기가 중단됐습니다. 다른 GPU 작업을 닫거나 해상도·fps를 낮춰 다시 시도해 주세요. (${error.message})`, { cause: error });
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', cancelOutput);
    if (!success) {
      cancelOutput();
      await cancelPromise;
      await sink?.cancel();
    }
    capture?.dispose();
  }
}
