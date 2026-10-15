import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Response } from 'express';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { PromptBuilderService } from './prompt-builder.service';
import { QaService } from './qa.service';

describe('QaService with retrieved document chunks', () => {
  const chunks = [
    {
      chunkId: 'chunk',
      content: 'Skills: TypeScript and PostgreSQL',
      chunkIndex: 0,
      metadata: null,
      documentId: 'doc',
      documentFilename: 'resume.pdf',
      similarityScore: 0.75,
      rrfScore: 0.03,
    },
  ];
  const post = jest.spyOn(axios, 'post');
  afterEach(() => post.mockReset());
  afterAll(() => post.mockRestore());

  function setup() {
    const service = new QaService(
      {
        generateEmbedding: jest.fn().mockResolvedValue([1, 0]),
      } as unknown as EmbeddingsService,
      {
        findHybridChunks: jest.fn().mockResolvedValue(chunks),
      } as unknown as RetrievalService,
      new PromptBuilderService(),
      new ConfigService({ OPENROUTER_API_KEY: 'test-key' }),
    );
    const response = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      status: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    });
    return { service, response, res: response as unknown as Response };
  }

  it('streams numeric cosine citations, tokens, and exactly one completion marker', async () => {
    post.mockResolvedValue({
      data: Readable.from([
        'data: {"choices":[{"delta":{"content":"TypeScript"}}]}\n\ndata: [DONE]\n\n',
      ]),
    });
    const { service, response, res } = setup();
    await service.streamAnswer('What skills?', res);
    const events = response.write.mock.calls.map(([event]: [string]) => event);
    expect(events[0]).toContain('"similarityScore":75');
    expect(events.join('')).toContain('"token":"TypeScript"');
    expect(
      events.filter((event: string) => event === 'data: [DONE]\n\n'),
    ).toHaveLength(1);
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('sends provider failures to the UI rather than silently ending', async () => {
    post.mockResolvedValue({
      data: Readable.from([
        'data: {"error":{"message":"Provider unavailable"}}\n\n',
      ]),
    });
    const { service, response, res } = setup();
    await service.streamAnswer('What skills?', res);
    expect(
      response.write.mock.calls.map(([event]: [string]) => event).join(''),
    ).toContain('"type":"error","message":"Provider unavailable"');
  });

  it('rejects provider error bodies returned with HTTP 200 on the nonstreaming path', async () => {
    post.mockResolvedValue({
      data: { error: { message: 'Insufficient credits' } },
    });
    const { service } = setup();
    await expect(service.askQuestion('What skills?')).rejects.toThrow(
      'Insufficient credits',
    );
  });
});
