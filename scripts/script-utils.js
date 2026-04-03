const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

/**
 * Read a value from the .env file in the project root.
 */
function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * Read an environment variable, falling back to .env file, then to a default.
 */
function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

/**
 * Parse a string value as boolean.
 */
function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

/**
 * Parse common CLI arguments from process.argv.
 * Returns an object with parsed values and the remaining unparsed args.
 *
 * Recognizes: --base-url, --dry-run, --file, --lookback-hours, --limit,
 *             --status, --concurrency, --target, --verbose
 */
function parseCommonArgs(argv) {
  const options = {
    baseUrl: readEnv("INGEST_BASE_URL", "http://localhost:3000"),
    dryRun: false,
    file: null,
    lookbackHours: null,
    limit: null,
    status: null,
    concurrency: null,
    target: null,
    verbose: false,
    extra: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--base-url":
        if (next) { options.baseUrl = next; i += 1; }
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--file":
        if (next) { options.file = next; i += 1; }
        break;
      case "--lookback-hours":
        if (next) { options.lookbackHours = Number(next); i += 1; }
        break;
      case "--limit":
        if (next) { options.limit = Number(next); i += 1; }
        break;
      case "--status":
        if (next) { options.status = next; i += 1; }
        break;
      case "--concurrency":
        if (next) { options.concurrency = Number(next); i += 1; }
        break;
      case "--target":
        if (next) { options.target = next; i += 1; }
        break;
      case "--verbose":
        options.verbose = true;
        break;
      default:
        if (arg.startsWith("--") && next && !next.startsWith("--")) {
          options.extra[arg.slice(2)] = next;
          i += 1;
        } else if (arg.startsWith("--")) {
          options.extra[arg.slice(2)] = true;
        }
        break;
    }
  }

  return options;
}

/**
 * Create a shared PrismaClient instance for scripts.
 */
function createPrisma() {
  return new PrismaClient();
}

/**
 * Run a script's main function with standard error handling and cleanup.
 *
 * Usage:
 *   runScript(async (prisma, options) => {
 *     // your script logic here
 *   });
 *
 * Options:
 *   - prisma: boolean (default true) — create and inject a PrismaClient
 *   - parseArgs: boolean (default true) — parse CLI args and inject options
 */
function runScript(mainFn, opts = {}) {
  const usePrisma = opts.prisma !== false;
  const useArgs = opts.parseArgs !== false;
  const prisma = usePrisma ? createPrisma() : null;
  const options = useArgs ? parseCommonArgs(process.argv.slice(2)) : {};

  async function cleanup() {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
  }

  process.on("SIGINT", async () => {
    console.log("\nInterrupted, cleaning up...");
    await cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  Promise.resolve()
    .then(() => mainFn({ prisma, options }))
    .then(async () => {
      await cleanup();
    })
    .catch(async (error) => {
      console.error("Script failed:", error.message || error);
      await cleanup();
      process.exit(1);
    });
}

/**
 * Simple timestamped logger with prefixed context.
 *
 * Usage:
 *   const log = createLogger("SYNC-ROSTER");
 *   log.info("Starting sync...");
 *   log.error("Failed to fetch", error);
 */
function createLogger(prefix) {
  function timestamp() {
    return new Date().toISOString().slice(11, 19);
  }

  return {
    info(...args) {
      console.log(`[${timestamp()}] [${prefix}]`, ...args);
    },
    warn(...args) {
      console.warn(`[${timestamp()}] [${prefix}] WARN`, ...args);
    },
    error(...args) {
      console.error(`[${timestamp()}] [${prefix}] ERROR`, ...args);
    }
  };
}

module.exports = {
  readEnvValueFromFile,
  readEnv,
  parseBoolean,
  parseCommonArgs,
  createPrisma,
  runScript,
  createLogger
};
