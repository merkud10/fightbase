// Разрешённые цели для /api/cron/revalidate: только публичные разделы, максимум 50 путей.
// Пути с [сегментами] ревалидируются как маршрут целиком (type: "page").

const ALLOWED_EXACT = new Set(["/", "/events", "/predictions", "/news", "/rankings"]);
const ALLOWED_PREFIXES = ["/events/", "/predictions/", "/news/", "/fighters/"];
const MAX_PATHS = 50;

export type RevalidateTarget = {
  path: string;
  type: "page" | null;
};

export function filterRevalidatePaths(paths: unknown): RevalidateTarget[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  const targets: RevalidateTarget[] = [];
  for (const raw of paths) {
    if (targets.length >= MAX_PATHS) {
      break;
    }
    const path = String(raw || "").trim();
    if (!path.startsWith("/")) {
      continue;
    }
    const allowed = ALLOWED_EXACT.has(path) || ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (!allowed) {
      continue;
    }
    targets.push({ path, type: path.includes("[") ? "page" : null });
  }

  return targets;
}
