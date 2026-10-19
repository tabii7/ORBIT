import { Injectable, NotFoundException } from '@nestjs/common';
import { TravelCabinClass } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTravelPreferencesDto } from './dto/travel-preferences.dto';

@Injectable()
export class TravelPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  empty(userId: string) {
    return {
      userId,
      homeCity: null,
      homeCountry: null,
      homeAirport: null,
      preferredCurrency: 'AED',
      maxHotelBudget: null,
      maxFlightBudget: null,
      preferredHotelStars: null,
      preferredAirlines: [] as string[],
      cabinClass: TravelCabinClass.ECONOMY,
      preferRefundable: false,
      adultsDefault: 1,
      notes: null,
    };
  }

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundException('User not found or inactive');
    }

    const prefs = await this.prisma.travelPreferences.findUnique({
      where: { userId },
    });
    return prefs ?? this.empty(userId);
  }

  async upsert(userId: string, dto: UpdateTravelPreferencesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundException('User not found or inactive');
    }

    return this.prisma.travelPreferences.upsert({
      where: { userId },
      create: {
        userId,
        homeCity: dto.homeCity,
        homeCountry: dto.homeCountry,
        homeAirport: dto.homeAirport,
        preferredCurrency: dto.preferredCurrency ?? 'AED',
        maxHotelBudget: dto.maxHotelBudget,
        maxFlightBudget: dto.maxFlightBudget,
        preferredHotelStars: dto.preferredHotelStars,
        preferredAirlines: dto.preferredAirlines ?? [],
        cabinClass: dto.cabinClass ?? TravelCabinClass.ECONOMY,
        preferRefundable: dto.preferRefundable ?? false,
        adultsDefault: dto.adultsDefault ?? 1,
        notes: dto.notes,
      },
      update: {
        ...(dto.homeCity !== undefined ? { homeCity: dto.homeCity } : {}),
        ...(dto.homeCountry !== undefined
          ? { homeCountry: dto.homeCountry }
          : {}),
        ...(dto.homeAirport !== undefined
          ? { homeAirport: dto.homeAirport }
          : {}),
        ...(dto.preferredCurrency !== undefined
          ? { preferredCurrency: dto.preferredCurrency }
          : {}),
        ...(dto.maxHotelBudget !== undefined
          ? { maxHotelBudget: dto.maxHotelBudget }
          : {}),
        ...(dto.maxFlightBudget !== undefined
          ? { maxFlightBudget: dto.maxFlightBudget }
          : {}),
        ...(dto.preferredHotelStars !== undefined
          ? { preferredHotelStars: dto.preferredHotelStars }
          : {}),
        ...(dto.preferredAirlines !== undefined
          ? { preferredAirlines: dto.preferredAirlines }
          : {}),
        ...(dto.cabinClass !== undefined ? { cabinClass: dto.cabinClass } : {}),
        ...(dto.preferRefundable !== undefined
          ? { preferRefundable: dto.preferRefundable }
          : {}),
        ...(dto.adultsDefault !== undefined
          ? { adultsDefault: dto.adultsDefault }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }
}
