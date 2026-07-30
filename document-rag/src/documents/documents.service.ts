import { Injectable, ConflictException, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import { DocumentEntity } from './document.entity';
import { ChunkEntity } from './chunk.entity';
import { ChunkingService } from './chunking.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,

    @InjectRepository(ChunkEntity)
    private readonly chunkRepository: Repository<ChunkEntity>,

    private readonly dataSource: DataSource,

    private readonly chunkingService: ChunkingService,

    // Injected from EmbeddingsModule — converts chunk text into 384-dim vectors
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Orchestrates the full ingestion pipeline:
   * Hash → Duplicate Check → Save Document → Extract Text →
   * Chunk → Generate Embeddings → Save Chunks → Return Response
   */
  async uploadDocument(file: Express.Multer.File) {
    // ─── STAGE 2: HASH GENERATION ───────────────────────────────
    const hash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    this.logger.log(`Processing: "${file.originalname}" | Hash: ${hash.slice(0, 16)}...`);

    // ─── STAGE 3: DUPLICATE DETECTION ───────────────────────────
    const existing = await this.documentRepository.findOne({ where: { hash } });
    if (existing) {
      this.logger.warn(`Duplicate detected → existing id: ${existing.id}`);
      throw new ConflictException({
        message: 'This document has already been uploaded and processed.',
        documentId: existing.id,
        filename: existing.filename,
        status: existing.status,
      });
    }

    // ─── STAGE 4: SAVE DOCUMENT METADATA (PROCESSING) ───────────
    const document = this.documentRepository.create({
      filename: file.originalname,
      hash,
      status: 'PROCESSING',
    });
    await this.documentRepository.save(document);
    this.logger.log(`Document record created: ${document.id}`);

    // ─── STAGES 5–8: TEXT → CHUNKS → DB (with error safety net) ──
    try {
      // STAGE 5: TEXT EXTRACTION
      this.logger.log(`Extracting text from: ${file.originalname}`);
      const pdfData = await pdfParse(file.buffer);
      const extractedText: string = pdfData.text;

      if (!extractedText || extractedText.trim().length === 0) {
        await this.documentRepository.update(document.id, { status: 'FAILED' });
        return {
          success: false,
          documentId: document.id,
          message:
            'No extractable text found. This PDF may be a scanned image. ' +
            'Please upload a digitally-created PDF.',
        };
      }

      this.logger.log(`Extracted ${extractedText.length} characters`);

      // STAGE 6: CHUNKING
      const textChunks = this.chunkingService.chunkText(extractedText, 500, 100);

      if (textChunks.length === 0) {
        await this.documentRepository.update(document.id, { status: 'FAILED' });
        return {
          success: false,
          documentId: document.id,
          message: 'Document produced no text chunks after processing.',
        };
      }

      this.logger.log(`Created ${textChunks.length} chunks`);

      // ─── STAGE 7: GENERATE EMBEDDINGS (batch) ───────────────────
      // Extract just the text content from each chunk for batch processing.
      // Batch > one-by-one: 50 chunks = 1 model call, not 50.
      this.logger.log('Generating embeddings for all chunks...');
      const chunkTexts = textChunks.map((c) => c.content);
      const embeddings = await this.embeddingsService.generateEmbeddings(chunkTexts);
      this.logger.log(`Embeddings generated: ${embeddings.length} vectors (dim=384)`);

      // ─── STAGE 8: BUILD CHUNK ENTITIES WITH EMBEDDINGS ──────────
      // Assign the embedding vector to each chunk entity.
      // embeddings[i] corresponds exactly to textChunks[i].
      const chunkEntities: ChunkEntity[] = textChunks.map((chunk, i) => {
        const entity = new ChunkEntity();
        entity.content = chunk.content;
        entity.chunkIndex = chunk.chunkIndex;
        entity.metadata = chunk.metadata;
        entity.document = document;
        entity.embedding = embeddings[i]; // ← 384-dim vector from MiniLM
        return entity;
      });

      // ─── STAGE 9: BULK SAVE CHUNKS TO DB ────────────────────────
      await this.chunkRepository.save(chunkEntities);

      // ─── STAGE 10: MARK DOCUMENT AS COMPLETED ───────────────────
      await this.documentRepository.update(document.id, { status: 'COMPLETED' });
      this.logger.log(`Ingestion complete: ${textChunks.length} chunks saved with embeddings`);

      return {
        success: true,
        documentId: document.id,
        filename: file.originalname,
        status: 'COMPLETED',
        chunksCreated: textChunks.length,
        totalCharacters: extractedText.length,
        embeddingDimension: 384,
        message: 'Document uploaded, parsed, chunked, and embedded successfully.',
      };
    } catch (error) {
      this.logger.error(`Ingestion failed: ${error.message}`, error.stack);
      await this.documentRepository.update(document.id, { status: 'FAILED' });
      throw new InternalServerErrorException(`Document processing failed: ${error.message}`);
    }
  }

  /** GET /documents — List all documents with status */
  async findAll() {
    const documents = await this.documentRepository.find({
      order: { createdAt: 'DESC' },
    });
    return {
      count: documents.length,
      documents: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    };
  }

  /** GET /documents/:id — Single document with chunk count */
  async findOne(id: string) {
    const document = await this.documentRepository.findOne({
      where: { id },
      relations: { chunks: true },
    });
    if (!document) return null;
    return {
      id: document.id,
      filename: document.filename,
      status: document.status,
      chunkCount: document.chunks?.length ?? 0,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
