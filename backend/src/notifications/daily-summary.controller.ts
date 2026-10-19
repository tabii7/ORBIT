import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { DailySummaryService } from './daily-summary.service';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@Controller('daily-summary')
@UseGuards(JwtAuthGuard)
export class DailySummaryController {
  constructor(private readonly dailySummaryService: DailySummaryService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.DAILY_SUMMARY,
    message: 'Daily summary fetched successfully',
  })
  @ApiOperation({
    summary: 'Get daily summary',
    description:
      'Returns cached summary for the date (user timezone) or builds one. Soft items only — critical alerts still use reminder/finance FCM.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    example: '2026-10-07',
    description: 'YYYY-MM-DD in user timezone (defaults to today)',
  })
  get(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.dailySummaryService.getOrCreate(user.id, {
      date,
      force: false,
      sendPush: false,
    });
  }

  @Post('generate')
  @ApiSuccess({
    code: ApiCode.DAILY_SUMMARY_GENERATED,
    message: 'Daily summary generated successfully',
  })
  @ApiOperation({
    summary: 'Force regenerate daily summary',
    description:
      'Rebuilds the digest now. Optional soft FCM when `push=true`. Morning cron does this at 07:00 user TZ by default.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    example: '2026-10-07',
  })
  @ApiQuery({
    name: 'push',
    required: false,
    example: 'false',
    description: 'If true, send a soft FCM “daily summary ready” notification',
  })
  generate(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('push') push?: string,
  ) {
    return this.dailySummaryService.getOrCreate(user.id, {
      date,
      force: true,
      sendPush: push === 'true' || push === '1',
    });
  }
}
