import { readFile } from 'fs/promises';
import { basename } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { validateBrowserAudioCandidate, YOUTUBE_VIDEO_ID_PATTERN } from '@/utils/browserAudioValidation';
import { BROWSER_YTDLP_MAX_FINAL_BYTES } from '@/services/audio/browserYtDlpConfig';
import {
  findLocalAudioFileByFilename,
  matchesLocalAudioVideoId,
  saveLocalAudioMetadata,
} from '@/services/storage/localAudioStorageService';
import { buildLocalAudioServePath } from '@/utils/localAudioUrl';

export const runtime = 'nodejs';
export const maxDuration = 120;

function normalizeTitle(value: unknown, videoId: string): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 240)
    : `YouTube Video ${videoId}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const videoId = typeof body.videoId === 'string' ? body.videoId : '';
    const candidatePath = typeof body.candidatePath === 'string' ? body.candidatePath : '';
    const sha256 = typeof body.sha256 === 'string' ? body.sha256 : '';
    const reportedFileSize = typeof body.fileSize === 'number' ? body.fileSize : undefined;
    const filename = basename(candidatePath.replace(/^audio[\\/]/, ''));

    if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      return NextResponse.json({ success: false, error: 'Invalid YouTube video ID.' }, { status: 400 });
    }
    if (!filename || !matchesLocalAudioVideoId(filename, videoId)) {
      return NextResponse.json({ success: false, error: 'Invalid local audio candidate path.' }, { status: 400 });
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return NextResponse.json({ success: false, error: 'Invalid audio candidate hash.' }, { status: 400 });
    }
    if (reportedFileSize !== undefined && (!Number.isFinite(reportedFileSize) || reportedFileSize <= 0 || reportedFileSize > BROWSER_YTDLP_MAX_FINAL_BYTES)) {
      return NextResponse.json({ success: false, error: 'Invalid audio candidate size.' }, { status: 400 });
    }

    const localAudio = await findLocalAudioFileByFilename(filename);
    if (!localAudio) {
      return NextResponse.json({ success: false, error: 'Audio candidate was not found.' }, { status: 404 });
    }

    const buffer = await readFile(localAudio.filePath);
    const validation = await validateBrowserAudioCandidate({
      buffer,
      contentType: 'audio/mpeg',
      expectedVideoId: videoId,
      expectedSha256: sha256,
      expectedFileSize: reportedFileSize,
    });
    const title = normalizeTitle(body.title, videoId);
    await saveLocalAudioMetadata({
      videoId,
      filename,
      filePath: localAudio.filePath,
      audioUrl: localAudio.audioUrl,
      title,
      duration: validation.duration,
      fileSize: buffer.byteLength,
    });

    return NextResponse.json({
      success: true,
      audioUrl: buildLocalAudioServePath(filename),
      storagePath: `audio/${filename}`,
      title,
      duration: validation.duration,
      fileSize: buffer.byteLength,
      isStreamUrl: false,
      method: 'browser-ytdlp',
    });
  } catch (error) {
    console.error('Browser extraction finalization failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Audio finalization failed.' },
      { status: 500 }
    );
  }
}
