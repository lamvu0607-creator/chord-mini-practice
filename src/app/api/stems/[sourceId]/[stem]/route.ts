import { stat } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { parseRange, readFileSlice } from '@/server/http/fileRange';
import { canViewStemSet, getStemSet } from '@/server/stems/stemSetRepository';
import { isValidSourceId, isValidStemName, resolveStemFile } from '@/server/stems/stemStorage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ sourceId: string; stem: string }> };

function safeDownloadName(title: string | undefined, stem: string): string {
  const base = (title || 'stems').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 120) || 'stems';
  return `${base} - ${stem}.flac`;
}

/** Stream one stem (FLAC) with Range support; `?download=1` serves it as an attachment. */
export async function GET(request: NextRequest, { params }: Params) {
  const { sourceId, stem } = await params;
  if (!isValidSourceId(sourceId) || !isValidStemName(stem)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const record = getStemSet(sourceId);
  const user = record?.sourceType === 'upload' ? await getAuthenticatedUser(request) : null;
  const stemEntry = record?.status === 'ready' ? record.stems.find((entry) => entry.name === stem) : undefined;
  if (!record || !stemEntry || !canViewStemSet(record, user)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = await resolveStemFile(sourceId, stemEntry.file);
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats?.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rangeHeader = request.headers.get('range');
  const range = parseRange(rangeHeader, fileStats.size);
  if (rangeHeader && !range) {
    return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileStats.size}` } });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? fileStats.size - 1;
  const body = await readFileSlice(filePath, start, end);
  const download = new URL(request.url).searchParams.get('download') === '1';
  const fileName = safeDownloadName(record.title, stem);
  const headers: HeadersInit = {
    'Content-Type': 'audio/flac',
    'Content-Length': String(body.byteLength),
    'Accept-Ranges': 'bytes',
    // Uploaded (private) stems must not be stored by shared caches.
    'Cache-Control': record.sourceType === 'upload' ? 'private, max-age=3600' : 'public, max-age=86400',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${fileStats.size}`;

  return new NextResponse(body, { status: range ? 206 : 200, headers });
}
