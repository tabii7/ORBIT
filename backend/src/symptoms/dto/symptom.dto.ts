import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSymptomDto {
  @ApiProperty({ type: [String], example: ['headache', 'nausea'] })
  @IsArray()
  @IsString({ each: true })
  symptoms: string[];

  @ApiProperty({ example: 6, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  severity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String], example: ['Metformin'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedMedications?: string[];

  @ApiPropertyOptional({ description: 'When symptoms were noticed (ISO)' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class ListSymptomsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
