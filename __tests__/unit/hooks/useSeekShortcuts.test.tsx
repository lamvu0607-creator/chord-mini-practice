import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { useSeekShortcuts } from '@/hooks/ui/useSeekShortcuts';

function Harness({ onSeek, time = 30, duration = 200, enabled = true }: {
  onSeek: (t: number) => void; time?: number; duration?: number; enabled?: boolean;
}) {
  useSeekShortcuts({ onSeek, getCurrentTime: () => time, getDuration: () => duration, enabled });
  return (
    <div>
      <input aria-label="search" />
      <div role="slider" aria-label="scrubber" tabIndex={0} />
    </div>
  );
}

describe('useSeekShortcuts', () => {
  it('seeks back / forward 5 s with the arrow keys', () => {
    const onSeek = jest.fn();
    render(<Harness onSeek={onSeek} />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(onSeek).toHaveBeenNthCalledWith(1, 35);
    expect(onSeek).toHaveBeenNthCalledWith(2, 25);
  });

  it('clamps to the song bounds', () => {
    const onSeek = jest.fn();
    const { rerender } = render(<Harness onSeek={onSeek} time={2} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenLastCalledWith(0);

    rerender(<Harness onSeek={onSeek} time={198} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(200);
  });

  it('ignores keys while typing, on sliders, with modifiers, or when disabled', () => {
    const onSeek = jest.fn();
    const { getByLabelText, rerender } = render(<Harness onSeek={onSeek} />);

    fireEvent.keyDown(getByLabelText('search'), { key: 'ArrowRight' });
    fireEvent.keyDown(getByLabelText('scrubber'), { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowUp' });

    rerender(<Harness onSeek={onSeek} enabled={false} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(onSeek).not.toHaveBeenCalled();
  });
});
