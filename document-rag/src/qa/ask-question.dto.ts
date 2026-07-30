// ask-question.dto.ts
// Describes the shape of the POST /qa/ask request body.

import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Question must be at least 3 characters long.' })
  question: string;
}
