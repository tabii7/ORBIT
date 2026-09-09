import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role, ReminderType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RemindersService } from './reminders.service';
import { UpdateReminderDto } from './dto/reminder.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Reminders')
@ApiBearerAuth('JWT')
@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'List my reminders' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: ReminderType,
    @Query('isActive') isActive?: string,
  ) {
    return this.remindersService.listForUser(user.id, {
      type,
      isActive:
        isActive === undefined
          ? undefined
          : isActive === 'true' || isActive === '1',
    });
  }

  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update my reminder (complete / deactivate)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.updateForUser(user.id, id, dto);
  }
}
