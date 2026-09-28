import { Injectable } from '@nestjs/common';
import { RetrievedChunk } from '../retrieval/retrieval.service';

@Injectable()
export class PromptBuilderService {
  buildSystemPrompt(): string {
    return [
      'Answer only from the supplied document context.',
      'If the context is insufficient, say you could not find enough relevant information.',
      'Do not fill gaps with general knowledge.',
      'Be concise and cite the source filename and page number when available.',
    ].join('\n');
  }

  buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
    const context = chunks.map((chunk) =>
      `[Source: ${chunk.documentFilename} | Page: ${chunk.metadata?.pageNumber ?? 'unknown'} | Relevance: ${(Number(chunk.similarityScore) * 100).toFixed(1)}%]\n${chunk.content}`,
    ).join('\n\n');
    return `CONTEXT:\n${context}\n\nQUESTION:\n${question}`;
  }
}
