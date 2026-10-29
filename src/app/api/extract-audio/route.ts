import { NextRequest, NextResponse } from 'next/server';
import { audioExtractionServiceSimplified, YouTubeVideoMetadata } from '@/services/audio/audioExtractionSimplified';
import { detectEnvironment } from '@/utils/environmentDetection';
import { getAuthenticatedUser } from '@/server/auth/sessionGuard';
import {
  checkTrialQuota,
  consumeTrialQuota,
  getOrCreateAnonymousToken,
  setAnonymousTokenCookie,
} from '@/server/auth/quotaGuard';

/**
 * Audio Extraction API Route - Environment-Aware Service Integration
 *
 * This route implements a streamlined extraction workflow:
 * - Uses YouTube search metadata directly (no filename guessing)
 * - Video ID-based caching and storage
 * - Environment-aware service selection:
 *   - Production: browser-side yt-dlp, finalized through /api/audio/finalize-browser-extraction
 *   - Local development: local yt-dlp
 *   - Rollback only: configured yt-mp3-go endpoint via explicit strategy override
 * - Leverages existing search results for metadata
 */

// Configure Vercel function timeout - Use 300 seconds to match vercel.json
// This allows time for audio extraction job creation + polling attempts
export const maxDuration = 300;

async function getCachedBrowserExtractionResult(videoMetadata: YouTubeVideoMetadata) {
  const videoId = videoMetadata.id;

  try {
    const { findExistingLocalAudioFile } = await import('@/services/storage/localAudioStorageService');
    const existing = await findExistingLocalAudioFile(videoId);
    if (existing) {
      return {
        success: true,
        audioUrl: existing.streamUrl || existing.audioUrl,
        streamUrl: existing.streamUrl,
        title: existing.title || videoMetadata.title,
        duration: existing.duration || 0,
        fromCache: true,
        isStreamUrl: Boolean(existing.streamUrl),
        streamExpiresAt: undefined,
      };
    }
  } catch (error) {
    console.warn('Local audio cache check failed before browser extraction:', error);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const {
      videoId,
      forceRedownload: requestedForceRedownload = false,
      forceRefresh: legacyForceRefresh = false,
      getInfoOnly = false,
      originalTitle,
      // New: Accept YouTube search metadata directly
      videoMetadata
    } = data;
    const forceRedownload = requestedForceRedownload === true || legacyForceRefresh === true;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    console.log(`🎵 Simplified audio extraction: ${videoId}${originalTitle ? ` ("${originalTitle}")` : ''}`);

    // If getInfoOnly is true, just return basic video info
    if (getInfoOnly) {
      return NextResponse.json({
        success: true,
        title: originalTitle || `YouTube Video ${videoId}`,
        duration: 0,
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`
      });
    }

    // Quota Guard: verify authenticated user or anonymous quota
    const authUser = await getAuthenticatedUser(request);
    const { token: anonToken, isNew: isNewAnonToken } = await getOrCreateAnonymousToken(request);
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    if (!authUser) {
      const quotaCheck = checkTrialQuota(anonToken, ipAddress, videoId);
      if (!quotaCheck.allowed) {
        const quotaExceededResponse = NextResponse.json(
          {
            success: false,
            error: {
              code: 'ANONYMOUS_QUOTA_EXCEEDED',
              message: 'Bạn đã sử dụng hết 1 lượt thử miễn phí. Vui lòng đăng nhập để tiếp tục phân tích không giới hạn.',
            },
          },
          { status: 403 }
        );
        if (isNewAnonToken) {
          setAnonymousTokenCookie(quotaExceededResponse, anonToken);
        }
        return quotaExceededResponse;
      }
    }

    try {
      const env = detectEnvironment();
      const resolvedMetadata: YouTubeVideoMetadata = videoMetadata || {
        id: videoId,
        title: typeof originalTitle === 'string' && originalTitle.length > 0 ? originalTitle : 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: 'Unknown Channel'
      };

      if (env.strategy === 'browser-ytdlp') {
        if (!forceRedownload) {
          const cachedResult = await getCachedBrowserExtractionResult(resolvedMetadata);
          if (cachedResult) {
            if (!authUser) {
              consumeTrialQuota(anonToken, videoId, ipAddress, userAgent);
            }
            const response = NextResponse.json({
              success: true,
              audioUrl: cachedResult.audioUrl,
              streamUrl: `/api/audio/${encodeURIComponent(videoId)}`,
              title: cachedResult.title,
              duration: cachedResult.duration,
              youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
              fromCache: cachedResult.fromCache,
              isStreamUrl: cachedResult.isStreamUrl,
              streamExpiresAt: cachedResult.streamExpiresAt,
              method: 'browser-ytdlp-cache'
            });
            if (isNewAnonToken) {
              setAnonymousTokenCookie(response, anonToken);
            }
            return response;
          }
        }

        if (!authUser) {
          consumeTrialQuota(anonToken, videoId, ipAddress, userAgent);
        }
        const response = NextResponse.json({
          success: false,
          requiresBrowserExtraction: true,
          method: 'browser-ytdlp',
          videoId,
          title: resolvedMetadata.title,
          duration: resolvedMetadata.duration,
          youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
        }, { status: 202 });
        if (isNewAnonToken) {
          setAnonymousTokenCookie(response, anonToken);
        }
        return response;
      }

      let result;

      // Use extraction with search metadata if available
      if (videoMetadata) {
        console.log(`📊 Using provided video metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(videoMetadata, forceRedownload);
      } else {
        // Fallback: create metadata from available data
        const fallbackMetadata: YouTubeVideoMetadata = {
          id: videoId,
          title: typeof originalTitle === 'string' && originalTitle.length > 0 ? originalTitle : 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          channelTitle: 'Unknown Channel'
        };

        console.log(`🔄 Using fallback metadata for ${videoId}`);
        result = await audioExtractionServiceSimplified.extractAudio(fallbackMetadata, forceRedownload);
      }

      if (!result.success) {
        console.error('❌ Simplified extraction failed', { videoId, error: result.error });
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Audio extraction failed',
            details: 'Audio extraction service is currently unavailable or the video cannot be processed',
            suggestion: 'The video may be restricted, too long, or temporarily unavailable. Please try a different video or try again later.'
          },
          { status: 500 }
        );
      }

      console.log(`✅ Simplified extraction successful for ${videoId}`);

      // Determine the method based on environment
      const method = env.strategy === 'ytdlp' ? 'yt-dlp' : 'yt-mp3-go';

      if (!authUser) {
        consumeTrialQuota(anonToken, videoId, ipAddress, userAgent);
      }

      const successResponse = NextResponse.json({
        success: true,
        audioUrl: result.audioUrl,
        streamUrl: `/api/audio/${encodeURIComponent(videoId)}`,
        title: result.title,
        duration: result.duration,
        youtubeEmbedUrl: `https://www.youtube.com/embed/${videoId}`,
        fromCache: result.fromCache,
        isStreamUrl: result.isStreamUrl,
        streamExpiresAt: result.streamExpiresAt,
        method
      });

      if (isNewAnonToken) {
        setAnonymousTokenCookie(successResponse, anonToken);
      }

      return successResponse;

    } catch (extractionError) {
      console.error('❌ Simplified extraction error', { videoId, extractionError });

      const errorMessage = extractionError instanceof Error ? extractionError.message : 'Unknown error';

      return NextResponse.json(
        {
          success: false,
          error: 'Audio extraction failed',
          details: errorMessage,
          suggestion: 'The video may be restricted, too long, or temporarily unavailable. Please try a different video or try again later.'
        },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error('Error proxying audio extraction:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to extract audio from YouTube',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
