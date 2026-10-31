import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { extname } from 'path';
import {
  deleteLocalAudioFile,
  findExistingLocalAudioFile,
} from '@/services/storage/localAudioStorageService';
import { requireAdmin } from '@/server/auth/sessionGuard';
import { parseRange, readFileSlice } from '@/server/http/fileRange';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

interface RouteContext {
  params: Promise<{ videoId: string }> | { videoId: string };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { videoId } = await Promise.resolve(context.params);
    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_VIDEO_ID', message: 'Invalid video ID' } },
        { status: 400 },
      );
    }

    const localAudio = await findExistingLocalAudioFile(videoId);
    if (!localAudio) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_NOT_FOUND', message: 'No audio file found for this video' } },
        { status: 404 },
      );
    }

    // Check if client only requested metadata
    const wantMetadata = request.nextUrl.searchParams.get('metadata') === 'true';
    if (wantMetadata) {
      return NextResponse.json({
        success: true,
        data: {
          videoId: localAudio.videoId,
          filename: localAudio.filename,
          fileSize: localAudio.fileSize,
          mimeType: localAudio.mimeType || 'audio/mpeg',
          title: localAudio.title,
          duration: localAudio.duration,
          audioUrl: `/api/audio/${encodeURIComponent(localAudio.videoId)}`,
        },
      });
    }

    const fileStats = await stat(localAudio.filePath);
    const extension = extname(localAudio.filename).toLowerCase();
    const contentType = localAudio.mimeType || CONTENT_TYPES[extension] || 'audio/mpeg';

    const rangeHeader = request.headers.get('range');
    const range = parseRange(rangeHeader, fileStats.size);

    if (rangeHeader && !range) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileStats.size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? fileStats.size - 1;
    const body = await readFileSlice(localAudio.filePath, start, end);

    const headers: HeadersInit = {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="${encodeURIComponent(localAudio.filename)}"`,
    };

    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileStats.size}`;
    }

    return new NextResponse(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error('Audio streaming error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error while serving the audio file' } },
      { status: 500 },
    );
  }
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  try {
    const { videoId } = await Promise.resolve(context.params);
    if (!videoId) return new NextResponse(null, { status: 400 });

    const localAudio = await findExistingLocalAudioFile(videoId);
    if (!localAudio) return new NextResponse(null, { status: 404 });

    const fileStats = await stat(localAudio.filePath);
    const extension = extname(localAudio.filename).toLowerCase();
    const contentType = localAudio.mimeType || CONTENT_TYPES[extension] || 'audio/mpeg';

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStats.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // Only Admin is authorized to delete audio cache
    const auth = await requireAdmin(request);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const { videoId } = await Promise.resolve(context.params);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_VIDEO_ID', message: 'Invalid video ID' } },
        { status: 400 },
      );
    }

    const localAudio = await findExistingLocalAudioFile(videoId);
    if (!localAudio) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_NOT_FOUND', message: 'No file found to delete' } },
        { status: 404 },
      );
    }

    const deleted = await deleteLocalAudioFile(localAudio.filename);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: 'DELETE_FAILED', message: 'Could not delete the audio file' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Audio file deleted',
    });
  } catch (error) {
    console.error('Audio delete error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error while deleting the audio file' } },
      { status: 500 },
    );
  }
}
