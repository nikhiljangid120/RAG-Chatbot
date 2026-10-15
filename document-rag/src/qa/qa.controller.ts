import { Controller, Post, Body, HttpCode, HttpStatus, Res, Query } from '@nestjs/common';
import type { Response } from 'express';
import { QaService } from './qa.service';
import { AskQuestionDto } from './ask-question.dto';

/**
 * QaController
 *
 * Exposes two endpoints:
 *   POST /qa/ask         — full response (waits for complete answer)
 *   POST /qa/ask/stream  — streaming SSE response (tokens arrive in real-time)
 */
@Controller('qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  /**
   * POST /qa/ask
   *
   * Standard (non-streaming) endpoint. Waits for the full LLM response
   * before returning. Use for API clients, scripts, or eval pipelines.
   *
   * Body:
   * {
   *   "question":   "What is the leave policy?",   // required
   *   "searchMode": "hybrid",                       // optional: 'vector' | 'hybrid' (default: 'hybrid')
   *   "minScore":   0.50                            // optional: only used when searchMode='vector'
   * }
   */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askQuestion(@Body() askQuestionDto: AskQuestionDto) {
    return this.qaService.askQuestion(
      askQuestionDto.question,
      askQuestionDto.minScore,
      askQuestionDto.searchMode,
    );
  }

  /**
   * POST /qa/ask/stream
   *
   * Streaming endpoint. Returns a Server-Sent Events (SSE) stream so the UI
   * can render tokens as they arrive — no more blank waiting screens.
   *
   * @Res() bypasses NestJS's response serialization so we can write raw SSE
   * to the underlying Express response object.
   *
   * Same body shape as POST /qa/ask:
   * {
   *   "question":   "What is the leave policy?",
   *   "searchMode": "hybrid",
   *   "minScore":   0.50
   * }
   *
   * SSE event protocol:
   *   data: {"type":"sources","sources":[...],"searchMode":"hybrid"}
   *   data: {"type":"token","token":"The "}
   *   data: {"type":"token","token":"leave "}
   *   ...
   *   data: [DONE]
   */
  @Post('ask/stream')
  async askStream(
    @Body() askQuestionDto: AskQuestionDto,
    @Res() res: Response,
  ) {
    return this.qaService.streamAnswer(
      askQuestionDto.question,
      res,
      askQuestionDto.minScore,
      askQuestionDto.searchMode,
    );
  }
}
