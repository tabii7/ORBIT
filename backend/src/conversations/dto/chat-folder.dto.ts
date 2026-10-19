import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChatFolderDto {
  @ApiProperty({ example: 'Travel' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateChatFolderDto {
  @ApiPropertyOptional({ example: 'Health' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({ example: 'Istanbul trip planning' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  /** Set to folder id to move into a folder; set to null to uncategorize. */
  @ApiPropertyOptional({
    example: 'cmfolder…',
    nullable: true,
    description: 'Folder id, or null to remove from folder',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;
}
