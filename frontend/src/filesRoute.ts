export const FILES_ROOT_PATH = "/files";

export function parseFilesRootPath(pathname: string): boolean {
  return pathname === FILES_ROOT_PATH || pathname === `${FILES_ROOT_PATH}/`;
}

export function filesTabPath(tabId: string): string {
  return `${FILES_ROOT_PATH}/${encodeURIComponent(tabId)}`;
}

export function parseFilesTabPath(pathname: string): string | null {
  const m = pathname.match(/^\/files\/([^/]+)\/?$/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function pushFilesRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", FILES_ROOT_PATH);
  else window.history.pushState({}, "", FILES_ROOT_PATH);
}

export function pushFilesTabRoute(tabId: string, replace = false): void {
  const path = filesTabPath(tabId);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}
