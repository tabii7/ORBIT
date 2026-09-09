import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    email: string;
    passwordHash?: string;
    fullName: string;
    role: Role;
    avatarUrl?: string;
    marketingOptIn?: boolean;
  }) {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findActiveById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive');
    }
    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async createByAdmin(
    dto: CreateUserDto,
    actor: { id: string; role: Role },
  ) {
    this.assertCanAssignRole(actor.role, dto.role);

    const existing = await this.findByEmail(dto.email.toLowerCase());
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actor: { id: string; role: Role },
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (dto.role) {
      this.assertCanAssignRole(actor.role, dto.role);
      this.assertCanManageTarget(actor, target.role);
    } else {
      this.assertCanManageTarget(actor, target.role);
    }

    if (actor.role === Role.ADMIN && target.role === Role.SUPERADMIN) {
      throw new ForbiddenException('Admin cannot modify SuperAdmin');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  private assertCanAssignRole(actorRole: Role, targetRole: Role) {
    if (actorRole === Role.SUPERADMIN) {
      return;
    }
    if (actorRole === Role.ADMIN && targetRole === Role.USER) {
      return;
    }
    throw new ForbiddenException(
      'You cannot assign this role. Only SuperAdmin can create Admin/SuperAdmin.',
    );
  }

  private assertCanManageTarget(
    actor: { id: string; role: Role },
    targetRole: Role,
  ) {
    if (actor.role === Role.SUPERADMIN) {
      return;
    }
    if (actor.role === Role.ADMIN && targetRole === Role.USER) {
      return;
    }
    throw new ForbiddenException('You cannot manage this user');
  }
}
