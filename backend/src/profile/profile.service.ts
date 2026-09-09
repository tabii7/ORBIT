import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateInterestsDto,
  UpdateMedicalProfileDto,
  UpdateProfileDto,
} from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        marketingOptIn: true,
        createdAt: true,
        profile: true,
        medicalProfile: true,
      },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      marketingOptIn: user.marketingOptIn,
      createdAt: user.createdAt,
      profile: user.profile ?? this.emptyProfile(userId),
      medical: user.medicalProfile ?? this.emptyMedical(userId),
    };
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    await this.ensureActiveUser(userId);

    const { fullName, avatarUrl, dateOfBirth, ...profileFields } = dto;

    await this.prisma.$transaction(async (tx) => {
      if (fullName !== undefined || avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(fullName !== undefined ? { fullName } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        });
      }

      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          ...profileFields,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        },
        update: {
          ...profileFields,
          ...(dateOfBirth !== undefined
            ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
            : {}),
        },
      });
    });

    return this.getMyProfile(userId);
  }

  async updateInterests(userId: string, dto: UpdateInterestsDto) {
    await this.ensureActiveUser(userId);

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        interests: dto.interests,
      },
      update: {
        interests: dto.interests,
      },
    });

    return this.getMyProfile(userId);
  }

  async getMedical(userId: string) {
    await this.ensureActiveUser(userId);

    const medical = await this.prisma.medicalProfile.findUnique({
      where: { userId },
    });

    return medical ?? this.emptyMedical(userId);
  }

  async updateMedical(userId: string, dto: UpdateMedicalProfileDto) {
    await this.ensureActiveUser(userId);

    await this.prisma.medicalProfile.upsert({
      where: { userId },
      create: {
        userId,
        currentSituation: dto.currentSituation,
        conditions: dto.conditions ?? [],
        allergies: dto.allergies ?? [],
        currentMedications: dto.currentMedications ?? [],
        bloodType: dto.bloodType,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        notes: dto.notes,
      },
      update: {
        ...(dto.currentSituation !== undefined
          ? { currentSituation: dto.currentSituation }
          : {}),
        ...(dto.conditions !== undefined ? { conditions: dto.conditions } : {}),
        ...(dto.allergies !== undefined ? { allergies: dto.allergies } : {}),
        ...(dto.currentMedications !== undefined
          ? { currentMedications: dto.currentMedications }
          : {}),
        ...(dto.bloodType !== undefined ? { bloodType: dto.bloodType } : {}),
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.getMedical(userId);
  }

  private async isActive(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    return !!user?.isActive;
  }

  private async ensureActiveUser(userId: string) {
    if (!(await this.isActive(userId))) {
      throw new NotFoundException('User not found or inactive');
    }
  }

  private emptyProfile(userId: string) {
    return {
      userId,
      phone: null,
      timezone: 'Asia/Dubai',
      bio: null,
      dateOfBirth: null,
      gender: null,
      language: 'en',
      country: null,
      city: null,
      interests: [],
    };
  }

  private emptyMedical(userId: string) {
    return {
      userId,
      currentSituation: null,
      conditions: [],
      allergies: [],
      currentMedications: [],
      bloodType: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
    };
  }
}
