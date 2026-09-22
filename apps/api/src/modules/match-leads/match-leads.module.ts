import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsString, Length, Matches } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { AdminGuard } from '../../common/auth/admin.guard';

export class CreateMatchLeadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  realName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  school!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  major!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: '请输入含国际区号的有效手机号' })
  contact!: string;

  @Equals(true)
  consent!: boolean;
}
class ContactMatchLeadDto {
  @IsBoolean()
  contacted!: boolean;
}
@Controller()
export class MatchLeadsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('me/match-leads')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateMatchLeadDto,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const data = {
      realName: body.realName,
      school: body.school,
      major: body.major,
      contact: body.contact,
      consentAt: new Date(),
    };
    await this.prisma.matchLead.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data, contacted: false },
    });
    return { ok: true };
  }

  @Get('admin/match-leads')
  @UseGuards(AdminGuard)
  async list() {
    return this.prisma.matchLead.findMany({
      orderBy: [{ contacted: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  @Patch('admin/match-leads/:id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() body: ContactMatchLeadDto) {
    return this.prisma.matchLead.update({
      where: { id },
      data: { contacted: body.contacted },
    });
  }
}
@Module({ controllers: [MatchLeadsController] })
export class MatchLeadsModule {}
