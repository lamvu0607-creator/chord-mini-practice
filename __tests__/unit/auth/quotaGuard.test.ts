import {
  checkTrialQuota,
  consumeTrialQuota,
  getOrCreateAnonymousToken,
  resetTrialQuota,
} from '@/server/auth/quotaGuard';

describe('quotaGuard', () => {
  const testAnonToken = 'anon_test_token_quota_12345';
  const songA = 'song_video_id_alpha';
  const songB = 'song_video_id_beta';

  beforeEach(() => {
    resetTrialQuota(testAnonToken);
  });

  afterAll(() => {
    resetTrialQuota(testAnonToken);
  });

  describe('getOrCreateAnonymousToken', () => {
    it('generates a new UUID token if request has no cookie', async () => {
      const { token, isNew } = await getOrCreateAnonymousToken();
      expect(isNew).toBe(true);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    it('returns existing token if present in request cookie header', async () => {
      const mockRequest = {
        headers: {
          get: (name: string) => (name.toLowerCase() === 'cookie' ? `chord_anon_token=${testAnonToken}` : null),
        },
      } as unknown as Request;

      const { token, isNew } = await getOrCreateAnonymousToken(mockRequest);
      expect(isNew).toBe(false);
      expect(token).toBe(testAnonToken);
    });
  });

  describe('checkTrialQuota & consumeTrialQuota', () => {
    it('grants 1 trial initially for fresh anonymous user', () => {
      const quota = checkTrialQuota(testAnonToken, '127.0.0.1', songA);
      expect(quota.allowed).toBe(true);
      expect(quota.remainingTrials).toBe(1);
      expect(quota.usedCount).toBe(0);
      expect(quota.isQuotaExceeded).toBe(false);
      expect(quota.trialVideoId).toBeNull();
    });

    it('allows opening the first song and marks quota as consumed', () => {
      // Consume quota for songA
      consumeTrialQuota(testAnonToken, songA, '127.0.0.1', 'Jest-Agent');

      // Check quota again for the same songA -> allowed!
      const quotaSameSong = checkTrialQuota(testAnonToken, '127.0.0.1', songA);
      expect(quotaSameSong.allowed).toBe(true);
      expect(quotaSameSong.usedCount).toBe(1);
      expect(quotaSameSong.trialVideoId).toBe(songA);
      expect(quotaSameSong.remainingTrials).toBe(0);
      expect(quotaSameSong.isQuotaExceeded).toBe(false);
    });

    it('blocks opening a SECOND different song (Quota Exceeded)', () => {
      // Consume quota for songA
      consumeTrialQuota(testAnonToken, songA, '127.0.0.1', 'Jest-Agent');

      // Attempt to access songB -> forbidden!
      const quotaDifferentSong = checkTrialQuota(testAnonToken, '127.0.0.1', songB);
      expect(quotaDifferentSong.allowed).toBe(false);
      expect(quotaDifferentSong.usedCount).toBe(1);
      expect(quotaDifferentSong.trialVideoId).toBe(songA);
      expect(quotaDifferentSong.remainingTrials).toBe(0);
      expect(quotaDifferentSong.isQuotaExceeded).toBe(true);
    });

    it('general check without targetVideoId indicates quota exceeded once used', () => {
      consumeTrialQuota(testAnonToken, songA, '127.0.0.1');

      const generalCheck = checkTrialQuota(testAnonToken, '127.0.0.1');
      expect(generalCheck.allowed).toBe(false);
      expect(generalCheck.isQuotaExceeded).toBe(true);
      expect(generalCheck.remainingTrials).toBe(0);
    });
  });
});
