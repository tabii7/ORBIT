import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterestCategory } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Meibad Khan', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://lh3.googleusercontent.com/a-/photo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '+971500000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Asia/Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'Managing work and health with ORBIT' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: '1995-05-20' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  gender?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ example: 'UAE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ example: 'Abu Dhabi' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class UpdateInterestsDto {
  @ApiProperty({
    isArray: true,
    enum: InterestCategory,
    example: [
      InterestCategory.TRAVEL,
      InterestCategory.HEALTH,
      InterestCategory.FINANCE,
    ],
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(InterestCategory, { each: true })
  interests: InterestCategory[];
}

export class UpdateMedicalProfileDto {
  @ApiPropertyOptional({
    example: 'Taking daily medication and tracking appointments',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentSituation?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['hypertension'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  conditions?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['penicillin'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['medicine X'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodType?: string;

  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+9715xxxxxxx' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: 'Prefer morning reminders' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
