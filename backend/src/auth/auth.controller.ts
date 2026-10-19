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
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiSuccess({
    code: ApiCode.OTP_SENT,
    message: 'Verification code sent to your email',
  })
  @ApiOperation({
    summary: 'Register with email/password (step 1 — send OTP)',
    description:
      'Does **not** return a JWT. Sends a 6-digit OTP via Brevo email. Next call `POST /auth/verify-otp`.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-otp')
  @ApiSuccess({
    code: ApiCode.REGISTER_SUCCESS,
    message: 'Registration successful',
  })
  @ApiOperation({
    summary: 'Verify email OTP (step 2 — create account + JWT)',
    description: 'Validates OTP from register email and returns accessToken.',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
  }

  @Post('resend-otp')
  @ApiSuccess({
    code: ApiCode.OTP_SENT,
    message: 'Verification code resent',
  })
  @ApiOperation({
    summary: 'Resend registration OTP',
  })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendRegisterOtp(dto);
  }

  @Post('login')
  @ApiSuccess({
    code: ApiCode.LOGIN_SUCCESS,
    message: 'Login successful',
  })
  @ApiOperation({
    summary: 'Login with email/password',
    description:
      'Requires verified email. Social-only accounts cannot use this.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('social')
  @ApiSuccess({
    code: ApiCode.SOCIAL_LOGIN_SUCCESS,
    message: 'Social login successful',
  })
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
  @ApiSuccess({ code: ApiCode.FETCHED, message: 'User fetched successfully' })
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
