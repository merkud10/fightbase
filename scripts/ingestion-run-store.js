const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function startIngestionRun(input) {
  return prisma.ingestionRun.create({
    data: {
      sourceKind: input.sourceKind,
      mode: input.mode,
      status: "running",
      filePath: input.filePath || null,
      baseUrl: input.baseUrl || null,
      itemCount: input.itemCount || 0,
      message: input.message || null
    }
  });
}

async function finishIngestionRun(runId, input) {
  return prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      status: input.status,
      createdCount: input.createdCount || 0,
      duplicateCount: input.duplicateCount || 0,
      failedCount: input.failedCount || 0,
      durationMs: input.durationMs ?? null,
      message: input.message || null,
      finishedAt: new Date()
    }
  });
}

async function failIngestionRun(runId, input) {
  return prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      status: input.status || "failed",
      createdCount: input.createdCount || 0,
      duplicateCount: input.duplicateCount || 0,
      failedCount: input.failedCount || 1,
      durationMs: input.durationMs ?? null,
      message: input.message || "Ingestion run failed",
      finishedAt: new Date()
    }
  });
}

async function disconnectIngestionRunStore() {
  await prisma.$disconnect();
}

module.exports = {
  disconnectIngestionRunStore,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun
};
