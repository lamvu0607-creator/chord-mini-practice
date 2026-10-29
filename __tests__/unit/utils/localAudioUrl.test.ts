import { buildAudioStreamPath, buildLocalAudioServePath, isLocalAudioUrl, toRelativeLocalAudioUrl } from '@/utils/localAudioUrl';
import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';
import { toInternalAudioUrl } from '@/config/serverBackend';

describe('local audio URLs', () => {
  const originalInternalUrl = process.env.INTERNAL_FRONTEND_URL;
  afterEach(() => {
    if (originalInternalUrl === undefined) delete process.env.INTERNAL_FRONTEND_URL;
    else process.env.INTERNAL_FRONTEND_URL = originalInternalUrl;
  });

  it('builds host-independent paths', () => {
    expect(buildLocalAudioServePath('audio_[abc]_1.mp3')).toBe('/api/serve-local-audio?filename=audio_%5Babc%5D_1.mp3');
    expect(buildAudioStreamPath('abc')).toBe('/api/audio/abc');
  });

  it('strips stored origins from legacy local URLs only', () => {
    expect(toRelativeLocalAudioUrl('http://localhost:3000/api/serve-local-audio?filename=a.mp3')).toBe('/api/serve-local-audio?filename=a.mp3');
    expect(toRelativeLocalAudioUrl('https://box.tail.ts.net/api/audio/abc')).toBe('/api/audio/abc');
    expect(toRelativeLocalAudioUrl('https://cdn.example.com/a.mp3')).toBe('https://cdn.example.com/a.mp3');
    expect(toRelativeLocalAudioUrl(null)).toBeNull();
    expect(isLocalAudioUrl('https://cdn.example.com/a.mp3')).toBe(false);
  });

  it('keeps proxied playback same-origin for legacy absolute URLs', () => {
    expect(buildAudioProxyUrl('http://localhost:3000/api/serve-local-audio?filename=a.mp3')).toBe('/api/serve-local-audio?filename=a.mp3');
  });

  it('maps local URLs to the internal frontend for backend services', () => {
    process.env.INTERNAL_FRONTEND_URL = 'http://frontend:3000/';
    expect(toInternalAudioUrl('/api/serve-local-audio?filename=a.mp3')).toBe('http://frontend:3000/api/serve-local-audio?filename=a.mp3');
    expect(toInternalAudioUrl('https://box.tail.ts.net/api/audio/abc')).toBe('http://frontend:3000/api/audio/abc');
    expect(toInternalAudioUrl('https://cdn.example.com/a.mp3')).toBe('https://cdn.example.com/a.mp3');
  });
});
