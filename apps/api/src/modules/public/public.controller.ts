import { Controller, Get, Query } from '@nestjs/common';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('landing')
  getLanding() {
    return this.publicService.getLandingPayload();
  }

  @Get('resolve-school')
  resolveSchool(@Query('email') email: string) {
    return this.publicService.resolveSchoolByEmail(email);
  }
}
