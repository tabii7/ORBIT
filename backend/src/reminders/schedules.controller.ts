import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { RemindersService } from './reminders.service';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Schedules')
@ApiBearerAuth('JWT')
@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class SchedulesController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.SCHEDULE_LIST,
    message: 'Schedules fetched successfully',
  })
  @ApiOperation({
    summary: 'List all schedules',
    description:
      'Returns all reminders/schedules for the authenticated user. No request body or query parameters — only JWT.',
  })
  @ApiOkResponse({
    description: 'Full schedule list',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.remindersService.listSchedules(user.id, { status: 'ALL' });
  }
}
