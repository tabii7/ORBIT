import {
  BusinessNoteKind,
  TaskContext,
  TaskPriority,
} from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BusinessNotesService } from '../../business/business-notes.service';
import { BusinessResearchService } from '../../business/business-research.service';
import { TasksService } from '../../productivity/tasks.service';

export type BusinessAgentAction = Record<string, unknown>;

export function createBusinessAgentTools(deps: {
  userId: string;
  businessNotesService: BusinessNotesService;
  businessResearchService: BusinessResearchService;
  tasksService: TasksService;
  actions: BusinessAgentAction[];
}) {
  const {
    userId,
    businessNotesService,
    businessResearchService,
    tasksService,
    actions,
  } = deps;

  const kindMap: Record<string, BusinessNoteKind> = {
    NOTE: BusinessNoteKind.NOTE,
    CHECKLIST: BusinessNoteKind.CHECKLIST,
    RESEARCH: BusinessNoteKind.RESEARCH,
    PLAN: BusinessNoteKind.PLAN,
  };

  const priorityMap: Record<string, TaskPriority> = {
    LOW: TaskPriority.LOW,
    MEDIUM: TaskPriority.MEDIUM,
    HIGH: TaskPriority.HIGH,
  };

  const createBusinessNote = tool(
    async (input) => {
      const note = await businessNotesService.create(userId, {
        title: input.title,
        body: input.body,
        kind: input.kind ? kindMap[input.kind.toUpperCase()] : undefined,
        checklistItems: input.checklist_items,
        tags: input.tags,
        sourceUrls: input.source_urls,
      });
      actions.push({ type: 'BUSINESS_NOTE_CREATED', data: note });
      return JSON.stringify({ ok: true, note });
    },
    {
      name: 'create_business_note',
      description:
        'Create a business note, checklist, plan, or research note.',
      schema: z.object({
        title: z.string(),
        body: z.string().optional(),
        kind: z
          .enum([
            'NOTE',
            'CHECKLIST',
            'RESEARCH',
            'PLAN',
            'note',
            'checklist',
            'research',
            'plan',
          ])
          .optional(),
        checklist_items: z
          .array(
            z.object({
              text: z.string(),
              done: z.boolean().optional(),
            }),
          )
          .optional(),
        tags: z.array(z.string()).optional(),
        source_urls: z.array(z.string()).optional(),
      }),
    },
  );

  const listBusinessNotes = tool(
    async (input) => {
      const kind = input.kind
        ? kindMap[input.kind.toUpperCase()]
        : undefined;
      const notes = await businessNotesService.list(userId, kind);
      return JSON.stringify({ ok: true, notes: notes.slice(0, 30) });
    },
    {
      name: 'list_business_notes',
      description: 'List business notes (optional kind filter).',
      schema: z.object({
        kind: z
          .enum([
            'NOTE',
            'CHECKLIST',
            'RESEARCH',
            'PLAN',
            'note',
            'checklist',
            'research',
            'plan',
          ])
          .optional(),
      }),
    },
  );

  const updateBusinessNote = tool(
    async (input) => {
      const note = await businessNotesService.update(userId, input.note_id, {
        title: input.title,
        body: input.body,
        kind: input.kind ? kindMap[input.kind.toUpperCase()] : undefined,
        checklistItems: input.checklist_items,
        tags: input.tags,
        sourceUrls: input.source_urls,
      });
      actions.push({ type: 'BUSINESS_NOTE_UPDATED', data: note });
      return JSON.stringify({ ok: true, note });
    },
    {
      name: 'update_business_note',
      description: 'Update a business note / checklist.',
      schema: z.object({
        note_id: z.string(),
        title: z.string().optional(),
        body: z.string().optional(),
        kind: z
          .enum([
            'NOTE',
            'CHECKLIST',
            'RESEARCH',
            'PLAN',
            'note',
            'checklist',
            'research',
            'plan',
          ])
          .optional(),
        checklist_items: z
          .array(
            z.object({
              text: z.string(),
              done: z.boolean().optional(),
            }),
          )
          .optional(),
        tags: z.array(z.string()).optional(),
        source_urls: z.array(z.string()).optional(),
      }),
    },
  );

  const deleteBusinessNote = tool(
    async (input) => {
      const result = await businessNotesService.remove(userId, input.note_id);
      actions.push({ type: 'BUSINESS_NOTE_DELETED', data: result });
      return JSON.stringify(result);
    },
    {
      name: 'delete_business_note',
      description: 'Delete a business note.',
      schema: z.object({ note_id: z.string() }),
    },
  );

  const createBusinessTask = tool(
    async (input) => {
      const task = await tasksService.create(
        userId,
        {
          title: input.title,
          description: input.description,
          priority: input.priority
            ? priorityMap[input.priority.toUpperCase()]
            : undefined,
          dueAt: input.due_at,
          tags: input.tags,
        },
        TaskContext.BUSINESS,
      );
      actions.push({ type: 'BUSINESS_TASK_CREATED', data: task });
      return JSON.stringify({ ok: true, task });
    },
    {
      name: 'create_business_task',
      description: 'Create a business-context task (work to-do).',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z
          .enum(['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high'])
          .optional(),
        due_at: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
  );

  const listBusinessTasks = tool(
    async (input) => {
      const tasks = await tasksService.list(userId, {
        includeDone: input.include_done === true,
        context: TaskContext.BUSINESS,
      });
      return JSON.stringify({ ok: true, tasks });
    },
    {
      name: 'list_business_tasks',
      description: 'List business tasks.',
      schema: z.object({ include_done: z.boolean().optional() }),
    },
  );

  const completeBusinessTask = tool(
    async (input) => {
      const task = await tasksService.complete(
        userId,
        input.task_id,
        TaskContext.BUSINESS,
      );
      actions.push({ type: 'BUSINESS_TASK_COMPLETED', data: task });
      return JSON.stringify({ ok: true, task });
    },
    {
      name: 'complete_business_task',
      description: 'Mark a business task done.',
      schema: z.object({ task_id: z.string() }),
    },
  );

  const researchBusiness = tool(
    async (input) => {
      const result = await businessResearchService.research(userId, input.query, {
        saveNote: input.save_note !== false,
        title: input.title,
      });
      actions.push({
        type: 'BUSINESS_RESEARCH',
        data: { ok: result.ok, noteId: result.note?.id },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'Present summary with markdown links to sources. Soft disclaimer: informational only.',
      });
    },
    {
      name: 'research_business',
      description:
        'Web-search a business topic; optionally save as RESEARCH note.',
      schema: z.object({
        query: z.string(),
        title: z.string().optional(),
        save_note: z.boolean().optional(),
      }),
    },
  );

  return [
    createBusinessNote,
    listBusinessNotes,
    updateBusinessNote,
    deleteBusinessNote,
    createBusinessTask,
    listBusinessTasks,
    completeBusinessTask,
    researchBusiness,
  ];
}
