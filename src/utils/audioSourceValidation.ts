import { isIP } from 'node:net';

const PRIVATE_IPV4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

/** Validate a remotely fetched audio URL and reject common SSRF targets. */
export function validateAudioSourceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('No audio URL provided');
  const raw = value.trim();
  if (raw.startsWith('/api/serve-local-audio?') || raw.startsWith('/api/audio/')) return raw;

  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('Invalid audio URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid audio URL protocol');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) {
    throw new Error('Private network audio URLs are not allowed');
  }
  if (isIP(hostname) === 4 && PRIVATE_IPV4.test(hostname)) {
    throw new Error('Private network audio URLs are not allowed');
  }
  return parsed.toString();
}
