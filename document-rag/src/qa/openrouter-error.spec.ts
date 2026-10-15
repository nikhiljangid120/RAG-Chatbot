import { Readable } from 'node:stream';
import { getOpenRouterError } from './openrouter-error';

describe('OpenRouter HTTP error handling', () => {
  it('reads the actual JSON error from an unsuccessful streamed HTTP response', async () => {
    const error = Object.assign(
      new Error('Request failed with status code 402'),
      {
        isAxiosError: true,
        response: {
          data: Readable.from([
            Buffer.from('{"error":{"message":"Insufficient credits"}}'),
          ]),
        },
      },
    );
    await expect(getOpenRouterError(error)).resolves.toBe(
      'Insufficient credits',
    );
  });

  it('uses the HTTP error when the response body is not JSON', async () => {
    const error = Object.assign(
      new Error('Request failed with status code 502'),
      {
        isAxiosError: true,
        response: {
          data: Readable.from([Buffer.from('<html>Bad gateway</html>')]),
        },
      },
    );
    await expect(getOpenRouterError(error)).resolves.toBe(error.message);
  });
});
