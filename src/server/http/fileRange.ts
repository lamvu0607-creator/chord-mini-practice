import 'server-only';
import { open } from 'fs/promises';

export function parseRange(rangeHeader: string | null, fileSize: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : fileSize - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) {
    return null;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

export async function readFileSlice(filePath: string, start: number, end: number): Promise<ArrayBuffer> {
  const length = end - start + 1;
  const buffer = Buffer.allocUnsafe(length);
  const handle = await open(filePath, 'r');

  try {
    await handle.read(buffer, 0, length, start);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  } finally {
    await handle.close();
  }
}
