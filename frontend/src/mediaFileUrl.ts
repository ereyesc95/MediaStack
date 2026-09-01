import { getProfileToken } from "./auth";

function pathLooksExclusive(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    const pathParam = parsed.searchParams.get("path") || "";
    return pathParam.split("/").some((p) => p.toLowerCase() === "exclusive");
  } catch {
    return /\/exclusive\//i.test(url);
  }
}

/** Append session token so /api/media/file can serve Exclusive paths. */
export function withMediaAccess(url: string): string {
  if (!pathLooksExclusive(url)) return url;
  const token = getProfileToken();
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  if (url.includes("access_token=")) return url;
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}
