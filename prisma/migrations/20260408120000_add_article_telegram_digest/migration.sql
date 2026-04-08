-- AlterTable (IF NOT EXISTS: если колонку уже добавили вручную или через db push)
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "telegramDigest" TEXT;
