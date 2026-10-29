import { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';

function createMockAudioBuffer(duration: number, sampleRate: number = 100): AudioBuffer {
  const totalSamples = Math.max(1, Math.floor(duration * sampleRate));
  const channelData = new Float32Array(totalSamples).fill(0.1);

  return {
    sampleRate,
    duration,
    getChannelData: jest.fn(() => channelData),
  } as unknown as AudioBuffer;
}

describe('DynamicsAnalyzer macro contour', () => {
  let analyzer: DynamicsAnalyzer;

  beforeEach(() => {
    analyzer = new DynamicsAnalyzer();
  });

  it('ramps up from a softer intro, stays full in the middle, and tapers in the outro', () => {
    analyzer.setParams({ bpm: 120, timeSignature: 4, totalDuration: 100 });

    const introStart = analyzer.getVelocityMultiplier(0);
    const introMid = analyzer.getVelocityMultiplier(6);
    const middle = analyzer.getVelocityMultiplier(50);
    const outroMid = analyzer.getVelocityMultiplier(94);
    const outroEnd = analyzer.getVelocityMultiplier(100);

    expect(introStart).toBeCloseTo(0.75 * 0.88, 2);
    expect(outroEnd).toBeCloseTo(0.75 * 0.88, 2);
    expect(introStart).toBeLessThan(introMid);
    expect(introMid).toBeLessThan(middle);
    expect(outroMid).toBeLessThan(middle);
    expect(outroEnd).toBeLessThan(outroMid);
    expect(Math.abs(introMid - introStart)).toBeLessThan(0.2);
    expect(Math.abs(outroMid - outroEnd)).toBeLessThan(0.2);
  });

  it('uses analyzed audio duration as a macro-contour fallback in audio-aware mode', () => {
    analyzer.analyzeBuffer(createMockAudioBuffer(10));

    const intro = analyzer.getVelocityMultiplier(0);
    const middle = analyzer.getVelocityMultiplier(5);
    const outro = analyzer.getVelocityMultiplier(10);

    expect(intro).toBeLessThan(middle);
    expect(outro).toBeLessThan(middle);
  });

  it('applies the same macro contour to export velocity calculations', () => {
    analyzer.setParams({ bpm: 120, timeSignature: 4, totalDuration: 16 });

    const intro = analyzer.getExportVelocity(1, 1, 'C');
    const middle = analyzer.getExportVelocity(8, 1, 'C');
    const outro = analyzer.getExportVelocity(15, 1, 'C');

    expect(intro).toBeLessThan(middle);
    expect(outro).toBeLessThan(middle);
  });
});
