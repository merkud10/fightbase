const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const DEFAULT_MODELS = ["qwen2.5:14b", "qwen3:14b", "gemma4:e4b"];
const TESTS_PATH = path.join(process.cwd(), "benchmark-data", "local-model-tests.json");
const OUT_DIR = path.join(process.cwd(), "tmp");
const JSON_OUT = path.join(OUT_DIR, "local-model-benchmark-results.json");
const MD_OUT = path.join(OUT_DIR, "local-model-benchmark-report.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildPrompt(test) {
  return [
    "Ты редактор серьезного русскоязычного ММА-медиа.",
    "Пиши только по-русски, если задача не требует иного.",
    "Не выдумывай факты, имена, даты, причины, цитаты и контекст.",
    "Не добавляй дисклеймеры о том, что ты ИИ.",
    "Если исходных данных мало, работай только с тем, что есть.",
    "",
    `Задача: ${test.task}`,
    "",
    "Исходный текст:",
    test.input
  ].join("\n");
}

async function generate({ url, model, prompt }) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama request failed for ${model}: ${response.status} ${body}`);
  }

  const payload = await response.json();
  return {
    output: String(payload.response || "").trim(),
    elapsedMs: Date.now() - startedAt,
    evalCount: payload.eval_count ?? null,
    promptEvalCount: payload.prompt_eval_count ?? null
  };
}

function scoreOutput(output) {
  const text = output.trim();
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  const cyrillicChars = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const oddsMentions = (text.match(/\b(odds|line|коэффициент|котировк|процент шансов|букмекер)/gi) || []).length;
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean).length;

  return {
    chars: text.length,
    paragraphs,
    latinShare: latinChars + cyrillicChars > 0 ? Number((latinChars / (latinChars + cyrillicChars)).toFixed(3)) : 0,
    exclamations,
    oddsMentions
  };
}

function trimPreview(text, max = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function buildMarkdown(results) {
  const lines = [
    "# Сравнение локальных моделей",
    "",
    `Дата: ${new Date().toLocaleString("ru-RU")}`,
    "",
    "Модели:",
    ...results.models.map((model) => `- ${model}`),
    "",
    `Тестов: ${results.tests.length}`,
    ""
  ];

  for (const test of results.tests) {
    lines.push(`## ${test.title}`);
    lines.push("");
    lines.push(`ID: \`${test.id}\``);
    lines.push("");
    lines.push("Задача:");
    lines.push(test.task);
    lines.push("");
    lines.push("Исходный текст:");
    lines.push(`> ${test.input}`);
    lines.push("");

    for (const run of test.runs) {
      lines.push(`### ${run.model}`);
      lines.push("");
      lines.push(`- Время: ${run.elapsedMs} мс`);
      lines.push(`- Длина: ${run.metrics.chars} символов`);
      lines.push(`- Абзацев: ${run.metrics.paragraphs}`);
      lines.push(`- Доля латиницы: ${run.metrics.latinShare}`);
      lines.push(`- Упоминаний коэффициентов: ${run.metrics.oddsMentions}`);
      lines.push("");
      lines.push(run.output);
      lines.push("");
    }
  }

  lines.push("## Короткие превью");
  lines.push("");
  for (const test of results.tests) {
    lines.push(`### ${test.id}`);
    lines.push("");
    for (const run of test.runs) {
      lines.push(`- ${run.model}: ${trimPreview(run.output)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS;
  const tests = readJson(TESTS_PATH);
  ensureDir(OUT_DIR);

  const results = {
    url: DEFAULT_URL,
    models,
    tests: []
  };

  for (const test of tests) {
    console.log(`\n[TEST] ${test.id} - ${test.title}`);
    const runs = [];
    const prompt = buildPrompt(test);

    for (const model of models) {
      process.stdout.write(`  -> ${model} ... `);
      const run = await generate({ url: DEFAULT_URL, model, prompt });
      const metrics = scoreOutput(run.output);
      console.log(`${run.elapsedMs} ms`);
      runs.push({
        model,
        output: run.output,
        elapsedMs: run.elapsedMs,
        evalCount: run.evalCount,
        promptEvalCount: run.promptEvalCount,
        metrics
      });
    }

    results.tests.push({
      id: test.id,
      title: test.title,
      task: test.task,
      input: test.input,
      runs
    });
  }

  fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2), "utf8");
  fs.writeFileSync(MD_OUT, buildMarkdown(results), "utf8");

  console.log(`\nSaved JSON: ${JSON_OUT}`);
  console.log(`Saved report: ${MD_OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
