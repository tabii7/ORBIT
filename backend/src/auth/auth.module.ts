import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SocialTokenService } from './services/social-token.service';
import { BrevoMailService } from './services/brevo-mail.service';
import { UsersModule } from '../users/users.module';
import { DevicesModule } from '../devices/devices.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    UsersModule,
    DevicesModule,
    BillingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const signOptions: JwtSignOptions = {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        };
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SocialTokenService, BrevoMailService],
  exports: [AuthService, JwtModule, BrevoMailService],
})
export class AuthModule {}
