import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { findVideoTranscriptions } from '@/server/persistence/transcriptionRepository';
import { deleteSongName, getSongName, upsertSongName, type SongNameRecord } from '@/server/persistence/savedSongRepository';
import { findExistingLocalAudioFile } from '@/services/storage/localAudioStorageService';
import { SONG_NAME_MAX_LENGTH, type SongName } from '@/types/songName';
import { isUploadSourceId } from '@/utils/uploadSourceId';

export const dynamic = 'force-dynamic';

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

type RouteContext = { params: Promise<{ videoId: string }> };
type Viewer = { userId: string; role: string };

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

function canEdit(record: SongNameRecord, viewer: Viewer): boolean {
  return viewer.role === 'admin' || viewer.userId === record.savedByUserId;
}

function toSongName(record: SongNameRecord, viewer: Viewer): SongName {
  return { name: record.name, canEdit: canEdit(record, viewer) };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { videoId } = await context.params;
  const record = getSongName(videoId);
  return NextResponse.json({ success: true, songName: record ? toSongName(record, auth.user) : null });
}

/** Set or change the custom name of a song. */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { videoId } = await context.params;
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId) && !isUploadSourceId(videoId)) {
    return errorResponse(400, 'INVALID_VIDEO_ID', 'Invalid song ID');
  }

  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return errorResponse(400, 'INVALID_NAME', 'Enter a name for this song');
  if (name.length > SONG_NAME_MAX_LENGTH) {
    return errorResponse(400, 'INVALID_NAME', `Names can be at most ${SONG_NAME_MAX_LENGTH} characters`);
  }

  const existing = getSongName(videoId);
  if (existing && !canEdit(existing, auth.user)) {
    return errorResponse(403, 'FORBIDDEN', 'Only the person who named this song can rename it');
  }
  if (!existing) {
    const hasAudio = Boolean(await findExistingLocalAudioFile(videoId));
    if (!hasAudio && findVideoTranscriptions(videoId).length === 0) {
      return errorResponse(404, 'SONG_NOT_FOUND', 'This song is not on the server');
    }
  }

  return NextResponse.json({ success: true, songName: toSongName(upsertSongName(videoId, name, auth.user.userId), auth.user) });
}

/** Back to the original title. The audio and analysis are not touched. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { videoId } = await context.params;
  const existing = getSongName(videoId);
  if (!existing) return errorResponse(404, 'SONG_NOT_FOUND', 'This song has no custom name');
  if (!canEdit(existing, auth.user)) {
    return errorResponse(403, 'FORBIDDEN', 'Only the person who named this song can change it');
  }
  deleteSongName(videoId);
  return NextResponse.json({ success: true });
}
