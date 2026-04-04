export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRequestContext(request: Request) {
  return {
    requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
    method: request.method,
    path: new URL(request.url).pathname,
    ip: getClientIp(request)
  };
}
