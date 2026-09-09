import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialAuthDto, SocialProvider } from './dto/social-auth.dto';
import { SocialTokenService } from './services/social-token.service';

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly socialTokenService: SocialTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      role: Role.USER,
    });

    return this.buildAuthResponse(user, false);
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

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

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
        },
      });

      return this.buildAuthResponse(user, false);
    }

    const existingUser = await this.usersService.findByEmail(identity.email);

    if (dto.action === 'login' && !existingUser) {
      throw new NotFoundException(
        'No account found for this social login. Please register first.',
      );
    }

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
        },
      });

      return this.buildAuthResponse(user, false);
    }

    const user = await this.prisma.user.create({
      data: {
        email: identity.email,
        fullName: dto.user?.name ?? identity.fullName,
        avatarUrl: dto.user?.photo_url ?? identity.avatarUrl,
        marketingOptIn: dto.marketing_opt_in,
        role: Role.USER,
        socialAccounts: {
          create: {
            provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
          },
        },
      },
    });

    return this.buildAuthResponse(user, true);
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
