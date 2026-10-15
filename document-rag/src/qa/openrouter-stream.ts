import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

interface CompletionEvent {
  error?: { message?: string };
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

export async function* readOpenRouterTokens(
  stream: Readable,
): AsyncGenerator<string> {
  // readline preserves UTF-8 characters and lines split across network chunks.
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let hasTokens = false;
  try {
    for await (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        if (!hasTokens)
          throw new Error(
            'The model returned an empty answer. Please try again.',
          );
        return;
      }
      let parsed: CompletionEvent;
      try {
        parsed = JSON.parse(payload) as CompletionEvent;
      } catch {
        throw new Error(
          'The model returned an invalid streaming response. Please try again.',
        );
      }
      if (parsed.error || parsed.choices?.[0]?.finish_reason === 'error') {
        throw new Error(
          parsed.error?.message ||
            'The model provider interrupted the answer. Please try again.',
        );
      }
      const token = parsed.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token.length > 0) {
        hasTokens = true;
        yield token;
      }
    }
    throw new Error('The answer stream ended unexpectedly. Please try again.');
  } finally {
    lines.close();
    stream.destroy();
  }
}
