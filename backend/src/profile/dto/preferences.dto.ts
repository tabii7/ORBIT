import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PREFERENCE_CATEGORIES } from '../preferences.constants';

/** Full preferences map: only predefined categories are accepted */
export class UpdatePreferencesDto {
  @ApiProperty({
    description: `Only keys ${PREFERENCE_CATEGORIES.join(', ')}. Extra keys are rejected. Omitted categories keep prior values when using per-category APIs; on full replace, omitted keys become [].`,
    example: {
      travel: ['beach', 'family', 'budget'],
      food: ['halal', 'vegetarian'],
      language: ['en', 'ar', 'ur'],
      finance: ['stocks', 'gold', 'bitcoin'],
    },
  })
  @IsObject()
  preferences: Record<string, string[]>;
}

/** Set / replace values for one category */
export class UpdatePreferenceCategoryDto {
  @ApiProperty({
    type: [String],
    example: ['beach', 'family', 'budget'],
    description: 'Values for this category (replaces existing list)',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  values: string[];
}

export class AddPreferenceValuesDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['adventure'],
    description: 'Values to add (merged uniquely into the category)',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  values: string[];
}
