import { buildAudioProxyUrl } from '@/utils/audioProxyUrl';
import { validateAudioSourceUrl } from '@/utils/audioSourceValidation';

describe('audioRoutePipeline utils', () => {
  describe('buildAudioProxyUrl', () => {
    it('returns /api/serve-local-audio without wrapping in proxy', () => {
      const url = '/api/serve-local-audio?filename=song.mp3';
      expect(buildAudioProxyUrl(url)).toBe(url);
    });

    it('returns /api/audio/<videoId> without wrapping in proxy', () => {
      const url = '/api/audio/yt-12345';
      expect(buildAudioProxyUrl(url)).toBe(url);
    });

    it('wraps remote audio URLs in proxy url', () => {
      const url = 'https://example.com/stream.mp3';
      const proxy = buildAudioProxyUrl(url, { videoId: 'yt-12345' });
      expect(proxy).toContain('/api/proxy-audio?url=');
      expect(proxy).toContain('videoId=yt-12345');
    });
  });

  describe('validateAudioSourceUrl', () => {
    it('allows /api/serve-local-audio paths', () => {
      const url = '/api/serve-local-audio?filename=track.mp3';
      expect(validateAudioSourceUrl(url)).toBe(url);
    });

    it('allows /api/audio/<videoId> paths', () => {
      const url = '/api/audio/track-123';
      expect(validateAudioSourceUrl(url)).toBe(url);
    });

    it('allows valid remote public https URLs', () => {
      const url = 'https://audio.example.com/audio.mp3';
      expect(validateAudioSourceUrl(url)).toBe(url);
    });

    it('rejects localhost and private network URLs', () => {
      expect(() => validateAudioSourceUrl('http://localhost:3000/audio.mp3')).toThrow(
        'Private network audio URLs are not allowed',
      );
      expect(() => validateAudioSourceUrl('http://192.168.1.100/audio.mp3')).toThrow(
        'Private network audio URLs are not allowed',
      );
    });
  });
});
