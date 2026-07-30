import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * EmbeddingsService
 *
 * Uses Transformers.js (Xenova/all-MiniLM-L6-v2) to generate
 * 384-dimensional semantic vectors from text strings.
 *
 * The model is loaded ONCE when the NestJS module boots (OnModuleInit),
 * then reused for every embedding request — no repeated loading overhead.
 *
 * RAG Role: Converts raw text into vectors so pgvector can do
 * cosine similarity search. Without embeddings, retrieval is impossible.
 */
@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  // The pipeline is the loaded model, stored as a class property
  // so it is initialized once and reused across all calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any = null;

  /**
   * OnModuleInit runs automatically when NestJS finishes booting this module.
   * We load the model here so the first real request does NOT wait for it.
   *
   * First run: downloads ~23MB model files and caches them locally.
   * Subsequent runs: loads from cache instantly (< 1 second).
   */
  async onModuleInit() {
    this.logger.log('Loading Xenova/all-MiniLM-L6-v2 model...');

    // Dynamic import is required because @xenova/transformers is an ESM package.
    // NestJS uses CommonJS, so we must use import() instead of require().
    const { pipeline } = await import('@xenova/transformers');

    this.extractor = await pipeline(
      'feature-extraction',        // Task type: extract feature vectors from text
      'Xenova/all-MiniLM-L6-v2',  // Model: MiniLM → outputs 384-dim vectors
    );

    this.logger.log('Model loaded and ready. Embedding dimension: 384');
  }

  /**
   * Generate a single 384-dimensional embedding for one text string.
   *
   * The pipeline runs the text through the transformer model,
   * then mean-pools all token embeddings into one 384-number vector.
   *
   * @param text  Any string (chunk content or a user question)
   * @returns     number[384] — a vector representing the semantic meaning of the text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Embedding model is not loaded yet. OnModuleInit may not have completed.');
    }

    // pooling: 'mean' averages all token embeddings into one vector
    // normalize: true scales the vector to unit length (required for cosine similarity)
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });

    // output.data is a Float32Array — convert to plain number[] for TypeORM/pgvector
    return Array.from(output.data as Float32Array);
  }

  /**
   * Generate embeddings for multiple texts in a single batch.
   *
   * WHY BATCH: If a document has 50 chunks, calling generateEmbedding()
   * 50 times would be slow. This method processes all texts in one pass.
   *
   * @param texts   Array of strings (all chunk contents from one document)
   * @returns       number[][] — one 384-dim vector per input text
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('Embedding model is not loaded yet.');
    }

    this.logger.log(`Generating embeddings for ${texts.length} texts...`);

    // Process all texts in parallel using Promise.all
    // Transformers.js handles each call internally with the cached model
    const embeddings = await Promise.all(
      texts.map((text) => this.generateEmbedding(text)),
    );

    this.logger.log(`Generated ${embeddings.length} embeddings (dim=384)`);
    return embeddings;
  }
}
