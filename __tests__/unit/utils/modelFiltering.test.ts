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
    expect(filterChordModels(['chord-cnn-lstm', 'btc-sl', 'btc-cl'])).toEqual([
      'chord-cnn-lstm',
      'btc-sl',
      'btc-cl',
    ]);
    // btc-pl is a legacy id of btc-cl and is not listed any more
    expect(getAvailableChordModels()).toEqual(['btc-cl', 'btc-sl', 'chord-cnn-lstm']);
    expect(getSafeChordModel('btc-sl')).toBe('btc-sl');
    expect(getChordRecognitionEndpoint('btc-cl')).toBe('/api/recognize-chords-btc-cl');
    expect(getModelDescription('btc-sl')).toContain('Development only');
  });

  it('maps the legacy btc-pl id to btc-cl', async () => {
    const { getSafeChordModel, normalizeChordModel, getChordRecognitionEndpoint } = await loadModule();

    expect(normalizeChordModel('btc-pl')).toBe('btc-cl');
    expect(getSafeChordModel('btc-pl')).toBe('btc-cl');
    expect(getChordRecognitionEndpoint('btc-pl')).toBe('/api/recognize-chords-btc-cl');
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

      expect(getListedChordModels()).toEqual(['btc-cl', 'btc-sl', 'chord-cnn-lstm']);
      expect(getAvailableChordModels()).toEqual(['btc-cl', 'btc-sl']);
      expect(isChordModelDeployed('chord-cnn-lstm')).toBe(false);
      expect(getSafeChordModel('chord-cnn-lstm')).toBe('btc-cl');
    });

    it('uses the configured default chord model', async () => {
      process.env.NEXT_PUBLIC_DEFAULT_CHORD_MODEL = 'btc-sl';
      const { getDefaultChordModel } = await loadModule();

      expect(getDefaultChordModel()).toBe('btc-sl');
    });

    it('falls back to btc-cl when no default is configured', async () => {
      delete process.env.NEXT_PUBLIC_DEFAULT_CHORD_MODEL;
      delete process.env.NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS;
      const { getDefaultChordModel } = await loadModule();

      expect(getDefaultChordModel()).toBe('btc-cl');
    });
  });

  describe('beat models', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('lists Beat This! first and uses it as the default', async () => {
      delete process.env.NEXT_PUBLIC_DEFAULT_BEAT_MODEL;
      const { getAvailableBeatModels, getDefaultBeatModel } = await loadModule();

      expect(getAvailableBeatModels()).toEqual(['beat-this', 'madmom', 'beat-transformer']);
      expect(getDefaultBeatModel()).toBe('beat-this');
    });

    it('honours NEXT_PUBLIC_DEFAULT_BEAT_MODEL and ignores unknown values', async () => {
      process.env.NEXT_PUBLIC_DEFAULT_BEAT_MODEL = 'madmom';
      expect((await loadModule()).getDefaultBeatModel()).toBe('madmom');

      jest.resetModules();
      process.env.NEXT_PUBLIC_DEFAULT_BEAT_MODEL = 'nonsense';
      expect((await loadModule()).getDefaultBeatModel()).toBe('beat-this');
    });
  });
});
