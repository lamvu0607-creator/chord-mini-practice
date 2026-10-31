import { NextRequest, NextResponse } from 'next/server';
import {
  deleteVideoTranscriptions,
  findTranscription,
  findVideoTranscriptions,
} from '@/server/persistence/transcriptionRepository';
import { requireAdmin } from '@/server/auth/sessionGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ videoId: string }> | { videoId: string };
}

function isValidVideoId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { videoId } = await Promise.resolve(context.params);
    if (!isValidVideoId(videoId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_VIDEO_ID',
            message: 'Invalid video ID',
          },
        },
        { status: 400 },
      );
    }

    const beatModel = request.nextUrl.searchParams.get('beatModel');
    const chordModel = request.nextUrl.searchParams.get('chordModel');

    if (beatModel && chordModel) {
      const transcription = findTranscription(videoId, beatModel, chordModel);
      if (!transcription) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TRANSCRIPTION_NOT_FOUND',
              message: 'This song has not been analyzed with this model yet',
            },
          },
          { status: 404 },
        );
      }

      return NextResponse.json(
        {
          success: true,
          cached: true,
          data: transcription,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const variants = findVideoTranscriptions(videoId);
    if (!variants || variants.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TRANSCRIPTION_NOT_FOUND',
            message: 'No chord data found for this song',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        cached: true,
        data: variants[0],
        variants,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to get transcription by videoId:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Server error while reading chord data',
        },
      },
      { status: 500 },
    );
  }
}

/** Admin only: remove a song from the shared "recent" list by deleting all its analyses. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { videoId } = await Promise.resolve(context.params);
  if (!isValidVideoId(videoId)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_VIDEO_ID', message: 'Invalid video ID' } },
      { status: 400 },
    );
  }

  const deleted = deleteVideoTranscriptions(videoId);
  if (deleted === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'TRANSCRIPTION_NOT_FOUND', message: 'Song not found' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, deleted });
}
