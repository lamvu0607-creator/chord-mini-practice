import { isLocalAudioUrl, toRelativeLocalAudioUrl } from '@/utils/localAudioUrl';

export const AUDIO_PROXY_FORCE_QUERY_PARAM = 'forceProxy';

export interface BuildAudioProxyUrlOptions {
  videoId?: string | null;
  forceProxy?: boolean;
}

export function encodeAudioProxySourceUrl(audioUrl: string): string {
  if (audioUrl.includes('quicktube.app/dl/')) {
    return encodeURIComponent(audioUrl).replace(/%5B/g, '[').replace(/%5D/g, ']');
  }

  return encodeURIComponent(audioUrl);
}

export function buildAudioProxyUrl(
  audioUrl: string,
  options: BuildAudioProxyUrlOptions = {},
): string {
  // Local files are already served by a validated same-origin route. Drop any
  // stored origin (e.g. http://localhost:3000) so other devices resolve it correctly.
  if (isLocalAudioUrl(audioUrl)) {
    return toRelativeLocalAudioUrl(audioUrl);
  }

  const queryParts = [`url=${encodeAudioProxySourceUrl(audioUrl)}`];

  if (options.videoId) {
    queryParts.push(`videoId=${encodeURIComponent(options.videoId)}`);
  }

  if (options.forceProxy) {
    queryParts.push(`${AUDIO_PROXY_FORCE_QUERY_PARAM}=1`);
  }

  return `/api/proxy-audio?${queryParts.join('&')}`;
}

export function isForceProxyRequested(forceProxyParam: string | null): boolean {
  if (forceProxyParam == null) {
    return false;
  }

  const normalized = forceProxyParam.trim().toLowerCase();
  return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
