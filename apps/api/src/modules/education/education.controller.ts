import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { createPublicAuthThrottle } from '../auth/auth-throttle';
import { EducationService } from './education.service';

class EducationEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
class VerifyEducationEmailDto extends EducationEmailDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
class EducationInviteDto {
  @IsString()
  @Length(1, 64)
  referralCode!: string;
  @IsString()
  @Length(1, 128)
  schoolId!: string;
}

@Controller('me/education')
@UseGuards(JwtAuthGuard)
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  status(@Req() request: AuthenticatedRequest) {
    return this.education.status(request.user!.sub);
  }

  @Post('invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(
    @Req() request: AuthenticatedRequest,
    @Body() body: EducationInviteDto,
  ) {
    return this.education.verifyInvite(
      request.user!.sub,
      body.referralCode,
      body.schoolId,
    );
  }

  @Post('email/request-code')
  @Throttle(createPublicAuthThrottle('requestCode'))
  requestCode(
    @Req() request: AuthenticatedRequest,
    @Body() body: EducationEmailDto,
  ) {
    return this.education.requestEmailCode(request.user!.sub, body.email);
  }

  @Post('email/verify')
  @Throttle(createPublicAuthThrottle('register'))
  verify(
    @Req() request: AuthenticatedRequest,
    @Body() body: VerifyEducationEmailDto,
  ) {
    return this.education.verifyEmail(request.user!.sub, body.email, body.code);
  }
}
