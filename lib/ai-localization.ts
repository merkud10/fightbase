import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { IngestDraftInput } from "@/lib/ingestion";

type LocalizedIngestionResult = {
  headline: string;
  body: string;
  localized: boolean;
  model: string | null;
};

const openAiApiUrl = "https://api.openai.com/v1/responses";
const defaultOpenAiModel = "gpt-4o-mini";
const defaultOllamaUrl = "http://127.0.0.1:11434/api/generate";
const defaultOllamaModel = "aya:8b-23";
const execFileAsync = promisify(execFile);

function readEnvValueFromFile(name: string) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function getEnvValue(name: string, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function getOpenAiApiKey() {
  return getEnvValue("OPENAI_API_KEY");
}

function getOpenAiModel() {
  return getEnvValue("OPENAI_INGEST_MODEL", defaultOpenAiModel);
}

function getOllamaUrl() {
  return getEnvValue("OLLAMA_URL", defaultOllamaUrl);
}

function getOllamaModel() {
  return getEnvValue("OLLAMA_MODEL", defaultOllamaModel);
}

function looksRussian(value: string) {
  return /[А-Яа-яЁё]/.test(value);
}

function sanitizeJsonPayload(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? value.trim();
}

function parseLocalizationResponse(rawText: string) {
  const parsed = JSON.parse(sanitizeJsonPayload(rawText)) as {
    headline?: string;
    body?: string;
  };

  if (!parsed.headline || !parsed.body) {
    throw new Error("Localization response is missing headline or body");
  }

  return {
    headline: parsed.headline.trim(),
    body: parsed.body.trim()
  };
}

function applyCaseAwareReplacement(value: string, replacements: Array<[RegExp, string]>) {
  let next = value;

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

function enforceWeightClassTerminology(sourceText: string, localizedText: string) {
  const lowerSource = sourceText.toLowerCase();
  let next = localizedText;

  const correctionRules: Array<{ term: string; replacements: Array<[RegExp, string]> }> = [
    {
      term: "featherweight",
      replacements: [
        [/\bлегкий вес\b/gi, "полулегкий вес"],
        [/\bлегкого веса\b/gi, "полулегкого веса"],
        [/\bлегком весе\b/gi, "полулегком весе"]
      ]
    },
    {
      term: "lightweight",
      replacements: [
        [/\bполулегкий вес\b/gi, "легкий вес"],
        [/\bполулегкого веса\b/gi, "легкого веса"],
        [/\bполулегком весе\b/gi, "легком весе"]
      ]
    },
    {
      term: "welterweight",
      replacements: [
        [/\bсредний вес\b/gi, "полусредний вес"],
        [/\bсреднего веса\b/gi, "полусреднего веса"],
        [/\bсреднем весе\b/gi, "полусреднем весе"]
      ]
    },
    {
      term: "light heavyweight",
      replacements: [
        [/\bтяжелый вес\b/gi, "полутяжелый вес"],
        [/\bтяжелого веса\b/gi, "полутяжелого веса"],
        [/\bтяжелом весе\b/gi, "полутяжелом весе"]
      ]
    }
  ];

  for (const rule of correctionRules) {
    if (lowerSource.includes(rule.term)) {
      next = applyCaseAwareReplacement(next, rule.replacements);
    }
  }

  return next;
}

function enforcePromotionLabel(input: IngestDraftInput, localizedHeadline: string) {
  const sourceLabel = input.sourceLabel.trim();
  if (!sourceLabel) {
    return localizedHeadline;
  }

  if (!input.headline.startsWith(sourceLabel) || localizedHeadline.includes(sourceLabel)) {
    return localizedHeadline;
  }

  const remainder = localizedHeadline.replace(/^\S+\s*/, "").trim();
  return remainder ? `${sourceLabel} ${remainder}` : sourceLabel;
}

function normalizeLocalizedOutput(
  input: IngestDraftInput,
  localized: { headline: string; body: string }
) {
  const sourceText = `${input.headline}\n${input.body}`;

  return {
    headline: enforceWeightClassTerminology(sourceText, enforcePromotionLabel(input, localized.headline)),
    body: enforceWeightClassTerminology(sourceText, localized.body)
  };
}

function buildGlossaryHints(input: IngestDraftInput) {
  const sourceText = `${input.headline}\n${input.body}`.toLowerCase();
  const glossary = [
    ["light heavyweight", "полутяжелый вес"],
    ["featherweight", "полулегкий вес"],
    ["lightweight", "легкий вес"],
    ["welterweight", "полусредний вес"],
    ["middleweight", "средний вес"],
    ["heavyweight", "тяжелый вес"],
    ["bantamweight", "легчайший вес"],
    ["flyweight", "наилегчайший вес"],
    ["main card", "основной кард"],
    ["prelims", "предварительный кард"],
    ["showcase", "шоу или турнир по контексту, не выставка"],
    ["rematch", "реванш"]
  ];

  const matched = glossary.filter(([term]) => sourceText.includes(term));
  if (matched.length === 0) {
    return [];
  }

  return [
    "Use this MMA glossary exactly when the source implies these terms:",
    ...matched.map(([term, translation]) => `- ${term} => ${translation}`)
  ];
}

function extractOpenAiOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if ("output" in payload && Array.isArray(payload.output)) {
    const chunks = payload.output.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("content" in entry) || !Array.isArray(entry.content)) {
        return [];
      }

      return entry.content
        .map((item: unknown) => {
          if (!item || typeof item !== "object") {
            return "";
          }

          if ("text" in item && typeof item.text === "string") {
            return item.text;
          }

          return "";
        })
        .filter(Boolean);
    });

    return chunks.join("\n").trim();
  }

  return "";
}

function postJson(url: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;

    const request = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");

          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Request failed with HTTP ${response.statusCode}: ${payload}`));
            return;
          }

          resolve(payload);
        });
      }
    );

    request.setTimeout(60000, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function postJsonWithPowerShell(url: string, body: string, headers: Record<string, string>) {
  const headerAssignments = Object.entries(headers)
    .map(([key, value]) => `"${key}" = "${value.replace(/"/g, '`"')}"`)
    .join("\n  ");

  const script = `
$headers = @{
  ${headerAssignments}
}
$response = Invoke-RestMethod -Method Post -Uri "${url}" -Headers $headers -Body @'
${body}
'@ -TimeoutSec 90
$response | ConvertTo-Json -Depth 100
`;

  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024
  });

  return stdout;
}

function buildPrompt(input: IngestDraftInput) {
  const glossaryHints = buildGlossaryHints(input);

  return [
    "You are an MMA news translator and editor for a Russian-language media outlet.",
    "Translate the source material into natural Russian and lightly rewrite it into concise newsroom style.",
    "Use vocabulary common in Russian MMA media, not literal word-for-word calques.",
    "Translate promotional words contextually: event/card/showcase usually becomes турнир, кард, or шоу depending on meaning.",
    "Preserve facts, names, dates, organizations, and uncertainty exactly.",
    "Preserve weight classes and card terminology exactly. Do not confuse featherweight with lightweight or other divisions.",
    "Do not invent any details.",
    "Return strict JSON with keys headline and body.",
    "Both headline and body must be in Russian.",
    "Body should be 2-4 short paragraphs without markdown.",
    ...glossaryHints,
    "",
    `Source: ${input.sourceLabel}`,
    `URL: ${input.sourceUrl}`,
    `Headline: ${input.headline}`,
    "Body:",
    input.body
  ].join("\n");
}

async function localizeWithOllama(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const model = getOllamaModel();
  const url = getOllamaUrl();
  const requestBody = JSON.stringify({
    model,
    stream: false,
    format: "json",
    prompt: buildPrompt(input)
  });

  const rawPayload = await postJson(url, requestBody);
  const payload = JSON.parse(rawPayload) as { response?: string };
  const localized = normalizeLocalizedOutput(input, parseLocalizationResponse(payload.response ?? ""));

  return {
    headline: localized.headline,
    body: localized.body,
    localized: true,
    model
  };
}

async function localizeWithOpenAi(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = getOpenAiModel();
  const requestBody = JSON.stringify({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are an MMA editor for a Russian-language media outlet. Translate and lightly rewrite source material into clean Russian newsroom style. Use vocabulary common in Russian MMA media and avoid literal calques. Translate event or showcase language contextually as турнир, кард, or шоу when appropriate. Preserve facts, names, records, dates, promotions, and uncertainty. Do not invent details. Output strict JSON with keys headline and body. Body should be 2-4 concise paragraphs without markdown."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Source label: ${input.sourceLabel}\nSource URL: ${input.sourceUrl}\nHeadline: ${input.headline}\nBody:\n${input.body}`
          }
        ]
      }
    ]
  });

  let rawPayload = "";

  try {
    rawPayload = await postJson(openAiApiUrl, requestBody, {
      Authorization: `Bearer ${apiKey}`
    });
  } catch (error) {
    console.error("OpenAI localization via node transport failed, retrying with PowerShell", error);
    rawPayload = await postJsonWithPowerShell(openAiApiUrl, requestBody, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    });
  }

  const payload = JSON.parse(rawPayload) as unknown;
  const outputText = extractOpenAiOutputText(payload);
  const localized = normalizeLocalizedOutput(input, parseLocalizationResponse(outputText));

  return {
    headline: localized.headline,
    body: localized.body,
    localized: true,
    model
  };
}

export async function localizeIngestionInput(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const sourceText = `${input.headline}\n${input.body}`.trim();

  if (!sourceText || looksRussian(sourceText)) {
    return {
      headline: input.headline,
      body: input.body,
      localized: false,
      model: null
    };
  }

  try {
    return await localizeWithOllama(input);
  } catch (error) {
    console.error("Ollama localization failed, falling back to OpenAI/source language", error);
  }

  if (getOpenAiApiKey()) {
    try {
      return await localizeWithOpenAi(input);
    } catch (error) {
      console.error("OpenAI localization failed, saving source language", error);
    }
  }

  return {
    headline: input.headline,
    body: input.body,
    localized: false,
    model: null
  };
}
