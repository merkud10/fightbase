type DeploymentEnvironment = "local" | "preview" | "production";

function readEnv(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (normalized === '""' || normalized === "''") {
    return "";
  }

  return normalized;
}

function readBoolean(value: string | undefined, fallback = false) {
  const normalized = readEnv(value).toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function detectDatabaseKind(databaseUrl: string) {
  if (!databaseUrl) {
    return "missing";
  }

  if (databaseUrl.startsWith("file:")) {
    return "sqlite";
  }

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return "postgres";
  }

  if (databaseUrl.startsWith("mysql://")) {
    return "mysql";
  }

  return "unknown";
}

export function getDeploymentEnvironment(): DeploymentEnvironment {
  const explicit = readEnv(process.env.DEPLOYMENT_ENV).toLowerCase();

  if (explicit === "preview" || explicit === "production" || explicit === "local") {
    return explicit;
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return "production";
  }

  return "local";
}

export function getEnvironmentReport() {
  const databaseUrl = readEnv(process.env.DATABASE_URL);
  const siteUrl = readEnv(process.env.NEXT_PUBLIC_SITE_URL);
  const cronSecret = readEnv(process.env.INGEST_CRON_SECRET);
  const openAiKey = readEnv(process.env.OPENAI_API_KEY);
  const ollamaUrl = readEnv(process.env.OLLAMA_URL);
  const deployment = getDeploymentEnvironment();
  const databaseKind = detectDatabaseKind(databaseUrl);

  return {
    deployment,
    databaseKind,
    adsEnabled: readBoolean(process.env.NEXT_PUBLIC_ADS_ENABLED, false),
    hasSiteUrl: Boolean(siteUrl),
    hasCronSecret: Boolean(cronSecret && cronSecret !== "change-me"),
    hasOpenAiKey: Boolean(openAiKey),
    hasOllama: Boolean(ollamaUrl),
    readyForPublicDeploy:
      deployment === "production"
        ? databaseKind !== "missing" && databaseKind !== "sqlite" && Boolean(siteUrl) && Boolean(cronSecret && cronSecret !== "change-me")
        : databaseKind !== "missing",
    warnings: [
      !databaseUrl ? "DATABASE_URL is not configured." : null,
      deployment === "production" && databaseKind === "sqlite"
        ? "Production should use Postgres instead of SQLite."
        : null,
      deployment !== "local" && !siteUrl ? "NEXT_PUBLIC_SITE_URL is not configured." : null,
      deployment !== "local" && (!cronSecret || cronSecret === "change-me")
        ? "INGEST_CRON_SECRET is not configured securely."
        : null
    ].filter(Boolean)
  };
}
