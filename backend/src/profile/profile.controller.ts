import { Body, Controller, Get, Put, Patch, UseGuards } from '@nestjs/common';
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

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.profileService.getMyProfile(user.id);
  }

  @Patch()
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateMyProfile(user.id, dto);
  }

  @Put('interests')
  updateInterests(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInterestsDto,
  ) {
    return this.profileService.updateInterests(user.id, dto);
  }

  @Get('medical')
  getMedical(@CurrentUser() user: AuthUser) {
    return this.profileService.getMedical(user.id);
  }

  @Put('medical')
  updateMedical(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMedicalProfileDto,
  ) {
    return this.profileService.updateMedical(user.id, dto);
  }
}
