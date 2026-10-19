import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../files/file-storage.service';
import {
  ProfileContract,
  ProfilePreferences,
  UpdateProfileDto,
} from './dto/profile-contract.dto';
import {
  UpdateInterestsDto,
  UpdateMedicalProfileDto,
} from './dto/profile.dto';
import {
  AddPreferenceValuesDto,
  UpdatePreferenceCategoryDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto';
import { Prisma } from '@prisma/client';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly config: ConfigService,
  ) {}

  async getMyProfile(userId: string): Promise<ProfileContract> {
    const user = await this.loadUser(userId);
    return this.toContract(user);
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
    avatarFile?: Express.Multer.File,
  ): Promise<ProfileContract> {
    await this.ensureActiveUser(userId);

    if (avatarFile) {
      this.assertAvatar(avatarFile);
    }

    let dateOfBirth: Date | null | undefined = undefined;
    let age: number | null | undefined = dto.age;

    if (dto.dateOfBirth !== undefined) {
      const parsed = this.parseDob(dto.dateOfBirth);
      dateOfBirth = parsed;
      if (parsed) {
        age = this.ageFromDob(parsed);
      }
    }

    let avatarUrl: string | undefined;
    if (avatarFile) {
      const saved = await this.fileStorage.saveBuffer({
        userId,
        originalName: avatarFile.originalname || 'avatar.jpg',
        buffer: avatarFile.buffer,
        subdir: 'avatars',
      });
      avatarUrl = this.publicUrl(saved.publicUrl);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName.trim(),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      });

      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          phone: dto.phone ?? null,
          dateOfBirth: dateOfBirth ?? null,
          age: age ?? null,
          country: dto.country ?? null,
          currency: dto.currency ?? null,
          residence: dto.residence ?? null,
          hobby: dto.hobby ?? null,
          // keep city in sync with residence for older clients
          city: dto.residence ?? null,
        },
        update: {
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
          ...(age !== undefined ? { age } : {}),
          ...(dto.country !== undefined
            ? { country: dto.country || null }
            : {}),
          ...(dto.currency !== undefined
            ? { currency: dto.currency || null }
            : {}),
          ...(dto.residence !== undefined
            ? { residence: dto.residence || null, city: dto.residence || null }
            : {}),
          ...(dto.hobby !== undefined ? { hobby: dto.hobby || null } : {}),
        },
      });
    });

    return this.getMyProfile(userId);
  }

  async updateInterests(userId: string, dto: UpdateInterestsDto) {
    await this.ensureActiveUser(userId);
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, interests: dto.interests },
      update: { interests: dto.interests },
    });
    return this.getMyProfile(userId);
  }

  async getPreferences(userId: string): Promise<{ preferences: ProfilePreferences }> {
    await this.ensureActiveUser(userId);
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    return { preferences: this.normalizePreferences(profile?.preferences) };
  }

  /** Replace entire preferences map */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    await this.ensureActiveUser(userId);
    const preferences = this.normalizePreferences(dto.preferences);
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferences: preferences as Prisma.InputJsonValue,
      },
      update: { preferences: preferences as Prisma.InputJsonValue },
    });
    return this.getPreferences(userId);
  }

  /** Replace values for one category */
  async setPreferenceCategory(
    userId: string,
    category: string,
    dto: UpdatePreferenceCategoryDto,
  ) {
    await this.ensureActiveUser(userId);
    const key = this.normalizeCategory(category);
    const values = this.normalizeValues(dto.values);
    const current = await this.getPreferences(userId);
    const next: ProfilePreferences = { ...current.preferences };
    if (values.length === 0) {
      delete next[key];
    } else {
      next[key] = values;
    }
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferences: next as Prisma.InputJsonValue,
      },
      update: { preferences: next as Prisma.InputJsonValue },
    });
    return this.getPreferences(userId);
  }

  /** Merge values into one category */
  async addPreferenceValues(
    userId: string,
    category: string,
    dto: AddPreferenceValuesDto,
  ) {
    await this.ensureActiveUser(userId);
    const key = this.normalizeCategory(category);
    const toAdd = this.normalizeValues(dto.values);
    const current = await this.getPreferences(userId);
    const existing = current.preferences[key] ?? [];
    const merged = this.normalizeValues([...existing, ...toAdd]);
    const next: ProfilePreferences = {
      ...current.preferences,
      [key]: merged,
    };
    if (merged.length === 0) {
      delete next[key];
    }
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferences: next as Prisma.InputJsonValue,
      },
      update: { preferences: next as Prisma.InputJsonValue },
    });
    return this.getPreferences(userId);
  }

  async deletePreferenceCategory(userId: string, category: string) {
    await this.ensureActiveUser(userId);
    const key = this.normalizeCategory(category);
    const current = await this.getPreferences(userId);
    if (!(key in current.preferences)) {
      return current;
    }
    const next = { ...current.preferences };
    delete next[key];
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        preferences: next as Prisma.InputJsonValue,
      },
      update: { preferences: next as Prisma.InputJsonValue },
    });
    return this.getPreferences(userId);
  }

  async getMedical(userId: string) {
    await this.ensureActiveUser(userId);
    const medical = await this.prisma.medicalProfile.findUnique({
      where: { userId },
    });
    return (
      medical ?? {
        userId,
        currentSituation: null,
        conditions: [],
        allergies: [],
        currentMedications: [],
        bloodType: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
      }
    );
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

  private async loadUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        isActive: true,
        profile: true,
      },
    });
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive');
    }
    return user;
  }

  private toContract(user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    profile: {
      phone: string | null;
      dateOfBirth: Date | null;
      age: number | null;
      country: string | null;
      currency: string | null;
      residence: string | null;
      city: string | null;
      hobby: string | null;
      preferences?: unknown;
    } | null;
  }): ProfileContract {
    const p = user.profile;
    const dob = p?.dateOfBirth ?? null;
    const computedAge =
      p?.age ?? (dob ? this.ageFromDob(dob) : null);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: p?.phone ?? null,
      dateOfBirth: dob ? dob.toISOString().slice(0, 10) : null,
      age: computedAge,
      country: p?.country ?? null,
      currency: p?.currency ?? null,
      residence: p?.residence ?? p?.city ?? null,
      hobby: p?.hobby ?? null,
      avatarUrl: user.avatarUrl ? this.publicUrl(user.avatarUrl) : null,
      preferences: this.normalizePreferences(p?.preferences),
    };
  }

  private normalizeCategory(category: string): string {
    const key = category.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || key.length > 40) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { category: 'Category must be 1–40 characters' },
      });
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: {
          category:
            'Category must be letters, numbers, underscore (e.g. travel, food)',
        },
      });
    }
    return key;
  }

  private normalizeValues(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
      if (typeof raw !== 'string') continue;
      const v = raw.trim();
      if (!v || v.length > 80) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
      if (out.length >= 50) break;
    }
    return out;
  }

  private normalizePreferences(raw: unknown): ProfilePreferences {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    const out: ProfilePreferences = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      try {
        const key = this.normalizeCategory(k);
        const values = this.normalizeValues(v);
        if (values.length) out[key] = values;
      } catch {
        // skip invalid keys from stored JSON
      }
    }
    return out;
  }

  private parseDob(value: string): Date {
    const day = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { dateOfBirth: 'dateOfBirth must be YYYY-MM-DD' },
      });
    }
    const d = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { dateOfBirth: 'Invalid dateOfBirth' },
      });
    }
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    if (d.getTime() > todayUtc.getTime()) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { dateOfBirth: 'dateOfBirth cannot be in the future' },
      });
    }
    return d;
  }

  private ageFromDob(dob: Date): number {
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const m = now.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) {
      age -= 1;
    }
    return Math.max(0, Math.min(120, age));
  }

  private assertAvatar(file: Express.Multer.File) {
    if (file.size > AVATAR_MAX_BYTES) {
      throw new PayloadTooLargeException('Avatar must be <= 5MB');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!AVATAR_MIME.has(mime)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { avatar: 'Avatar must be jpeg, png, or webp' },
      });
    }
  }

  private publicUrl(stored: string) {
    if (/^https?:\/\//i.test(stored)) return stored;
    const base = (this.config.get<string>('PUBLIC_BASE_URL') || '').replace(
      /\/$/,
      '',
    );
    const path = stored.startsWith('/') ? stored : `/${stored}`;
    return base ? `${base}${path}` : path;
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundException('User not found or inactive');
    }
  }
}
