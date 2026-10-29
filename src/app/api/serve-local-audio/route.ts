import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { basename, extname } from 'path';
import {
  deleteLocalAudioFile,
  findExistingLocalAudioFile,
  findLocalAudioFileByFilename,
  saveLocalAudioFile,
  saveLocalAudioMetadata,
  enforceLocalAudioQuota,
} from '@/services/storage/localAudioStorageService';
import { buildAudioStreamPath, buildLocalAudioServePath } from '@/utils/localAudioUrl';
import { requireAdmin } from '@/server/auth/sessionGuard';
import { parseRange, readFileSlice } from '@/server/http/fileRange';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
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

function getMaxUploadBytes(): number {
  const configured = Number(process.env.LOCAL_AUDIO_MAX_UPLOAD_MB || 100);
  return Number.isFinite(configured) && configured > 0
    ? configured * 1024 * 1024
    : DEFAULT_MAX_UPLOAD_BYTES;
}

function getSafeFilename(request: NextRequest): string | null {
  const filename = new URL(request.url).searchParams.get('filename');
  if (!filename) return null;

  const safeFilename = basename(filename);
  const extension = extname(safeFilename).toLowerCase();
  if (safeFilename !== filename || !CONTENT_TYPES[extension]) {
    return null;
  }

  return safeFilename;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestedVideoId = requestUrl.searchParams.get('videoId');
  if (requestedVideoId) {
    const localAudio = await findExistingLocalAudioFile(requestedVideoId);
    if (!localAudio) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      audioUrl: buildLocalAudioServePath(localAudio.filename),
      streamUrl: buildAudioStreamPath(localAudio.videoId),
      storagePath: `audio/${localAudio.filename}`,
      fileSize: localAudio.fileSize,
      title: localAudio.title,
      duration: localAudio.duration,
    });
  }

  const safeFilename = getSafeFilename(request);
  if (!safeFilename) {
    return NextResponse.json({ error: 'Invalid or missing audio filename' }, { status: 400 });
  }

  const localAudio = await findLocalAudioFileByFilename(safeFilename);
  if (!localAudio) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileStats = await stat(localAudio.filePath);
  const contentType = CONTENT_TYPES[extname(safeFilename).toLowerCase()] || 'application/octet-stream';
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
    'Content-Disposition': `inline; filename="${safeFilename}"`,
  };

  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${fileStats.size}`;
  }

  return new NextResponse(body, { status: range ? 206 : 200, headers });
}

export async function HEAD(request: NextRequest) {
  const safeFilename = getSafeFilename(request);
  if (!safeFilename) {
    return new NextResponse(null, { status: 400 });
  }

  const localAudio = await findLocalAudioFileByFilename(safeFilename);
  if (!localAudio) {
    return new NextResponse(null, { status: 404 });
  }

  const fileStats = await stat(localAudio.filePath);
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[extname(safeFilename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': String(fileStats.size),
      'Accept-Ranges': 'bytes',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio');
    const videoId = formData.get('videoId');

    if (!(audio instanceof File) || typeof videoId !== 'string' || !videoId.trim()) {
      return NextResponse.json({ error: 'audio file and videoId are required' }, { status: 400 });
    }

    if (!audio.type.startsWith('audio/') && !CONTENT_TYPES[extname(audio.name).toLowerCase()]) {
      return NextResponse.json({ error: 'Only audio files are allowed' }, { status: 415 });
    }

    const maxUploadBytes = getMaxUploadBytes();
    if (audio.size <= 0 || audio.size > maxUploadBytes) {
      return NextResponse.json(
        { error: `Audio file must be between 1 byte and ${Math.round(maxUploadBytes / 1024 / 1024)}MB` },
        { status: 413 }
      );
    }

    const saved = await saveLocalAudioFile(videoId, new Uint8Array(await audio.arrayBuffer()), {
      filename: audio.name,
      title: typeof formData.get('title') === 'string' ? String(formData.get('title')) : undefined,
      contentType: audio.type,
    });
    void enforceLocalAudioQuota();

    const audioUrl = buildLocalAudioServePath(saved.filename);
    return NextResponse.json({
      success: true,
      audioUrl,
      storagePath: `audio/${saved.filename}`,
      fileSize: saved.fileSize,
    });
  } catch (error) {
    console.error('Local audio upload failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Local audio upload failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  // Only Admin is authorized to delete audio cache
  const auth = await requireAdmin(request);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const safeFilename = getSafeFilename(request);
  if (!safeFilename) {
    return NextResponse.json({ error: 'Invalid or missing audio filename' }, { status: 400 });
  }

  try {
    const deleted = await deleteLocalAudioFile(safeFilename);
    return deleted
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (error) {
    console.error('Local audio deletion failed:', error);
    return NextResponse.json({ error: 'Local audio deletion failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json() as {
      videoId?: string;
      storagePath?: string;
      title?: string;
      duration?: number;
      fileSize?: number;
    };
    const filename = data.storagePath ? basename(data.storagePath) : '';
    if (!data.videoId || !filename) {
      return NextResponse.json({ error: 'videoId and storagePath are required' }, { status: 400 });
    }

    const localAudio = await findLocalAudioFileByFilename(filename);
    if (!localAudio) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await saveLocalAudioMetadata({
      videoId: data.videoId,
      filename,
      filePath: localAudio.filePath,
      audioUrl: localAudio.audioUrl,
      title: data.title,
      duration: data.duration,
      fileSize: data.fileSize || localAudio.fileSize,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Local audio metadata update failed:', error);
    return NextResponse.json({ error: 'Local audio metadata update failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
