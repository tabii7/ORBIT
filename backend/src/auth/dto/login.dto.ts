import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';

export class LoginDto {
  @ApiProperty({ example: 'superadmin@orbit.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperAdmin@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    example: 'dGVzdC1mY20tdG9rZW4tZXhhbXBsZQ',
    description: 'FCM push token for this device (saved/updated on login)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  fcmToken?: string;

  @ApiPropertyOptional({
    enum: DevicePlatform,
    example: DevicePlatform.ANDROID,
    description: 'Device platform — required when fcmToken is sent',
  })
  @ValidateIf((o: LoginDto) => Boolean(o.fcmToken))
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;
}
