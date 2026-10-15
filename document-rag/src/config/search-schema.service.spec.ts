import { DataSource } from 'typeorm';
import { SearchSchemaService } from './search-schema.service';

describe('SearchSchemaService', () => {
  function setup(query = jest.fn().mockResolvedValue([])) {
    const transaction = jest.fn(
      (work: (manager: { query: typeof query }) => Promise<void>) =>
        work({ query }),
    );
    const service = new SearchSchemaService({
      transaction,
    } as unknown as DataSource);
    return { service, query, transaction };
  }

  it('backfills only missing vectors and initializes the index in one transaction', async () => {
    const { service, query, transaction } = setup();
    await service.onApplicationBootstrap();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE "searchVector" IS NULL'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE INDEX IF NOT EXISTS'),
    );
  });

  it('rejects startup when schema initialization fails', async () => {
    const failure = new Error('database unavailable');
    const { service } = setup(jest.fn().mockRejectedValue(failure));
    await expect(service.onApplicationBootstrap()).rejects.toThrow(failure);
  });
});
