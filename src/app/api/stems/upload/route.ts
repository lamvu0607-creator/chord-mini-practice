import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/sessionGuard';
import { getStemSet, toPublicStemSet, upsertPendingStemSet } from '@/server/stems/stemSetRepository';
import { absoluteStemDir, relativeStemDir, uploadSourceId } from '@/server/stems/stemStorage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.webm', '.aac']);

function maxUploadBytes(): number {
  const configured = Number(process.env.STEMS_MAX_UPLOAD_MB || 100);
  return (Number.isFinite(configured) && configured > 0 ? configured : 100) * 1024 * 1024;
}

/** Store an uploaded song for separation. Uploads are private to the uploader. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user } = auth;

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxUploadBytes() + 1024 * 1024) {
    return NextResponse.json({ success: false, error: 'File is too large' }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  const entry = formData?.get('file');
  // Structural check: runtimes may hand back a File/Blob class from a different realm.
  const file = entry && typeof entry === 'object' && typeof entry.arrayBuffer === 'function' ? entry : null;
  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Missing audio file' }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ success: false, error: 'File is too large' }, { status: 413 });
  }
  const originalName = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const extension = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ success: false, error: 'Unsupported audio format' }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const sourceId = uploadSourceId(user.userId, contentHash);

  const existing = getStemSet(sourceId);
  if (existing) {
    return NextResponse.json({ success: true, sourceId, stemSet: toPublicStemSet(existing, user) });
  }

  const directory = await absoluteStemDir(sourceId);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `source${extension}`;
  const temporary = path.join(directory, `.${fileName}.tmp`);
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, path.join(directory, fileName));

  const title = path.basename(originalName, extension).slice(0, 200) || 'Uploaded audio';
  const record = upsertPendingStemSet({
    sourceId,
    sourceType: 'upload',
    ownerUserId: user.userId,
    title,
    inputPath: `${relativeStemDir(sourceId)}/${fileName}`,
  });
  return NextResponse.json({ success: true, sourceId, stemSet: toPublicStemSet(record, user) }, { status: 201 });
}
