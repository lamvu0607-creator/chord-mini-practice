import { act, renderHook } from '@testing-library/react';

const master = { playing: false, position: 0, rate: 1 };
jest.mock('@/services/audio/youtubeMasterClock', () => ({
  youtubeMasterClock: {
    isPlaying: () => master.playing,
    getLivePosition: () => master.position,
    getRate: () => master.rate,
  },
}));

import { useStemFollower } from '@/hooks/stems/useStemFollower';

function fakeEngine() {
  const engine = {
    isPlaying: false,
    position: 0,
    practiceState: { rate: 1, semitones: 0, loop: null, loopEnabled: false },
    outputLatencySeconds: 0.02,
    getCurrentTime: () => engine.position,
    pause: jest.fn(() => { engine.isPlaying = false; }),
    followTo: jest.fn(async (position: number, rate: number) => {
      engine.isPlaying = true;
      engine.position = position + 0.02 * rate;
      engine.practiceState = { ...engine.practiceState, rate };
    }),
  };
  return engine;
}

describe('useStemFollower', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.assign(master, { playing: false, position: 0, rate: 1 });
  });
  afterEach(() => jest.useRealTimers());

  const tick = async (ms = 40) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await Promise.resolve();
    });
  };

  it('starts, holds steady, re-syncs on drift and rate changes, and pauses with the video', async () => {
    const engine = fakeEngine();
    renderHook(() => useStemFollower(engine as never, true));

    await tick();
    expect(engine.followTo).not.toHaveBeenCalled();

    master.playing = true;
    master.position = 10;
    await tick();
    expect(engine.followTo).toHaveBeenLastCalledWith(10, 1);

    // Within tolerance (0.08 s): no re-seek.
    master.position = 10.05;
    await tick();
    expect(engine.followTo).toHaveBeenCalledTimes(1);

    // User seek on the video: big drift, one re-seek.
    master.position = 60;
    await tick();
    expect(engine.followTo).toHaveBeenLastCalledWith(60, 1);
    expect(engine.followTo).toHaveBeenCalledTimes(2);

    // Speed change on the video is mirrored.
    master.rate = 1.5;
    await tick();
    expect(engine.followTo).toHaveBeenLastCalledWith(60, 1.5);

    master.playing = false;
    await tick();
    expect(engine.pause).toHaveBeenCalled();
    expect(engine.isPlaying).toBe(false);
  });

  it('stops following and pauses the stems when disabled', async () => {
    const engine = fakeEngine();
    master.playing = true;
    const { rerender } = renderHook(({ enabled }) => useStemFollower(engine as never, enabled), { initialProps: { enabled: true } });
    await tick();
    expect(engine.isPlaying).toBe(true);

    rerender({ enabled: false });
    expect(engine.pause).toHaveBeenCalled();
    const calls = engine.followTo.mock.calls.length;
    master.position = 99;
    await tick(200);
    expect(engine.followTo).toHaveBeenCalledTimes(calls);
  });
});
