import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { QaService } from './qa.service';
import { AskQuestionDto } from './ask-question.dto';

/**
 * QaController
 *
 * Exposes the POST /qa/ask endpoint.
 * Thin controller — delegates everything to QaService.
 */
@Controller('qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  /**
   * POST /qa/ask
   * Body: { "question": "What is the leave policy?" }
   */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askQuestion(@Body() askQuestionDto: AskQuestionDto) {
    return this.qaService.askQuestion(askQuestionDto.question);
  }
}
