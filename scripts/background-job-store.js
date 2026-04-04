const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function claimNextBackgroundJob() {
  const now = new Date();
  const job = await prisma.backgroundJob.findFirst({
    where: {
      status: "queued",
      runAt: { lte: now }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });

  if (!job) {
    return null;
  }

  return prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: "running",
      attempts: { increment: 1 },
      lockedAt: now,
      startedAt: now
    }
  });
}

async function completeBackgroundJob(jobId, result) {
  return prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      lockedAt: null,
      result: result || null,
      errorMessage: null
    }
  });
}

async function failBackgroundJob(jobId, input) {
  const current = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true }
  });

  const shouldRetry = current && current.attempts < current.maxAttempts;

  return prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: shouldRetry ? "queued" : "failed",
      finishedAt: shouldRetry ? null : new Date(),
      lockedAt: null,
      errorMessage: input.errorMessage || "Background job failed",
      runAt: shouldRetry ? new Date(Date.now() + 60_000) : undefined
    }
  });
}

async function disconnectBackgroundJobStore() {
  await prisma.$disconnect();
}

module.exports = {
  claimNextBackgroundJob,
  completeBackgroundJob,
  disconnectBackgroundJobStore,
  failBackgroundJob
};
