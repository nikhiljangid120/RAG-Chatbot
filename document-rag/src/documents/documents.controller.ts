import { Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseFilePipe, Post, UploadedFile, UseGuards, UseInterceptors, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile(new ParseFilePipe({ validators: [
      new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
      new FileTypeValidator({ fileType: 'application/pdf' }),
    ] })) file: Express.Multer.File,
  ) { return this.documentsService.uploadDocument(file, user.id); }

  @Get() findAll(@CurrentUser() user: AuthUser) { return this.documentsService.findAll(user.id); }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const document = await this.documentsService.findOne(id, user.id);
    if (!document) throw new NotFoundException(`Document with id "${id}" not found.`);
    return document;
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.documentsService.remove(id, user.id);
    return { success: true };
  }
}
