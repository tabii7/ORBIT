import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthDocumentCategory } from '@prisma/client';

export class CreateHealthDocumentDto {
  @ApiProperty({ example: 'CBC lab results' })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    enum: HealthDocumentCategory,
    example: HealthDocumentCategory.LAB,
  })
  @IsOptional()
  @IsEnum(HealthDocumentCategory)
  category?: HealthDocumentCategory;

  @ApiPropertyOptional({ example: 'https://example.com/file.pdf' })
  @IsOptional()
  @IsUrl()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}
