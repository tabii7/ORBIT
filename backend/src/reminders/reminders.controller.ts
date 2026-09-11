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
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  @ApiOperation({ summary: 'Create a reminder' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReminderDto) {
    return this.remindersService.createFromDto(user.id, dto);
  }

  @Get('due')
  @ApiOperation({
    summary: 'List due reminders for polling / local notifications',
  })
  listDue(@CurrentUser() user: AuthUser) {
    return this.remindersService.listDueForUser(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List my reminders' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListRemindersQueryDto) {
    return this.remindersService.listForUser(user.id, {
      type: query.type,
      isActive: query.isActive,
      from: query.from,
      to: query.to,
    });
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get reminder detail with recent logs' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.remindersService.getForUser(user.id, id);
  }

  @Patch(':id')
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
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Deactivate / complete a reminder' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.remindersService.deleteForUser(user.id, id);
  }

  @Post(':id/log')
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
