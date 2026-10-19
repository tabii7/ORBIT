import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role, TravelOfferKind } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { TravelTripService } from './travel-trip.service';
import {
  CreateTripDto,
  SelectTripOfferDto,
  UpdateTripDto,
} from './dto/trip.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Travel')
@ApiBearerAuth('JWT')
@Controller('travel/trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly travelTripService: TravelTripService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.TRIP_LIST,
    message: 'Trips fetched successfully',
  })
  @ApiOperation({
    summary: 'List my trips',
    description: 'Returns trips with ranked offers (recommended first).',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.travelTripService.list(user.id);
  }

  @Post()
  @ApiSuccess({
    code: ApiCode.TRIP_CREATED,
    message: 'Trip created successfully',
  })
  @ApiOperation({ summary: 'Create a trip plan' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.travelTripService.create(user.id, dto);
  }

  @Get(':id')
  @ApiSuccess({
    code: ApiCode.TRIP_DETAIL,
    message: 'Trip fetched successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get trip with offers' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.travelTripService.get(user.id, id);
  }

  @Patch(':id')
  @ApiSuccess({
    code: ApiCode.TRIP_UPDATED,
    message: 'Trip updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update trip plan' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.travelTripService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiSuccess({
    code: ApiCode.TRIP_DELETED,
    message: 'Trip deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a trip' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.travelTripService.remove(user.id, id);
  }

  @Post(':id/select-hotel')
  @ApiSuccess({
    code: ApiCode.TRIP_OFFER_SELECTED,
    message: 'Hotel offer selected',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'Select hotel offer for trip',
    description: 'Sets selectedHotelOfferId and returns bookingUrl for external booking.',
  })
  selectHotel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SelectTripOfferDto,
  ) {
    return this.travelTripService.selectOffer(
      user.id,
      id,
      dto.offerId,
      TravelOfferKind.HOTEL,
    );
  }

  @Post(':id/select-flight')
  @ApiSuccess({
    code: ApiCode.TRIP_OFFER_SELECTED,
    message: 'Flight offer selected',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'Select flight offer for trip',
    description: 'Sets selectedFlightOfferId and returns bookingUrl for external booking.',
  })
  selectFlight(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SelectTripOfferDto,
  ) {
    return this.travelTripService.selectOffer(
      user.id,
      id,
      dto.offerId,
      TravelOfferKind.FLIGHT,
    );
  }
}
