import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RetrievalService, RetrievedChunk } from '../retrieval/retrieval.service';
import { PromptBuilderService } from './prompt-builder.service';

// The OpenRouter model identifier for Llama 3.3 70B
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';

// OpenRouter API endpoint — OpenAI-compatible
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * QaService
 *
 * Responsibility: Orchestrate the complete RAG question-answering pipeline.
 *
 * Pipeline:
 *   1. Embed the user's question → 384-dim vector
 *   2. Retrieve top-K relevant chunks from pgvector
 *   3. Build a structured prompt with context + grounding rules
 *   4. Call Llama 3.3 via OpenRouter
 *   5. Return the answer with source citations
 *
 * RAG Role: This is the "Generation" step — the "G" in RAG.
 * It ties together Retrieval (Phase 4) and Embeddings (Phase 3)
 * and produces the final grounded answer.
 */
@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);
  private readonly openRouterApiKey: string;

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly retrievalService: RetrievalService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly configService: ConfigService,
  ) {
    // Read API key at startup — fail fast if missing
    const key = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!key) {
      throw new Error(
        'OPENROUTER_API_KEY is not set in .env. ' +
        'Get your key from https://openrouter.ai/keys',
      );
    }
    this.openRouterApiKey = key;
  }

  /**
   * Answer a natural language question using the RAG pipeline.
   *
   * @param question  The user's question string (e.g. "What is the leave policy?")
   */
  async askQuestion(question: string): Promise<{
    answer: string;
    question: string;
    sources: Array<{
      filename: string;
      chunkIndex: number;
      similarityScore: number;
    }>;
    model: string;
    chunksUsed: number;
  }> {
    if (!question || question.trim().length === 0) {
      throw new BadRequestException('Question cannot be empty.');
    }

    this.logger.log(`Processing question: "${question}"`);

    // ─── STEP 1: EMBED THE QUESTION ────────────────────────────────────────
    // Convert the question text into the same 384-dim vector space
    // as the stored chunk embeddings. This is what makes the similarity
    // search meaningful — apples compared to apples.
    this.logger.log('Embedding user question...');
    const queryEmbedding = await this.embeddingsService.generateEmbedding(question.trim());

    // ─── STEP 2: RETRIEVE RELEVANT CHUNKS ─────────────────────────────────
    // Find the 5 chunks whose embeddings are closest to the question embedding.
    // These chunks are the "knowledge" the LLM will use to answer.
    this.logger.log('Retrieving similar chunks from pgvector...');
    const retrievedChunks: RetrievedChunk[] = await this.retrievalService.findSimilarChunks(
      queryEmbedding,
      5, // top-K
    );

    // If no chunks are found, no documents have been uploaded yet
    if (retrievedChunks.length === 0) {
      return {
        answer:
          'No documents have been uploaded yet. ' +
          'Please upload a PDF using POST /documents/upload before asking questions.',
        question,
        sources: [],
        model: OPENROUTER_MODEL,
        chunksUsed: 0,
      };
    }

    this.logger.log(
      `Retrieved ${retrievedChunks.length} chunks. ` +
      `Top chunk from: "${retrievedChunks[0].documentFilename}" ` +
      `(similarity: ${(retrievedChunks[0].similarityScore * 100).toFixed(1)}%)`,
    );

    // ─── STEP 3: BUILD THE PROMPT ──────────────────────────────────────────
    // Construct two messages for the LLM:
    //   - system: grounding rules (answer ONLY from context)
    //   - user:   the context blocks + the actual question
    const systemPrompt = this.promptBuilderService.buildSystemPrompt();
    const userPrompt = this.promptBuilderService.buildUserPrompt(question, retrievedChunks);

    // ─── STEP 4: CALL LLAMA 3.3 VIA OPENROUTER ────────────────────────────
    // OpenRouter uses the OpenAI chat completion format.
    // Temperature=0.1 keeps answers factual and consistent (not creative).
    this.logger.log(`Sending prompt to ${OPENROUTER_MODEL} via OpenRouter...`);

    let answer: string;

    try {
      const response = await axios.post(
        OPENROUTER_API_URL,
        {
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          temperature: 0.1,    // Low = factual, consistent
          max_tokens: 1024,    // Enough for a detailed paragraph answer
        },
        {
          headers: {
            'Authorization':  `Bearer ${this.openRouterApiKey}`,
            'Content-Type':   'application/json',
            // OpenRouter requires these headers to identify your app
            'HTTP-Referer':   'http://localhost:3000',
            'X-Title':        'Document RAG System',
          },
          timeout: 30000, // 30 second timeout
        },
      );

      answer = response.data.choices[0]?.message?.content;

      if (!answer) {
        throw new Error('OpenRouter returned an empty response.');
      }
    } catch (error) {
      this.logger.error(
        `OpenRouter call failed: ${error?.response?.data?.error?.message ?? error.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to get answer from LLM: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }

    this.logger.log('Answer received from Llama 3.3.');

    // ─── STEP 5: RETURN ANSWER + SOURCES ──────────────────────────────────
    // Include source citations so the user knows which document the
    // answer came from. This is what makes the system explainable and auditable.
    return {
      answer,
      question,
      sources: retrievedChunks.map((chunk) => ({
        filename: chunk.documentFilename,
        chunkIndex: chunk.chunkIndex,
        similarityScore: parseFloat((chunk.similarityScore * 100).toFixed(2)),
      })),
      model: OPENROUTER_MODEL,
      chunksUsed: retrievedChunks.length,
    };
  }
}
