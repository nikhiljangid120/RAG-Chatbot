import { Readable } from 'node:stream';
import { readOpenRouterTokens } from './openrouter-stream';

async function tokens(parts: Buffer[] | string[]): Promise<string> {
  const output: string[] = [];
  for await (const token of readOpenRouterTokens(Readable.from(parts)))
    output.push(token);
  return output.join('');
}

describe('OpenRouter stream parser', () => {
  it('preserves UTF-8 tokens across byte boundaries and accepts CRLF', async () => {
    const input = Buffer.from(
      ': heartbeat\r\ndata: {"choices":[{"delta":{"content":"Résumé ✓"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
    );
    await expect(
      tokens(Array.from(input, (byte) => Buffer.from([byte]))),
    ).resolves.toBe('Résumé ✓');
  });

  it('surfaces provider error events instead of completing a blank answer', async () => {
    await expect(
      tokens([
        'data: {"error":{"message":"Insufficient credits"},"choices":[{"finish_reason":"error"}]}\n\n',
      ]),
    ).rejects.toThrow('Insufficient credits');
  });

  it('reports truncated streams', async () => {
    await expect(
      tokens(['data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n']),
    ).rejects.toThrow('ended unexpectedly');
  });

  it('rejects an empty answer', async () => {
    await expect(tokens(['data: [DONE]\n\n'])).rejects.toThrow('empty answer');
  });
});
