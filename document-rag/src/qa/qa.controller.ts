import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { QaService } from './qa.service';
import { AskQuestionDto } from './ask-question.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@Controller('qa')
@UseGuards(AuthGuard)
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  askQuestion(@CurrentUser() user: AuthUser, @Body() body: AskQuestionDto) {
    return this.qaService.askQuestion(body.question, user.id, body.documentIds ?? []);
  }
}
