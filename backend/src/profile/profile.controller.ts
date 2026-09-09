import { Body, Controller, Get, Put, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import {
  UpdateInterestsDto,
  UpdateMedicalProfileDto,
  UpdateProfileDto,
} from './dto/profile.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Profile')
@ApiBearerAuth('JWT')
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'Get my full profile',
    description: 'Returns basic user info, interests, and medical situation.',
  })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.profileService.getMyProfile(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Update name, avatar, phone, timezone, bio, DOB, gender, language, country, city.',
  })
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateMyProfile(user.id, dto);
  }

  @Put('interests')
  @ApiOperation({
    summary: 'Set my interests',
    description: 'Replaces the full interests list.',
  })
  updateInterests(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInterestsDto,
  ) {
    return this.profileService.updateInterests(user.id, dto);
  }

  @Get('medical')
  @ApiOperation({
    summary: 'Get my medical profile',
    description:
      'Lightweight medical context for reminders — not a clinical record.',
  })
  getMedical(@CurrentUser() user: AuthUser) {
    return this.profileService.getMedical(user.id);
  }

  @Put('medical')
  @ApiOperation({
    summary: 'Update my medical profile',
    description:
      'Upsert current situation, conditions, allergies, medications, blood type, emergency contact.',
  })
  updateMedical(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMedicalProfileDto,
  ) {
    return this.profileService.updateMedical(user.id, dto);
  }
}
