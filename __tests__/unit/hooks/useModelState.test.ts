import { renderHook, act } from '@testing-library/react';
import { useModelState } from '@/hooks/chord-analysis/useModelState';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Keep the real type guards; make availability checks pass-through so tests see raw selections
jest.mock('@/utils/modelFiltering', () => {
  const actual = jest.requireActual('@/utils/modelFiltering');
  return {
    ...actual,
    getSafeBeatModel: jest.fn((model) => model),
    getSafeChordModel: jest.fn((model) => model),
    getDefaultBeatModel: jest.fn(() => 'beat-this'),
    getDefaultChordModel: jest.fn(() => 'btc-cl'),
  };
});

/** localStorage contents for one test; the defaults migration flag is set unless overridden. */
function useStorage(values: Record<string, string | null>) {
  const store: Record<string, string | null> = { chordmini_model_defaults_version: '2', ...values };
  localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
  localStorageMock.removeItem.mockImplementation((key: string) => { store[key] = null; });
  localStorageMock.setItem.mockImplementation((key: string, value: string) => { store[key] = value; });
  return store;
}

describe('useModelState Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with default values when localStorage is empty', () => {
    useStorage({});

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-this');
    expect(result.current.chordDetector).toBe('btc-cl');
    expect(result.current.modelsInitialized).toBe(false);
  });

  it('loads saved values from localStorage', () => {
    useStorage({ chordmini_beat_detector: 'madmom', chordmini_chord_detector: 'btc-sl' });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('madmom');
    expect(result.current.chordDetector).toBe('btc-sl');
  });

  it('ignores invalid values from localStorage', () => {
    useStorage({ chordmini_beat_detector: 'invalid-detector', chordmini_chord_detector: 'invalid-chord' });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-this');
    expect(result.current.chordDetector).toBe('btc-cl');
  });

  it('moves selections that equal the old defaults to the new defaults once', () => {
    const store = useStorage({
      chordmini_model_defaults_version: null,
      chordmini_beat_detector: 'madmom',
      chordmini_chord_detector: 'btc-sl',
    });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-this');
    expect(result.current.chordDetector).toBe('btc-cl');
    expect(store.chordmini_model_defaults_version).toBe('2');
  });

  it('keeps an explicit non-default selection when migrating', () => {
    useStorage({ chordmini_model_defaults_version: null, chordmini_beat_detector: 'beat-transformer' });

    const { result } = renderHook(() => useModelState());

    expect(result.current.beatDetector).toBe('beat-transformer');
  });

  it('updates beat detector and persists to localStorage', () => {
    useStorage({});
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setBeatDetector('madmom');
    });

    expect(result.current.beatDetector).toBe('madmom');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chordmini_beat_detector', 'madmom');
  });

  it('updates chord detector and persists to localStorage', () => {
    useStorage({});
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setChordDetector('btc-sl');
    });

    expect(result.current.chordDetector).toBe('btc-sl');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chordmini_chord_detector', 'btc-sl');
  });

  it('updates refs when state changes', () => {
    useStorage({});
    const { result } = renderHook(() => useModelState());

    act(() => {
      result.current.setBeatDetector('madmom');
    });

    expect(result.current.beatDetectorRef.current).toBe('madmom');
  });

  it('initializes models after 1 second timer', () => {
    useStorage({});
    const { result } = renderHook(() => useModelState());

    expect(result.current.modelsInitialized).toBe(false);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.modelsInitialized).toBe(true);
  });

  it('cleans up timer on unmount', () => {
    useStorage({});
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = renderHook(() => useModelState());

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
