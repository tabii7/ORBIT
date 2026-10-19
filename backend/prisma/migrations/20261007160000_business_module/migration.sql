-- CreateEnum
CREATE TYPE "TaskContext" AS ENUM ('PERSONAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BusinessNoteKind" AS ENUM ('NOTE', 'CHECKLIST', 'RESEARCH', 'PLAN');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "context" "TaskContext" NOT NULL DEFAULT 'PERSONAL';

-- CreateIndex
CREATE INDEX "tasks_userId_context_status_idx" ON "tasks"("userId", "context", "status");

-- CreateTable
CREATE TABLE "business_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "kind" "BusinessNoteKind" NOT NULL DEFAULT 'NOTE',
    "checklistItems" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_notes_userId_kind_createdAt_idx" ON "business_notes"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "business_notes" ADD CONSTRAINT "business_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
