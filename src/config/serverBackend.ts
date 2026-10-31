const DEFAULT_PYTHON_API_URL = 'http://localhost:5001';
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_LOCAL_SHEETSAGE_API_URL = 'http://localhost:8082';
const DEFAULT_LOCAL_STEMS_API_URL = 'http://localhost:8083';
const DEFAULT_LOCAL_MUSCRIPTOR_API_URL = 'http://localhost:8084';
const DEFAULT_DOCKER_FRONTEND_URL = 'http://frontend:3000';

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isLocalUrl(candidateUrl: string | undefined): boolean {
  if (!candidateUrl) {
    return false;
  }

  try {
    const { hostname } = new URL(candidateUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return candidateUrl.includes('localhost') || candidateUrl.includes('127.0.0.1');
  }
}

export function getPythonApiUrl(): string {
  return process.env.PYTHON_API_URL || DEFAULT_PYTHON_API_URL;
}

export function getSheetSageApiUrl(): string {
  if (isProductionLikeEnvironment()) {
    return process.env.SHEETSAGE_API_URL || getPythonApiUrl();
  }

  const localSheetSageUrl = process.env.LOCAL_SHEETSAGE_API_URL || process.env.SHEETSAGE_API_URL;
  return localSheetSageUrl && isLocalUrl(localSheetSageUrl)
    ? localSheetSageUrl
    : DEFAULT_LOCAL_SHEETSAGE_API_URL;
}

export function getStemsApiUrl(): string {
  if (isProductionLikeEnvironment()) {
    return process.env.STEMS_API_URL || 'http://stems:8083';
  }

  const localStemsUrl = process.env.LOCAL_STEMS_API_URL || process.env.STEMS_API_URL;
  return localStemsUrl && isLocalUrl(localStemsUrl)
    ? localStemsUrl
    : DEFAULT_LOCAL_STEMS_API_URL;
}

export function getMuscriptorApiUrl(): string {
  if (isProductionLikeEnvironment()) {
    return process.env.MUSCRIPTOR_API_URL || 'http://muscriptor:8084';
  }

  const localMuscriptorUrl = process.env.LOCAL_MUSCRIPTOR_API_URL || process.env.MUSCRIPTOR_API_URL;
  return localMuscriptorUrl && isLocalUrl(localMuscriptorUrl)
    ? localMuscriptorUrl
    : DEFAULT_LOCAL_MUSCRIPTOR_API_URL;
}

export function getFrontendBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_FRONTEND_URL;
}

/** Frontend origin reachable from server-side code and sibling containers. */
export function getInternalFrontendUrl(): string {
  const fallback = isProductionLikeEnvironment() ? DEFAULT_DOCKER_FRONTEND_URL : DEFAULT_FRONTEND_URL;
  return (process.env.INTERNAL_FRONTEND_URL || fallback).replace(/\/+$/, '');
}

/** Rewrite a local audio URL (relative or with a public origin) to the internal frontend origin. */
export function toInternalAudioUrl(audioUrl: string): string {
  const internalBase = getInternalFrontendUrl();
  try {
    const parsed = new URL(audioUrl, internalBase);
    if (parsed.pathname === '/api/serve-local-audio' || parsed.pathname.startsWith('/api/audio/')) {
      return `${internalBase}${parsed.pathname}${parsed.search}`;
    }
  } catch { /* leave non-URL values for the caller to validate */ }
  return audioUrl;
}

function normalizeBaseUrl(candidateUrl: string | undefined): string | null {
  const trimmedUrl = candidateUrl?.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/+$/, '');
  } catch {
    return trimmedUrl.replace(/\/+$/, '');
  }
}

export function getYtMp3GoBaseUrl(): string | null {
  return normalizeBaseUrl(process.env.YT_MP3_GO_BASE_URL);
}

export function getYtMp3GoHostname(): string | null {
  const baseUrl = getYtMp3GoBaseUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

export function isLocalPythonApi(): boolean {
  const backendUrl = getPythonApiUrl();
  return backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
}
