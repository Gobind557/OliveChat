CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');
CREATE TYPE "InferenceStatus" AS ENUM ('SUCCESS', 'ERROR', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "auth0Subject" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Provider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Model" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InferenceLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT,
  "conversationId" TEXT,
  "sessionId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "InferenceStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "latencyMs" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "inputPreview" TEXT,
  "outputPreview" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requestMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InferenceLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InferenceMetadata" (
  "id" TEXT NOT NULL,
  "inferenceLogId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InferenceMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_auth0Subject_key" ON "User"("auth0Subject");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");
CREATE INDEX "Conversation_userId_status_updatedAt_idx" ON "Conversation"("userId", "status", "updatedAt");
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
CREATE UNIQUE INDEX "Provider_name_key" ON "Provider"("name");
CREATE UNIQUE INDEX "Model_providerId_name_key" ON "Model"("providerId", "name");
CREATE INDEX "Model_name_idx" ON "Model"("name");
CREATE UNIQUE INDEX "InferenceLog_eventId_key" ON "InferenceLog"("eventId");
CREATE INDEX "InferenceLog_createdAt_idx" ON "InferenceLog"("createdAt");
CREATE INDEX "InferenceLog_userId_createdAt_idx" ON "InferenceLog"("userId", "createdAt");
CREATE INDEX "InferenceLog_conversationId_createdAt_idx" ON "InferenceLog"("conversationId", "createdAt");
CREATE INDEX "InferenceLog_provider_model_createdAt_idx" ON "InferenceLog"("provider", "model", "createdAt");
CREATE INDEX "InferenceLog_status_createdAt_idx" ON "InferenceLog"("status", "createdAt");
CREATE UNIQUE INDEX "InferenceMetadata_inferenceLogId_key" ON "InferenceMetadata"("inferenceLogId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Model" ADD CONSTRAINT "Model_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InferenceLog" ADD CONSTRAINT "InferenceLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InferenceMetadata" ADD CONSTRAINT "InferenceMetadata_inferenceLogId_fkey" FOREIGN KEY ("inferenceLogId") REFERENCES "InferenceLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
