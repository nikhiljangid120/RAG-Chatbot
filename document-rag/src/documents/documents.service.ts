import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(ChunkEntity) private readonly chunks: Repository<ChunkEntity>,
    private readonly chunking: ChunkingService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async uploadDocument(file: Express.Multer.File, ownerId: string) {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new ConflictException('The uploaded file is not a valid PDF.');
    }

    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.documents.findOne({ where: { hash, ownerId } });
    if (existing) {
      throw new ConflictException({
        message: 'This document has already been uploaded.',
        documentId: existing.id,
        filename: existing.filename,
        status: existing.status,
      });
    }

    const document = await this.documents.save(this.documents.create({
      filename: file.originalname,
      hash,
      ownerId,
      status: 'PROCESSING',
    }));

    try {
      const pages: string[] = [];
      const pdfData = await pdfParse(file.buffer, {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
          pages.push(text);
          return text;
        },
      });

      const pageTexts = pages.length > 0 ? pages : [pdfData.text];
      const textChunks = pageTexts.flatMap((text, pageIndex) =>
        this.chunking.chunkText(text, 500, 100).map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata, pageNumber: pageIndex + 1 },
        })),
      );

      if (textChunks.length === 0) {
        await this.documents.update(document.id, { status: 'FAILED', pageCount: pdfData.numpages ?? 0 });
        return { success: false, documentId: document.id, message: 'No extractable text was found in this PDF.' };
      }

      const vectors = await this.embeddings.generateEmbeddings(textChunks.map((chunk) => chunk.content));
      await this.chunks.save(textChunks.map((chunk, index) => this.chunks.create({
        content: chunk.content,
        chunkIndex: index,
        metadata: chunk.metadata,
        document,
        embedding: vectors[index],
      })));

      await this.documents.update(document.id, { status: 'COMPLETED', pageCount: pdfData.numpages ?? pageTexts.length });
      return {
        success: true,
        documentId: document.id,
        filename: document.filename,
        status: 'COMPLETED',
        pages: pdfData.numpages ?? pageTexts.length,
        chunksCreated: textChunks.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      this.logger.error(`Ingestion failed: ${message}`);
      await this.documents.update(document.id, { status: 'FAILED' });
      throw new InternalServerErrorException(`Document processing failed: ${message}`);
    }
  }

  async findAll(ownerId: string) {
    const documents = await this.documents.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
    return { count: documents.length, documents: documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      status: document.status,
      pageCount: document.pageCount,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })) };
  }

  async findOne(id: string, ownerId: string) {
    const document = await this.documents.findOne({ where: { id, ownerId }, relations: { chunks: true } });
    if (!document) return null;
    return {
      id: document.id,
      filename: document.filename,
      status: document.status,
      pageCount: document.pageCount,
      chunkCount: document.chunks?.length ?? 0,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async remove(id: string, ownerId: string) {
    const document = await this.documents.findOne({ where: { id, ownerId } });
    if (!document) throw new NotFoundException('Document not found.');
    await this.documents.remove(document);
  }
}
