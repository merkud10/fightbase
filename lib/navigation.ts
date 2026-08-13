import { stripLocalePrefix } from "@/lib/locale-path";

function normalizePath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  const stripped = stripLocalePrefix(pathname).pathname;

  return stripped === "/" ? "/" : stripped.replace(/\/+$/, "");
}

export function isNavigationItemActive(pathname: string, href: string) {
  const currentPath = normalizePath(pathname);
  const itemPath = normalizePath(href);

  if (itemPath === "/") {
    return currentPath === "/";
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}
