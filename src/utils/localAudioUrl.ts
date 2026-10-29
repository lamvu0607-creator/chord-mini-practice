const LOCAL_AUDIO_SERVE_PATH = '/api/serve-local-audio';
const LOCAL_AUDIO_STREAM_PREFIX = '/api/audio/';
const PARSE_BASE = 'http://local.invalid';

/** Same-origin path for a file in local audio storage. */
export function buildLocalAudioServePath(filename: string): string {
  return `${LOCAL_AUDIO_SERVE_PATH}?filename=${encodeURIComponent(filename)}`;
}

/** Same-origin path for the range-capable stream of a cached video. */
export function buildAudioStreamPath(videoId: string): string {
  return `${LOCAL_AUDIO_STREAM_PREFIX}${encodeURIComponent(videoId)}`;
}

function parseLocalAudioUrl(value: string): URL | null {
  try {
    const parsed = new URL(value, PARSE_BASE);
    const isLocalPath = parsed.pathname === LOCAL_AUDIO_SERVE_PATH || parsed.pathname.startsWith(LOCAL_AUDIO_STREAM_PREFIX);
    return isLocalPath ? parsed : null;
  } catch {
    return null;
  }
}

export function isLocalAudioUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && parseLocalAudioUrl(value.trim()) !== null;
}

/**
 * Strip the origin from local audio URLs so they resolve against whichever host
 * the page was loaded from (localhost, LAN IP, Tailscale). Older rows stored
 * absolute URLs such as http://localhost:3000/api/serve-local-audio?... .
 */
export function toRelativeLocalAudioUrl(value: string): string;
export function toRelativeLocalAudioUrl(value: string | null | undefined): string | null | undefined;
export function toRelativeLocalAudioUrl(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value;
  const parsed = parseLocalAudioUrl(value.trim());
  return parsed ? `${parsed.pathname}${parsed.search}` : value;
}
