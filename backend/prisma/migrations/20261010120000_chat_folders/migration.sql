-- CreateTable
CREATE TABLE "chat_folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_folders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "chat_folders_userId_sortOrder_idx" ON "chat_folders"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "chat_folders_userId_name_key" ON "chat_folders"("userId", "name");

-- CreateIndex
CREATE INDEX "conversations_userId_folderId_idx" ON "conversations"("userId", "folderId");

-- AddForeignKey
ALTER TABLE "chat_folders" ADD CONSTRAINT "chat_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "chat_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
