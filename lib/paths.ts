import path from "node:path";

export function resolveAppRoot() {
  if (process.env.APP_ROOT) {
    return process.env.APP_ROOT;
  }
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) {
    return path.resolve(cwd, "..", "..");
  }
  return cwd;
}

export function resolvePublicPath(...segments: string[]) {
  return path.join(resolveAppRoot(), "public", ...segments);
}
