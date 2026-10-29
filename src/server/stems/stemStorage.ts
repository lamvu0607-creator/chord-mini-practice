import 'server-only';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureLocalAudioWriteDir } from '@/services/storage/localAudioStorageService';

/** Stems live under `<audio dir>/stems/<sourceId>/`, shared with the stems container. */
export const STEMS_SUBDIR = 'stems';

const SOURCE_ID_PATTERN = /^(yt_[a-zA-Z0-9_-]{11}|up_[a-f0-9]{24})$/;
const STEM_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function isValidSourceId(sourceId: string): boolean {
  return SOURCE_ID_PATTERN.test(sourceId);
}

export function isValidStemName(name: string): boolean {
  return STEM_NAME_PATTERN.test(name);
}

export function youtubeSourceId(videoId: string): string {
  return `yt_${videoId}`;
}

/** Uploads are scoped per user, so two users uploading the same file get separate private sets. */
export function uploadSourceId(userId: string, contentSha256: string): string {
  return `up_${crypto.createHash('sha256').update(`${userId}:${contentSha256}`).digest('hex').slice(0, 24)}`;
}

export async function getAudioRoot(): Promise<string> {
  return ensureLocalAudioWriteDir();
}

/** Path of a set directory relative to the audio root (what the stems service receives). */
export function relativeStemDir(sourceId: string): string {
  if (!isValidSourceId(sourceId)) throw new Error('Invalid stem source id');
  return `${STEMS_SUBDIR}/${sourceId}`;
}

export async function absoluteStemDir(sourceId: string): Promise<string> {
  return path.join(await getAudioRoot(), relativeStemDir(sourceId));
}

/** Convert an absolute file path to one relative to the audio root, or null when it lives elsewhere. */
export async function toAudioRootRelative(absolutePath: string): Promise<string | null> {
  const root = await getAudioRoot();
  const relative = path.relative(root, path.resolve(absolutePath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

export async function resolveStemFile(sourceId: string, fileName: string): Promise<string> {
  const directory = await absoluteStemDir(sourceId);
  const target = path.resolve(directory, fileName);
  if (path.dirname(target) !== path.resolve(directory)) throw new Error('Invalid stem file');
  return target;
}

export async function removeStemDir(sourceId: string): Promise<void> {
  await fs.rm(await absoluteStemDir(sourceId), { recursive: true, force: true });
}
