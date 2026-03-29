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
  };

  const scriptPath = path.resolve(process.cwd(), "scripts", "fetch-source-feed.js");
  const origin = new URL(request.url).origin;
  const args = [scriptPath, "--file", body.file ?? "ingestion/sample-watchlist.json", "--base-url", origin];

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
