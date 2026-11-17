// Картинка-сводка после турнира для Telegram и VK, 1080×1350. Рисуется на
// сервере через next/og: вёрстка только на flex, шрифты — из assets/fonts
// (системных шрифтов с кириллицей на сервере нет). Макет согласован 17.11.2026:
// ops/reports/design/summary-mock.html.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import type { ModelSummary, ModelSummaryMark } from "@/lib/model-summary";

export const MODEL_SUMMARY_WIDTH = 1080;
export const MODEL_SUMMARY_HEIGHT = 1350;

const COLORS = {
  bg: "#0c0c0d",
  panel: "#151516",
  line: "#262628",
  text: "#dcdcdc",
  strong: "#f4f4f4",
  text2: "#b4b4b9",
  muted: "#8e8e93",
  red: "#e5333b",
  model: "#e5333b",
  favorite: "#4a90d9",
  good: "#58b784"
};

// satori берёт по одному файлу на имя семейства, поэтому латинские и кириллические
// подмножества заведены как разные семейства и перечисляются в fontFamily оба.
const INTER = "Inter Latin, Inter";
const OSWALD = "Oswald Latin, Oswald";

const FONT_FILES = [
  ["Inter", 400, "inter-cyrillic-400-normal.woff"],
  ["Inter Latin", 400, "inter-latin-400-normal.woff"],
  ["Inter", 500, "inter-cyrillic-500-normal.woff"],
  ["Inter Latin", 500, "inter-latin-500-normal.woff"],
  ["Inter", 600, "inter-cyrillic-600-normal.woff"],
  ["Inter Latin", 600, "inter-latin-600-normal.woff"],
  ["Oswald", 500, "oswald-cyrillic-500-normal.woff"],
  ["Oswald Latin", 500, "oswald-latin-500-normal.woff"],
  ["Oswald", 600, "oswald-cyrillic-600-normal.woff"],
  ["Oswald Latin", 600, "oswald-latin-600-normal.woff"]
] as const;

type LoadedFont = { name: string; weight: 400 | 500 | 600; style: "normal"; data: Buffer };
let fontsPromise: Promise<LoadedFont[]> | null = null;

function loadFonts() {
  const root = path.join(process.env.APP_ROOT || process.cwd(), "assets", "fonts");
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ([name, weight, file]) => ({
      name,
      weight,
      style: "normal" as const,
      data: await readFile(path.join(root, file))
    }))
  );
  return fontsPromise;
}

const MARK_STYLE: Record<ModelSummaryMark, { background: string; color: string }> = {
  hit: { background: "#1f3a2c", color: COLORS.good },
  miss: { background: "#3a1f21", color: COLORS.red },
  void: { background: "#1f1f22", color: COLORS.muted }
};

// Галочка, крестик и прочерк нарисованы линиями: в подмножествах шрифтов таких знаков нет.
function MarkIcon({ mark, size }: { mark: ModelSummaryMark; size: number }) {
  const stroke = MARK_STYLE[mark].color;
  const common = { fill: "none", stroke, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 30 30">
      {mark === "hit" ? <path d="M6 16 L12.5 22.5 L24 8.5" {...common} /> : null}
      {mark === "miss" ? <path d="M8 8 L22 22 M22 8 L8 22" {...common} /> : null}
      {mark === "void" ? <path d="M7 15 L23 15" {...common} /> : null}
    </svg>
  );
}

function LegendItem({ mark, label }: { mark: ModelSummaryMark; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginRight: 26 }}>
      <svg width="20" height="20" viewBox="0 0 30 30" style={{ marginRight: 8 }}>
        {mark === "hit" ? <path d="M6 16 L12.5 22.5 L24 8.5" fill="none" stroke={COLORS.muted} strokeWidth="3" strokeLinecap="round" /> : null}
        {mark === "miss" ? <path d="M8 8 L22 22 M22 8 L8 22" fill="none" stroke={COLORS.muted} strokeWidth="3" strokeLinecap="round" /> : null}
        {mark === "void" ? <path d="M7 15 L23 15" fill="none" stroke={COLORS.muted} strokeWidth="3" strokeLinecap="round" /> : null}
      </svg>
      {label}
    </div>
  );
}

const CHART_HEIGHT = 225;

function tournaments(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "турнир";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "турнира";
  return "турниров";
}

export function ModelSummaryCard({ summary }: { summary: ModelSummary }) {
  const hasChart = summary.chart.length >= 2;
  const hasVoid = summary.marks.includes("void");
  // Длинный заголовок и большой кард должны остаться в одну строку: вторая строка
  // сдвигает всё ниже и выталкивает подвал за край картинки.
  const titleSize = summary.title.length > 40 ? 44 : summary.title.length > 30 ? 52 : 64;
  const markSize = Math.min(62, Math.floor((MODEL_SUMMARY_WIDTH - 128) / Math.max(summary.marks.length, 1)) - 10);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: MODEL_SUMMARY_WIDTH,
        height: MODEL_SUMMARY_HEIGHT,
        padding: "64px 64px 52px",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: INTER
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontFamily: OSWALD, fontWeight: 600, fontSize: 34, letterSpacing: 1.4, color: COLORS.strong }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 58,
              height: 50,
              marginRight: 16,
              background: COLORS.red,
              borderRadius: 6,
              color: "#fff",
              fontSize: 27
            }}
          >
            FB
          </div>
          FightBase
        </div>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: COLORS.muted }}>Итоги ИИ-модели</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 54 }}>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: COLORS.red }}>{summary.dateLabel}</div>
        <div style={{ display: "flex", marginTop: 12, fontFamily: OSWALD, fontWeight: 500, fontSize: titleSize, lineHeight: 1.1, color: COLORS.strong }}>
          {summary.title}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 44 }}>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: OSWALD, fontWeight: 500, fontSize: 168, lineHeight: 0.92, color: COLORS.strong }}>
            {summary.model.correct}/{summary.model.judged}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 22, marginBottom: 10, fontSize: 30, lineHeight: 1.3, color: COLORS.text2 }}>
            <div style={{ display: "flex" }}>прогнозов</div>
            <div style={{ display: "flex" }}>сыграло</div>
          </div>
        </div>
        {summary.favorite.judged > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 24, color: COLORS.muted }}>
            <div style={{ display: "flex" }}>фаворит по линии</div>
            <div style={{ display: "flex", marginTop: 6, fontFamily: OSWALD, fontWeight: 500, fontSize: 46, lineHeight: 1, color: COLORS.text }}>
              {summary.favorite.correct}/{summary.favorite.judged}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", marginTop: 30 }}>
        {summary.marks.map((mark, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: markSize,
              height: markSize,
              margin: "0 10px 10px 0",
              borderRadius: 8,
              background: MARK_STYLE[mark].background
            }}
          >
            <MarkIcon mark={mark} size={Math.round(markSize * 0.48)} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 4, fontSize: 20, color: COLORS.muted }}>
        <div style={{ display: "flex", marginRight: 26 }}>бои от главного к первому</div>
        <LegendItem mark="hit" label="угадан" />
        <LegendItem mark="miss" label="мимо" />
        {hasVoid ? <LegendItem mark="void" label="не в счёт" /> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginTop: 40, padding: "34px 36px 28px", background: COLORS.panel, borderRadius: 12 }}>
        {hasChart ? (
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: COLORS.text2 }}>
              <div style={{ display: "flex", fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: COLORS.muted }}>
                Последние {summary.chart.length} {tournaments(summary.chart.length)}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", width: 16, height: 16, marginRight: 10, borderRadius: 3, background: COLORS.model }} />
                модель
                <div style={{ display: "flex", width: 16, height: 16, margin: "0 10px 0 26px", borderRadius: 3, background: COLORS.favorite }} />
                фаворит
              </div>
            </div>
            <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end", marginTop: 20, borderBottom: `2px solid ${COLORS.line}` }}>
              {summary.chart.map((item, index) => (
                <div key={index} style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <div style={{ display: "flex", marginBottom: 8, fontSize: 24, fontWeight: 600, color: item.current ? COLORS.strong : COLORS.muted }}>
                    {item.model.correct}/{item.model.judged}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", opacity: item.current ? 1 : 0.55 }}>
                    <div
                      style={{
                        display: "flex",
                        width: 46,
                        height: Math.round((CHART_HEIGHT * (item.modelHeight ?? 0)) / 100),
                        margin: "0 2px",
                        borderRadius: "6px 6px 0 0",
                        background: COLORS.model
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        width: 46,
                        height: Math.round((CHART_HEIGHT * (item.favoriteHeight ?? 0)) / 100),
                        margin: "0 2px",
                        borderRadius: "6px 6px 0 0",
                        background: COLORS.favorite
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              {summary.chart.map((item, index) => (
                <div key={index} style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", fontSize: 20, lineHeight: 1.3, color: COLORS.muted }}>
                  <div style={{ display: "flex", fontWeight: item.current ? 600 : 500, color: item.current ? COLORS.strong : COLORS.text2 }}>{item.label}</div>
                  <div style={{ display: "flex" }}>{item.dateLabel}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", fontSize: 26, lineHeight: 1.4, color: COLORS.text2 }}>
            График по турнирам появится после следующего турнира.
          </div>
        )}
      </div>

      <div style={{ display: "flex", marginTop: 30 }}>
        {summary.totals.percent !== null ? (
          <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: OSWALD, fontWeight: 500, fontSize: 62, lineHeight: 1, color: COLORS.strong }}>{summary.totals.percent}%</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10, fontSize: 22, lineHeight: 1.35, color: COLORS.text2 }}>
              <div style={{ display: "flex" }}>
                точность за {summary.totals.eventsCount} {tournaments(summary.totals.eventsCount)}:
              </div>
              <div style={{ display: "flex" }}>
                {summary.totals.correct} из {summary.totals.judged} боёв
              </div>
            </div>
          </div>
        ) : null}
        {summary.totals.bankroll !== null ? (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", paddingLeft: 36, borderLeft: `2px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", fontFamily: OSWALD, fontWeight: 500, fontSize: 62, lineHeight: 1, color: summary.totals.bankrollUp ? COLORS.good : COLORS.strong }}>
              {summary.totals.bankroll}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10, fontSize: 22, lineHeight: 1.35, color: COLORS.text2 }}>
              <div style={{ display: "flex" }}>при ставке 1 у.е.</div>
              <div style={{ display: "flex" }}>на каждый прогноз</div>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, fontSize: 20, color: COLORS.muted }}>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", marginRight: 8, fontWeight: 600, color: COLORS.text }}>fightbase.ru</div>
          разборы всех боёв и история точности
        </div>
        <div style={{ display: "flex" }}>Прогноз — не совет делать ставки</div>
      </div>
    </div>
  );
}

export async function renderModelSummaryPng(summary: ModelSummary): Promise<Buffer> {
  const response = new ImageResponse(<ModelSummaryCard summary={summary} />, {
    width: MODEL_SUMMARY_WIDTH,
    height: MODEL_SUMMARY_HEIGHT,
    fonts: await loadFonts()
  });
  return Buffer.from(await response.arrayBuffer());
}
