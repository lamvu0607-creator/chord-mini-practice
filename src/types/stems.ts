export type StemSourceType = 'youtube' | 'upload';
export type StemSetStatus = 'pending' | 'ready';
export type StemJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/** Stem names produced by the separation model. Kept open so extra stems can be added later. */
export type StemName = 'vocals' | 'drums' | 'bass' | 'other' | (string & {});

export const STEM_DISPLAY_ORDER: StemName[] = ['vocals', 'drums', 'bass', 'other'];

export interface StemFile {
  name: StemName;
  file: string;
  bytes: number;
  /** Streaming URL served by the frontend (`/api/stems/<sourceId>/<name>`). */
  url: string;
}

export interface StemSet {
  sourceId: string;
  sourceType: StemSourceType;
  videoId?: string;
  title?: string;
  status: StemSetStatus;
  model?: string;
  duration?: number;
  stems: StemFile[];
  totalBytes: number;
  createdAtMs: number;
  updatedAtMs: number;
  /** True when the current viewer may delete the set (upload owner or admin). */
  canDelete?: boolean;
}

export interface StemJob {
  jobId: string;
  sourceId: string;
  status: StemJobStatus;
  error?: string | null;
  attemptCount: number;
  /** 0..1 while processing, when the stems service reports it. */
  progress?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StemJobResponse {
  success: boolean;
  job?: StemJob;
  stemSet?: StemSet;
  error?: string;
}
