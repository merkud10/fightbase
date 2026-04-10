const fs = require("node:fs");
const path = require("node:path");

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

function getEnvValue(name) {
  return process.env[name] || readEnvValueFromFile(name) || "";
}

function getInternalApiSecret() {
  return getEnvValue("INTERNAL_API_SECRET") || getEnvValue("INGEST_CRON_SECRET") || "";
}

function buildInternalApiHeaders(extraHeaders = {}) {
  const headers = {
    ...extraHeaders
  };

  const secret = getInternalApiSecret();
  if (secret) {
    headers["x-internal-api-secret"] = secret;
  }

  return headers;
}

module.exports = {
  buildInternalApiHeaders,
  getInternalApiSecret
};
