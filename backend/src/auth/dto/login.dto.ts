import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'superadmin@orbit.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperAdmin@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
