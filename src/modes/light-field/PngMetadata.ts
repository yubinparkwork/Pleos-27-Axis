function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function injectPngPpi(dataUrl: string, ppi: number): string {
  const source = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (character) => character.charCodeAt(0));
  const output = injectPngPpiBytes(source, ppi);
  let binary = "";
  for (let offset = 0; offset < output.length; offset += 0x8000) binary += String.fromCharCode(...output.subarray(offset, offset + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

export async function injectPngPpiBlob(blob: Blob, ppi: number): Promise<Blob> {
  const source = new Uint8Array(await blob.arrayBuffer());
  const injected = injectPngPpiBytes(source, ppi);
  const bytes = new Uint8Array(injected.byteLength);
  bytes.set(injected);
  return new Blob([bytes], { type: "image/png" });
}

function injectPngPpiBytes(source: Uint8Array, ppi: number): Uint8Array {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const ihdrLength = view.getUint32(8, false);
  const insertOffset = 20 + ihdrLength;
  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]);
  const data = new Uint8Array(9);
  const dataView = new DataView(data.buffer);
  const pixelsPerMeter = Math.round(ppi / .0254);
  dataView.setUint32(0, pixelsPerMeter, false);
  dataView.setUint32(4, pixelsPerMeter, false);
  data[8] = 1;
  const crcInput = new Uint8Array(13);
  crcInput.set(type);
  crcInput.set(data, 4);
  const chunk = new Uint8Array(21);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9, false);
  chunk.set(type, 4);
  chunk.set(data, 8);
  chunkView.setUint32(17, crc32(crcInput), false);
  const output = new Uint8Array(source.length + chunk.length);
  output.set(source.subarray(0, insertOffset));
  output.set(chunk, insertOffset);
  output.set(source.subarray(insertOffset), insertOffset + chunk.length);
  return output;
}
