import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TravelCabinClass } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateTravelPreferencesDto {
  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  homeCity?: string;

  @ApiPropertyOptional({ example: 'UAE' })
  @IsOptional()
  @IsString()
  homeCountry?: string;

  @ApiPropertyOptional({ example: 'DXB' })
  @IsOptional()
  @IsString()
  homeAirport?: string;

  @ApiPropertyOptional({ example: 'AED' })
  @IsOptional()
  @IsString()
  preferredCurrency?: string;

  @ApiPropertyOptional({ example: 1500, description: 'Max hotel budget (total or per night — noted in chat)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxHotelBudget?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Max flight budget' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFlightBudget?: number;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  preferredHotelStars?: number;

  @ApiPropertyOptional({ type: [String], example: ['Emirates', 'Etihad'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredAirlines?: string[];

  @ApiPropertyOptional({ enum: TravelCabinClass })
  @IsOptional()
  @IsEnum(TravelCabinClass)
  cabinClass?: TravelCabinClass;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  preferRefundable?: boolean;

  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adultsDefault?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
