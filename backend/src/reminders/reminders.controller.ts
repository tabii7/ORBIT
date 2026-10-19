import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { RemindersService } from './reminders.service';
import {
  CreateReminderDto,
  ListRemindersQueryDto,
  LogReminderDto,
  UpdateReminderDto,
} from './dto/reminder.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Reminders')
@ApiBearerAuth('JWT')
@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @ApiSuccess({
    code: ApiCode.REMINDER_CREATED,
    message: 'Reminder created successfully',
  })
  @ApiOperation({ summary: 'Create a reminder' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReminderDto) {
    return this.remindersService.createFromDto(user.id, dto);
  }

  @Get('due')
  @ApiSuccess({
    code: ApiCode.REMINDER_LIST,
    message: 'Due reminders fetched successfully',
  })
  @ApiOperation({
    summary: 'List due reminders for polling / local notifications',
  })
  listDue(@CurrentUser() user: AuthUser) {
    return this.remindersService.listDueForUser(user.id);
  }

  @Get()
  @ApiSuccess({
    code: ApiCode.REMINDER_LIST,
    message: 'Reminders fetched successfully',
  })
  @ApiOperation({
    summary: 'List my reminders (latest first)',
    description:
      'No body required. Optional query: type, isActive, from, to. Newest created first.',
  })
  @ApiOkResponse({
    description: 'Array of reminders, latest first',
    schema: {
      example: [
        {
          id: 'cmufad0p10007kzy0qs2q3emo',
          type: 'MEDICINE',
          title: 'Take Panadol & Cough syrup',
          medicineName: 'Panadol, Cough syrup',
          remindAt: '2026-09-25T11:00:00.000Z',
          timesOfDay: ['15:00'],
          timezone: 'Asia/Dubai',
          isActive: true,
          isCompleted: false,
          createdAt: '2026-09-24T17:03:42.288Z',
        },
      ],
    },
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListRemindersQueryDto) {
    return this.remindersService.listForUser(user.id, {
      type: query.type,
      isActive: query.isActive,
      from: query.from,
      to: query.to,
    });
  }

  @Get(':id')
  @ApiSuccess({
    code: ApiCode.REMINDER_DETAIL,
    message: 'Reminder fetched successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get reminder detail with recent logs' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.remindersService.getForUser(user.id, id);
  }

  @Patch(':id')
  @ApiSuccess({
    code: ApiCode.REMINDER_UPDATED,
    message: 'Reminder updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update reminder schedule / status' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.updateForUser(user.id, id, dto);
  }

  @Delete(':id')
  @ApiSuccess({
    code: ApiCode.REMINDER_DELETED,
    message: 'Reminder deleted successfully',
  })
  @ApiParam({
    name: 'id',
    description: 'Reminder id to delete',
    example: 'cmufad0p10007kzy0qs2q3emo',
  })
  @ApiOperation({
    summary: 'Delete a reminder',
    description:
      'Permanently deletes the reminder (and its dose logs). No request body — path id + JWT only.',
  })
  @ApiOkResponse({
    description: 'Delete confirmation',
    schema: {
      example: {
        ok: true,
        deleted: true,
        id: 'cmufad0p10007kzy0qs2q3emo',
        title: 'Take Panadol & Cough syrup',
      },
    },
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.remindersService.deleteForUser(user.id, id);
  }

  @Post(':id/log')
  @ApiSuccess({
    code: ApiCode.UPDATED,
    message: 'Dose logged successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Log dose as TAKEN / SKIPPED / SNOOZED' })
  log(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LogReminderDto,
  ) {
    return this.remindersService.logForUser(user.id, id, dto);
  }
}
