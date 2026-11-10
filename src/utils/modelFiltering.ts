/**
 * Model Filtering Utility for ChordMiniApp
 *
 * Provides environment-based filtering for experimental local-only models.
 * BTC models and Beat-Transformer are hidden on public origins unless
 * NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODELS is set.
 *
 * Chord models:
 *  - btc-cl: BTC trained with pseudo-labels + continual learning (arXiv 2602.19778), default
 *  - btc-sl: the original BTC (ISMIR 2019)
 *  - btc-pl: legacy id of btc-cl (same checkpoint). Still accepted for URLs and cached
 *    results, but no longer listed in the selector.
 *  - chord-cnn-lstm
 * Beat models: beat-this (default), madmom, beat-transformer.
 */

export type ChordDetectorType = 'btc-cl' | 'btc-sl' | 'btc-pl' | 'chord-cnn-lstm';
export type BeatDetectorType = 'beat-this' | 'madmom' | 'beat-transformer';

export const ALL_CHORD_MODELS: ChordDetectorType[] = ['btc-cl', 'btc-sl', 'btc-pl', 'chord-cnn-lstm'];
export const ALL_BEAT_MODELS: BeatDetectorType[] = ['beat-this', 'madmom', 'beat-transformer'];

/** Legacy ids mapped to the model that now serves them. */
const LEGACY_CHORD_MODELS: Partial<Record<ChordDetectorType, ChordDetectorType>> = { 'btc-pl': 'btc-cl' };

export function isChordDetectorType(value: unknown): value is ChordDetectorType {
  return typeof value === 'string' && (ALL_CHORD_MODELS as string[]).includes(value);
}

export function isBeatDetectorType(value: unknown): value is BeatDetectorType {
  return typeof value === 'string' && (ALL_BEAT_MODELS as string[]).includes(value);
}

/** Replace a legacy chord model id (btc-pl) by its current id (btc-cl). */
export function normalizeChordModel(model: ChordDetectorType): ChordDetectorType {
  return LEGACY_CHORD_MODELS[model] ?? model;
}

function isLocalDevelopmentOrigin(): boolean {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_BASE_URL || '');

  return baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
}

/**
 * Check if BTC models should be available based on environment
 * @returns true if BTC models should be shown (local development), false if hidden (production)
 */
export function areExperimentalModelsAvailable(): boolean {
  const envOverride = process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODELS;
  if (envOverride === '1' || envOverride === 'true') {
    return true;
  }

  return isLocalDevelopmentOrigin() || process.env.NODE_ENV === 'development';
}

export function areBTCModelsAvailable(): boolean {
  return areExperimentalModelsAvailable();
}

export function areBeatTransformerAvailable(): boolean {
  return areExperimentalModelsAvailable();
}

/**
 * Filter chord detector types based on environment
 * @param models Array of chord detector types to filter
 * @returns Filtered array with BTC models removed in production
 */
export function filterChordModels(models: ChordDetectorType[]): ChordDetectorType[] {
  if (areBTCModelsAvailable()) {
    // Local development: show all models
    return models;
  }

  // Production: filter out BTC models
  return models.filter(model => !model.startsWith('btc-'));
}

/**
 * Check if a chord model is deployed on the backend.
 * Models listed in NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS (comma-separated, build time)
 * stay visible in the selector but cannot be selected.
 */
export function isChordModelDeployed(model: ChordDetectorType): boolean {
  const undeployed = (process.env.NEXT_PUBLIC_UNDEPLOYED_CHORD_MODELS || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  return !undeployed.includes(model);
}

/**
 * Get chord detector types to list in the selector, including undeployed ones
 * @returns Array of chord detector types shown in this environment
 */
export function getListedChordModels(): ChordDetectorType[] {
  const allModels: ChordDetectorType[] = ['btc-cl', 'btc-sl', 'chord-cnn-lstm'];
  return filterChordModels(allModels);
}

/**
 * Get available chord detector types based on environment
 * @returns Array of chord detector types that can actually be used
 */
export function getAvailableChordModels(): ChordDetectorType[] {
  return getListedChordModels().filter(isChordModelDeployed);
}

export function filterBeatModels(models: BeatDetectorType[]): BeatDetectorType[] {
  if (areBeatTransformerAvailable()) {
    return models;
  }

  return models.filter((model) => model !== 'beat-transformer');
}

export function getAvailableBeatModels(): BeatDetectorType[] {
  return filterBeatModels([...ALL_BEAT_MODELS]);
}

/**
 * Check if a specific chord model is available in the current environment
 * @param model The chord detector type to check
 * @returns true if the model is available, false otherwise
 */
export function isChordModelAvailable(model: ChordDetectorType): boolean {
  const availableModels = getAvailableChordModels();
  return availableModels.includes(model);
}

export function isBeatModelAvailable(model: BeatDetectorType): boolean {
  const availableModels = getAvailableBeatModels();
  return availableModels.includes(model);
}

/**
 * Get a safe fallback chord model if the requested model is not available
 * @param requestedModel The requested chord detector type
 * @returns A safe chord detector type that's available in the current environment
 */
export function getSafeChordModel(requestedModel: ChordDetectorType): ChordDetectorType {
  const model = normalizeChordModel(requestedModel);
  if (isChordModelAvailable(model)) {
    return model;
  }

  // Fallback to the first usable model, or chord-cnn-lstm when nothing else is listed
  return getAvailableChordModels()[0] ?? 'chord-cnn-lstm';
}

/**
 * Get the default chord model for users with no saved selection.
 * Set at build time via NEXT_PUBLIC_DEFAULT_CHORD_MODEL; falls back to the first
 * available model when the configured model is unknown or unavailable here.
 */
export function getDefaultChordModel(): ChordDetectorType {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_CHORD_MODEL;
  if (isChordDetectorType(configured)) {
    return getSafeChordModel(configured);
  }
  return getSafeChordModel('btc-cl');
}

export function getSafeBeatModel(requestedModel: BeatDetectorType): BeatDetectorType {
  if (isBeatModelAvailable(requestedModel)) {
    return requestedModel;
  }

  return getAvailableBeatModels()[0] ?? 'madmom';
}

/**
 * Get the default beat model for users with no saved selection.
 * Set at build time via NEXT_PUBLIC_DEFAULT_BEAT_MODEL (default beat-this).
 */
export function getDefaultBeatModel(): BeatDetectorType {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_BEAT_MODEL;
  return getSafeBeatModel(isBeatDetectorType(configured) ? configured : 'beat-this');
}

/**
 * Get the appropriate API endpoint for chord recognition based on model
 * @param model The chord detector type
 * @returns The API endpoint path
 */
export function getChordRecognitionEndpoint(model: ChordDetectorType): string {
  // Ensure the model is available in the current environment
  const safeModel = getSafeChordModel(model);

  switch (safeModel) {
    case 'btc-cl':
      return '/api/recognize-chords-btc-cl';
    case 'btc-sl':
      return '/api/recognize-chords-btc-sl';
    case 'btc-pl':
      return '/api/recognize-chords-btc-pl';
    case 'chord-cnn-lstm':
    default:
      return '/api/recognize-chords';
  }
}

/**
 * Check if we're in a development environment (for UI indicators)
 * @returns true if in development, false if in production
 */
export function isDevelopmentEnvironment(): boolean {
  return areExperimentalModelsAvailable();
}

/**
 * Get environment-specific model descriptions
 * @param model The chord detector type
 * @returns Description with environment-specific notes
 */
export function getModelDescription(model: ChordDetectorType): string {
  const baseDescriptions: Record<ChordDetectorType, string> = {
    'chord-cnn-lstm': 'CNN+LSTM model with 301 chord labels for comprehensive chord recognition',
    'btc-cl': 'Transformer model with 170 chord labels, pseudo-label pre-training + continual learning (most accurate)',
    'btc-sl': 'Original BTC transformer with 170 chord labels (ISMIR 2019)',
    'btc-pl': 'Same model as BTC CL (legacy name)',
  };

  const description = baseDescriptions[model];

  // Add development-only note for BTC models in development environment
  if (model.startsWith('btc-') && isDevelopmentEnvironment()) {
    return `${description} (Development only - requires local repository)`;
  }

  return description;
}

export function getBeatModelDescription(model: BeatDetectorType): string {
  const baseDescriptions: Record<BeatDetectorType, string> = {
    'beat-this': 'Transformer beat and downbeat tracker (ISMIR 2024), detects bars and meter, fast on GPU',
    madmom: 'Neural network with high accuracy and speed, best for common time signatures',
    'beat-transformer': 'DL model with 5-channel audio separation, flexible in time signatures, slow processing speed',
  };

  const description = baseDescriptions[model];

  if (model === 'beat-transformer' && isDevelopmentEnvironment()) {
    return `${description} (Development only - requires local repository)`;
  }

  return description;
}
