CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT');
CREATE TYPE "ExtractStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'SKIPPED');

ALTER TABLE "health_documents"
  ADD COLUMN "storagePath" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "byteSize" INTEGER,
  ADD COLUMN "extractStatus" "ExtractStatus" NOT NULL DEFAULT 'SKIPPED',
  ADD COLUMN "extractedText" TEXT;

CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT,
    "extractStatus" "ExtractStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractError" TEXT,
    "healthDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_healthDocumentId_fkey"
  FOREIGN KEY ("healthDocumentId") REFERENCES "health_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
