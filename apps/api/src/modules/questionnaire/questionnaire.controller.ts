import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PUBLIC_READ_THROTTLE } from '../../common/http/public-read-throttle';
import { QuestionnaireService } from './questionnaire.service';

@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get('current')
  @Throttle(PUBLIC_READ_THROTTLE)
  getCurrent() {
    return this.questionnaireService.getCurrentVersion();
  }
}
