import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/device.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Devices')
@ApiBearerAuth('JWT')
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({
    summary: 'Register FCM/APNs device token for future push notifications',
  })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my registered devices' })
  list(@CurrentUser() user: AuthUser) {
    return this.devicesService.list(user.id);
  }

  @Delete(':token')
  @ApiParam({ name: 'token', description: 'Device push token' })
  @ApiOperation({ summary: 'Unregister a device token' })
  unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.devicesService.unregister(user.id, token);
  }
}
