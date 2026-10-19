import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BudgetEntryType,
  FinanceAlertCondition,
  FinanceMarket,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateBudgetEntryDto {
  @ApiProperty({ enum: BudgetEntryType })
  @IsEnum(BudgetEntryType)
  type: BudgetEntryType;

  @ApiProperty({ example: 'groceries' })
  @IsString()
  category: string;

  @ApiProperty({ example: 120 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'AED' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: '2026-10-02' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class CreateWatchlistItemDto {
  @ApiProperty({ example: 'FAB.AD' })
  @IsString()
  symbol: string;

  @ApiPropertyOptional({ enum: FinanceMarket, default: FinanceMarket.OTHER })
  @IsOptional()
  @IsEnum(FinanceMarket)
  market?: FinanceMarket;

  @ApiPropertyOptional({ example: 'First Abu Dhabi Bank' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFinanceAlertDto {
  @ApiProperty({ example: 'FAB.AD' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: FinanceAlertCondition })
  @IsEnum(FinanceAlertCondition)
  condition: FinanceAlertCondition;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsNumber()
  threshold: number;

  @ApiPropertyOptional({ example: 'AED' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  watchlistItemId?: string;
}

export class UpdateFinanceAlertDto {
  @ApiPropertyOptional({ enum: FinanceAlertCondition })
  @IsOptional()
  @IsEnum(FinanceAlertCondition)
  condition?: FinanceAlertCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
