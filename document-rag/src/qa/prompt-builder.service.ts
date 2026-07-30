import { Injectable, Logger } from '@nestjs/common';
import { RetrievedChunk } from '../retrieval/retrieval.service';

/**
 * PromptBuilderService
 *
 * Responsibility: Assemble the final prompt string that goes to Llama 3.3.
 *
 * WHY THIS EXISTS:
 * The LLM needs two things to give a grounded answer:
 *   1. The retrieved text chunks (the "context" or "knowledge")
 *   2. Clear instructions to ONLY use that context — not hallucinate
 *
 * This service owns that construction logic, keeping QaService clean.
 *
 * RAG Role: This is the "Augmentation" step in Retrieval-Augmented Generation.
 * Without augmentation, the LLM answers from training data → hallucination.
 * With augmentation, the LLM answers from YOUR specific documents → grounded truth.
 */
@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  /**
   * Build a structured system prompt instructing the LLM to stay grounded.
   * This is sent as the "system" role in the chat completion request.
   */
  buildSystemPrompt(): string {
    return [
      'You are a precise and helpful assistant that answers questions based ONLY on the provided document context.',
      'Rules you must follow:',
      '1. Answer ONLY using information from the CONTEXT section below.',
      '2. If the answer is not in the context, respond with: "I could not find relevant information in the uploaded documents to answer this question."',
      '3. Do NOT use your general training knowledge to fill gaps.',
      '4. Be concise. Cite which document you found the information in.',
      '5. If multiple chunks from different documents are relevant, synthesize them clearly.',
    ].join('\n');
  }

  /**
   * Build the user-facing prompt that includes the retrieved context and the question.
   *
   * Format:
   *   CONTEXT:
   *   [Source: filename.pdf | Chunk #0 | Similarity: 0.92]
   *   <chunk text>
   *
   *   [Source: filename.pdf | Chunk #1 | Similarity: 0.88]
   *   <chunk text>
   *   ...
   *
   *   QUESTION:
   *   <user question>
   *
   * @param question        The user's natural language question
   * @param chunks          Top-K retrieved chunks from RetrievalService
   */
  buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
    // Format each retrieved chunk as a labelled context block
    const contextBlocks = chunks
      .map((chunk, index) => {
        const similarity = (chunk.similarityScore * 100).toFixed(1);
        return (
          `[Source: ${chunk.documentFilename} | Chunk #${chunk.chunkIndex} | Relevance: ${similarity}%]\n` +
          chunk.content
        );
      })
      .join('\n\n');

    return (
      `CONTEXT:\n${contextBlocks}\n\n` +
      `QUESTION:\n${question}`
    );
  }
}
