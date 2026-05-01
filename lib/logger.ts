type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  // Spread meta first so callers can't accidentally clobber level/message/timestamp
  // (e.g. passing `{ message: errorText }` would otherwise overwrite the templated message).
  const payload = {
    ...meta,
    level,
    message,
    timestamp: new Date().toISOString()
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    write("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    write("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    write("error", message, meta);
  }
};
