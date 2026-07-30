import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * POST /documents/upload
   * Accepts a PDF via multipart/form-data (field name must be "file").
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Keeps file in RAM — no disk temp files
    }),
  )
  async uploadDocument(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
          new FileTypeValidator({ fileType: 'application/pdf' }),   // PDF only
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.documentsService.uploadDocument(file);
  }

  /**
   * GET /documents
   * List all documents with their ingestion status.
   */
  @Get()
  async findAll() {
    return this.documentsService.findAll();
  }

  /**
   * GET /documents/:id
   * Get a single document with chunk count.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const document = await this.documentsService.findOne(id);
    if (!document) {
      throw new NotFoundException(`Document with id "${id}" not found.`);
    }
    return document;
  }
}
