import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SocialProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  MICROSOFT = 'microsoft',
}

class SocialUserDto {
  @ApiProperty({
    example: 'MNjCLltwECRrazotzlSYILmdXj1',
    description: 'Firebase / provider user id',
  })
  @IsString()
  id: string;

  @ApiProperty({ example: 'user@gmail.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'https://lh3.googleusercontent.com/a-/photo',
  })
  @IsOptional()
  @IsUrl()
  photo_url?: string;

  @ApiPropertyOptional({ example: 'Meibad Khan' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class SocialAuthDto {
  @ApiProperty({ enum: SocialProvider, example: SocialProvider.GOOGLE })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({ enum: ['login', 'register'], example: 'login' })
  @IsIn(['login', 'register'])
  action: 'login' | 'register';

  @ApiProperty({
    description: 'Firebase ID token from Google / Facebook / Microsoft sign-in',
  })
  @IsString()
  id_token: string;

  @ApiProperty({ example: 'user@gmail.com' })
  @IsEmail()
  identifier: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  marketing_opt_in: boolean;

  @ApiPropertyOptional({ type: SocialUserDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialUserDto)
  user?: SocialUserDto;
}
