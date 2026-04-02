import { Controller, Get } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';

@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get('current')
  getCurrent() {
    return this.questionnaireService.getCurrentVersion();
  }
}
