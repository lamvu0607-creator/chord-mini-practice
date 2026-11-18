import React from 'react';
import { render, screen } from '@testing-library/react';

const isDevelopmentEnvironment = jest.fn();

jest.mock('@/utils/modelFiltering', () => ({
  isDevelopmentEnvironment: () => isDevelopmentEnvironment(),
}));

import AnalyzeEmptyState from '@/app/analyze/[videoId]/_components/AnalyzeEmptyState';

describe('AnalyzeEmptyState', () => {
  beforeEach(() => {
    isDevelopmentEnvironment.mockReturnValue(false);
  });

  it('shows the queue position and estimated wait while queued', () => {
    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
        queuePosition={2}
        estimatedWaitSeconds={45}
        statusMessage="Downloading audio"
      />,
    );

    expect(screen.getByText('Waiting in queue')).toBeInTheDocument();
    expect(screen.getByText('Downloading audio')).toBeInTheDocument();
    expect(screen.getByText('Position 2 · Estimated wait ~45s')).toBeInTheDocument();
  });

  it('keeps the wait panel visible after extraction and while backend inference runs', () => {
    const { rerender } = render(<AnalyzeEmptyState isExtracted queueStatus={null} />);
    expect(screen.getByText('Analyzing audio')).toBeInTheDocument();

    rerender(<AnalyzeEmptyState isExtracted isAnalyzing queueStatus={null} />);
    expect(screen.getByText('Analyzing audio')).toBeInTheDocument();
  });

  it('shows the wait panel while cached results are ready but unopened', () => {
    render(<AnalyzeEmptyState isExtracted fromCache hasCachedAnalysis queueStatus={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the normal empty state once analysis is loaded', () => {
    render(<AnalyzeEmptyState isExtracted isAnalyzed queueStatus={null} />);
    expect(screen.getByText('No analysis loaded yet')).toBeInTheDocument();
  });

  it('keeps the normal empty state in development', () => {
    isDevelopmentEnvironment.mockReturnValue(true);

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
        queuePosition={1}
        estimatedWaitSeconds={30}
      />,
    );

    expect(screen.getByText('No analysis loaded yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
