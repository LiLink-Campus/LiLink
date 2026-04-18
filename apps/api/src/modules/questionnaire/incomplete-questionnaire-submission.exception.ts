import { BadRequestException } from '@nestjs/common';

export class IncompleteQuestionnaireSubmissionException extends BadRequestException {}
