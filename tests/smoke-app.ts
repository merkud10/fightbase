import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const repoRoot = path.resolve(process.cwd());
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  dotenv.config({ path: path.join(repoRoot, name), override: true });
}

/** Абсолютный путь к файлу SQLite из DATABASE_URL (относительно корня репозитория). */
function resolveRepoSqliteAbsolutePath(raw: string): string {
  if (!raw.startsWith("file:")) {
    throw new Error("Smoke test: expected SQLite DATABASE_URL to start with file:");
  }
  const rest = raw.slice("file:".length);
  if (rest.startsWith("/") && !rest.startsWith("//")) {
    return rest;
  }
  if (/^[a-zA-Z]:[\\/]/.test(rest)) {
    return rest;
  }
  const normalized = rest.replace(/^\.\//, "");
  const canonical = path.resolve(repoRoot, normalized);
  if (fs.existsSync(canonical)) {
    return canonical;
  }
  const nested = path.resolve(repoRoot, "prisma", normalized);
  if (fs.existsSync(nested)) {
    return nested;
  }
  return canonical;
}

/** Формат SQLite URL для Prisma. На Windows нужно `file:C:/...`, не `file:/C:/...` (иначе error 14). */
function prismaSqliteFileUrl(absPath: string): string {
  return `file:${absPath.replace(/\\/g, "/")}`;
}

let smokeTempDbPath: string | null = null;

/**
 * Копируем SQLite во временный путь только из ASCII (os.tmpdir), иначе Prisma/SQLite на Windows
 * не открывают file: URL с кириллицей в пути (например OneDrive/«Рабочий стол»).
 */
function prepareDatabaseUrlForStandaloneServer(): string {
  let raw = process.env.DATABASE_URL?.trim() || "";
  if (!raw.startsWith("file:")) {
    const dev = path.join(repoRoot, "prisma", "dev.db");
    const ci = path.join(repoRoot, "prisma", "ci.db");
    raw = fs.existsSync(dev) ? "file:./prisma/dev.db" : fs.existsSync(ci) ? "file:./prisma/ci.db" : "file:./prisma/dev.db";
  }
  const src = resolveRepoSqliteAbsolutePath(raw);
  if (!fs.existsSync(src)) {
    throw new Error(
      `Smoke test: database file missing at ${src}. Run \`npm run db:push\` (or create the DB) before test:smoke.`
    );
  }
  smokeTempDbPath = path.join(os.tmpdir(), `fightbase-smoke-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(src, smokeTempDbPath);
  return prismaSqliteFileUrl(fs.realpathSync(smokeTempDbPath));
}

const PORT = Number(process.env.SMOKE_TEST_PORT || String(3200 + Math.floor(Math.random() * 400)));
const BASE_URL = `http://127.0.0.1:${PORT}`;

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, server: ReturnType<typeof spawn>, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode != null) {
      throw new Error(`Smoke server exited early with code ${server.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(1_000);
  }

  throw new Error(`Smoke server did not become ready within ${timeoutMs}ms.`);
}

async function runCheck(name: string, check: () => Promise<void>): Promise<CheckResult> {
  try {
    await check();
    return { name, ok: true };
  } catch (error) {
    return {
      name,
      ok: false,
      details: error instanceof Error ? error.message : "Unknown smoke test error."
    };
  }
}

async function main() {
  const serverCwd = path.resolve(process.cwd(), ".next", "standalone");
  const dbUrl = prepareDatabaseUrlForStandaloneServer();
  const server = spawn(process.execPath, ["server.js"], {
    cwd: serverCwd,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: dbUrl
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  server.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });

  server.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForServer(`${BASE_URL}/admin/login`, server);

    const checks = await Promise.all([
      runCheck("Public localized home page responds", async () => {
        const response = await fetch(`${BASE_URL}/ru`, { redirect: "manual" });
        if (response.status === 200) {
          return;
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location") || "";
          if (location.includes("/ru")) {
            return;
          }
        }

        throw new Error(`Expected 200 or localized redirect, got ${response.status}`);
      }),
      runCheck("Health endpoint responds", async () => {
        const response = await fetch(`${BASE_URL}/api/health`);
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}`);
        }
      }),
      runCheck("Admin route redirects to login", async () => {
        const response = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
        if (!([302, 303, 307, 308] as number[]).includes(response.status)) {
          throw new Error(`Expected redirect status, got ${response.status}`);
        }

        const location = response.headers.get("location") || "";
        if (!location.includes("/admin/login")) {
          throw new Error(`Expected redirect to /admin/login, got "${location}"`);
        }
      }),
      runCheck("Admin login page responds", async () => {
        const response = await fetch(`${BASE_URL}/admin/login`);
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}`);
        }
      }),
      runCheck("Draft ingest API is protected", async () => {
        const response = await fetch(`${BASE_URL}/api/ingest/draft`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({})
        });

        if (![401, 403].includes(response.status)) {
          throw new Error(`Expected 401/403, got ${response.status}`);
        }
      }),
      runCheck("Cron ingest API is protected", async () => {
        const response = await fetch(`${BASE_URL}/api/cron/ingest`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ job: "ai-discovery" })
        });

        if (![401, 403].includes(response.status)) {
          throw new Error(`Expected 401/403, got ${response.status}`);
        }
      }),
      runCheck("Jobs cron API is protected", async () => {
        const response = await fetch(`${BASE_URL}/api/cron/jobs`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({})
        });

        if (![401, 403].includes(response.status)) {
          throw new Error(`Expected 401/403, got ${response.status}`);
        }
      })
    ]);

    const failedChecks = checks.filter((check) => !check.ok);

    for (const check of checks) {
      const marker = check.ok ? "PASS" : "FAIL";
      console.log(`${marker}: ${check.name}${check.details ? ` - ${check.details}` : ""}`);
    }

    if (failedChecks.length > 0) {
      throw new Error(`Smoke checks failed: ${failedChecks.map((check) => check.name).join(", ")}`);
    }
  } catch (error) {
    if (stdout.trim()) {
      console.log(stdout.trim());
    }

    if (stderr.trim()) {
      console.error(stderr.trim());
    }

    throw error;
  } finally {
    server.kill("SIGTERM");
    await sleep(1_000);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
    if (smokeTempDbPath && fs.existsSync(smokeTempDbPath)) {
      try {
        fs.unlinkSync(smokeTempDbPath);
      } catch {
        /* ignore */
      }
      smokeTempDbPath = null;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
