import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactSupportDto {
  @ApiProperty({
    example: 'user@gmail.com',
    description: 'User email — admin can reply to this address',
  })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'Cannot upload profile photo',
    description: 'Short subject line',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: 'When I tap upload on Android 14 the app shows an error…',
    description: 'Full message / description',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;
}
