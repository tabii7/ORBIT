import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class HealthCheckAnswerDto {
  @ApiProperty({ example: 'sleep' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  questionId: string;

  @ApiProperty({ example: '7_8', description: 'Option value from the quiz' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  value: string;
}

export class SubmitHealthCheckDto {
  @ApiProperty({
    type: [HealthCheckAnswerDto],
    description: 'One answer per question from GET /health-check/questions',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HealthCheckAnswerDto)
  answers: HealthCheckAnswerDto[];
}
