import { expect, test } from '@playwright/test';

test('local persistence APIs survive the complete browser-facing workflow', async ({ request }) => {
  const health = await request.get('/api/persistence/health');
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({ ready: true, schemaVersion: 2, journalMode: 'wal' });

  // Anonymous auth check -> 401 Unauthorized
  const meAnon = await request.get('/api/auth/me');
  expect(meAnon.status()).toBe(401);
  await expect(meAnon.json()).resolves.toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });

  // Bad credentials rejected
  const badLogin = await request.post('/api/auth/login', {
    data: { username: 'nonexistent', pin: '9999' },
  });
  expect(badLogin.status()).toBe(401);

  const upload = await request.post('/api/serve-local-audio', {
    multipart: {
      videoId: 'e2e-video',
      audio: { name: 'sample.webm', mimeType: 'audio/webm', buffer: Buffer.from('0123456789') },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { audioUrl: string; streamUrl?: string };
  const filename = new URL(stored.audioUrl).searchParams.get('filename');
  expect(filename).toBeTruthy();

  const range = await request.get(`/api/serve-local-audio?filename=${encodeURIComponent(filename!)}`, {
    headers: { Range: 'bytes=2-5' },
  });
  expect(range.status()).toBe(206);
  expect(await range.body()).toEqual(Buffer.from('2345'));
  expect(range.headers()['content-range']).toBe('bytes 2-5/10');

  // Direct /api/audio/[videoId] streaming
  const streamRange = await request.get('/api/audio/e2e-video', {
    headers: { Range: 'bytes=2-5' },
  });
  expect(streamRange.status()).toBe(206);
  expect(await streamRange.body()).toEqual(Buffer.from('2345'));

  const traversal = await request.get('/api/serve-local-audio?filename=..%2Fsecret.mp3');
  expect(traversal.status()).toBe(400);

  const transcription = {
    videoId: 'e2e-video', beatModel: 'madmom', chordModel: 'chord-cnn-lstm', title: 'E2E song',
    beats: [{ time: 0, strength: 1 }], chords: [{ start: 0, end: 1, chord: 'Db' }],
    synchronizedChords: [{ beatIndex: 0, chord: 'Db' }], keySignature: 'Db',
  };
  expect((await request.put('/api/transcriptions', { data: transcription })).ok()).toBeTruthy();
  expect((await request.post('/api/transcriptions/usage', {
    data: { videoId: 'e2e-video', beatModel: 'madmom', chordModel: 'chord-cnn-lstm' },
  })).ok()).toBeTruthy();

  const read = await request.get('/api/transcriptions?videoId=e2e-video&beatModel=madmom&chordModel=chord-cnn-lstm');
  await expect(read.json()).resolves.toMatchObject({ data: { videoId: 'e2e-video', usageCount: 1 } });
  const recent = await request.get('/api/transcriptions/recent?key=C%23&limit=1');
  await expect(recent.json()).resolves.toMatchObject({ videos: [{ videoId: 'e2e-video' }] });
});
