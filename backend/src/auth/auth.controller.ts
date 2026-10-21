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
import {
  ForgotPasswordDto,
  ResendResetOtpDto,
  ResetPasswordDto,
} from './dto/forgot-password.dto';
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

  @Post('forgot-password')
  @ApiSuccess({
    code: ApiCode.OTP_SENT,
    message:
      'If an account exists for this email, a reset code has been sent',
  })
  @ApiOperation({
    summary: 'Forgot password (step 1 — send reset OTP)',
    description:
      'Emails a 6-digit reset code if the account exists, is verified, and has a password. Response does not reveal whether the email exists. Next: `POST /auth/reset-password`.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('resend-reset-otp')
  @ApiSuccess({
    code: ApiCode.OTP_SENT,
    message:
      'If an account exists for this email, a reset code has been sent',
  })
  @ApiOperation({
    summary: 'Resend password-reset OTP',
  })
  resendResetOtp(@Body() dto: ResendResetOtpDto) {
    return this.authService.resendResetOtp(dto);
  }

  @Post('reset-password')
  @ApiSuccess({
    code: ApiCode.PASSWORD_RESET_SUCCESS,
    message: 'Password reset successfully',
  })
  @ApiOperation({
    summary: 'Reset password (step 2 — OTP + new password → JWT)',
    description:
      'Validates reset OTP, sets new password, returns accessToken (user is logged in).',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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
