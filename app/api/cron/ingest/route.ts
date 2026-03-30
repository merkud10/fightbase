import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

function isAuthorized(request: Request) {
  const expectedSecret = process.env.INGEST_CRON_SECRET;

  if (!expectedSecret) {
    return {
      ok: false,
      reason: "INGEST_CRON_SECRET is not configured"
    };
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-ingest-cron-secret");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const providedSecret = headerSecret ?? bearerSecret;

  if (providedSecret !== expectedSecret) {
    return {
      ok: false,
      reason: "Unauthorized"
    };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  const authorization = isAuthorized(request);

  if (!authorization.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: authorization.reason
      },
      { status: authorization.reason === "Unauthorized" ? 401 : 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    file?: string;
    dryRun?: boolean;
    job?: "watchlist" | "ai-discovery";
    lookbackHours?: number;
    limit?: number;
    status?: "draft" | "review" | "published";
  };

  const origin = new URL(request.url).origin;
  const job = body.job === "watchlist" ? "watchlist" : "ai-discovery";
  const scriptName = job === "watchlist" ? "fetch-source-feed.js" : "discover-ai-news.js";
  const scriptPath = path.resolve(process.cwd(), "scripts", scriptName);
  const args = [scriptPath, "--base-url", origin];

  if (job === "watchlist") {
    args.push("--file", body.file ?? "ingestion/sample-watchlist.json");
  } else {
    if (typeof body.lookbackHours === "number" && Number.isFinite(body.lookbackHours)) {
      args.push("--lookback-hours", String(body.lookbackHours));
    }

    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      args.push("--limit", String(body.limit));
    }

    if (body.status) {
      args.push("--status", body.status);
    }
  }

  if (body.dryRun) {
    args.push("--dry-run");
  }

  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: 120_000
    });

    return NextResponse.json({
      ok: true,
      job,
      mode: body.dryRun ? "dry-run" : "write",
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    });
  } catch (error) {
    const executionError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return NextResponse.json(
      {
        ok: false,
        error: executionError.message ?? "Cron ingestion failed",
        stdout: executionError.stdout?.trim() ?? "",
        stderr: executionError.stderr?.trim() ?? ""
      },
      { status: 500 }
    );
  }
}
