import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import { Transform } from 'class-transformer';

export class RegisterDeviceDto {
  @ApiPropertyOptional({
    example: 'dGVzdC1mY20tdG9rZW4tZXhhbXBsZQ',
    description: 'FCM / APNs device token (alias of token)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  fcmToken?: string;

  @ApiPropertyOptional({
    example: 'dGVzdC1mY20tdG9rZW4tZXhhbXBsZQ',
    description: 'Same as fcmToken — either field is accepted',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  token?: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  /** Resolved push token from fcmToken or token. */
  get resolvedToken(): string {
    return (this.fcmToken || this.token || '').trim();
  }
}

/** Shared helper type for auth bodies that may include FCM. */
export type FcmAuthFields = {
  fcmToken?: string;
  platform?: DevicePlatform;
};
