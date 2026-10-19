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
import { ApiCode, ApiSuccess } from '../common/response';
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
  @ApiSuccess({
    code: ApiCode.CREATED,
    message: 'Device token registered successfully',
  })
  @ApiOperation({
    summary: 'Register FCM/APNs device token',
    description:
      'Send `fcmToken` (or `token`) + `platform`. Same token upserts. Also accepted on register/login/social.',
  })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(user.id, dto);
  }

  @Get()
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Devices fetched successfully',
  })
  @ApiOperation({ summary: 'List my registered devices' })
  list(@CurrentUser() user: AuthUser) {
    return this.devicesService.list(user.id);
  }

  @Delete(':token')
  @ApiSuccess({
    code: ApiCode.DELETED,
    message: 'Device token removed successfully',
  })
  @ApiParam({ name: 'token', description: 'FCM / device push token' })
  @ApiOperation({ summary: 'Unregister a device token' })
  unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.devicesService.unregister(user.id, decodeURIComponent(token));
  }
}
