import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialAuthDto } from './dto/social-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register with email/password',
    description: 'Always creates a USER role account and returns a JWT.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login with email/password',
    description: 'Returns accessToken + user. Social-only accounts cannot use this.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('social')
  @ApiOperation({
    summary: 'Social login (Google / Facebook / Microsoft)',
    description:
      'Accepts Flutter Firebase payload. Verifies id_token, creates or links user, returns ORBIT JWT.',
  })
  socialLogin(@Body() dto: SocialAuthDto) {
    return this.authService.socialLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(
    @CurrentUser()
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    },
  ) {
    return { user };
  }
}
