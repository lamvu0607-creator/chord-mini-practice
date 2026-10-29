import { NextRequest, NextResponse } from 'next/server';
import {
  findTranscription,
  incrementUsage,
} from '@/server/persistence/transcriptionRepository';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ videoId: string }> | { videoId: string };
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

async function handleIncrement(request: NextRequest, context: RouteContext) {
  try {
    const { videoId } = await Promise.resolve(context.params);
    if (!isValidId(videoId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_VIDEO_ID', message: 'Video ID không hợp lệ' } },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const beatModel = body?.beatModel;
    const chordModel = body?.chordModel;

    if (!isValidId(beatModel) || !isValidId(chordModel)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_MODELS', message: 'beatModel và chordModel là bắt buộc' } },
        { status: 400 },
      );
    }

    const updated = incrementUsage(videoId, beatModel, chordModel);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'TRANSCRIPTION_NOT_FOUND', message: 'Không tìm thấy bản ghi hợp âm' } },
        { status: 404 },
      );
    }

    const current = findTranscription(videoId, beatModel, chordModel);
    return NextResponse.json({
      success: true,
      usageCount: current?.usageCount ?? 1,
    });
  } catch (error) {
    console.error('Increment transcription usage error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Lỗi cập nhật lượt xem' } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleIncrement(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleIncrement(request, context);
}
