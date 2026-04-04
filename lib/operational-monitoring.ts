import { prisma } from "@/lib/prisma";
import { getEnvironmentReport } from "@/lib/env";

type AlertSeverity = "info" | "warn" | "error";

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  source: string;
};

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return new Date(0).toISOString();
  }

  return new Date(value).toISOString();
}

function hoursSince(value: Date | string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

export async function getReadinessReport() {
  const environment = getEnvironmentReport();
  const [latestIngestionRun, queuedJobs, staleRunningJobs, recentFailedJobs] = await Promise.all([
    prisma.ingestionRun.findFirst({
      orderBy: { startedAt: "desc" }
    }),
    prisma.backgroundJob.count({
      where: {
        status: "queued"
      }
    }),
    prisma.backgroundJob.findMany({
      where: {
        status: "running"
      },
      orderBy: { startedAt: "asc" },
      take: 10
    }),
    prisma.backgroundJob.count({
      where: {
        status: "failed",
        updatedAt: {
          gte: new Date(Date.now() - 6 * 3_600_000)
        }
      }
    })
  ]);

  await prisma.$queryRaw`SELECT 1`;

  const staleRunningThresholdHours = 1;
  const staleRunningCount = staleRunningJobs.filter((job) => hoursSince(job.startedAt ?? job.updatedAt) > staleRunningThresholdHours).length;
  const ingestionIsFresh = latestIngestionRun ? hoursSince(latestIngestionRun.startedAt) <= 48 : false;
  const environmentReady = environment.readyForPublicDeploy;

  const checks = {
    database: {
      status: "ok" as const
    },
    environment: {
      status: environmentReady ? ("ok" as const) : ("warn" as const),
      warnings: environment.warnings
    },
    ingestion: {
      status: ingestionIsFresh ? ("ok" as const) : ("warn" as const),
      latestStartedAt: latestIngestionRun?.startedAt ?? null,
      latestStatus: latestIngestionRun?.status ?? "missing"
    },
    backgroundJobs: {
      status: staleRunningCount === 0 && recentFailedJobs === 0 ? ("ok" as const) : recentFailedJobs > 0 ? ("error" as const) : ("warn" as const),
      queuedJobs,
      staleRunningCount,
      recentFailedJobs
    }
  };

  const ok =
    checks.database.status === "ok" &&
    checks.environment.status === "ok" &&
    checks.backgroundJobs.status !== "error";

  return {
    ok,
    timestamp: new Date().toISOString(),
    checks
  };
}

export async function getOperationalAlerts(limit = 8): Promise<OperationalAlert[]> {
  const [recentErrorEvents, recentWarnEvents, failedJobs, staleRunningJobs, latestIngestionRun] = await Promise.all([
    prisma.systemEvent.findMany({
      where: {
        level: "error",
        createdAt: {
          gte: new Date(Date.now() - 24 * 3_600_000)
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.systemEvent.findMany({
      where: {
        level: "warn",
        createdAt: {
          gte: new Date(Date.now() - 6 * 3_600_000)
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.backgroundJob.findMany({
      where: {
        status: "failed"
      },
      orderBy: { updatedAt: "desc" },
      take: 3
    }),
    prisma.backgroundJob.findMany({
      where: {
        status: "running"
      },
      orderBy: { startedAt: "asc" },
      take: 3
    }),
    prisma.ingestionRun.findFirst({
      orderBy: { startedAt: "desc" }
    })
  ]);

  const alerts: OperationalAlert[] = [];

  for (const event of recentErrorEvents) {
    alerts.push({
      id: `event-${event.id}`,
      severity: "error",
      title: event.category,
      message: event.message,
      createdAt: toIsoString(event.createdAt),
      source: event.source || "system-events"
    });
  }

  for (const event of recentWarnEvents) {
    alerts.push({
      id: `warn-${event.id}`,
      severity: "warn",
      title: event.category,
      message: event.message,
      createdAt: toIsoString(event.createdAt),
      source: event.source || "system-events"
    });
  }

  for (const job of failedJobs) {
    alerts.push({
      id: `job-failed-${job.id}`,
      severity: "error",
      title: "Background job failed",
      message: `${job.type} failed after ${job.attempts}/${job.maxAttempts} attempts${job.errorMessage ? `: ${job.errorMessage}` : ""}`,
      createdAt: toIsoString(job.updatedAt),
      source: "background-jobs"
    });
  }

  for (const job of staleRunningJobs) {
    if (hoursSince(job.startedAt ?? job.updatedAt) <= 1) {
      continue;
    }

    alerts.push({
      id: `job-stale-${job.id}`,
      severity: "warn",
      title: "Background job is stale",
      message: `${job.type} has been running for more than one hour.`,
      createdAt: toIsoString(job.startedAt ?? job.updatedAt),
      source: "background-jobs"
    });
  }

  if (!latestIngestionRun || hoursSince(latestIngestionRun.startedAt) > 48) {
    alerts.push({
      id: "ingestion-stale",
      severity: "warn",
      title: "Ingestion appears stale",
      message: latestIngestionRun
        ? "No ingestion run has started in the last 48 hours."
        : "There are no ingestion runs recorded yet.",
      createdAt: latestIngestionRun ? toIsoString(latestIngestionRun.startedAt) : new Date().toISOString(),
      source: "ingestion"
    });
  }

  return alerts
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
