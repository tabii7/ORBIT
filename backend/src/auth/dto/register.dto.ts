import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@orbit.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'UserPass@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Orbit User', minLength: 2 })
  @IsString()
  @MinLength(2)
  fullName: string;

  /** Ignored on public register — always creates USER. */
  @ApiPropertyOptional({
    enum: Role,
    description: 'Ignored on public register; always creates USER',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
