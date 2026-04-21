import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';
import { QuestionnaireService } from './questionnaire.service';

@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get('current')
  @Throttle(createPublicReadThrottle())
  getCurrent() {
    return this.questionnaireService.getCurrentVersion();
  }
}
