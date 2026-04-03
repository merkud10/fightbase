import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { IngestDraftInput } from "@/lib/ingestion";
import {
  buildUfcNameGuide,
  collectUfcNameRedFlags,
  UFC_NAME_RED_FLAG_RULES,
  normalizeUfcNameText
} from "@/lib/ufc-name-normalizer";
import {
  buildMmaGlossaryHints,
  collectMmaEditorialRedFlags,
  enforceMmaTerminology,
  MMA_EDITORIAL_RED_FLAG_RULES
} from "@/lib/mma-terminology";

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
const defaultAlibabaBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const defaultAlibabaModel = "qwen-flash";
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

function getAiProvider() {
  return getEnvValue("AI_PROVIDER", "").toLowerCase();
}

function getAlibabaApiKey() {
  return getEnvValue("DASHSCOPE_API_KEY");
}

function getAlibabaBaseUrl() {
  return getEnvValue("DASHSCOPE_BASE_URL", defaultAlibabaBaseUrl);
}

function getAlibabaModel() {
  return getEnvValue("DASHSCOPE_MODEL", defaultAlibabaModel);
}

function looksRussian(value: string) {
  return /\p{Script=Cyrillic}/u.test(value);
}

function getLetterStats(value: string) {
  const cyrillic = (value.match(/\p{Script=Cyrillic}/gu) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return {
    cyrillic,
    latin,
    total: cyrillic + latin
  };
}

function isPredominantlyRussian(value: string) {
  const stats = getLetterStats(value);
  if (stats.total === 0) {
    return false;
  }

  return stats.cyrillic / stats.total >= 0.55;
}

function looksUkrainian(value: string) {
  const lower = value.toLowerCase();
  return /[\u0456\u0457\u0454\u0491]/i.test(value) || /\b(?:\u0442\u0430|\u043f\u0456\u0441\u043b\u044f|\u043f\u0435\u0440\u0435\u043c\u0456\u0433|\u0432\u0456\u0434\u0431\u0443\u0432\u0441\u044f|\u0433\u043b\u044f\u0434\u0430\u0447\u0456|\u043f\u043e\u0454\u0434\u0438\u043d\u043e\u043a|\u0441\u0443\u0434\u0434\u0456|\u0433\u043e\u043b\u043e\u0432\u043d\u043e\u043c\u0443|\u0432\u0438\u0441\u0432\u0456\u0442\u043b\u0435\u043d\u043d\u044f|\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0438)\b/i.test(lower);
}

function sanitizeJsonPayload(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? value.trim();
}

function coerceLocalizedString(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.join("\n\n").trim();
  }

  return String(value || "").trim();
}

function parseLocalizationResponse(rawText: string) {
  const sanitized = sanitizeJsonPayload(rawText);
  const parsed = JSON.parse(sanitized) as {
    headline?: string | string[];
    title?: string | string[];
    body?: string | string[];
    text?: string | string[];
    sectionBody?: string | string[];
  };

  const headline =
    coerceLocalizedString(parsed.headline) ||
    coerceLocalizedString(parsed.title) ||
    sanitized.match(/"headline"\s*:\s*"([\s\S]*?)"/i)?.[1]?.trim() ||
    sanitized.match(/"title"\s*:\s*"([\s\S]*?)"/i)?.[1]?.trim() ||
    "";
  const body =
    coerceLocalizedString(parsed.body) ||
    coerceLocalizedString(parsed.text) ||
    coerceLocalizedString(parsed.sectionBody) ||
    sanitized.match(/"body"\s*:\s*"([\s\S]*?)"/i)?.[1]?.trim() ||
    sanitized.match(/"text"\s*:\s*"([\s\S]*?)"/i)?.[1]?.trim() ||
    sanitized.match(/"sectionBody"\s*:\s*"([\s\S]*?)"/i)?.[1]?.trim() ||
    "";

  if (!headline || !body) {
    throw new Error("Localization response is missing headline or body");
  }

  return {
    headline: headline.trim(),
    body: body.trim()
  };
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

function enforceNameCorrections(value: string) {
  return normalizeUfcNameText(value);
}


function normalizeLocalizedOutput(
  input: IngestDraftInput,
  localized: { headline: string; body: string }
) {
  const sourceText = `${input.headline}\n${input.body}`;

  return {
    headline: enforceNameCorrections(
      enforceMmaTerminology(sourceText, enforcePromotionLabel(input, localized.headline))
    ),
    body: enforceNameCorrections(enforceMmaTerminology(sourceText, localized.body))
  };
}

const LOCALIZATION_RED_FLAG_RULES: Array<{ label: string; pattern: RegExp }> = [
  ...UFC_NAME_RED_FLAG_RULES,
  ...MMA_EDITORIAL_RED_FLAG_RULES,
  { label: "multi_option_ui_answer", pattern: /(?:^|\n)\s*(?:\*\*)?\u0412\u0430\u0440\u0438\u0430\u043d\u0442\s+\d/i }
];

function collectLocalizationRedFlags(value: string) {
  const flags = new Set(
    LOCALIZATION_RED_FLAG_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.label)
  );

  for (const label of collectUfcNameRedFlags(value)) {
    flags.add(label);
  }

  for (const label of collectMmaEditorialRedFlags(value)) {
    flags.add(label);
  }

  return [...flags];
}

function buildGlossaryHints(input: IngestDraftInput) {
  return buildMmaGlossaryHints(`${input.headline}\n${input.body}`);
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

    request.setTimeout(180000, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function postJsonWithPowerShell(url: string, body: string, headers: Record<string, string>) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const headerAssignments = Object.entries(headers)
    .map(([key, value]) => `"${key.replace(/"/g, "")}" = "${value.replace(/"/g, "")}"`)
    .join("\n  ");

  const script = `
param([string]$Uri, [string]$Body)
$headers = @{
  ${headerAssignments}
}
$response = Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($Body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 90
$response | ConvertTo-Json -Depth 100
`;

  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script, url, body], {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024
  });

  return stdout;
}

function buildPrompt(input: IngestDraftInput) {
  const nameGuide = buildUfcNameGuide();
  const glossaryHints = buildGlossaryHints(input);

  return [
    "You are an MMA news translator and editor for a Russian-language media outlet.",
    "Translate the source material into natural Russian and lightly rewrite it into clean newsroom style.",
    "Output Russian only. Do not use Ukrainian words, Ukrainian spelling, or mixed Russian-Ukrainian text.",
    "Use vocabulary common in Russian MMA media, not literal word-for-word calques.",
    "Translate promotional words contextually: event/card/showcase usually becomes С‚СѓСЂРЅРёСЂ, РєР°СЂРґ, or С€РѕСѓ depending on meaning.",
    "Preserve facts, names, dates, organizations, and uncertainty exactly.",
    "Preserve weight classes and card terminology exactly. Do not confuse featherweight with lightweight or other divisions.",
    "Do not invent any details.",
    "Do not aggressively summarize. Preserve the substance and most factual detail of the original article.",
    "Use standard Russian MMA terminology and standard fighter names already established in Russian media.",
    nameGuide.tokenLine,
    nameGuide.fullNameLine,
    "Do not leave raw English terms such as eligible, athletic commission, featherweight, bantamweight, welterweight, middleweight, lightweight, heavyweight, or flyweight inside Russian sentences.",
    "Do not invent or distort fighter names. For example, do not write РђР№СЃСѓР»С‚Р°РЅ РњР°С…Р°С‡РµРІ or Р¦СЃР°СЂСѓРєСЏРЅ.",
    "Do not use awkward words such as РјР°СЂС€РёСЃС‚, РІРµР»РѕРІРµСЃ, or С„СЌР·РµСЂРІРµР№С‚.",
    "Return strict JSON with keys headline and body.",
    "Both headline and body must be in Russian.",
    "Body should usually stay close to the source in informational density and can be 4-8 short paragraphs without markdown when needed.",
    ...glossaryHints,
    "",
    `Source: ${input.sourceLabel}`,
    `URL: ${input.sourceUrl}`,
    `Headline: ${input.headline}`,
    "Body:",
    input.body
  ].join("\n");
}

function buildRussianRepairPrompt(localized: { headline: string; body: string }) {
  const nameGuide = buildUfcNameGuide();
  return [
    "You are fixing a draft for a Russian-language MMA media outlet.",
    "Rewrite the text into clean natural Russian only.",
    "Do not use Ukrainian words, Ukrainian grammar, Ukrainian spelling, or mixed-language output.",
    "Keep names, promotions, dates, and facts intact.",
    nameGuide.tokenLine,
    nameGuide.fullNameLine,
    "Remove awkward wording, raw English insertions, and malformed fighter names.",
    "Return strict JSON with keys headline and body.",
    "",
    `Headline: ${localized.headline}`,
    "Body:",
    localized.body
  ].join("\n");
}

function buildRedFlagRepairPrompt(
  input: IngestDraftInput,
  localized: { headline: string; body: string },
  flags: string[]
) {
  const nameGuide = buildUfcNameGuide();
  return [
    "You are fixing a draft for a Russian-language MMA media outlet.",
    "Rewrite the text into clean newsroom Russian while preserving every fact from the source.",
    "Keep names, dates, promotions, organizations, records, and uncertainty intact.",
    nameGuide.tokenLine,
    nameGuide.fullNameLine,
    "Do not invent details and do not summarize aggressively.",
    "Remove malformed names, raw English fragments, mixed-language output, and awkward literal calques.",
    "Return strict JSON with keys headline and body.",
    "",
    `Detected issues: ${flags.join(", ")}`,
    `Original source headline: ${input.headline}`,
    "Draft headline:",
    localized.headline,
    "",
    "Draft body:",
    localized.body
  ].join("\n");
}

const FIGHT_RESULT_PATTERN =
  /(?:РїРѕР±РµРґРёР»|РїРѕР±РµРґРёР»Р°|РЅРѕРєР°СѓС‚РёСЂРѕРІР°Р»|РЅРѕРєР°СѓС‚РёСЂРѕРІР°Р»Р°|РІС‹РёРіСЂР°Р»|РІС‹РёРіСЂР°Р»Р°|РѕРґРѕР»РµР»|РѕРґРѕР»РµР»Р°|РѕРґРµСЂР¶Р°Р»|РѕРґРµСЂР¶Р°Р»Р°|Р·Р°РІРµСЂС€РёР»Рё|СЃР°Р±РјРёС€РµРЅ|С‚РµС…РЅРёС‡РµСЃРєРёРј РЅРѕРєР°СѓС‚РѕРј|РµРґРёРЅРѕРіР»Р°СЃРЅС‹Рј СЂРµС€РµРЅРёРµРј|СЂРµС€РµРЅРёРµРј Р±РѕР»СЊС€РёРЅСЃС‚РІР°|СЂР°Р·РґРµР»СЊРЅС‹Рј СЂРµС€РµРЅРёРµРј|РІРЅРёС‡СЊСЋ)/i;

const CARD_HEADER_PATTERN = /^(?:РіР»Р°РІРЅС‹Р№ РєР°СЂРґ|РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ РєР°СЂРґ|РѕСЃРЅРѕРІРЅРѕР№ РєР°СЂРґ|СЂР°РЅРЅРёРµ РїСЂРµР»РёРјС‹)/i;

function splitNarrativeAndResults(body: string) {
  const paragraphs = body.split(/\n\n+/);
  const narrative: string[] = [];
  const results: string[] = [];
  let inResultsSection = false;

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    if (CARD_HEADER_PATTERN.test(trimmed)) {
      inResultsSection = true;
      results.push(trimmed);
    } else if (inResultsSection || (FIGHT_RESULT_PATTERN.test(trimmed) && trimmed.length < 120)) {
      inResultsSection = true;
      results.push(trimmed);
    } else {
      narrative.push(trimmed);
    }
  }

  return { narrative, results };
}

function buildRewritePrompt(input: IngestDraftInput) {
  return [
    "You are a Russian-language MMA news editor.",
    "Rewrite the following article in your own words so that the result is unique and not a copy of the original.",
    "Change sentence structure, wording, and phrasing while keeping the same meaning.",
    "Preserve ALL facts, fighter names, records, dates, organizations, weight classes, and direct quotes exactly.",
    "Do not add any information that is not in the original article.",
    "Do not aggressively summarize вЂ” keep the same informational density.",
    "Output must be in natural Russian only.",
    "Return strict JSON with keys headline and body.",
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
  const sendPrompt = async (prompt: string) => {
    const requestBody = JSON.stringify({
      model,
      stream: false,
      format: "json",
      prompt
    });

    const rawPayload = await postJson(url, requestBody);
    const payload = JSON.parse(rawPayload) as { response?: string };
    return parseLocalizationResponse(payload.response ?? "");
  };

  let localized = normalizeLocalizedOutput(input, await sendPrompt(buildPrompt(input)));
  if (looksUkrainian(`${localized.headline}\n${localized.body}`)) {
    localized = normalizeLocalizedOutput(input, await sendPrompt(buildRussianRepairPrompt(localized)));
  }

  const redFlags = collectLocalizationRedFlags(`${localized.headline}\n${localized.body}`);
  if (redFlags.length > 0) {
    localized = normalizeLocalizedOutput(
      input,
      await sendPrompt(buildRedFlagRepairPrompt(input, localized, redFlags))
    );
  }

  return {
    headline: localized.headline,
    body: localized.body,
    localized: true,
    model
  };
}

async function rewriteWithOllama(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const model = getOllamaModel();
  const url = getOllamaUrl();
  const sendPrompt = async (prompt: string) => {
    const requestBody = JSON.stringify({
      model,
      stream: false,
      format: "json",
      prompt
    });

    const rawPayload = await postJson(url, requestBody);
    const payload = JSON.parse(rawPayload) as { response?: string };
    return parseLocalizationResponse(payload.response ?? "");
  };

  const { narrative, results } = splitNarrativeAndResults(input.body);

  const rewriteInput = {
    ...input,
    body: narrative.join("\n\n")
  };

  const parsed = await sendPrompt(buildRewritePrompt(rewriteInput));

  const bodyParts = [parsed.body];
  if (results.length > 0) {
    bodyParts.push(results.join("\n\n"));
  }

  let localized = {
    headline: parsed.headline,
    body: bodyParts.join("\n\n")
  };

  const redFlags = collectLocalizationRedFlags(`${localized.headline}\n${localized.body}`);
  if (redFlags.length > 0) {
    localized = normalizeLocalizedOutput(
      input,
      await sendPrompt(buildRedFlagRepairPrompt(input, localized, redFlags))
    );
  }

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
              "You are an MMA editor for a Russian-language media outlet. Translate and lightly rewrite source material into clean Russian newsroom style. Use vocabulary common in Russian MMA media and avoid literal calques. Translate event or showcase language contextually as С‚СѓСЂРЅРёСЂ, РєР°СЂРґ, or С€РѕСѓ when appropriate. Preserve facts, names, records, dates, promotions, and uncertainty. Do not invent details. Do not aggressively summarize: preserve most factual detail and keep the article close to the source in informational density. Use standard Russian MMA terminology only, do not distort fighter names, and do not leave raw English terms like eligible, athletic commission, featherweight, bantamweight, welterweight, middleweight, lightweight, heavyweight, or flyweight inside Russian sentences. Output strict JSON with keys headline and body. Body can be 4-8 concise paragraphs without markdown when needed."
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

async function localizeWithAlibaba(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const apiKey = getAlibabaApiKey();
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is not configured");
  }

  const model = getAlibabaModel();
  const baseUrl = getAlibabaBaseUrl().replace(/\/$/, "");
  const requestBody = JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an MMA editor for a Russian-language media outlet. Translate and lightly rewrite source material into clean Russian newsroom style. Output Russian only. Do not use Ukrainian words, Ukrainian spelling, or mixed Russian-Ukrainian text. Preserve facts, names, records, dates, promotions, and uncertainty. Do not invent details. Do not aggressively summarize: preserve most factual detail and keep the article close to the source in informational density. Use standard Russian MMA terminology only, do not distort fighter names, and do not leave raw English terms like eligible, athletic commission, featherweight, bantamweight, welterweight, middleweight, lightweight, heavyweight, or flyweight inside Russian sentences. Output strict JSON with keys headline and body. Body can be 4-8 concise paragraphs without markdown when needed."
      },
      {
        role: "user",
        content: buildPrompt(input)
      }
    ],
    response_format: {
      type: "json_object"
    },
    temperature: 0.2
  });

  const rawPayload = await postJson(`${baseUrl}/chat/completions`, requestBody, {
    Authorization: `Bearer ${apiKey}`
  });
  const payload = JSON.parse(rawPayload) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const outputText = payload.choices?.[0]?.message?.content ?? "";
  let localized = normalizeLocalizedOutput(input, parseLocalizationResponse(outputText));

  if (looksUkrainian(`${localized.headline}\n${localized.body}`)) {
    const repairBody = JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are fixing a draft for a Russian-language MMA media outlet. Rewrite the text into clean natural Russian only. Do not use Ukrainian words, Ukrainian grammar, Ukrainian spelling, or mixed-language output. Keep names, promotions, dates, and facts intact. Return strict JSON with keys headline and body."
        },
        {
          role: "user",
          content: buildRussianRepairPrompt(localized)
        }
      ],
      response_format: {
        type: "json_object"
      },
      temperature: 0.1
    });

    const repairRawPayload = await postJson(`${baseUrl}/chat/completions`, repairBody, {
      Authorization: `Bearer ${apiKey}`
    });
    const repairPayload = JSON.parse(repairRawPayload) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const repairText = repairPayload.choices?.[0]?.message?.content ?? "";
    localized = normalizeLocalizedOutput(input, parseLocalizationResponse(repairText));
  }

  return {
    headline: localized.headline,
    body: localized.body,
    localized: true,
    model
  };
}

export async function localizeIngestionInput(input: IngestDraftInput): Promise<LocalizedIngestionResult> {
  const sourceText = `${input.headline}\n${input.body}`.trim();

  if (!sourceText) {
    return {
      headline: input.headline,
      body: input.body,
      localized: false,
      model: null
    };
  }

  if (looksRussian(sourceText) && isPredominantlyRussian(sourceText)) {
    try {
      return await rewriteWithOllama(input);
    } catch (error) {
      console.error("Russian rewrite failed, saving original text", error);
    }

    return {
      headline: input.headline,
      body: input.body,
      localized: false,
      model: null
    };
  }

  const provider = getAiProvider();

  if (provider === "alibaba" && getAlibabaApiKey()) {
    try {
      return await localizeWithAlibaba(input);
    } catch (error) {
      console.error("Alibaba localization failed, falling back to Ollama/OpenAI/source language", error);
    }
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

