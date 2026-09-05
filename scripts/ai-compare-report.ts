export type CompareOutcome = {
  provider: string;
  ok: boolean;
  model: string | null;
  headline: string;
  body: string;
  interestScore: number | null;
  durationMs: number;
  error: string | null;
};

export type CompareRow = {
  index: number;
  sourceLabel: string;
  sourceUrl: string;
  headline: string;
  outcomes: CompareOutcome[];
};

function seconds(ms: number) {
  return (ms / 1000).toFixed(1);
}

function outcomeHeading(outcome: CompareOutcome) {
  if (!outcome.ok) {
    return `### ${outcome.provider} — ошибка, ${seconds(outcome.durationMs)} с`;
  }
  const interest = outcome.interestScore === null ? "interest —" : `interest ${outcome.interestScore}`;
  return `### ${outcome.provider} — ${outcome.model ?? "?"}, ${seconds(outcome.durationMs)} с, ${interest}`;
}

function summaryTable(rows: CompareRow[]) {
  const providers = new Map<string, { runs: number; errors: number; totalMs: number; totalLength: number; okCount: number }>();
  for (const row of rows) {
    for (const outcome of row.outcomes) {
      const entry = providers.get(outcome.provider) ?? { runs: 0, errors: 0, totalMs: 0, totalLength: 0, okCount: 0 };
      entry.runs += 1;
      entry.totalMs += outcome.durationMs;
      if (outcome.ok) {
        entry.okCount += 1;
        entry.totalLength += outcome.body.length;
      } else {
        entry.errors += 1;
      }
      providers.set(outcome.provider, entry);
    }
  }
  const lines = [
    "| провайдер | запусков | ошибок | среднее время, с | средняя длина текста, символов |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const [provider, entry] of providers) {
    const avgSeconds = entry.runs ? seconds(entry.totalMs / entry.runs) : "—";
    const avgLength = entry.okCount ? String(Math.round(entry.totalLength / entry.okCount)) : "—";
    lines.push(`| ${provider} | ${entry.runs} | ${entry.errors} | ${avgSeconds} | ${avgLength} |`);
  }
  return lines.join("\n");
}

export function buildCompareReport(rows: CompareRow[], options: { generatedAt?: string } = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const parts: string[] = [
    "# Сравнение AI-провайдеров",
    "",
    `Сформировано: ${generatedAt}. Материалов: ${rows.length}.`,
    "",
    "## Сводка",
    "",
    summaryTable(rows),
    ""
  ];

  for (const row of rows) {
    parts.push(`## ${row.index}. ${row.headline}`, "", `Источник: ${row.sourceLabel} — ${row.sourceUrl}`, "");
    for (const outcome of row.outcomes) {
      parts.push(outcomeHeading(outcome), "");
      if (!outcome.ok) {
        parts.push("```", outcome.error ?? "unknown error", "```", "");
        continue;
      }
      parts.push(`**${outcome.headline}**`, "", outcome.body, "");
    }
  }

  return parts.join("\n");
}
