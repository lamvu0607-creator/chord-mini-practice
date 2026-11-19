import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { GuitarChordTimeline } from '@/components/chord-analysis/GuitarChordTimeline';
import { usePlaybackStore } from '@/stores/playbackStore';

// 3 bars of 4/4: Am held into bar 2, change to F, F held into bar 3, then G.
const chords = ['Am', 'Am', 'Am', 'Am', 'Am', 'Am', 'F', 'F', 'F', 'F', 'G', 'G'];
const beatTimes = chords.map((_, i) => 1 + i * 0.5);

describe('GuitarChordTimeline', () => {
  const onBeatClick = jest.fn();

  beforeEach(() => {
    onBeatClick.mockReset();
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    usePlaybackStore.setState({ currentTime: 0, isPlaying: false, currentBeatIndex: 5, onBeatClick });
  });

  const renderTimeline = () => render(
    <GuitarChordTimeline chords={chords} beatTimes={beatTimes} timeSignature={4} />,
  );

  it('draws one box per bar', () => {
    const { container } = renderTimeline();
    expect(container.querySelectorAll('[data-bar-index]')).toHaveLength(3);
  });

  it('names a chord only where it changes, and once faded at a carried bar start', () => {
    const { container } = renderTimeline();
    const labelled = (kind: string) => Array.from(container.querySelectorAll(`[data-label="${kind}"]`))
      .map((el) => Number(el.getAttribute('data-beat-index')));

    expect(labelled('change')).toEqual([0, 6, 10]);
    expect(labelled('carried')).toEqual([4, 8]);
  });

  it('highlights the current beat and its bar', () => {
    const { container } = renderTimeline();
    expect(container.querySelector('[data-beat-index="5"]')?.className).toContain('bg-blue-50');
    expect(container.querySelector('[data-bar-index="1"]')?.className).toContain('shadow-');
    expect(container.querySelector('[data-bar-index="0"]')?.className).not.toContain('shadow-');
  });

  it('seeks to the beat time when a beat is clicked', () => {
    renderTimeline();
    fireEvent.click(screen.getByRole('button', { name: 'Bar 2, beat 3: F' }));
    expect(onBeatClick).toHaveBeenCalledWith(6, 4);
  });
});
