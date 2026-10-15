import { DataSource } from 'typeorm';
import { RetrievalService } from './retrieval.service';

describe('RetrievalService database score conversion', () => {
  function setup(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue(rows);
    return new RetrievalService({ query } as unknown as DataSource);
  }

  it('returns numeric hybrid scores for nonempty PostgreSQL numeric results', async () => {
    const service = setup([
      { chunkId: 'one', similarityScore: '0.745', rrfScore: '0.0327868852459' },
    ]);
    const chunks = await service.findHybridChunks([1, 0], 'skills');
    expect(chunks[0].similarityScore).toBe(0.745);
    expect(chunks[0].rrfScore).toBeCloseTo(0.0327868852459);
    expect(chunks[0].similarityScore.toFixed(2)).toBe('0.74');
  });

  it('normalizes vector-search scores too', async () => {
    const chunks = await setup([{ similarityScore: '0.8' }]).findSimilarChunks([
      1, 0,
    ]);
    expect(chunks[0].similarityScore).toBe(0.8);
  });

  it('handles empty results in both search modes', async () => {
    const service = setup([]);
    await expect(service.findHybridChunks([1, 0], 'skills')).resolves.toEqual(
      [],
    );
    await expect(service.findSimilarChunks([1, 0])).resolves.toEqual([]);
  });

  it('rejects invalid scores before formatting or passing them to the prompt', async () => {
    await expect(
      setup([{ similarityScore: 'NaN' }]).findSimilarChunks([1, 0]),
    ).rejects.toThrow('invalid retrieval score');
  });
});
