describe('modelFiltering', () => {
  const loadModule = async () => import('@/utils/modelFiltering');

  afterEach(() => {
    jest.resetModules();
  });

  it('treats the default jsdom localhost origin as development and keeps BTC models available', async () => {
    const {
      areBTCModelsAvailable,
      filterChordModels,
      getAvailableChordModels,
      getSafeChordModel,
      getChordRecognitionEndpoint,
      getModelDescription,
    } = await loadModule();

    expect(areBTCModelsAvailable()).toBe(true);
    expect(filterChordModels(['chord-cnn-lstm', 'btc-sl', 'btc-pl'])).toEqual([
      'chord-cnn-lstm',
      'btc-sl',
      'btc-pl',
    ]);
    expect(getAvailableChordModels()).toEqual(['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
    expect(getSafeChordModel('btc-sl')).toBe('btc-sl');
    expect(getChordRecognitionEndpoint('btc-pl')).toBe('/api/recognize-chords-btc-pl');
    expect(getModelDescription('btc-sl')).toContain('Development only');
  });

  it('returns the standard endpoint and description for the always-available base model', async () => {
    const {
      getChordRecognitionEndpoint,
      getModelDescription,
    } = await loadModule();

    expect(getChordRecognitionEndpoint('chord-cnn-lstm')).toBe('/api/recognize-chords');
    expect(getModelDescription('chord-cnn-lstm')).toContain('CNN+LSTM model');
  });

  describe('undeployed and default chord models', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('keeps undeployed models listed but unusable, and falls back to a deployed model', async () => {
      process.env.NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS = 'chord-cnn-lstm';
      const {
        getListedChordModels,
        getAvailableChordModels,
        isChordModelDeployed,
        getSafeChordModel,
      } = await loadModule();

      expect(getListedChordModels()).toEqual(['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
      expect(getAvailableChordModels()).toEqual(['btc-sl', 'btc-pl']);
      expect(isChordModelDeployed('chord-cnn-lstm')).toBe(false);
      expect(getSafeChordModel('chord-cnn-lstm')).toBe('btc-sl');
    });

    it('uses the configured default chord model', async () => {
      process.env.NEXT_PUBLIC_DEFAULT_CHORD_MODEL = 'btc-pl';
      const { getDefaultChordModel } = await loadModule();

      expect(getDefaultChordModel()).toBe('btc-pl');
    });

    it('falls back to chord-cnn-lstm when no default is configured', async () => {
      delete process.env.NEXT_PUBLIC_DEFAULT_CHORD_MODEL;
      delete process.env.NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS;
      const { getDefaultChordModel } = await loadModule();

      expect(getDefaultChordModel()).toBe('chord-cnn-lstm');
    });
  });
});
