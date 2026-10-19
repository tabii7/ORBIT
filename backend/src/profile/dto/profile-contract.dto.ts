import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

/**
 * Flutter profile contract — PUT /api/profile
 * Rejects email / photo_path / name / dob via global forbidNonWhitelisted.
 */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Ali Khan', minLength: 2, maxLength: 80 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '1998-05-12' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 28, minimum: 0, maximum: 120 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ example: 'Pakistan' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ example: 'PKR' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(16)
  currency?: string;

  @ApiPropertyOptional({ example: 'Lahore' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  residence?: string;

  @ApiPropertyOptional({ example: 'Travel' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  hobby?: string;
}

/** Category → multiple values */
export type ProfilePreferences = Record<string, string[]>;

/** Flat profile payload returned by GET/PUT /api/profile */
export type ProfileContract = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  dateOfBirth: string | null;
  age: number | null;
  country: string | null;
  currency: string | null;
  residence: string | null;
  hobby: string | null;
  avatarUrl: string | null;
  /** e.g. { travel: ["beach","family"], food: ["halal"] } */
  preferences: ProfilePreferences;
};
