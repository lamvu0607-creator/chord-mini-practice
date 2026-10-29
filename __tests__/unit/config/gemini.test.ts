describe('config/gemini', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns null when no API key is available', async () => {
    delete process.env.GEMINI_API_KEY;
    const { createGeminiClient } = await import('@/config/gemini');
    expect(createGeminiClient()).toBeNull();
  });

  it('caches env-key clients by timeout but not explicit-key clients', async () => {
    process.env.GEMINI_API_KEY = 'env-key';
    const { createGeminiClient } = await import('@/config/gemini');
    expect(createGeminiClient()).toBe(createGeminiClient());
    expect(createGeminiClient({ timeoutMs: 5000 })).not.toBe(createGeminiClient());
    expect(createGeminiClient({ apiKey: 'user-key' })).not.toBe(createGeminiClient({ apiKey: 'user-key' }));
  });

  it('maps generateContent to REST without putting the API key in the URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Db ' }, { text: 'major' }] } }] }),
    });
    const { createGeminiClient } = await import('@/config/gemini');
    const client = createGeminiClient({ apiKey: 'secret-key', timeoutMs: 9000 })!;
    await expect(client.models.generateContent({
      model: 'gemini-test', contents: 'Analyze', config: { thinkingConfig: { thinkingLevel: 'HIGH' } },
    })).resolves.toEqual({ text: 'Db major' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'secret-key' }),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Analyze' }] }],
          generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } },
        }),
      }),
    );
    expect((global.fetch as jest.Mock).mock.calls[0][0]).not.toContain('secret-key');
  });
});
