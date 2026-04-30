import { Controller, Get, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { normalizeLocale } from '@lilink/shared';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';
import { QuestionnaireService } from './questionnaire.service';

@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get('current')
  @Throttle(createPublicReadThrottle())
  getCurrent(@Headers('x-locale') locale?: string) {
    return this.questionnaireService.getCurrentVersion(normalizeLocale(locale));
  }
}
