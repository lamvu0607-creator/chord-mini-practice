export const GEMINI_MODEL_NAME = 'gemini-3.1-flash-lite';
export const GEMINI_DEFAULT_TIMEOUT_MS = 120000;

export interface GeminiGenerateContentRequest {
  model: string;
  contents: string;
  config?: {
    thinkingConfig?: { thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' };
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  };
}

export interface GeminiClient {
  models: {
    generateContent(request: GeminiGenerateContentRequest): Promise<{ text: string }>;
  };
}

const serverClients = new Map<number, GeminiClient>();

interface GeminiClientOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export function createGeminiClient({
  apiKey,
  timeoutMs = GEMINI_DEFAULT_TIMEOUT_MS
}: GeminiClientOptions = {}): GeminiClient | null {
  const resolvedApiKey = apiKey ?? process.env.GEMINI_API_KEY;

  if (!resolvedApiKey) {
    return null;
  }

  if (!apiKey) {
    const cachedClient = serverClients.get(timeoutMs);
    if (cachedClient) {
      return cachedClient;
    }
  }

  const client: GeminiClient = {
    models: {
      async generateContent(request) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': resolvedApiKey },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: request.contents }] }],
              ...(request.config ? { generationConfig: request.config } : {}),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        const payload = await response.json().catch(() => ({})) as {
          error?: { message?: string };
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        if (!response.ok) {
          throw new Error(payload.error?.message || `Gemini request failed (${response.status})`);
        }
        const text = payload.candidates?.[0]?.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text || '')
          .join('') || '';
        return { text };
      },
    },
  };

  if (!apiKey) {
    serverClients.set(timeoutMs, client);
  }

  return client;
}
