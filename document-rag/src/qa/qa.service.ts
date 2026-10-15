import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Response } from 'express';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import {
  RetrievalService,
  RetrievedChunk,
} from '../retrieval/retrieval.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SearchMode } from './ask-question.dto';

// The OpenRouter model identifier for Llama 3.3 70B
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';
// OpenRouter API endpoint — OpenAI-compatible
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Default minimum cosine similarity score for chunk retrieval.
 *
 * Any chunk whose similarity to the user's question falls below this value
 * is discarded before reaching the LLM. This prevents feeding irrelevant
 * context to the model, which can cause confused or hallucinated answers.
 *
 * Value rationale (0.50):
 *   - Below 0.40 → chunks are likely thematically unrelated to the query
 *   - 0.40 – 0.55 → loosely related (good for broad exploratory questions)
 *   - 0.55 – 0.70 → strongly related (recommended for factual Q&A)
 *   - Above 0.75 → near-identical match (too strict for most use cases)
 *
 * Callers can override this per-request via the AskQuestionDto.minScore field.
 */
const DEFAULT_MIN_SCORE = 0.5;

/**
 * Default search mode — hybrid catches exact terms that pure vector search misses.
 */
const DEFAULT_SEARCH_MODE: SearchMode = 'hybrid';

/**
 * QaService
 *
 * Responsibility: Orchestrate the complete RAG question-answering pipeline.
 *
 * Pipeline:
 *   1. Embed the user's question → 384-dim vector
 *   2. Retrieve top-K relevant chunks — VECTOR or HYBRID mode
 *   3. If no chunks pass the threshold → return early WITHOUT calling the LLM
 *   4. Build a structured prompt with context + grounding rules
 *   5. Call Llama 3.3 via OpenRouter
 *   6. Return the answer with source citations + retrieval metadata
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
   * @param minScore  Minimum cosine similarity for retrieved chunks (default: 0.50)
   *                  Chunks scoring below this are discarded before the LLM is called.
   */
  async askQuestion(
    question: string,
    minScore: number = DEFAULT_MIN_SCORE,
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<{
    answer: string;
    question: string;
    sources: Array<{
      filename: string;
      chunkIndex: number;
      similarityScore: number;
    }>;
    model: string;
    chunksUsed: number;
    thresholdApplied: number;
    belowThreshold: boolean;
    searchMode: SearchMode;
  }> {
    if (!question || question.trim().length === 0) {
      throw new BadRequestException('Question cannot be empty.');
    }

    // Clamp minScore to a safe [0, 1] range as a defensive guard
    const safeMinScore = Math.min(Math.max(minScore, 0), 1);

    this.logger.log(
      `Processing question: "${question}" | mode=${searchMode} | minScore=${safeMinScore}`,
    );

    // ─── STEP 1: EMBED THE QUESTION ────────────────────────────────────────
    // Convert the question text into the same 384-dim vector space
    // as the stored chunk embeddings. This is what makes the similarity
    // search meaningful — apples compared to apples.
    this.logger.log('Embedding user question...');
    const queryEmbedding = await this.embeddingsService.generateEmbedding(
      question.trim(),
    );

    // ─── STEP 2: RETRIEVE RELEVANT CHUNKS ─────────────────────────────────
    // Route to the appropriate retrieval strategy:
    //
    //   'hybrid' → findHybridChunks()  — vector + BM25 merged by RRF
    //              Best for: exact terms, codes, section references, names
    //              minScore threshold is NOT applied (RRF rank governs quality)
    //
    //   'vector' → findSimilarChunks() — cosine similarity only
    //              Best for: conceptual/semantic questions
    //              minScore threshold IS applied (chunks below it are discarded)
    this.logger.log(`Retrieving chunks via ${searchMode} search...`);
    const retrievedChunks: RetrievedChunk[] =
      searchMode === 'hybrid'
        ? await this.retrievalService.findHybridChunks(
            queryEmbedding,
            question.trim(), // raw text for BM25
            5, // top-K final results after RRF merge
          )
        : await this.retrievalService.findSimilarChunks(
            queryEmbedding,
            5,
            safeMinScore,
          );

    // ─── EARLY EXIT A: No documents uploaded ──────────────────────────────
    // This branch is hit when the chunks table is completely empty.
    // We check for this by trying without threshold first — but since we
    // already pass a threshold, an empty result here could mean either case.
    // We add a quick COUNT check only when retrievedChunks is empty.
    if (retrievedChunks.length === 0) {
      // Distinguish between "no docs at all" vs "no docs above threshold"
      // by re-querying with minScore=0 to check if ANY chunks exist.
      const anyChunks: RetrievedChunk[] =
        await this.retrievalService.findSimilarChunks(
          queryEmbedding,
          1,
          0, // no threshold — just check if anything exists
        );

      if (anyChunks.length === 0) {
        // ── CASE A: No documents have been uploaded at all ────────────────
        this.logger.warn(
          'No documents in the database. Returning upload prompt.',
        );
        return {
          answer:
            'No documents have been uploaded yet. ' +
            'Please upload a PDF using POST /documents/upload before asking questions.',
          question,
          sources: [],
          model: OPENROUTER_MODEL,
          chunksUsed: 0,
          thresholdApplied: safeMinScore,
          belowThreshold: false,
          searchMode,
        };
      }

      // ── CASE B: Documents exist but nothing matched the threshold ─────────
      // This is the core benefit of the threshold filter:
      // We return a clear "not found" message WITHOUT spending any API tokens
      // on the LLM. The best available chunk's score is logged for debugging.
      const bestAvailable = anyChunks[0];
      this.logger.warn(
        `All chunks scored below threshold. ` +
          `Best available similarity: ${bestAvailable.similarityScore.toFixed(4)} ` +
          `(threshold: ${safeMinScore}). Skipping LLM call.`,
      );

      return {
        answer:
          searchMode === 'hybrid'
            ? `I could not find relevant information in the uploaded documents for your question. ` +
              `The keyword and semantic search found no strong matches. ` +
              `Try rephrasing your question or upload documents that contain this information.`
            : `I could not find sufficiently relevant information in the uploaded documents to answer your question. ` +
              `The most similar content found had a relevance score of ${(bestAvailable.similarityScore * 100).toFixed(1)}%, ` +
              `which is below the required threshold of ${(safeMinScore * 100).toFixed(0)}%. ` +
              `Try rephrasing your question or upload documents that contain this information.`,
        question,
        sources: [],
        model: OPENROUTER_MODEL,
        chunksUsed: 0,
        thresholdApplied: safeMinScore,
        belowThreshold: true,
        searchMode,
      };
    }

    this.logger.log(
      `Retrieved ${retrievedChunks.length} chunks above threshold. ` +
        `Top chunk from: "${retrievedChunks[0].documentFilename}" ` +
        `(similarity: ${(retrievedChunks[0].similarityScore * 100).toFixed(1)}%)`,
    );

    // ─── STEP 3: BUILD THE PROMPT ──────────────────────────────────────────
    // Construct two messages for the LLM:
    //   - system: grounding rules (answer ONLY from context)
    //   - user:   the context blocks + the actual question
    const systemPrompt = this.promptBuilderService.buildSystemPrompt();
    const userPrompt = this.promptBuilderService.buildUserPrompt(
      question,
      retrievedChunks,
    );

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
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1, // Low = factual, consistent
          max_tokens: 1024, // Enough for a detailed paragraph answer
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            // OpenRouter requires these headers to identify your app
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Document RAG System',
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

    // ─── STEP 5: RETURN ANSWER + SOURCES + METADATA ───────────────────────
    // Include source citations so the user knows which document the
    // answer came from. This is what makes the system explainable and auditable.
    // Also return thresholdApplied so clients can log/display it.
    return {
      answer,
      question,
      sources: retrievedChunks.map((chunk) => ({
        filename: chunk.documentFilename,
        chunkIndex: chunk.chunkIndex,
        similarityScore: parseFloat((chunk.similarityScore * 100).toFixed(4)),
      })),
      model: OPENROUTER_MODEL,
      chunksUsed: retrievedChunks.length,
      thresholdApplied: safeMinScore,
      belowThreshold: false,
      searchMode,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING METHOD — POST /qa/ask/stream
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Streaming variant of askQuestion().
   *
   * WHY STREAMING:
   * The non-streaming endpoint waits 5–15 seconds for the full LLM response
   * before sending anything to the client. This feels broken even when working.
   * Server-Sent Events (SSE) streams tokens as they're generated, making the
   * interface feel instant and alive from the first word.
   *
   * HOW SSE WORKS:
   * 1. Server sets Content-Type: text/event-stream
   * 2. Server writes "data: <payload>\n\n" for each event
   * 3. Client reads the stream incrementally via fetch() + ReadableStream
   * 4. Connection stays open until server writes "data: [DONE]\n\n"
   *
   * EVENT PROTOCOL (what we emit on the wire):
   *   data: {"type":"sources","sources":[...],"searchMode":"hybrid"}\n\n
   *     → Sent FIRST, before any tokens. UI renders source badges immediately.
   *
   *   data: {"type":"token","token":"The "}\n\n
   *   data: {"type":"token","token":"leave "}\n\n
   *   ... (one event per LLM token delta)
   *
   *   data: [DONE]\n\n
   *     → Standard OpenAI-compatible stream terminator.
   *
   * @param question   The user's raw question string
   * @param res        Express Response object (raw — NestJS @Res() decorator)
   * @param minScore   Minimum cosine similarity threshold (vector mode only)
   * @param searchMode 'hybrid' | 'vector'
   */
  async streamAnswer(
    question: string,
    res: Response,
    minScore: number = DEFAULT_MIN_SCORE,
    searchMode: SearchMode = DEFAULT_SEARCH_MODE,
  ): Promise<void> {
    if (!question || question.trim().length === 0) {
      res.status(400).json({ message: 'Question cannot be empty.' });
      return;
    }

    const safeMinScore = Math.min(Math.max(minScore, 0), 1);

    this.logger.log(
      `[STREAM] "${question}" | mode=${searchMode} | minScore=${safeMinScore}`,
    );

    // ─── SSE HEADERS ────────────────────────────────────────────────────────
    // These headers tell the browser this is a live event stream:
    //   text/event-stream  → SSE MIME type
    //   no-cache           → prevents proxy/browser from buffering
    //   keep-alive         → keeps TCP connection open for streaming
    //   no-transform       → prevents CDN gzip which breaks streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders(); // flush headers immediately

    // Helper: write a single SSE event to the response
    const emit = (payload: object | string) => {
      const data =
        typeof payload === 'string' ? payload : JSON.stringify(payload);
      res.write(`data: ${data}\n\n`);
    };

    try {
      // ─── STEP 1: EMBED ─────────────────────────────────────────────────────
      this.logger.log('[STREAM] Embedding question...');
      const queryEmbedding = await this.embeddingsService.generateEmbedding(
        question.trim(),
      );

      // ─── STEP 2: RETRIEVE ──────────────────────────────────────────────────
      this.logger.log(`[STREAM] Retrieving chunks via ${searchMode} search...`);
      const retrievedChunks: RetrievedChunk[] =
        searchMode === 'hybrid'
          ? await this.retrievalService.findHybridChunks(
              queryEmbedding,
              question.trim(),
              5,
            )
          : await this.retrievalService.findSimilarChunks(
              queryEmbedding,
              5,
              safeMinScore,
            );

      // ─── EARLY EXIT: no chunks ─────────────────────────────────────────────
      if (retrievedChunks.length === 0) {
        const anyChunks = await this.retrievalService.findSimilarChunks(
          queryEmbedding,
          1,
          0,
        );
        const noDocsMsg =
          anyChunks.length === 0
            ? 'No documents have been uploaded yet. Please upload a PDF first.'
            : 'I could not find relevant information in the uploaded documents for your question. Try rephrasing or upload relevant documents.';

        // Emit sources event (empty) then stream the message as tokens
        emit({ type: 'sources', sources: [], searchMode });
        for (const word of noDocsMsg.split(' ')) {
          emit({ type: 'token', token: word + ' ' });
        }
        emit('[DONE]');
        res.end();
        return;
      }

      // ─── STEP 3: EMIT SOURCES EVENT ────────────────────────────────────────
      // Send source citations BEFORE the first token so the UI can render
      // source badges while the answer is still streaming in.
      emit({
        type: 'sources',
        sources: retrievedChunks.map((c) => ({
          filename: c.documentFilename,
          chunkIndex: c.chunkIndex,
          similarityScore: parseFloat((c.similarityScore * 100).toFixed(4)),
        })),
        searchMode,
        chunksUsed: retrievedChunks.length,
      });

      this.logger.log(
        `[STREAM] ${retrievedChunks.length} chunks retrieved. ` +
          `Top: "${retrievedChunks[0].documentFilename}" (${(retrievedChunks[0].similarityScore * 100).toFixed(1)}%). ` +
          `Opening token stream to OpenRouter...`,
      );

      // ─── STEP 4: BUILD PROMPT ──────────────────────────────────────────────
      const systemPrompt = this.promptBuilderService.buildSystemPrompt();
      const userPrompt = this.promptBuilderService.buildUserPrompt(
        question,
        retrievedChunks,
      );

      // ─── STEP 5: CALL OPENROUTER WITH stream: true ─────────────────────────
      // OpenRouter streams OpenAI-compatible SSE chunks:
      //   data: {"choices":[{"delta":{"content":"The "}}]}
      //   data: {"choices":[{"delta":{"content":"leave "}}]}
      //   data: [DONE]
      //
      // We use axios with responseType:'stream' to get a Node.js Readable stream
      // from the HTTP response, then process it line-by-line.
      const streamResponse = await axios.post(
        OPENROUTER_API_URL,
        {
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1024,
          stream: true, // ← STREAMING ENABLED
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Document RAG System',
          },
          responseType: 'stream', // ← Axios returns a Node.js Readable
          timeout: 60000, // longer timeout for streaming
        },
      );

      // ─── STEP 6: PARSE SSE STREAM AND FORWARD TOKENS ──────────────────────
      // OpenRouter sends raw SSE lines. We accumulate incomplete lines
      // across chunks using a buffer, then parse each complete line.
      let buffer = '';

      await new Promise<void>((resolve, reject) => {
        streamResponse.data.on('data', (chunk: Buffer) => {
          // Append raw bytes to our line buffer
          buffer += chunk.toString('utf8');

          // Split on newlines — SSE events are separated by \n\n
          const lines = buffer.split('\n');

          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and SSE comment lines
            if (!trimmed || trimmed.startsWith(':')) continue;

            // Each SSE data line starts with "data: "
            if (!trimmed.startsWith('data: ')) continue;

            const payload = trimmed.slice(6); // strip "data: " prefix

            // [DONE] is the end-of-stream sentinel (OpenAI SSE convention)
            if (payload === '[DONE]') {
              emit('[DONE]');
              resolve();
              return;
            }

            // Parse the JSON delta and extract the token text
            try {
              const parsed = JSON.parse(payload);
              const token: string | undefined =
                parsed?.choices?.[0]?.delta?.content;

              // Only emit non-empty tokens (some deltas carry role info, not text)
              if (token) {
                emit({ type: 'token', token });
              }
            } catch {
              // Malformed JSON line — skip silently (can happen at stream boundaries)
            }
          }
        });

        streamResponse.data.on('end', () => {
          // Stream ended cleanly without a [DONE] sentinel (shouldn't happen, but guard)
          emit('[DONE]');
          resolve();
        });

        streamResponse.data.on('error', (err: Error) => {
          this.logger.error(`[STREAM] OpenRouter stream error: ${err.message}`);
          reject(err);
        });
      });

      this.logger.log('[STREAM] Token stream complete.');
    } catch (error) {
      // Emit an error event so the UI can display it gracefully
      this.logger.error(`[STREAM] Error: ${error?.message}`);
      try {
        emit({
          type: 'error',
          message: error?.response?.data?.error?.message ?? error.message,
        });
        emit('[DONE]');
      } catch {
        // Response may already be partially written — nothing more we can do
      }
    } finally {
      res.end();
    }
  }
}
