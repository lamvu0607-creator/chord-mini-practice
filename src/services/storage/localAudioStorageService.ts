import path from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { buildAudioStreamPath, buildLocalAudioServePath } from '@/utils/localAudioUrl';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.opus', '.webm', '.flac', '.ogg', '.aac'] as const;
const AUDIO_MIME_TYPES: Record<(typeof AUDIO_EXTENSIONS)[number], string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.opus': 'audio/opus', '.webm': 'audio/webm',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
};
const DEFAULT_LOCAL_AUDIO_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'audio');
const PROJECT_TEMP_AUDIO_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'temp');
const LEGACY_LOCAL_AUDIO_DIR = path.join(tmpdir(), 'chordmini-ytdlp');

function getConfiguredLocalAudioDir(): string {
  const configuredDir = process.env.LOCAL_AUDIO_STORAGE_DIR?.trim();
  return configuredDir ? path.resolve(configuredDir) : DEFAULT_LOCAL_AUDIO_DIR;
}

export interface LocalAudioMetadataEntry {
  videoId: string;
  audioUrl?: string;
  title?: string;
  duration?: number;
  fileSize?: number;
  createdAt?: string;
  filePath?: string;
  filename?: string;
  mimeType?: string;
}

export interface LocalAudioFileData {
  videoId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  audioUrl: string;
  streamUrl?: string;
  title?: string;
  duration?: number;
  createdAt?: string;
  sourceDir: string;
  mimeType?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAllowedAudioExtension(filename: string): boolean {
  return AUDIO_EXTENSIONS.some((extension) => filename.endsWith(extension));
}

// Relative on purpose: the browser resolves them against whatever host served the page.
export function buildLocalAudioServeUrl(filename: string): string {
  return buildLocalAudioServePath(filename);
}

export function buildAudioStreamUrl(videoId: string): string {
  return buildAudioStreamPath(videoId);
}

function inferAudioMimeType(filename: string): string | undefined {
  return AUDIO_MIME_TYPES[path.extname(filename).toLowerCase() as (typeof AUDIO_EXTENSIONS)[number]];
}

export function getLocalAudioSearchDirs(): string[] {
  return [getConfiguredLocalAudioDir(), PROJECT_TEMP_AUDIO_DIR, LEGACY_LOCAL_AUDIO_DIR];
}

export async function ensureLocalAudioWriteDir(): Promise<string> {
  const directory = getConfiguredLocalAudioDir();
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function ensureLocalAudioTempDir(): Promise<string> {
  await fs.mkdir(PROJECT_TEMP_AUDIO_DIR, { recursive: true });
  return PROJECT_TEMP_AUDIO_DIR;
}

export function sanitizeLocalAudioVideoId(videoId: string): string {
  const sanitized = videoId.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!sanitized) {
    throw new Error('Invalid video ID');
  }
  return sanitized;
}

export function sanitizeLocalAudioFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(extension as (typeof AUDIO_EXTENSIONS)[number])) {
    throw new Error('Unsupported audio file type');
  }

  const basename = path.basename(filename, extension)
    .replace(/[^a-zA-Z0-9._[\]-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);

  return `${basename || 'audio'}${extension}`;
}

export async function saveLocalAudioFile(
  videoId: string,
  data: Uint8Array,
  options: {
    filename?: string;
    title?: string;
    duration?: number;
    contentType?: string;
  } = {}
): Promise<LocalAudioFileData> {
  const safeVideoId = sanitizeLocalAudioVideoId(videoId);
  const { findAudioMetadataByVideoId } = await import('@/server/persistence/audioRepository');
  const previous = findAudioMetadataByVideoId(safeVideoId);
  const requestedExtension = path.extname(options.filename || '').toLowerCase();
  const extension = AUDIO_EXTENSIONS.includes(requestedExtension as (typeof AUDIO_EXTENSIONS)[number])
    ? requestedExtension
    : options.contentType === 'audio/wav'
      ? '.wav'
      : options.contentType === 'audio/mp4' || options.contentType === 'audio/x-m4a'
        ? '.m4a'
        : options.contentType === 'audio/opus'
          ? '.opus'
          : options.contentType === 'audio/webm'
            ? '.webm'
            : '.mp3';
  const filename = sanitizeLocalAudioFilename(`audio_[${safeVideoId}]_${Date.now()}${extension}`);
  const directory = await ensureLocalAudioWriteDir();
  const filePath = path.join(directory, filename);
  const temporaryPath = path.join(directory, `.${filename}.${process.pid}.tmp`);

  await fs.writeFile(temporaryPath, data, { flag: 'wx' });
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  const result: LocalAudioFileData = {
    videoId: safeVideoId,
    filename,
    filePath,
    fileSize: data.byteLength,
    audioUrl: buildLocalAudioServeUrl(filename),
    streamUrl: buildAudioStreamUrl(safeVideoId),
    title: options.title,
    duration: options.duration,
    createdAt: new Date().toISOString(),
    sourceDir: directory,
    mimeType: options.contentType || inferAudioMimeType(filename),
  };

  try {
    await saveLocalAudioMetadata({ ...result, filename });
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined);
    throw error;
  }

  // Replacing a cached video should not leave quota-invisible files behind.
  // Keep the old file only while a queued/running job still references it.
  if (previous && previous.filename !== filename) {
    await fs.unlink(path.join(directory, path.basename(previous.filename))).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to remove superseded audio file ${previous.filename}:`, error);
      }
    });
  }
  return result;
}

export async function deleteLocalAudioFile(storagePath: string): Promise<boolean> {
  const filename = path.basename(storagePath);
  if (!filename || filename !== storagePath.replace(/^audio[\\/]/, '') || !hasAllowedAudioExtension(filename)) {
    return false;
  }

  const localAudio = await findLocalAudioFileByFilename(filename);
  if (!localAudio) {
    return false;
  }

  const configuredDir = path.resolve(getConfiguredLocalAudioDir());
  if (path.resolve(localAudio.sourceDir) !== configuredDir) {
    return false;
  }

  await fs.unlink(localAudio.filePath);
  const { removeAudioMetadata } = await import('@/server/persistence/audioRepository');
  removeAudioMetadata(filename);
  return true;
}

export function matchesLocalAudioVideoId(filename: string, videoId: string): boolean {
  if (!hasAllowedAudioExtension(filename)) {
    return false;
  }

  const basename = path.basename(filename, path.extname(filename));
  if (basename === videoId || basename.startsWith(`${videoId}_`) || basename.startsWith(`${videoId}-`)) {
    return true;
  }

  return new RegExp(`\\[${escapeRegExp(videoId)}\\]`).test(filename);
}

function inferTitleFromFilename(filename: string, videoId: string): string {
  const basename = path.basename(filename, path.extname(filename));
  const withoutVideoId = basename
    .replace(new RegExp(`-?\\[${escapeRegExp(videoId)}\\]$`), '')
    .trim();

  if (!withoutVideoId || withoutVideoId === videoId) {
    return `YouTube Video ${videoId}`;
  }

  return withoutVideoId.replace(/_/g, ' ').trim();
}

async function readLocalAudioMetadataEntries(): Promise<LocalAudioMetadataEntry[]> {
  const { listAudioMetadata } = await import('@/server/persistence/audioRepository');
  return listAudioMetadata().map((entry) => ({
    videoId: entry.videoId,
    filename: entry.filename,
    fileSize: entry.fileSize,
    title: entry.title,
    duration: entry.duration,
    createdAt: new Date(entry.createdAtMs).toISOString(),
  }));
}

function normalizeLocalAudioFileData(
  videoId: string,
  filename: string,
  filePath: string,
  fileSize: number,
  sourceDir: string,
  metadata?: LocalAudioMetadataEntry
): LocalAudioFileData {
  return {
    videoId,
    filename,
    filePath,
    fileSize,
    audioUrl: buildLocalAudioServeUrl(filename),
    streamUrl: videoId ? buildAudioStreamUrl(videoId) : undefined,
    title: metadata?.title || inferTitleFromFilename(filename, videoId),
    duration: metadata?.duration,
    createdAt: metadata?.createdAt,
    sourceDir,
    mimeType: metadata?.mimeType || inferAudioMimeType(filename),
  };
}

export async function findLocalAudioFileByFilename(filename: string): Promise<LocalAudioFileData | null> {
  const safeFilename = path.basename(filename);
  if (!safeFilename || safeFilename !== filename || !hasAllowedAudioExtension(safeFilename)) {
    return null;
  }

  for (const directory of getLocalAudioSearchDirs()) {
    const filePath = path.join(directory, safeFilename);

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        continue;
      }

      const { findAudioMetadataByFilename, touchAudioMetadata } = await import('@/server/persistence/audioRepository');
      const metadata = findAudioMetadataByFilename(safeFilename);
      touchAudioMetadata(safeFilename);
      return {
        videoId: metadata?.videoId ?? '',
        filename: safeFilename,
        filePath,
        fileSize: stats.size,
        audioUrl: buildLocalAudioServeUrl(safeFilename),
        streamUrl: metadata?.videoId ? buildAudioStreamUrl(metadata.videoId) : undefined,
        title: metadata?.title,
        duration: metadata?.duration,
        createdAt: metadata ? new Date(metadata.createdAtMs).toISOString() : undefined,
        sourceDir: directory,
        mimeType: metadata?.mimeType || inferAudioMimeType(safeFilename),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to inspect local audio file ${filePath}:`, error);
      }
    }
  }

  return null;
}

export async function findExistingLocalAudioFile(videoId: string): Promise<LocalAudioFileData | null> {
  const { findAudioMetadataByVideoId } = await import('@/server/persistence/audioRepository');
  const indexed = findAudioMetadataByVideoId(videoId);
  if (indexed) {
    const indexedFile = await findLocalAudioFileByFilename(indexed.filename);
    if (indexedFile) return { ...indexedFile, videoId };
  }

  const metadataEntries = await readLocalAudioMetadataEntries();
  const metadataByVideoId = new Map(
    metadataEntries
      .filter((entry) => entry.videoId)
      .map((entry) => [entry.videoId, entry])
  );

  const matches: Array<LocalAudioFileData & { modifiedAt: number }> = [];

  for (const directory of getLocalAudioSearchDirs()) {
    try {
      const files = await fs.readdir(directory);

      for (const filename of files) {
        if (!matchesLocalAudioVideoId(filename, videoId)) {
          continue;
        }

        const filePath = path.join(directory, filename);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          continue;
        }

        matches.push({
          ...normalizeLocalAudioFileData(
            videoId,
            filename,
            filePath,
            stats.size,
            directory,
            metadataByVideoId.get(videoId)
          ),
          modifiedAt: stats.mtimeMs,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to scan local audio directory ${directory}:`, error);
      }
    }
  }

  matches.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return matches[0] ?? null;
}

export async function findExistingLocalAudioFiles(videoIds: string[]): Promise<Map<string, LocalAudioFileData>> {
  const results = new Map<string, LocalAudioFileData>();

  for (const videoId of videoIds) {
    const match = await findExistingLocalAudioFile(videoId);
    if (match) {
      results.set(videoId, match);
    }
  }

  return results;
}

export async function saveLocalAudioMetadata(entry: LocalAudioMetadataEntry): Promise<void> {
  if (!entry.videoId) {
    return;
  }

  const resolvedFilename = entry.filename || (entry.filePath ? path.basename(entry.filePath) : undefined);
  if (!resolvedFilename) return;
  const file = await findLocalAudioFileByFilename(resolvedFilename);
  const { upsertAudioMetadata } = await import('@/server/persistence/audioRepository');
  upsertAudioMetadata({
    videoId: entry.videoId,
    filename: resolvedFilename,
    fileSize: entry.fileSize ?? file?.fileSize ?? 0,
    title: entry.title,
    duration: entry.duration,
    mimeType: entry.mimeType || inferAudioMimeType(resolvedFilename),
    createdAtMs: entry.createdAt && Number.isFinite(Date.parse(entry.createdAt)) ? Date.parse(entry.createdAt) : undefined,
  });
}

export async function enforceLocalAudioQuota(): Promise<{ deletedFiles: number; freedBytes: number }> {
  const quotaGb = Number(process.env.LOCAL_AUDIO_QUOTA_GB || 20);
  const quotaBytes = Math.max(1, (Number.isFinite(quotaGb) ? quotaGb : 20) * 1024 ** 3);
  const { claimAudioForEviction, getAudioUsageBytes, releaseAudioEviction, removeAudioMetadata } = await import('@/server/persistence/audioRepository');
  const usage = getAudioUsageBytes();
  if (usage <= quotaBytes) return { deletedFiles: 0, freedBytes: 0 };
  const targets = claimAudioForEviction(usage - Math.floor(quotaBytes * 0.9));
  let deletedFiles = 0;
  let freedBytes = 0;
  for (const target of targets) {
    try {
      await fs.unlink(path.join(getConfiguredLocalAudioDir(), target.filename));
      removeAudioMetadata(target.filename);
      deletedFiles += 1;
      freedBytes += target.fileSize;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        removeAudioMetadata(target.filename);
      } else {
        releaseAudioEviction(target.filename);
      }
    }
  }
  return { deletedFiles, freedBytes };
}

export async function cleanupTempAudioFile(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const resolvedPath = path.resolve(filePath);
    const tempDir = path.resolve(PROJECT_TEMP_AUDIO_DIR);
    const legacyTempDir = path.resolve(LEGACY_LOCAL_AUDIO_DIR);
    const isInsideTemp =
      resolvedPath.startsWith(tempDir + path.sep) ||
      resolvedPath.startsWith(legacyTempDir + path.sep);

    if (!isInsideTemp) {
      console.warn(`Refusing to delete non-temp audio file: ${resolvedPath}`);
      return false;
    }

    await fs.unlink(resolvedPath);
    console.log(`🧹 Cleaned up temporary audio file: ${resolvedPath}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to clean up temporary audio file ${filePath}:`, error);
    }
    return false;
  }
}

export async function cleanupOrphanTempAudioFiles(
  maxAgeMs: number = 30 * 60 * 1000
): Promise<{ deletedFiles: number; freedBytes: number }> {
  let deletedFiles = 0;
  let freedBytes = 0;
  const now = Date.now();

  for (const directory of [PROJECT_TEMP_AUDIO_DIR, LEGACY_LOCAL_AUDIO_DIR]) {
    try {
      const files = await fs.readdir(directory);
      for (const filename of files) {
        if (!hasAllowedAudioExtension(filename)) continue;
        const filePath = path.join(directory, filename);
        try {
          const stats = await fs.stat(filePath);
          const isStale = now - stats.mtimeMs > maxAgeMs;
          const videoId = inferVideoIdFromFilename(filename);

          let alreadyPersisted = false;
          if (videoId) {
            const { findAudioMetadataByVideoId } = await import('@/server/persistence/audioRepository');
            alreadyPersisted = Boolean(findAudioMetadataByVideoId(videoId));
          }

          if (isStale || alreadyPersisted) {
            await fs.unlink(filePath);
            deletedFiles += 1;
            freedBytes += stats.size;
            console.log(`🧹 Evicted duplicate/stale temp audio: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
          }
        } catch {
          // File may have been unlinked concurrently
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  return { deletedFiles, freedBytes };
}

function inferVideoIdFromFilename(filename: string): string | null {
  const bracketed = /\[([A-Za-z0-9_-]{6,128})\]/.exec(filename)?.[1];
  if (bracketed) return bracketed;
  const basename = path.basename(filename, path.extname(filename));
  return /^[A-Za-z0-9_-]{11}$/.test(basename) ? basename : null;
}

/**
 * One-time compatibility bridge for audio created by the previous local-audio
 * implementation. Metadata is copied into SQLite and files outside the durable
 * audio directory are copied there atomically. The operation is idempotent.
 */
export async function bootstrapLocalAudioMetadata(): Promise<number> {
  const directory = await ensureLocalAudioWriteDir();
  const legacyMetadataPath = path.join(directory, 'cache-metadata.json');
  let legacyEntries: LocalAudioMetadataEntry[] = [];

  try {
    const parsed = JSON.parse(await fs.readFile(legacyMetadataPath, 'utf8'));
    if (Array.isArray(parsed)) legacyEntries = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to read legacy local-audio metadata:', error);
    }
  }

  let indexed = 0;
  let importedLegacyEntries = 0;
  for (const entry of legacyEntries) {
    try {
      if (!entry.videoId || !entry.filename) throw new Error('Missing videoId or filename');
      const safeFilename = sanitizeLocalAudioFilename(entry.filename);
      let sourcePath = entry.filePath ? path.resolve(entry.filePath) : path.join(directory, safeFilename);
      const allowedSource = getLocalAudioSearchDirs().some((candidate) => {
        const relative = path.relative(path.resolve(candidate), sourcePath);
        return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
      }) || sourcePath === path.join(directory, safeFilename);
      if (!allowedSource) throw new Error('Audio path is outside approved local directories');

      const destination = path.join(directory, safeFilename);
      if (path.resolve(sourcePath) !== path.resolve(destination)) {
        try {
          await fs.access(destination);
        } catch {
          const temporary = path.join(directory, `.${safeFilename}.${process.pid}.bootstrap`);
          await fs.copyFile(sourcePath, temporary);
          await fs.rename(temporary, destination).catch(async (error) => {
            await fs.unlink(temporary).catch(() => undefined);
            throw error;
          });
        }
        sourcePath = destination;
      }
      const stats = await fs.stat(sourcePath);
      await saveLocalAudioMetadata({ ...entry, filename: safeFilename, filePath: sourcePath, fileSize: stats.size });
      indexed += 1;
      importedLegacyEntries += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to import local audio metadata for ${entry.videoId}:`, error);
      }
    }
  }

  for (const filename of await fs.readdir(directory)) {
    if (!hasAllowedAudioExtension(filename)) continue;
    const videoId = inferVideoIdFromFilename(filename);
    if (!videoId) continue;
    const { findAudioMetadataByFilename } = await import('@/server/persistence/audioRepository');
    if (findAudioMetadataByFilename(filename)) continue;
    const stats = await fs.stat(path.join(directory, filename));
    await saveLocalAudioMetadata({ videoId, filename, fileSize: stats.size, createdAt: stats.birthtime.toISOString() });
    indexed += 1;
  }

  // Remove the obsolete sidecar only after every entry is safely represented
  // in SQLite; otherwise retain it for a later retry/manual recovery.
  if (legacyEntries.length > 0 && importedLegacyEntries === legacyEntries.length) {
    await fs.unlink(legacyMetadataPath).catch(() => undefined);
  }
  return indexed;
}

const globalMaintenance = globalThis as typeof globalThis & { __localAudioMaintenanceStarted?: boolean };

export function startLocalAudioMaintenance(): void {
  if (globalMaintenance.__localAudioMaintenanceStarted) return;
  globalMaintenance.__localAudioMaintenanceStarted = true;
  const intervalMs = Math.max(60_000, Number(process.env.LOCAL_AUDIO_CLEANUP_INTERVAL_MS || 3_600_000));
  void enforceLocalAudioQuota();
  const timer = setInterval(() => void enforceLocalAudioQuota(), intervalMs);
  timer.unref?.();
}
