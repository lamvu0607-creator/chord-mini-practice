import crypto from 'crypto';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { findExistingLocalAudioFile, saveLocalAudioFile } from '@/services/storage/localAudioStorageService';
import { toUploadSourceId } from '@/utils/uploadSourceId';

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

function maxUploadBytes(): number {
  const configured = Number(process.env.LOCAL_AUDIO_MAX_UPLOAD_MB || 100);
  return (Number.isFinite(configured) && configured > 0 ? configured : 100) * 1024 * 1024;
}

function readTitle(value: FormDataEntryValue | null | undefined, fallback: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  return (title || fallback).slice(0, 200);
}

/**
 * Store an uploaded song (or a clip cut in the browser) for analysis on /analyze/<id>.
 * Requires login; the id is private to the uploader and only reachable by its link.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user } = auth;

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxUploadBytes() + 1024 * 1024) {
    return NextResponse.json({ success: false, error: 'File too large' }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  const entry = formData?.get('file');
  // Structural check: runtimes may hand back a File/Blob class from a different realm.
  const file = entry && typeof entry === 'object' && typeof entry.arrayBuffer === 'function' ? entry : null;
  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Missing audio file' }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ success: false, error: 'File too large' }, { status: 413 });
  }
  const originalName = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const extension = path.extname(originalName).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ success: false, error: 'Unsupported audio format' }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const id = toUploadSourceId(crypto.createHash('sha256').update(`${user.userId}:${contentHash}`).digest('hex'));
  const title = readTitle(formData?.get('title'), path.basename(originalName, extension) || 'Uploaded audio');

  const existing = await findExistingLocalAudioFile(id);
  if (existing) {
    return NextResponse.json({ success: true, id, title: existing.title || title, existing: true });
  }

  await saveLocalAudioFile(id, bytes, { filename: originalName, title, contentType });
  return NextResponse.json({ success: true, id, title, existing: false });
}
