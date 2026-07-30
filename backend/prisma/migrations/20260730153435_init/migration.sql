-- CreateEnum
CREATE TYPE "tsf_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "tsf_task_status" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "tsf_refresh_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "tsf_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tsf_tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "tsf_task_status" NOT NULL DEFAULT 'PENDING',
    "priority" "tsf_priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "tsf_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tsf_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tsf_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tsf_refresh_tokens_tokenHash_key" ON "tsf_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "tsf_refresh_tokens_userId_idx" ON "tsf_refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "tsf_refresh_tokens_tokenHash_idx" ON "tsf_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "tsf_tasks_userId_status_idx" ON "tsf_tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "tsf_tasks_userId_priority_idx" ON "tsf_tasks"("userId", "priority");

-- CreateIndex
CREATE INDEX "tsf_tasks_userId_createdAt_idx" ON "tsf_tasks"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tsf_users_email_key" ON "tsf_users"("email");

-- AddForeignKey
ALTER TABLE "tsf_refresh_tokens" ADD CONSTRAINT "tsf_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "tsf_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tsf_tasks" ADD CONSTRAINT "tsf_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "tsf_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
