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

export enum SocialProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  MICROSOFT = 'microsoft',
}

class SocialUserDto {
  @IsString()
  id: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsUrl()
  photo_url?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class SocialAuthDto {
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @IsIn(['login', 'register'])
  action: 'login' | 'register';

  @IsString()
  id_token: string;

  @IsEmail()
  identifier: string;

  @IsBoolean()
  marketing_opt_in: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialUserDto)
  user?: SocialUserDto;
}
