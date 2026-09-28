import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { QaService } from './qa.service';
import { AskQuestionDto } from './ask-question.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { RateLimitGuard } from './rate-limit.guard';

@Controller('qa')
@UseGuards(AuthGuard, RateLimitGuard)
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  askQuestion(@CurrentUser() user: AuthUser, @Body() body: AskQuestionDto) {
    return this.qaService.askQuestion(body.question, user.id, body.documentIds ?? [], body.sessionId);
  }

  @Post('stream')
  async streamQuestion(@CurrentUser() user: AuthUser, @Body() body: AskQuestionDto, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    try {
      const result = await this.qaService.streamQuestion(
        body.question,
        user.id,
        body.documentIds ?? [],
        body.sessionId,
        (content) => response.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`),
      );
      response.write(`data: ${JSON.stringify({ type: 'sources', sources: result.sources })}\n\n`);
      response.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Streaming failed.';
      response.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      response.end();
    }
  }
}
