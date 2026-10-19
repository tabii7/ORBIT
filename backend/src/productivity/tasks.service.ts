import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskContext, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/productivity.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  list(
    userId: string,
    opts?: {
      status?: TaskStatus;
      includeDone?: boolean;
      context?: TaskContext;
    },
  ) {
    return this.prisma.task.findMany({
      where: {
        userId,
        ...(opts?.context ? { context: opts.context } : {}),
        ...(opts?.status
          ? { status: opts.status }
          : opts?.includeDone
            ? {}
            : { status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] } }),
      },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async get(userId: string, id: string, context?: TaskContext) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        userId,
        ...(context ? { context } : {}),
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  create(
    userId: string,
    dto: CreateTaskDto,
    context: TaskContext = TaskContext.PERSONAL,
  ) {
    return this.prisma.task.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        context,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        tags: dto.tags ?? [],
      },
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTaskDto,
    context?: TaskContext,
  ) {
    await this.get(userId, id, context);
    const status = dto.status;
    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.dueAt !== undefined
          ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }
          : {}),
        ...(status !== undefined
          ? {
              status,
              completedAt:
                status === TaskStatus.DONE
                  ? new Date()
                  : status === TaskStatus.TODO ||
                      status === TaskStatus.IN_PROGRESS
                    ? null
                    : undefined,
            }
          : {}),
      },
    });
  }

  async complete(userId: string, id: string, context?: TaskContext) {
    return this.update(userId, id, { status: TaskStatus.DONE }, context);
  }

  async remove(userId: string, id: string, context?: TaskContext) {
    await this.get(userId, id, context);
    await this.prisma.task.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }
}
