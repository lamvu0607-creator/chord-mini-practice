import { NextRequest, NextResponse } from 'next/server';
import {
  enrichTranscription,
  findRecentTranscriptions,
  findTranscription,
  findVideoTranscriptions,
  upsertTranscription,
} from '@/server/persistence/transcriptionRepository';
import type { TranscriptionData } from '@/types/transcription';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import { checkTrialQuota, getOrCreateAnonymousToken } from '@/server/auth/quotaGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function valid(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('videoId');
  const beatModel = request.nextUrl.searchParams.get('beatModel');
  const chordModel = request.nextUrl.searchParams.get('chordModel');

  // If videoId is not provided, serve recent transcriptions with pagination (06-api-contract.md 3.1)
  if (!valid(videoId)) {
    try {
      const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 12);
      const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 12));
      const recent = findRecentTranscriptions({
        selectedKey: request.nextUrl.searchParams.get('key') || 'all',
        cursor: request.nextUrl.searchParams.get('cursor'),
        limit,
      });
      return NextResponse.json(
        { success: true, data: recent },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_QUERY', message: error instanceof Error ? error.message : 'Tham số không hợp lệ' } },
        { status: 400 },
      );
    }
  }

  const data = valid(beatModel) && valid(chordModel)
    ? findTranscription(videoId, beatModel, chordModel)
    : findVideoTranscriptions(videoId);

  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
}

function parseTranscriptionPayload(body: Record<string, unknown>): Omit<TranscriptionData, 'createdAt'> | null {
  const videoId = body?.videoId;
  const beatModel = body?.beatModel;
  const chordModel = body?.chordModel;

  if (!valid(videoId) || !valid(beatModel) || !valid(chordModel)) {
    return null;
  }

  // Handle either flat structure or nested body.payload structure
  const nested = (body?.payload && typeof body.payload === 'object') ? body.payload as Record<string, unknown> : null;
  const beats = (Array.isArray(body?.beats) ? body.beats : nested?.beats) as unknown[];
  const chords = (Array.isArray(body?.chords) ? body.chords : nested?.chords) as unknown[];
  const synchronizedChords = (Array.isArray(body?.synchronizedChords) ? body.synchronizedChords : nested?.synchronizedChords) as unknown[];

  if (!Array.isArray(beats) || !Array.isArray(chords) || !Array.isArray(synchronizedChords)) {
    return null;
  }

  return {
    ...nested,
    ...body,
    videoId,
    beatModel,
    chordModel,
    beats: beats as TranscriptionData['beats'],
    chords: chords as TranscriptionData['chords'],
    synchronizedChords: synchronizedChords as TranscriptionData['synchronizedChords'],
  } as Omit<TranscriptionData, 'createdAt'>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseTranscriptionPayload(body);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PAYLOAD', message: 'Dữ liệu phân tích hợp âm không hợp lệ' } },
        { status: 400 },
      );
    }

    const authUser = await getAuthenticatedUser(request);
    if (!authUser && parsed.videoId) {
      const { token: anonToken } = await getOrCreateAnonymousToken(request);
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
      const quotaCheck = checkTrialQuota(anonToken, ipAddress, parsed.videoId);
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ANONYMOUS_QUOTA_EXCEEDED',
              message: 'Bạn đã dùng hết 1 lượt thử miễn phí. Vui lòng đăng nhập để tiếp tục.',
            },
          },
          { status: 403 },
        );
      }
    }

    const saved = upsertTranscription(parsed);
    return NextResponse.json(
      {
        success: true,
        message: 'Đã lưu bản ghi hợp âm thành công',
        data: saved,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Save transcription error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Không thể lưu bản ghi hợp âm' } },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseTranscriptionPayload(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid transcription payload' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: upsertTranscription(parsed) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save transcription' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!valid(body?.videoId) || !valid(body?.beatModel) || !valid(body?.chordModel) || !body?.enrichment) {
      return NextResponse.json({ error: 'Invalid enrichment payload' }, { status: 400 });
    }
    const data = enrichTranscription(body.videoId, body.beatModel, body.chordModel, body.enrichment);
    return data ? NextResponse.json({ success: true, data }) : NextResponse.json({ error: 'Transcription not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update transcription' }, { status: 500 });
  }
}
