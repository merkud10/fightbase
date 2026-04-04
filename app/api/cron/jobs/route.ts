import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { recordSystemEvent } from "@/lib/system-events";
import { BackgroundJobsRunInputSchema } from "@/lib/validation";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:jobs",
      limit: 60,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = BackgroundJobsRunInputSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const limit = parsed.data.limit ?? 5;
  const scriptPath = path.resolve(process.cwd(), "scripts", "process-background-jobs.js");

  try {
    const result = await execFileAsync(process.execPath, [scriptPath, "--limit", String(limit)], {
      cwd: process.cwd(),
      timeout: 240_000
    });

    logger.info("Background jobs processed", {
      ...authorization.context,
      limit
    });
    void recordSystemEvent({
      level: "info",
      category: "jobs.processor",
      message: "Background jobs processed",
      source: "api/cron/jobs",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        limit
      }
    });

    return NextResponse.json(
      {
        ok: true,
        limit,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      },
      {
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  } catch (error) {
    const executionError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    logger.error("Background job processor failed", {
      ...authorization.context,
      limit,
      error: executionError.message ?? "Background job processor failed"
    });
    void recordSystemEvent({
      level: "error",
      category: "jobs.processor",
      message: "Background job processor failed",
      source: "api/cron/jobs",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        limit,
        error: executionError.message ?? "Background job processor failed"
      }
    });

    return NextResponse.json(
      {
        ok: false,
        error: executionError.message ?? "Background job processor failed",
        stdout: executionError.stdout?.trim() ?? "",
        stderr: executionError.stderr?.trim() ?? ""
      },
      {
        status: 500,
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
