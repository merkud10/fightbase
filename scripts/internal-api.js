function getInternalApiSecret() {
  return process.env.INTERNAL_API_SECRET || process.env.INGEST_CRON_SECRET || "";
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
