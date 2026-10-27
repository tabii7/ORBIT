import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    example: 'plus',
    description: 'Plan code: basic | plus | pro',
  })
  @IsString()
  @MinLength(2)
  planCode: string;

  @ApiProperty({
    enum: BillingInterval,
    example: BillingInterval.MONTHLY,
  })
  @IsEnum(BillingInterval)
  interval: BillingInterval;

  @ApiPropertyOptional({
    description: 'Override success redirect (must include {CHECKOUT_SESSION_ID} optional)',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
