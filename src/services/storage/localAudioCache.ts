import 'server-only';
import { MemoryCache } from '@/services/cache/memoryCache';
import { findExistingAudioFile, findExistingAudioFiles } from './localAudioServerService';
import { saveLocalAudioMetadata } from './localAudioStorageService';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';

export interface SimplifiedAudioData {
  videoId: string; audioUrl: string; title: string; thumbnail?: string; channelTitle?: string;
  duration?: number; fileSize?: number; isStreamUrl: boolean; streamExpiresAt?: number; createdAt: number;
  extractionService?: string; extractionTimestamp?: number; videoDuration?: string; videoDescription?: string;
  videoPublishedAt?: string; videoViewCount?: number;
}

const memoryCache = new MemoryCache<SimplifiedAudioData>();

type SaveAudioMetadataInput = Omit<SimplifiedAudioData, 'createdAt' | 'isStreamUrl'> & { isStreamUrl?: boolean };

function normalize(data: SaveAudioMetadataInput): SimplifiedAudioData {
  return { ...data, thumbnail: normalizeThumbnailUrl(data.videoId, data.thumbnail, 'mqdefault'),
    duration: data.duration ?? 0, fileSize: data.fileSize ?? 0, isStreamUrl: data.isStreamUrl ?? false,
    extractionTimestamp: data.extractionTimestamp ?? Date.now(), createdAt: Date.now() };
}

function fromFile(videoId: string, file: { audioUrl: string; fileSize?: number }): SimplifiedAudioData {
  return normalize({ videoId, audioUrl: file.audioUrl, title: `YouTube Video ${videoId}`,
    thumbnail: normalizeThumbnailUrl(videoId, null, 'mqdefault'), fileSize: file.fileSize, extractionService: 'local-storage' });
}

class LocalAudioCache {
  async saveAudioMetadata(data: SaveAudioMetadataInput): Promise<boolean> {
    const normalized = normalize(data);
    memoryCache.set(`audio_${data.videoId}`, normalized, true);
    if (data.audioUrl.includes('/api/serve-local-audio')) {
      const filename = new URL(data.audioUrl, 'http://localhost').searchParams.get('filename');
      if (filename) {
        await saveLocalAudioMetadata({ videoId: data.videoId, filename, title: data.title,
          duration: data.duration, fileSize: data.fileSize });
      }
    }
    return true;
  }
  async saveAudioMetadataBackground(data: SaveAudioMetadataInput): Promise<void> { void this.saveAudioMetadata(data); }
  async getCachedAudioMetadata(videoId: string): Promise<SimplifiedAudioData | null> {
    return memoryCache.get(`audio_${videoId}`, async () => {
      const file = await findExistingAudioFile(videoId); return file ? fromFile(videoId, file) : null;
    }) as Promise<SimplifiedAudioData | null>;
  }
  async isAudioCached(videoId: string) { return Boolean(await this.getCachedAudioMetadata(videoId)); }
  async getMultipleCachedAudio(videoIds: string[]): Promise<Map<string, SimplifiedAudioData>> {
    const files = await findExistingAudioFiles(videoIds); const result = new Map<string, SimplifiedAudioData>();
    files.forEach((file, id) => result.set(id, fromFile(id, file))); return result;
  }
  async updateAudioMetadata(videoId: string, updates: Partial<SimplifiedAudioData>) {
    const current = memoryCache.peek(`audio_${videoId}`); if (!current) return false;
    memoryCache.set(`audio_${videoId}`, { ...current, ...updates, videoId }, true); return true;
  }
  async deleteCachedAudio(videoId: string) { memoryCache.invalidate(`audio_${videoId}`); return true; }
  async getCacheStats() { const stats = memoryCache.getStats(); return { totalCached: stats.totalEntries, validCached: stats.totalEntries - stats.incompleteEntries, expiredCached: stats.incompleteEntries }; }
}

export const localAudioCache = new LocalAudioCache();
