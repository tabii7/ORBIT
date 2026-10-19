-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "residence" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hobby" TEXT;
