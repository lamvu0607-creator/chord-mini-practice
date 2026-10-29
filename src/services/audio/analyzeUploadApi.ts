/**
 * Client for /api/audio/upload: stores an uploaded file (or a clip cut in the browser)
 * and returns the `upload_<hex>` id used by /analyze/<id>.
 */

export class AnalyzeUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AnalyzeUploadError';
  }
}

export interface AnalyzeUploadResult {
  id: string;
  title: string;
}

export const ANALYZE_UPLOAD_MAX_MB = 100;
export const ANALYZE_UPLOAD_ACCEPT = '.mp3,.wav,.m4a,.flac,.ogg,.opus,.webm,.aac,audio/*';

/** Upload with progress (fetch cannot report upload progress). */
export function uploadAnalyzeAudio(
  file: File,
  options: { title?: string; onProgress?: (fraction: number) => void } = {},
): Promise<AnalyzeUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/audio/upload');
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new AnalyzeUploadError('Tải lên thất bại. Kiểm tra kết nối mạng.', 0));
    request.onload = () => {
      const payload = request.response ?? {};
      if (request.status >= 200 && request.status < 300 && payload.success) {
        resolve({ id: payload.id, title: payload.title });
        return;
      }
      const error = payload.error;
      const message = request.status === 401
        ? 'Bạn cần đăng nhập để tải file lên.'
        : typeof error === 'string' ? error : error?.message || `Tải lên thất bại (${request.status})`;
      reject(new AnalyzeUploadError(message, request.status));
    };
    const form = new FormData();
    form.append('file', file);
    if (options.title) form.append('title', options.title);
    request.send(form);
  });
}
