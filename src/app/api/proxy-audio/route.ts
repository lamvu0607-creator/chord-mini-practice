import { NextRequest, NextResponse } from 'next/server';
import { getCachedAudioFile } from '@/services/api/parallelPipelineService';
import { safeFetchAudioSource } from '@/utils/safeServerAudioFetch';

export const maxDuration = 180;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function forwardedHeaders(request: NextRequest): HeadersInit {
  const headers: Record<string, string> = {
    'User-Agent': 'ChordMini/1.0',
    Accept: 'audio/*,application/octet-stream',
  };
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  return headers;
}

async function proxy(request: NextRequest, method: 'GET' | 'HEAD') {
  const { searchParams } = new URL(request.url);
  const audioUrl = searchParams.get('url');
  const videoId = searchParams.get('videoId');
  if (!audioUrl) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });

  if (videoId) {
    const cached = getCachedAudioFile(videoId);
    if (cached) {
      return new NextResponse(method === 'HEAD' ? null : cached.stream(), {
        headers: {
          'Content-Type': cached.type || 'audio/mpeg',
          'Content-Length': String(cached.size),
          'Cache-Control': 'private, max-age=300',
          'Access-Control-Allow-Origin': '*',
          'X-Cache-Hit': 'true',
        },
      });
    }
  }

  try {
    const upstream = await safeFetchAudioSource(
      audioUrl,
      {
        method,
        headers: forwardedHeaders(request),
        signal: AbortSignal.timeout(120_000),
      },
      {
        allowDevelopmentLocalhost: process.env.NODE_ENV === 'development',
      }
    );
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_AUDIO_BYTES) {
      upstream.body?.cancel();
      return NextResponse.json({ error: 'Audio file too large (max 100MB)' }, { status: 413 });
    }

    return new NextResponse(method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        ...(length > 0 ? { 'Content-Length': String(length) } : {}),
        ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range')! } : {}),
        ...(upstream.headers.get('accept-ranges') ? { 'Accept-Ranges': upstream.headers.get('accept-ranges')! } : {}),
        'Cache-Control': 'private, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch audio';
    const status = /Invalid|not allowed|disallowed/.test(message) ? 403 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export function GET(request: NextRequest) { return proxy(request, 'GET'); }
export function HEAD(request: NextRequest) { return proxy(request, 'HEAD'); }
export function OPTIONS() {
  return new NextResponse(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  } });
}
