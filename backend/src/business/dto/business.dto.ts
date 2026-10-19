import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessNoteKind } from '@prisma/client';
import { Type } from 'class-transformer';

export class ChecklistItemDto {
  @ApiProperty({ example: 'Draft proposal outline' })
  @IsString()
  text: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreateBusinessNoteDto {
  @ApiProperty({ example: 'Q4 hiring plan' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: BusinessNoteKind, default: BusinessNoteKind.NOTE })
  @IsOptional()
  @IsEnum(BusinessNoteKind)
  kind?: BusinessNoteKind;

  @ApiPropertyOptional({ type: [ChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklistItems?: ChecklistItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceUrls?: string[];
}

export class UpdateBusinessNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: BusinessNoteKind })
  @IsOptional()
  @IsEnum(BusinessNoteKind)
  kind?: BusinessNoteKind;

  @ApiPropertyOptional({ type: [ChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklistItems?: ChecklistItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceUrls?: string[];
}

export class BusinessResearchDto {
  @ApiProperty({ example: 'UAE SME marketing channels 2026' })
  @IsString()
  @MinLength(3)
  query: string;

  @ApiPropertyOptional({
    description: 'If true, save result as a RESEARCH business note',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  saveNote?: boolean;

  @ApiPropertyOptional({ example: 'Marketing research' })
  @IsOptional()
  @IsString()
  title?: string;
}
