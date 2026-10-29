/**
 * Audio Extraction Service - Environment-Aware Integration
 *
 * This service provides environment-aware audio extraction:
 * 1. Uses browser-side yt-dlp for production extraction after server cache checks
 * 2. Uses local yt-dlp for localhost/development
 * 3. Keeps yt-mp3-go available only through explicit rollback configuration
 * 4. Uses video ID-based caching and storage with existing search metadata
 */



import { ytMp3GoService } from '@/services/youtube/ytMp3GoService';
import { localAudioCache, SimplifiedAudioData } from '@/services/storage/localAudioCache';
import { detectEnvironment } from '@/utils/environmentDetection';
import { ytDlpService } from '@/services/youtube/ytDlpService';
import { validateUrlAccessibility } from '@/utils/urlValidationUtils';
import { toInternalAudioUrl } from '@/config/serverBackend';
import { isLocalAudioUrl } from '@/utils/localAudioUrl';

/**
 * Validate a persistent local audio URL before returning it
 * @param storageUrl The local storage URL to validate
 * @param originalUrl The original URL to fall back to if validation fails
 * @param videoId Video ID for logging
 * @returns Object with validated URL and storage status
 */
async function validateAndReturnUrl(
  storageUrl: string,
  originalUrl: string,
  videoId: string
): Promise<{ url: string; isStorageUrl: boolean }> {
  console.log(`ðŸ” Validating local storage URL accessibility for ${videoId}...`);

  // Storage URLs are relative; probe them through the internal frontend origin.
  const validation = await validateUrlAccessibility(toInternalAudioUrl(storageUrl), 15000, 3);

  if (validation.isAccessible) {
    console.log(`âœ… local storage URL validated and accessible for ${videoId}`);
    return { url: storageUrl, isStorageUrl: true };
  } else {
    console.log(`âš ï¸ local storage URL not accessible for ${videoId}: ${validation.error}`);
    console.log(`ðŸ”„ Falling back to original URL: ${originalUrl}`);
    return { url: originalUrl, isStorageUrl: false };
  }
}

export interface AudioExtractionResult {
  success: boolean;
  audioUrl?: string;
  title?: string;
  duration?: number;
  fromCache?: boolean;
  isStreamUrl?: boolean;
  streamExpiresAt?: number;
  error?: string;
}

export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: string;
  url?: string;
}

export class AudioExtractionServiceSimplified {
  private static instance: AudioExtractionServiceSimplified;

  public static getInstance(): AudioExtractionServiceSimplified {
    if (!AudioExtractionServiceSimplified.instance) {
      AudioExtractionServiceSimplified.instance = new AudioExtractionServiceSimplified();
    }
    return AudioExtractionServiceSimplified.instance;
  }



  /**
   * Extract audio using environment-aware strategy
   */
  async extractAudio(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const env = detectEnvironment();

    // Environment detection logging removed for production

    // Route to appropriate service based on environment strategy
    switch (env.strategy) {
      case 'yt-mp3-go':
        // Explicit rollback path for configured yt-mp3-go deployments.
        return await this.extractAudioWithYtMp3Go(videoMetadata, forceRedownload);

      case 'ytdlp':
        // Allow yt-dlp in production when explicitly configured
        if (env.isDevelopment || process.env.NEXT_PUBLIC_AUDIO_STRATEGY === 'ytdlp') {
          return await this.extractAudioWithYtDlp(videoMetadata, forceRedownload);
        } else {
          return {
            success: false,
            error: 'yt-dlp is only available in development environment or when NEXT_PUBLIC_AUDIO_STRATEGY=ytdlp'
          };
        }

      case 'browser-ytdlp':
        return {
          success: false,
          error: 'Browser yt-dlp extraction must be performed by the client after the cache check.'
        };

      default:
        // Fallback to yt-mp3-go for unknown strategies
        console.log(`âš ï¸ Unknown strategy ${env.strategy}, falling back to yt-mp3-go`);
        return await this.extractAudioWithYtMp3Go(videoMetadata, forceRedownload);
    }
  }





  /**
   * Extract audio using yt-dlp (development only)
   */
  private async extractAudioWithYtDlp(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const videoId = videoMetadata.id;

    try {
      // Step 1: Check local storage first for permanent audio files (unless forced redownload)
      if (!forceRedownload) {
// local storage check logging removed for production
        try {
          const { findExistingAudioFile } = await import('@/services/storage/localAudioServerService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`âœ… Found existing audio in local storage for ${videoId}`);
            console.log(`ðŸ“ˆ local storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // PERFORMANCE P1-C: Non-blocking background save eliminates redundant getCachedAudioMetadata() read
            localAudioCache.saveAudioMetadataBackground({
              videoId,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              thumbnail: videoMetadata.thumbnail,
              channelTitle: videoMetadata.channelTitle,
              duration: this.parseDuration(videoMetadata.duration),
              fileSize: existingFile.fileSize || 0,
              extractionService: 'local-storage-cache',
              extractionTimestamp: Date.now(),
              videoDuration: videoMetadata.duration
            });

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // local storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn('âš ï¸ local storage check failed during audio extraction', { videoId, storageError });
        }

        // Step 2: Check simplified SQLite cache as fallback
        const cached = await localAudioCache.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`âœ… Using cached audio metadata for ${videoId}: "${cached.title}"`);
          console.log(`ðŸ“ˆ SQLite Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }



      // Step 2: Use yt-dlp to download audio
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const downloadResult = await ytDlpService.downloadAudio(videoUrl, videoId);

      if (!downloadResult.success || !downloadResult.audioUrl) {
        console.error('âŒ yt-dlp download failed', { videoId, error: downloadResult.error });

        // In development, provide additional debugging information
        if (process.env.NODE_ENV === 'development') {
          console.log(`ðŸ”§ Debug: You can use the debug API to troubleshoot this issue:`);
          console.log(`   POST /api/debug/ytdlp`);
          console.log(`   Body: { "action": "troubleshoot", "videoUrl": "${videoUrl}" }`);
        }

        throw new Error(downloadResult.error || 'yt-dlp download failed');
      }

      console.log(`âœ… yt-dlp download successful:`, {
        filename: downloadResult.filename,
        fileSize: downloadResult.fileSize ? `${(downloadResult.fileSize / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
        localPath: downloadResult.localPath,
        audioUrl: downloadResult.audioUrl
      });

      // Step 3: Attempt to upload to local storage for permanent access
      let finalAudioUrl = downloadResult.audioUrl;
      let isStorageUrl = false;
      let actualFileSize = 0;
      const finalDuration = downloadResult.duration || 0;

      try {
        // DOCKER FIX: Use localPath directly instead of fetching URL
        // In Docker, fetching localhost URLs from within the container doesn't work reliably
        if (downloadResult.localPath) {
          // For local yt-dlp files, read the file directly from filesystem
          console.log(`ðŸ“¥ Reading local audio file from filesystem for local storage upload: ${downloadResult.localPath}`);

          // Import fs/promises for server-side file reading
          const fs = await import('fs/promises');
          const audioBuffer = await fs.readFile(downloadResult.localPath);
          // Convert Buffer to ArrayBuffer for local persistence upload
          const audioData: ArrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
          actualFileSize = audioData.byteLength;

          console.log(`ðŸ“¥ Read ${(actualFileSize / 1024 / 1024).toFixed(2)}MB local file for storage`);

          // Upload to local storage with monitoring
          const uploadStartTime = Date.now();
          const { uploadAudioFile, saveAudioFileMetadata } = await import('@/services/storage/localAudioServerService');
          const uploadResult = await uploadAudioFile(videoId, audioData);

          if (uploadResult) {
            const uploadTime = Date.now() - uploadStartTime;

            // Validate local storage URL accessibility before using it
            const { url: validatedUrl, isStorageUrl: validatedIsStorageUrl } = await validateAndReturnUrl(
              uploadResult.audioUrl,
              downloadResult.audioUrl, // Fall back to original URL
              videoId
            );

            finalAudioUrl = validatedUrl;
            isStorageUrl = validatedIsStorageUrl;

            console.log(`âœ… Audio stored in local storage in ${uploadTime}ms: ${uploadResult.audioUrl}`);
            console.log(`ðŸ“Š Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);
            console.log(`ðŸ” Using ${isStorageUrl ? 'validated local storage' : 'fallback original'} URL: ${finalAudioUrl}`);

            // Save detailed metadata to SQLite
            await saveAudioFileMetadata({
              videoId,
              audioUrl: finalAudioUrl,
              title: videoMetadata.title,
              storagePath: uploadResult.storagePath,
              fileSize: actualFileSize,
              duration: finalDuration,
              isStreamUrl: false,
              streamExpiresAt: undefined
            });

            console.log(`ðŸ“ˆ local storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
          }
        } else if (downloadResult.audioUrl && (downloadResult.audioUrl.startsWith('http://localhost:') || isLocalAudioUrl(downloadResult.audioUrl))) {
          // FALLBACK: Try fetching URL if localPath is not available (backward compatibility)
          console.log(`ðŸ“¥ Reading local audio file via URL for local storage upload: ${downloadResult.audioUrl}`);

          const audioResponse = await fetch(toInternalAudioUrl(downloadResult.audioUrl));
          if (audioResponse.ok) {
            const audioData = await audioResponse.arrayBuffer();
            actualFileSize = audioData.byteLength;

            console.log(`ðŸ“¥ Read ${(actualFileSize / 1024 / 1024).toFixed(2)}MB local file for storage`);

            // Upload to local storage with monitoring
            const uploadStartTime = Date.now();
            const { uploadAudioFile, saveAudioFileMetadata } = await import('@/services/storage/localAudioServerService');
            const uploadResult = await uploadAudioFile(videoId, audioData);

            if (uploadResult) {
              const uploadTime = Date.now() - uploadStartTime;

              // Validate local storage URL accessibility before using it
              const { url: validatedUrl, isStorageUrl: validatedIsStorageUrl } = await validateAndReturnUrl(
                uploadResult.audioUrl,
                downloadResult.audioUrl, // Fall back to original URL
                videoId
              );

              finalAudioUrl = validatedUrl;
              isStorageUrl = validatedIsStorageUrl;

              console.log(`âœ… Audio stored in local storage in ${uploadTime}ms: ${uploadResult.audioUrl}`);
              console.log(`ðŸ“Š Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);
              console.log(`ðŸ” Using ${isStorageUrl ? 'validated local storage' : 'fallback original'} URL: ${finalAudioUrl}`);

              // Save detailed metadata to SQLite
              await saveAudioFileMetadata({
                videoId,
                audioUrl: finalAudioUrl,
                title: videoMetadata.title,
                storagePath: uploadResult.storagePath,
                fileSize: actualFileSize,
                duration: finalDuration,
                isStreamUrl: false,
                streamExpiresAt: undefined
              });

              console.log(`ðŸ“ˆ local storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
            }
          }
        }
      } catch (storageError) {
        console.warn(`âš ï¸ local storage upload failed for yt-dlp file, using local URL fallback: ${storageError}`);
        console.log(`ðŸ“ˆ local storage Failure: videoId=${videoId}, error=${storageError instanceof Error ? storageError.message : 'Unknown'}`);
      }

      // Clean up temporary yt-dlp download file once permanently stored in durable local storage
      if (isStorageUrl && downloadResult.localPath) {
        const { cleanupTempAudioFile } = await import('@/services/storage/localAudioStorageService');
        await cleanupTempAudioFile(downloadResult.localPath);
      }

      // Step 4: Save to cache with final URL (storage or local) - only if not already saved to full metadata
      if (!isStorageUrl) {
        // Only save to simplified cache if local storage upload failed
        const saved = await localAudioCache.saveAudioMetadata({
          videoId,
          audioUrl: finalAudioUrl,
          title: videoMetadata.title,
          thumbnail: videoMetadata.thumbnail,
          channelTitle: videoMetadata.channelTitle,
          duration: finalDuration,
          fileSize: actualFileSize || 0,

          // Enhanced metadata from video search results
          extractionService: 'yt-dlp',
          extractionTimestamp: Date.now(),
          videoDuration: videoMetadata.duration
        });

        if (saved) {
          console.log(`ðŸ’¾ Cached yt-dlp result for ${videoId} (fallback)`);
          console.log(`ðŸ“ˆ Local URL Fallback: videoId=${videoId}, reason=storage_upload_failed`);
        }
      } else {
        console.log(`ðŸ’¾ Audio metadata already saved to local storage for ${videoId}`);
      }



      return {
        success: true,
        audioUrl: finalAudioUrl,
        title: videoMetadata.title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl
      };

    } catch (error) {
      console.error('âŒ yt-dlp extraction failed', { videoId, error });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'yt-dlp extraction failed'
      };
    }
  }

  /**
   * Download audio file from URL with redirect handling
   */
  private async downloadAudioFromUrl(audioUrl: string): Promise<ArrayBuffer> {
    const https = await import('https');
    const http = await import('http');
    const protocol = audioUrl.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Range': 'bytes=0-',
        }
      };

      const req = protocol.get(audioUrl, options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          this.downloadAudioFromUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        });

        res.on('error', (error: Error) => {
          reject(new Error(`Download error: ${error.message}`));
        });
      });

      req.on('error', (error: Error) => {
        reject(new Error(`Download request failed: ${error.message}`));
      });

      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Extract audio using yt-mp3-go (fallback service)
   */
  private async extractAudioWithYtMp3Go(
    videoMetadata: YouTubeVideoMetadata,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    const { id: videoId, title } = videoMetadata;

    console.log(`ðŸŽµ yt-mp3-go extraction: ${videoId} ("${title}")`);
    console.log(`ðŸ“Š Video metadata received:`, {
      title: videoMetadata.title,
      channelTitle: videoMetadata.channelTitle,
      thumbnail: videoMetadata.thumbnail,
      duration: videoMetadata.duration
    });

    try {
      // Step 1: Check local storage first for permanent audio files
      if (!forceRedownload) {
// local storage check logging removed for production
        try {
          const { findExistingAudioFile } = await import('@/services/storage/localAudioServerService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`âœ… Found existing audio in local storage for ${videoId}`);
            console.log(`ðŸ“ˆ local storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // PERFORMANCE P1-C: Non-blocking background save eliminates redundant getCachedAudioMetadata() read
            localAudioCache.saveAudioMetadataBackground({
              videoId,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fileSize: existingFile.fileSize || 0
            });

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: videoMetadata.title,
              duration: this.parseDuration(videoMetadata.duration),
              fromCache: true,
              isStreamUrl: false // local storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn('âš ï¸ local storage check failed, continuing with extraction:', storageError);
        }

        // Step 2: Check simplified SQLite cache as fallback
        const cached = await localAudioCache.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`âœ… Using cached audio metadata for ${videoId}`);
          console.log(`ðŸ“ˆ SQLite Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }

      // Step 3: Extract using yt-mp3-go service with automatic retry strategy
      const searchDuration = this.parseDuration(videoMetadata.duration);
      console.log('ðŸŽµ Using yt-mp3-go service for audio extraction with medium quality');
      let extractionResult = await ytMp3GoService.extractAudio(videoId, title, searchDuration, 'medium');

      // Automatic retry strategy for transient failures:
      // 1. Retry same quality once after a short delay (handles file-availability races)
      // 2. Then fall back to low quality (handles quality-specific failures)
      if (!extractionResult.success) {
        console.log(`âš ï¸ yt-mp3-go medium quality failed: ${extractionResult.error}`);

        // Retry 1: Same quality after a brief delay (handles transient file-availability issues)
        console.log('ðŸ”„ Retrying yt-mp3-go with medium quality after delay...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        extractionResult = await ytMp3GoService.extractAudio(videoId, title, searchDuration, 'medium');

        if (!extractionResult.success) {
          console.log(`âš ï¸ yt-mp3-go medium quality retry failed: ${extractionResult.error}`);

          // Retry 2: Try with low quality (sometimes quality-specific issues cause failures)
          console.log('ðŸ”„ Retrying yt-mp3-go with low quality...');
          extractionResult = await ytMp3GoService.extractAudio(videoId, title, searchDuration, 'low');

          if (!extractionResult.success) {
            console.log(`âš ï¸ yt-mp3-go low quality also failed: ${extractionResult.error}`);

            // All methods failed
            return {
              success: false,
              error: `All extraction methods failed. yt-mp3-go: ${extractionResult.error}`
            };
          } else {
            console.log('âœ… yt-mp3-go low quality succeeded');
          }
        } else {
          console.log('âœ… yt-mp3-go medium quality retry succeeded');
        }
      } else {
        console.log('âœ… yt-mp3-go medium quality succeeded');
      }

      // Step 4: Attempt to download and upload to local storage for permanent caching
      let finalAudioUrl = extractionResult.audioUrl!;
      let isStorageUrl = false;
      let actualFileSize = 0;
      const finalDuration = extractionResult.duration || this.parseDuration(videoMetadata.duration);

      console.log(`ðŸ“ yt-mp3-go provided external URL: ${finalAudioUrl}`);

      // Try to download and upload to local storage for permanent access
      try {
        console.log(`ðŸ“¥ Downloading yt-mp3-go audio file for local storage upload...`);
        const downloadStartTime = Date.now();

        const audioResponse = await fetch(finalAudioUrl);
        if (audioResponse.ok) {
          const audioData = await audioResponse.arrayBuffer();
          actualFileSize = audioData.byteLength;
          const downloadTime = Date.now() - downloadStartTime;

          console.log(`ðŸ“¥ Downloaded ${(actualFileSize / 1024 / 1024).toFixed(2)}MB from yt-mp3-go in ${downloadTime}ms`);

          // Upload to local storage with monitoring
          const uploadStartTime = Date.now();
          const { uploadAudioFile, saveAudioFileMetadata } = await import('@/services/storage/localAudioServerService');
          const uploadResult = await uploadAudioFile(videoId, audioData);

          if (uploadResult) {
            const uploadTime = Date.now() - uploadStartTime;
            finalAudioUrl = uploadResult.audioUrl;
            isStorageUrl = true;

            console.log(`âœ… yt-mp3-go audio stored in local storage in ${uploadTime}ms: ${finalAudioUrl}`);
            console.log(`ðŸ“Š Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);

            // Save detailed metadata to SQLite with enhanced video information
            console.log('ðŸ’¾ Saving local storage metadata', {
              videoId,
              title,
              channelTitle: videoMetadata.channelTitle,
              extractionService: 'yt-mp3-go',
              fileSize: actualFileSize
            });

            await saveAudioFileMetadata({
              videoId,
              audioUrl: finalAudioUrl,
              title,
              storagePath: uploadResult.storagePath,
              fileSize: actualFileSize,
              duration: finalDuration,
              isStreamUrl: false,
              streamExpiresAt: undefined,

              // Enhanced metadata from video search results
              channelTitle: videoMetadata.channelTitle,
              thumbnail: videoMetadata.thumbnail,
              extractionService: 'yt-mp3-go',
              extractionTimestamp: Date.now(),
              videoDuration: videoMetadata.duration
            });

            // Log storage success metrics
            console.log(`ðŸ“ˆ local storage Success: videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
          }
        }
      } catch (storageError) {
        console.warn('âš ï¸ local storage upload failed for yt-mp3-go, falling back to external URL caching:', storageError);
        // Continue with external URL caching as fallback
      }

      // Step 5: Cache the result in simplified SQLite (only if not already saved to local storage)
      if (!isStorageUrl) {
        // Only save to simplified cache if local storage upload failed
        try {
          await localAudioCache.saveAudioMetadata({
            videoId,
            audioUrl: finalAudioUrl,
            title,
            thumbnail: videoMetadata.thumbnail,
            channelTitle: videoMetadata.channelTitle,
            duration: finalDuration,
            fileSize: actualFileSize,
            isStreamUrl: !isStorageUrl,
            streamExpiresAt: isStorageUrl ? undefined : Date.now() + 24 * 60 * 60 * 1000, // 24 hours for stream URLs

            // Enhanced metadata from video search results
            extractionService: 'yt-mp3-go',
            extractionTimestamp: Date.now(),
            videoDuration: videoMetadata.duration
          });
          console.log(`ðŸ’¾ Cached yt-mp3-go external URL with enhanced metadata for ${videoId}`);
        } catch (cacheError) {
          console.warn('âš ï¸ Failed to cache yt-mp3-go result:', cacheError);
        }
      } else {
        console.log(`ðŸ’¾ Audio metadata already saved to local storage for ${videoId}`);
      }

      return {
        success: true,
        audioUrl: finalAudioUrl,
        title,
        duration: finalDuration,
        fromCache: false,
        isStreamUrl: !isStorageUrl,
        streamExpiresAt: isStorageUrl ? undefined : Date.now() + 24 * 60 * 60 * 1000
      };

    } catch (error) {
      console.error('âŒ yt-mp3-go extraction failed', { videoId, error });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown yt-mp3-go extraction error'
      };
    }
  }

  /**
   * Extract audio using just video ID (fallback when search metadata is not available)
   */
  async extractAudioById(
    videoId: string,
    forceRedownload: boolean = false
  ): Promise<AudioExtractionResult> {
    console.log(`ðŸŽµ Audio extraction by ID: ${videoId}`);

    try {
      // Step 1: Check local storage first for permanent audio files
      if (!forceRedownload) {
console.log(`ðŸ” Checking local storage for existing audio file: ${videoId}`);
        try {
          const { findExistingAudioFile } = await import('@/services/storage/localAudioServerService');
          const existingFile = await findExistingAudioFile(videoId);

          if (existingFile) {
            console.log(`âœ… Found existing audio in local storage for ${videoId}`);
            console.log(`ðŸ“ˆ local storage Cache Hit: videoId=${videoId}, source=permanent_storage`);

            // PERFORMANCE P1-C: Non-blocking background save eliminates redundant getCachedAudioMetadata() read
            localAudioCache.saveAudioMetadataBackground({
              videoId,
              audioUrl: existingFile.audioUrl,
              title: `YouTube Video ${videoId}`,
              duration: 0,
              fileSize: existingFile.fileSize || 0
            });

            return {
              success: true,
              audioUrl: existingFile.audioUrl,
              title: `YouTube Video ${videoId}`,
              duration: 0,
              fromCache: true,
              isStreamUrl: false // local storage URLs are permanent
            };
          }
        } catch (storageError) {
          console.warn(`âš ï¸ local storage check failed for ${videoId}:`, storageError);
        }

        // Step 2: Check simplified SQLite cache as fallback
        const cached = await localAudioCache.getCachedAudioMetadata(videoId);
        if (cached) {
          console.log(`âœ… Using cached audio metadata for ${videoId}`);
          console.log(`ðŸ“ˆ SQLite Cache Hit: videoId=${videoId}, source=metadata_cache`);
          return {
            success: true,
            audioUrl: cached.audioUrl,
            title: cached.title,
            duration: cached.duration,
            fromCache: true,
            isStreamUrl: cached.isStreamUrl,
            streamExpiresAt: cached.streamExpiresAt
          };
        }
      }

      // Step 2: Extract using appropriate service based on environment (no search metadata available)
      const env = detectEnvironment();
      let extractionResult;

      switch (env.strategy) {
        case 'ytdlp':
          // yt-dlp is not suitable for direct audio extraction by ID
          // It's designed for full video processing with search metadata
          return {
            success: false,
            error: 'yt-dlp requires full video metadata and is not suitable for ID-only extraction'
          };

        // PRESERVED FOR REFERENCE - yt-mp3-go integration
        // case 'ytmp3go':
        //   console.log('ðŸŽµ Using yt-mp3-go service for audio extraction (by ID) with medium quality');
        //   extractionResult = await ytMp3GoService.extractAudio(videoId, undefined, undefined, 'medium');
        //   break;

        default:
          // Fallback to yt-mp3-go for unknown strategies
          console.log(`âš ï¸ Unknown strategy ${env.strategy}, falling back to yt-mp3-go`);
          extractionResult = await ytMp3GoService.extractAudio(videoId, undefined, undefined, 'medium');
          break;
      }

      // Fallback to yt-mp3-go if primary service fails
      if (!extractionResult.success) {
        console.log(`âš ï¸ Primary service failed: ${extractionResult.error}`);
        console.log('ðŸ”„ Falling back to yt-mp3-go service...');

        try {
          const fallbackResult = await ytMp3GoService.extractAudio(videoId, undefined, undefined, 'medium');

          if (fallbackResult.success && fallbackResult.audioUrl) {
            console.log('âœ… yt-mp3-go fallback succeeded');

            // Download and upload to local storage for permanent caching
            let finalAudioUrl = fallbackResult.audioUrl;
            let isStorageUrl = false;
            let actualFileSize = 0;
            const finalDuration = fallbackResult.duration || 0;
            const title = fallbackResult.title || `YouTube Video ${videoId}`;

            console.log(`ðŸ“ yt-mp3-go fallback provided external URL: ${finalAudioUrl}`);

            // Try to download and upload to local storage for permanent access
            try {
              console.log(`ðŸ“¥ Downloading yt-mp3-go fallback audio file for local storage upload...`);
              const downloadStartTime = Date.now();

              const audioResponse = await fetch(finalAudioUrl);
              if (audioResponse.ok) {
                const audioData = await audioResponse.arrayBuffer();
                actualFileSize = audioData.byteLength;
                const downloadTime = Date.now() - downloadStartTime;

                console.log(`ðŸ“¥ Downloaded ${(actualFileSize / 1024 / 1024).toFixed(2)}MB from yt-mp3-go fallback in ${downloadTime}ms`);

                // Upload to local storage with monitoring
                const uploadStartTime = Date.now();
                const { uploadAudioFile, saveAudioFileMetadata } = await import('@/services/storage/localAudioServerService');
                const uploadResult = await uploadAudioFile(videoId, audioData);

                if (uploadResult) {
                  const uploadTime = Date.now() - uploadStartTime;
                  finalAudioUrl = uploadResult.audioUrl;
                  isStorageUrl = true;

                  console.log(`âœ… yt-mp3-go fallback audio stored in local storage in ${uploadTime}ms: ${finalAudioUrl}`);
                  console.log(`ðŸ“Š Storage metrics: ${(actualFileSize / 1024 / 1024).toFixed(2)}MB uploaded`);

                  // Save detailed metadata to SQLite with enhanced video information
                  await saveAudioFileMetadata({
                    videoId,
                    audioUrl: finalAudioUrl,
                    title,
                    storagePath: uploadResult.storagePath,
                    fileSize: actualFileSize,
                    duration: finalDuration,
                    isStreamUrl: false,
                    streamExpiresAt: undefined,

                    // Enhanced metadata
                    channelTitle: 'Unknown Channel',
                    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                    extractionService: 'yt-mp3-go-fallback',
                    extractionTimestamp: Date.now(),
                    videoDuration: '0:00'
                  });

                  console.log(`ðŸ“ˆ local storage Success (fallback): videoId=${videoId}, size=${(actualFileSize / 1024 / 1024).toFixed(2)}MB, uploadTime=${uploadTime}ms`);
                }
              }
            } catch (storageError) {
              console.warn(`âš ï¸ local storage upload failed for yt-mp3-go fallback, using external URL: ${storageError}`);
              console.log(`ðŸ“ˆ local storage Failure (fallback): videoId=${videoId}, error=${storageError instanceof Error ? storageError.message : 'Unknown'}`);
            }

            // Save metadata to simplified cache (only if local storage upload failed) - NON-BLOCKING
            if (!isStorageUrl) {
              localAudioCache.saveAudioMetadataBackground({
                videoId,
                audioUrl: finalAudioUrl,
                title,
                thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                channelTitle: 'Unknown Channel',
                duration: finalDuration,
                fileSize: actualFileSize,
                extractionService: 'yt-mp3-go-fallback',
                extractionTimestamp: Date.now(),
                isStreamUrl: true // External URLs are temporary
              });
            }

            console.log(`âœ… yt-mp3-go fallback extraction completed for ${videoId}`);

            return {
              success: true,
              audioUrl: finalAudioUrl,
              title,
              duration: finalDuration,
              fromCache: false,
              isStreamUrl: !isStorageUrl // local storage URLs are permanent
            };
          } else {
            console.log(`âŒ yt-mp3-go fallback also failed: ${fallbackResult.error}`);
          }
        } catch (fallbackError) {
          console.error(`âŒ yt-mp3-go fallback error:`, fallbackError);
        }

        // Both services failed
        return {
          success: false,
          error: `Both primary service and yt-mp3-go failed. Primary: ${extractionResult.error}`
        };
      }

      // Step 3: Return the extraction result directly (downr.org handles everything)
      if (extractionResult.success && extractionResult.audioUrl) {
        return extractionResult;
      } else {
        return {
          success: false,
          error: extractionResult.error || 'Audio extraction failed'
        };
      }

    } catch (error) {
      console.error(`âŒ Audio extraction failed for ${videoId}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  /**
   * Check if audio is available in cache
   */
  async isAudioCached(videoId: string): Promise<boolean> {
    return await localAudioCache.isAudioCached(videoId);
  }

  /**
   * Get cached audio metadata
   */
  async getCachedAudio(videoId: string): Promise<SimplifiedAudioData | null> {
    return await localAudioCache.getCachedAudioMetadata(videoId);
  }

  /**
   * Batch check for cached audio with local storage priority
   */
  async getBatchCachedAudio(videoIds: string[]): Promise<Map<string, SimplifiedAudioData>> {
    console.log(`ðŸ” Batch checking audio cache for ${videoIds.length} videos`);

    // First, check local storage for permanent files
    try {
      const { findExistingAudioFiles } = await import('@/services/storage/localAudioServerService');
      const storageResults = await findExistingAudioFiles(videoIds);

      if (storageResults.size > 0) {
        console.log(`âœ… Found ${storageResults.size} videos in local storage`);
        console.log(`ðŸ“ˆ local storage Batch Hit: found=${storageResults.size}/${videoIds.length}`);

        // Convert local storage results to SimplifiedAudioData format
        const results = new Map<string, SimplifiedAudioData>();

        for (const [videoId, storageData] of storageResults.entries()) {
          const audioData: SimplifiedAudioData = {
            videoId,
            audioUrl: storageData.audioUrl,
            title: `YouTube Video ${videoId}`, // Will be updated with actual title if available
            duration: 0, // Duration will be detected later
            fileSize: storageData.fileSize || 0,
            isStreamUrl: false, // local storage URLs are permanent
            createdAt: Date.now()
          };

          results.set(videoId, audioData);

          // Save to simplified cache for faster future access
          await localAudioCache.saveAudioMetadata({
            videoId,
            audioUrl: storageData.audioUrl,
            title: `YouTube Video ${videoId}`,
            duration: 0,
            fileSize: storageData.fileSize || 0
          });
        }

        // For videos not found in local storage, check SQLite cache
        const remainingVideoIds = videoIds.filter(id => !storageResults.has(id));
        if (remainingVideoIds.length > 0) {
          console.log(`ðŸ” Checking SQLite cache for remaining ${remainingVideoIds.length} videos`);
          const cacheResults = await localAudioCache.getMultipleCachedAudio(remainingVideoIds);

          // Merge results
          for (const [videoId, data] of cacheResults.entries()) {
            results.set(videoId, data);
          }

          console.log(`ðŸ“ˆ SQLite Cache Hit: found=${cacheResults.size}/${remainingVideoIds.length}`);
        }

        console.log(`âœ… Total batch cache results: ${results.size}/${videoIds.length} videos found`);
        return results;
      }
    } catch (storageError) {
      console.warn('âš ï¸ local storage batch check failed, falling back to SQLite:', storageError);
    }

    // Fallback to SQLite-only check
    console.log(`ðŸ” Falling back to SQLite-only batch check for ${videoIds.length} videos`);
    const results = await localAudioCache.getMultipleCachedAudio(videoIds);
    console.log(`ðŸ“ˆ SQLite Cache Hit: found=${results.size}/${videoIds.length}`);
    return results;
  }

  /**
   * Check audio extraction service availability
   */
  async isServiceAvailable(): Promise<boolean> {
    const env = detectEnvironment();

    switch (env.strategy) {


      case 'ytdlp':
        // Allow yt-dlp in production when explicitly configured
        return (env.isDevelopment || process.env.NEXT_PUBLIC_AUDIO_STRATEGY === 'ytdlp')
          ? await ytDlpService.isAvailable()
          : false;

      // PRESERVED FOR REFERENCE - service availability checks
      // case 'ytmp3go':
      //   return await ytMp3GoService.isAvailable();
      default:
        // Fallback: yt-mp3-go is generally available
        return true;
    }
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(durationString?: string): number {
    if (!durationString) return 0;

    try {
      // Handle formats like "3:45", "1:23:45", "0:30"
      const parts = durationString.split(':').map(part => parseInt(part, 10));
      
      if (parts.length === 2) {
        // MM:SS format
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clear service caches
   */
  clearCaches(): void {
    // Current extraction strategies manage their own cache internally.
    console.log('ðŸ§¹ Cleared audio extraction service caches');
  }

  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{
    quickTubeAvailable: boolean;
    cacheStats: {
      totalCached: number;
      validCached: number;
      expiredCached: number;
    };
  }> {
    const [quickTubeAvailable, cacheStats] = await Promise.all([
      this.isServiceAvailable(),
      localAudioCache.getCacheStats()
    ]);

    return {
      quickTubeAvailable,
      cacheStats
    };
  }

  /**
   * Estimate file size based on duration and bitrate
   */
  private estimateFileSizeFromDuration(durationSeconds: number, bitrateKbps: number): number {
    // Formula: (bitrate in bits per second * duration in seconds) / 8 bits per byte
    const bitrateBytes = (bitrateKbps * 1000) / 8;
    return Math.round(bitrateBytes * durationSeconds);
  }

  // REMOVED: tryProxyServicesForGoogleVideo method
  // This was part of the removed downr-org extraction pipeline that used SearchAPI and ScrapingBee services
}

// Export singleton instance
export const audioExtractionServiceSimplified = AudioExtractionServiceSimplified.getInstance();
