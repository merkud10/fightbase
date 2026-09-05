/**
 * Прогоняет материалы из JSON (см. discover-weekly-news.js --dump) через мост Codex и DeepSeek
 * и пишет markdown-отчёт. Запуск на проде из /opt/fightbase (там .env с ключами и туннель):
 *   npx tsx scripts/compare-ai-providers.ts /tmp/items.json --limit 10 --out /tmp/ai-compare.md
 */
import fs from "node:fs";
import path from "node:path";

import { localizeIngestionInput, type LocalizationProviderOverride } from "../lib/ai-localization";
import { buildCompareReport, type CompareOutcome, type CompareRow } from "./ai-compare-report";

type DumpedItem = {
  headline: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt?: string;
  category?: string;
};

const PROVIDERS: LocalizationProviderOverride[] = ["codex", "deepseek"];

function parseArgs(argv: string[]) {
  const options = { file: "", limit: 10, out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[++index]) || 10;
    } else if (arg === "--out" && argv[index + 1]) {
      options.out = argv[++index] ?? "";
    } else if (!options.file) {
      options.file = arg;
    }
  }
  if (!options.file) {
    throw new Error("usage: compare-ai-providers.ts <items.json> [--limit N] [--out report.md]");
  }
  if (!options.out) {
    options.out = path.join("ops", "reports", `ai-compare-${new Date().toISOString().slice(0, 10)}.md`);
  }
  return options;
}

async function runProvider(provider: LocalizationProviderOverride, item: DumpedItem): Promise<CompareOutcome> {
  const started = Date.now();
  try {
    const result = await localizeIngestionInput(
      { headline: item.headline, body: item.body, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl },
      { provider }
    );
    return {
      provider,
      ok: result.localized,
      model: result.model,
      headline: result.headline,
      body: result.body,
      interestScore: result.interestScore,
      durationMs: Date.now() - started,
      error: result.localized ? null : "provider returned the source text unchanged"
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      model: null,
      headline: "",
      body: "",
      interestScore: null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const items = (JSON.parse(fs.readFileSync(options.file, "utf8")) as DumpedItem[]).slice(0, options.limit);
  const rows: CompareRow[] = [];

  for (const [position, item] of items.entries()) {
    const outcomes: CompareOutcome[] = [];
    for (const provider of PROVIDERS) {
      console.log(`[${position + 1}/${items.length}] ${provider}: ${item.headline}`);
      const outcome = await runProvider(provider, item);
      console.log(
        `  -> ${outcome.ok ? "ok" : "error"} in ${(outcome.durationMs / 1000).toFixed(1)}s${outcome.error ? `: ${outcome.error.slice(0, 160)}` : ""}`
      );
      outcomes.push(outcome);
    }
    rows.push({ index: position + 1, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, headline: item.headline, outcomes });
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, buildCompareReport(rows), "utf8");
  console.log(`Report written to ${options.out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
