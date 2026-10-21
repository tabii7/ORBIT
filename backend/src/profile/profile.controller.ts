import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/profile-contract.dto';
import {
  UpdateInterestsDto,
  UpdateMedicalProfileDto,
} from './dto/profile.dto';
import {
  AddPreferenceValuesDto,
  UpdatePreferenceCategoryDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto';
import { PREFERENCE_CATEGORIES } from './preferences.constants';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Profile')
@ApiBearerAuth('JWT')
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Profile fetched successfully',
  })
  @ApiOperation({
    summary: 'Get my profile (Flutter contract)',
    description: `Flat profile + preferences for fixed categories: ${PREFERENCE_CATEGORIES.join(', ')}.`,
  })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.profileService.getMyProfile(user.id);
  }

  @Get('preferences')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Preferences fetched successfully',
  })
  @ApiOperation({
    summary: 'Get my preferences',
    description: `Always returns all predefined categories (${PREFERENCE_CATEGORIES.join(', ')}) with string arrays (empty if unset).`,
  })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.profileService.getPreferences(user.id);
  }

  @Put('preferences')
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Preferences updated successfully',
  })
  @ApiOperation({
    summary: 'Replace all preferences',
    description:
      'Only predefined category keys allowed. Unknown keys → 400. Omitted categories become [].',
  })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.profileService.updatePreferences(user.id, dto);
  }

  @Put('preferences/:category')
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Preference category updated successfully',
  })
  @ApiParam({
    name: 'category',
    enum: PREFERENCE_CATEGORIES,
    example: 'travel',
    description: `One of: ${PREFERENCE_CATEGORIES.join(', ')}`,
  })
  @ApiOperation({
    summary: 'Set values for one preference category',
    description:
      'Replaces values for that category only. Empty `values` clears selections (category stays).',
  })
  setPreferenceCategory(
    @CurrentUser() user: AuthUser,
    @Param('category') category: string,
    @Body() dto: UpdatePreferenceCategoryDto,
  ) {
    return this.profileService.setPreferenceCategory(user.id, category, dto);
  }

  @Post('preferences/:category')
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Preference values added successfully',
  })
  @ApiParam({
    name: 'category',
    enum: PREFERENCE_CATEGORIES,
    example: 'travel',
  })
  @ApiOperation({
    summary: 'Add values to a preference category',
    description: 'Merges uniquely into existing values for that category.',
  })
  addPreferenceValues(
    @CurrentUser() user: AuthUser,
    @Param('category') category: string,
    @Body() dto: AddPreferenceValuesDto,
  ) {
    return this.profileService.addPreferenceValues(user.id, category, dto);
  }

  @Put()
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Profile updated successfully',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    description:
      'JSON without photo, or multipart with optional `avatar` file. Email is read-only (ignored). Do not send photo_path.',
    schema: {
      type: 'object',
      required: ['fullName'],
      properties: {
        fullName: { type: 'string', example: 'Ali Khan' },
        phone: { type: 'string', example: '+923001234567' },
        dateOfBirth: { type: 'string', example: '1998-05-12' },
        age: { type: 'number', example: 28 },
        country: { type: 'string', example: 'Pakistan' },
        currency: { type: 'string', example: 'PKR' },
        residence: { type: 'string', example: 'Lahore' },
        hobby: { type: 'string', example: 'Travel' },
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Update my profile (Flutter contract)',
    description:
      'PUT only. JSON or multipart. fullName required (2–80). Optional avatar jpeg/png/webp ≤5MB.',
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.profileService.updateMyProfile(user.id, dto, avatar);
  }

  @Put('interests')
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Interests updated successfully',
  })
  @ApiOperation({ summary: 'Set my interests (replaces list)' })
  updateInterests(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInterestsDto,
  ) {
    return this.profileService.updateInterests(user.id, dto);
  }

  @Get('medical')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Medical profile fetched successfully',
  })
  @ApiOperation({ summary: 'Get my medical profile' })
  getMedical(@CurrentUser() user: AuthUser) {
    return this.profileService.getMedical(user.id);
  }

  @Put('medical')
  @ApiSuccess({
    code: ApiCode.PROFILE_UPDATED,
    message: 'Medical profile updated successfully',
  })
  @ApiOperation({ summary: 'Update my medical profile' })
  updateMedical(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMedicalProfileDto,
  ) {
    return this.profileService.updateMedical(user.id, dto);
  }
}
