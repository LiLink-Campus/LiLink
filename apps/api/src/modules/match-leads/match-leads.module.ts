import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, Matches } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminGuard } from '../../common/auth/admin.guard';

export class CreateMatchLeadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

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

  @Post('public/match-leads')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async create(@Body() body: CreateMatchLeadDto) {
    await this.prisma.matchLead.upsert({
      where: { phone: body.phone },
      create: { phone: body.phone },
      update: {},
    });
    return { ok: true };
  }

  @Get('admin/match-leads')
  @UseGuards(AdminGuard)
  async list() {
    return this.prisma.matchLead.findMany({
      orderBy: [{ contacted: 'asc' }, { createdAt: 'desc' }],
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
