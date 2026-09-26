type Run = { status: string; startedAt: Date | null; finishedAt: Date | null };
type Success = { type: string; finishedAt: Date | null };
type Failure = { type: string; updatedAt: Date };

export function unresolvedFailures<T extends Failure>(failures: T[], successes: Success[]) {
  const latestSuccess = new Map<string, number>();
  for (const run of successes) {
    latestSuccess.set(run.type, Math.max(latestSuccess.get(run.type) ?? 0, run.finishedAt?.getTime() ?? 0));
  }
  return failures.filter((run) => (latestSuccess.get(run.type) ?? 0) <= run.updatedAt.getTime());
}

export function ingestionStatus(input: {
  latestJob: Run | null;
  successfulJob: Run | null;
  latestLegacy: Run | null;
  successfulLegacy: Run | null;
  now?: Date;
}) {
  // News discovery now runs through BackgroundJob. The legacy watchlist log
  // must not determine freshness once the queue has taken over.
  const queued = Boolean(input.latestJob);
  const latest = queued ? input.latestJob : input.latestLegacy;
  const successful = queued ? input.successfulJob : input.successfulLegacy;
  const maxAgeHours = queued ? 12 : 48;
  const age = successful?.finishedAt
    ? ((input.now ?? new Date()).getTime() - successful.finishedAt.getTime()) / 3_600_000
    : Infinity;
  const status = latest?.status === "failed" || latest?.status === "error"
    ? "error" as const
    : age > maxAgeHours ? "warn" as const : "ok" as const;
  return {
    status,
    source: queued ? "background-jobs" : "ingestion-runs",
    latestStartedAt: latest?.startedAt ?? null,
    latestStatus: latest?.status ?? "missing",
    lastSucceededAt: successful?.finishedAt ?? null,
    maxAgeHours
  };
}
