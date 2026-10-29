import { NextRequest, NextResponse } from 'next/server';
import { incrementUsage } from '@/server/persistence/transcriptionRepository';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.videoId || !body?.beatModel || !body?.chordModel) {
    return NextResponse.json({ error: 'videoId, beatModel and chordModel are required' }, { status: 400 });
  }
  return incrementUsage(body.videoId, body.beatModel, body.chordModel)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Transcription not found' }, { status: 404 });
}
