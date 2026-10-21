import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller';
import { TripsController } from './trips.controller';
import { TravelPreferencesService } from './travel-preferences.service';
import { TravelSearchService } from './travel-search.service';
import { TravelTripService } from './travel-trip.service';
import { TravelCompareService } from './travel-compare.service';
import { TravelPlannerService } from './travel-planner.service';

@Module({
  controllers: [TravelController, TripsController],
  providers: [
    TravelPreferencesService,
    TravelSearchService,
    TravelTripService,
    TravelCompareService,
    TravelPlannerService,
  ],
  exports: [
    TravelPreferencesService,
    TravelSearchService,
    TravelTripService,
    TravelCompareService,
    TravelPlannerService,
  ],
})
export class TravelModule {}
