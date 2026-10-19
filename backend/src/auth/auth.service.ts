import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthProvider,
  DevicePlatform,
  EmailOtpPurpose,
  Prisma,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialAuthDto, SocialProvider } from './dto/social-auth.dto';
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { SocialTokenService } from './services/social-token.service';
import { BrevoMailService } from './services/brevo-mail.service';

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl?: string | null;
};

type RegisterPayload = {
  fullName: string;
  passwordHash: string;
  fcmToken?: string;
  platform?: DevicePlatform;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly socialTokenService: SocialTokenService,
    private readonly devicesService: DevicesService,
    private readonly brevoMail: BrevoMailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 1: store pending signup + email OTP (no JWT yet).
   */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    if (existing?.emailVerifiedAt) {
      throw new ConflictException('Email already registered');
    }
    if (existing && !existing.emailVerifiedAt) {
      // Allow restarting verification for unfinished signup
      await this.prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const code = this.generateOtp();
    const expiresMinutes = Number(
      this.config.get('OTP_EXPIRES_MINUTES') || 10,
    );
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);

    const payload: RegisterPayload = {
      fullName: dto.fullName.trim(),
      passwordHash,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
    };

    await this.prisma.emailOtp.upsert({
      where: {
        email_purpose: { email, purpose: EmailOtpPurpose.REGISTER },
      },
      create: {
        email,
        purpose: EmailOtpPurpose.REGISTER,
        codeHash: this.hashOtp(code),
        payload: payload as unknown as Prisma.InputJsonValue,
        expiresAt,
        attempts: 0,
      },
      update: {
        codeHash: this.hashOtp(code),
        payload: payload as unknown as Prisma.InputJsonValue,
        expiresAt,
        attempts: 0,
      },
    });

    await this.brevoMail.sendOtpEmail({
      to: email,
      code,
      fullName: dto.fullName,
    });

    return {
      email,
      otpSent: true,
      expiresInSeconds: expiresMinutes * 60,
      message: 'Verification code sent to your email',
    };
  }

  /**
   * Step 2: verify OTP → create user → JWT.
   */
  async verifyRegisterOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const row = await this.prisma.emailOtp.findUnique({
      where: {
        email_purpose: { email, purpose: EmailOtpPurpose.REGISTER },
      },
    });

    if (!row) {
      throw new BadRequestException(
        'No pending registration for this email. Please register again.',
      );
    }

    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtp.delete({ where: { id: row.id } });
      throw new BadRequestException('OTP expired. Please request a new code.');
    }

    if (row.attempts >= 5) {
      await this.prisma.emailOtp.delete({ where: { id: row.id } });
      throw new BadRequestException(
        'Too many invalid attempts. Please register again.',
      );
    }

    const ok = row.codeHash === this.hashOtp(dto.otp.trim());
    if (!ok) {
      await this.prisma.emailOtp.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    const payload = row.payload as RegisterPayload | null;
    if (!payload?.passwordHash || !payload?.fullName) {
      await this.prisma.emailOtp.delete({ where: { id: row.id } });
      throw new BadRequestException(
        'Registration data missing. Please register again.',
      );
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing?.emailVerifiedAt) {
      await this.prisma.emailOtp.delete({ where: { id: row.id } });
      throw new ConflictException('Email already registered');
    }

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: payload.passwordHash,
            fullName: payload.fullName,
            emailVerifiedAt: new Date(),
            isActive: true,
          },
        })
      : await this.usersService.create({
          email,
          passwordHash: payload.passwordHash,
          fullName: payload.fullName,
          role: Role.USER,
          emailVerifiedAt: new Date(),
        });

    await this.prisma.emailOtp.delete({ where: { id: row.id } });
    await this.saveFcm(user.id, payload.fcmToken, payload.platform);
    return this.buildAuthResponse(user, true);
  }

  async resendRegisterOtp(dto: ResendOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const row = await this.prisma.emailOtp.findUnique({
      where: {
        email_purpose: { email, purpose: EmailOtpPurpose.REGISTER },
      },
    });

    if (!row) {
      throw new BadRequestException(
        'No pending registration for this email. Please register first.',
      );
    }

    const payload = row.payload as RegisterPayload | null;
    const code = this.generateOtp();
    const expiresMinutes = Number(
      this.config.get('OTP_EXPIRES_MINUTES') || 10,
    );
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);

    await this.prisma.emailOtp.update({
      where: { id: row.id },
      data: {
        codeHash: this.hashOtp(code),
        expiresAt,
        attempts: 0,
      },
    });

    await this.brevoMail.sendOtpEmail({
      to: email,
      code,
      fullName: payload?.fullName,
    });

    return {
      email,
      otpSent: true,
      expiresInSeconds: expiresMinutes * 60,
      message: 'Verification code resent',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google, Facebook, or Microsoft.',
      );
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Email not verified. Please complete OTP verification.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.saveFcm(user.id, dto.fcmToken, dto.platform);
    return this.buildAuthResponse(user, false);
  }

  async socialLogin(dto: SocialAuthDto) {
    const provider = this.mapProvider(dto.provider);
    const identity = await this.socialTokenService.verify(
      dto.provider,
      dto.id_token,
    );

    if (identity.email !== dto.identifier.toLowerCase()) {
      throw new UnauthorizedException('Social login identifier mismatch');
    }

    const existingSocial = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existingSocial) {
      if (!existingSocial.user.isActive) {
        throw new UnauthorizedException('Account is inactive');
      }

      const user = await this.prisma.user.update({
        where: { id: existingSocial.userId },
        data: {
          fullName: dto.user?.name ?? identity.fullName,
          avatarUrl: dto.user?.photo_url ?? identity.avatarUrl,
          marketingOptIn: dto.marketing_opt_in,
          emailVerifiedAt: existingSocial.user.emailVerifiedAt ?? new Date(),
        },
      });

      await this.saveFcm(user.id, dto.fcmToken, dto.platform);
      return this.buildAuthResponse(user, false);
    }

    const existingUser = await this.usersService.findByEmail(identity.email);

    if (existingUser) {
      if (!existingUser.isActive) {
        throw new UnauthorizedException('Account is inactive');
      }

      await this.prisma.socialAccount.create({
        data: {
          userId: existingUser.id,
          provider,
          providerUserId: identity.providerUserId,
          email: identity.email,
        },
      });

      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          fullName: dto.user?.name ?? identity.fullName,
          avatarUrl: dto.user?.photo_url ?? identity.avatarUrl,
          marketingOptIn: dto.marketing_opt_in,
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        },
      });

      await this.saveFcm(user.id, dto.fcmToken, dto.platform);
      return this.buildAuthResponse(user, false);
    }

    const user = await this.prisma.user.create({
      data: {
        email: identity.email,
        fullName: dto.user?.name ?? identity.fullName,
        avatarUrl: dto.user?.photo_url ?? identity.avatarUrl,
        marketingOptIn: dto.marketing_opt_in,
        role: Role.USER,
        emailVerifiedAt: new Date(),
        socialAccounts: {
          create: {
            provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
          },
        },
      },
    });

    await this.saveFcm(user.id, dto.fcmToken, dto.platform);
    return this.buildAuthResponse(user, true);
  }

  private generateOtp() {
    return String(randomInt(100000, 1000000));
  }

  private hashOtp(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private async saveFcm(
    userId: string,
    fcmToken?: string,
    platform?: DevicePlatform,
  ) {
    await this.devicesService.registerIfPresent(userId, {
      fcmToken,
      platform,
    });
  }

  private mapProvider(provider: SocialProvider): AuthProvider {
    switch (provider) {
      case SocialProvider.GOOGLE:
        return AuthProvider.GOOGLE;
      case SocialProvider.FACEBOOK:
        return AuthProvider.FACEBOOK;
      case SocialProvider.MICROSOFT:
        return AuthProvider.MICROSOFT;
      default:
        throw new UnauthorizedException('Unsupported social provider');
    }
  }

  private buildAuthResponse(user: AuthUser, isNewUser: boolean) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      },
      isNewUser,
    };
  }
}
