import axios from 'axios';
import { Readable } from 'node:stream';

function providerMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('error' in value)) return;
  const detail = value.error;
  if (
    detail &&
    typeof detail === 'object' &&
    'message' in detail &&
    typeof detail.message === 'string'
  ) {
    return detail.message;
  }
}

export async function getOpenRouterError(error: unknown): Promise<string> {
  const fallback =
    error instanceof Error
      ? error.message
      : 'Unable to generate an answer. Please try again.';
  if (!axios.isAxiosError<unknown>(error)) return fallback;
  const data = error.response?.data;
  if (!(data instanceof Readable)) return providerMessage(data) || fallback;
  try {
    let body = '';
    for await (const part of data as AsyncIterable<Buffer>) {
      body += part.toString('utf8');
      if (body.length > 65536) break;
    }
    return providerMessage(JSON.parse(body) as unknown) || fallback;
  } catch {
    return fallback;
  } finally {
    data.destroy();
  }
}
