/**
 * Beats and beat-synchronous chords from one upload (backend POST /api/analyze).
 *
 * Returns null when the combined request is not usable (older backend without the
 * endpoint, a failed stage, no beats) so the caller can fall back to the separate
 * detect-beats + recognize-chords requests, which have their own model fallbacks and
 * error messages. Size and rate-limit errors are thrown: the fallback would fail too.
 */

import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import {
  normalizeBeatDetectionPayload,
  type BeatDetectionBackendResponse,
} from '@/services/audio/beatDetectionService';
import {
  parseChordRecognitionPayload,
  type DetailedChordRecognition,
} from '@/services/chord-analysis/chordService';
import type { ChordDetectorType } from '@/types/audioAnalysis';

export interface CombinedAnalysis {
  beatResults: BeatDetectionBackendResponse;
  chordRecognition: DetailedChordRecognition;
}

const TIMEOUT_MS = 800000;

export async function analyzeBeatsAndChords(
  audioFile: File,
  beatDetector: string,
  chordDetector: ChordDetectorType
): Promise<CombinedAnalysis | null> {
  const { getSafeChordModel } = await import('@/utils/modelFiltering');
  const chordModel = getSafeChordModel(chordDetector);

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('beat_detector', beatDetector);
  formData.append('chord_detector', chordModel);
  formData.append('chord_dict', chordModel === 'chord-cnn-lstm' ? 'full' : 'large_voca');
  if (beatDetector === 'beat-transformer') formData.append('force', 'true');

  let response: Response;
  try {
    response = await fetch('/api/analyze-audio', {
      method: 'POST',
      body: formData,
      signal: createSafeTimeoutSignal(TIMEOUT_MS),
    });
  } catch (e) {
    console.warn('Combined analysis request failed, using separate requests:', e);
    return null;
  }

  if (response.status === 413) {
    throw new Error('Audio file size exceeds server limits. Please use a smaller file.');
  }
  if (response.status === 429) {
    throw new Error('Rate limited: too many analysis requests. Please wait and try again.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data?.success) {
    console.warn(`Combined analysis unavailable (${response.status}${data?.stage ? `, ${data.stage}` : ''}): `
      + `${data?.error ?? 'no details'}; using separate requests`);
    return null;
  }

  const beats = data.beats;
  const chords = data.chords;
  if (!beats?.success || !Array.isArray(beats.beats) || !chords?.success || !Array.isArray(chords.chords)) {
    console.warn('Combined analysis returned an incomplete payload; using separate requests');
    return null;
  }
  const beatResults = normalizeBeatDetectionPayload(beats, beatDetector) as BeatDetectionBackendResponse;
  beatResults.beats = beatResults.beats.filter((t) => typeof t === 'number' && !isNaN(t) && t >= 0 && t <= 3600);
  if (beatResults.beats.length === 0) return null;

  return { beatResults, chordRecognition: parseChordRecognitionPayload(chords) };
}
