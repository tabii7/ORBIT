import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  BusinessNoteKind,
  Role,
  TaskContext,
  TaskStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { TasksService } from '../productivity/tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
} from '../productivity/dto/productivity.dto';
import { BusinessNotesService } from './business-notes.service';
import {
  BusinessResearchDto,
  CreateBusinessNoteDto,
  UpdateBusinessNoteDto,
} from './dto/business.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Business')
@ApiBearerAuth('JWT')
@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(
    private readonly businessNotesService: BusinessNotesService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('notes')
  @ApiSuccess({
    code: ApiCode.BUSINESS_NOTE_LIST,
    message: 'Business notes fetched successfully',
  })
  @ApiOperation({ summary: 'List business notes / checklists / research' })
  @ApiQuery({ name: 'kind', required: false, enum: BusinessNoteKind })
  listNotes(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: BusinessNoteKind,
  ) {
    return this.businessNotesService.list(user.id, kind);
  }

  @Post('notes')
  @ApiSuccess({
    code: ApiCode.BUSINESS_NOTE_CREATED,
    message: 'Business note created successfully',
  })
  @ApiOperation({
    summary: 'Create business note',
    description: 'Kinds: NOTE, CHECKLIST, RESEARCH, PLAN',
  })
  createNote(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBusinessNoteDto,
  ) {
    return this.businessNotesService.create(user.id, dto);
  }

  @Patch('notes/:id')
  @ApiSuccess({
    code: ApiCode.BUSINESS_NOTE_UPDATED,
    message: 'Business note updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update business note' })
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessNoteDto,
  ) {
    return this.businessNotesService.update(user.id, id, dto);
  }

  @Delete('notes/:id')
  @ApiSuccess({
    code: ApiCode.BUSINESS_NOTE_DELETED,
    message: 'Business note deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete business note' })
  deleteNote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.businessNotesService.remove(user.id, id);
  }

  @Get('tasks')
  @ApiSuccess({
    code: ApiCode.BUSINESS_TASK_LIST,
    message: 'Business tasks fetched successfully',
  })
  @ApiOperation({ summary: 'List business-context tasks' })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'includeDone', required: false, example: 'true' })
  listTasks(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: TaskStatus,
    @Query('includeDone') includeDone?: string,
  ) {
    return this.tasksService.list(user.id, {
      status,
      includeDone: includeDone === 'true' || includeDone === '1',
      context: TaskContext.BUSINESS,
    });
  }

  @Post('tasks')
  @ApiSuccess({
    code: ApiCode.BUSINESS_TASK_CREATED,
    message: 'Business task created successfully',
  })
  @ApiOperation({ summary: 'Create a business task' })
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.id, dto, TaskContext.BUSINESS);
  }

  @Patch('tasks/:id')
  @ApiSuccess({
    code: ApiCode.TASK_UPDATED,
    message: 'Task updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update a business task' })
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(
      user.id,
      id,
      dto,
      TaskContext.BUSINESS,
    );
  }

  @Post('tasks/:id/complete')
  @ApiSuccess({
    code: ApiCode.TASK_UPDATED,
    message: 'Task completed successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Complete a business task' })
  completeTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.complete(user.id, id, TaskContext.BUSINESS);
  }

  @Delete('tasks/:id')
  @ApiSuccess({
    code: ApiCode.TASK_DELETED,
    message: 'Task deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a business task' })
  deleteTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.remove(user.id, id, TaskContext.BUSINESS);
  }

  @Post('research')
  @ApiSuccess({
    code: ApiCode.BUSINESS_RESEARCH,
    message: 'Business research ready',
  })
  @ApiOperation({
    summary: 'Web research for business topics (via chat only)',
    description:
      'CLOSED as a direct REST call. OpenAI is only used from POST /api/chat. Ask in chat instead.',
  })
  research(@CurrentUser() _user: AuthUser, @Body() _dto: BusinessResearchDto) {
    return {
      ok: false,
      error:
        'Direct research API is closed. OpenAI runs only when you chat via POST /api/chat.',
      summary: null,
      sources: [],
    };
  }
}
