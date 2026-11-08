import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SeekStepButton from '@/components/analysis/SeekStepButton';

describe('SeekStepButton', () => {
  it('rewinds and fast-forwards 5 seconds', () => {
    const onSeek = jest.fn();
    render(
      <>
        <SeekStepButton direction="back" currentTime={12} duration={60} onSeek={onSeek} />
        <SeekStepButton direction="forward" currentTime={12} duration={60} onSeek={onSeek} />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rewind 5 seconds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));

    expect(onSeek).toHaveBeenNthCalledWith(1, 7);
    expect(onSeek).toHaveBeenNthCalledWith(2, 17);
  });

  it('is disabled until the player is ready', () => {
    const onSeek = jest.fn();
    render(<SeekStepButton direction="forward" currentTime={0} duration={60} onSeek={onSeek} disabled />);

    const button = screen.getByRole('button', { name: 'Forward 5 seconds' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('steps from the live player time so repeated clicks add up while the prop is stale', () => {
    let position = 0;
    const onSeek = jest.fn((t: number) => { position = t; });
    render(
      <SeekStepButton direction="forward" currentTime={0} getCurrentTime={() => position} duration={60} onSeek={onSeek} />,
    );
    const button = screen.getByRole('button', { name: 'Forward 5 seconds' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSeek).toHaveBeenNthCalledWith(1, 5);
    expect(onSeek).toHaveBeenNthCalledWith(2, 10);
  });

  it('falls back to the currentTime prop when the live time is unknown', () => {
    const onSeek = jest.fn();
    render(<SeekStepButton direction="forward" currentTime={12} getCurrentTime={() => undefined} duration={60} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(onSeek).toHaveBeenCalledWith(17);
  });
});
