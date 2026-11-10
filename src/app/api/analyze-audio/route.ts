import { NextRequest, NextResponse } from 'next/server';
import { getPythonApiUrl } from '@/config/serverBackend';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * Beats + beat-synchronous chords in one backend request (Python POST /api/analyze).
 * The multipart body is forwarded unchanged; status and JSON are passed back so the
 * client can tell "endpoint missing" (404) from size/rate limits (413/429).
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const response = await fetch(`${getPythonApiUrl()}/api/analyze`, {
      method: 'POST',
      body: formData,
      signal: createSafeTimeoutSignal(800000),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: text.slice(0, 500) || `Backend returned ${response.status}` };
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Combined analysis proxy error:', message);
    const status = message.includes('timeout') || message.includes('aborted') ? 408 : 502;
    return NextResponse.json({ success: false, error: `Analysis request failed: ${message}` }, { status });
  }
}
