import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { TravelPreferencesService } from './travel-preferences.service';
import { UpdateTravelPreferencesDto } from './dto/travel-preferences.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Travel')
@ApiBearerAuth('JWT')
@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelController {
  constructor(
    private readonly travelPreferencesService: TravelPreferencesService,
  ) {}

  @Get('preferences')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Travel preferences fetched successfully',
  })
  @ApiOperation({
    summary: 'Get my travel preferences',
    description:
      'Home city/airport, budgets, hotel stars, airlines, cabin class — used by chat travel search.',
  })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.travelPreferencesService.get(user.id);
  }

  @Put('preferences')
  @ApiSuccess({
    code: ApiCode.TRAVEL_PREFS_UPDATED,
    message: 'Travel preferences saved successfully',
  })
  @ApiOperation({
    summary: 'Save my travel preferences',
    description: 'Upsert travel defaults for hotel/flight search in chat.',
  })
  savePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTravelPreferencesDto,
  ) {
    return this.travelPreferencesService.upsert(user.id, dto);
  }
}
