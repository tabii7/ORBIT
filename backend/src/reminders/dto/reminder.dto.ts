import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReminderLogStatus,
  ReminderRecurrence,
  ReminderType,
} from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateReminderDto {
  @ApiProperty({ enum: ReminderType, example: ReminderType.MEDICINE })
  @IsEnum(ReminderType)
  type: ReminderType;

  @ApiProperty({ example: 'Take metformin' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Metformin' })
  @IsOptional()
  @IsString()
  medicineName?: string;

  @ApiPropertyOptional({ example: '500mg' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({
    example: '2026-09-12T08:00:00+04:00',
    description: 'ISO datetime; if omitted, derived from timesOfDay',
  })
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional({
    enum: ReminderRecurrence,
    example: ReminderRecurrence.DAILY,
  })
  @IsOptional()
  @IsEnum(ReminderRecurrence)
  recurrence?: ReminderRecurrence;

  @ApiPropertyOptional({
    type: [String],
    example: ['08:00', '20:00'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  timesOfDay?: string[];

  @ApiPropertyOptional({ example: 'Asia/Dubai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateReminderDto {
  @ApiPropertyOptional({ enum: ReminderType })
  @IsOptional()
  @IsEnum(ReminderType)
  type?: ReminderType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicineName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @ApiPropertyOptional({ enum: ReminderRecurrence })
  @IsOptional()
  @IsEnum(ReminderRecurrence)
  recurrence?: ReminderRecurrence;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  timesOfDay?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListRemindersQueryDto {
  @ApiPropertyOptional({ enum: ReminderType })
  @IsOptional()
  @IsEnum(ReminderType)
  type?: ReminderType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'ISO from datetime filter on remindAt' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO to datetime filter on remindAt' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class LogReminderDto {
  @ApiProperty({ enum: ReminderLogStatus, example: ReminderLogStatus.TAKEN })
  @IsEnum(ReminderLogStatus)
  status: ReminderLogStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'Snooze minutes when status is SNOOZED',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  snoozeMinutes?: number;
}
