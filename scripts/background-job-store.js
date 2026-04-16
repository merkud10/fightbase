const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000;

async function reapStaleRunningJobs() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
  const stale = await prisma.backgroundJob.findMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    select: { id: true, attempts: true, maxAttempts: true }
  });

  for (const job of stale) {
    const shouldRetry = job.attempts < job.maxAttempts;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: shouldRetry ? "queued" : "failed",
        finishedAt: shouldRetry ? null : new Date(),
        lockedAt: null,
        errorMessage: "Reaped: job stuck in running state for over 30 minutes",
        runAt: shouldRetry ? new Date(Date.now() + 60_000) : undefined
      }
    });
    console.log(`Reaped stale job ${job.id} → ${shouldRetry ? "queued (retry)" : "failed"}`);
  }
}

async function claimNextBackgroundJob() {
  await reapStaleRunningJobs();

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
