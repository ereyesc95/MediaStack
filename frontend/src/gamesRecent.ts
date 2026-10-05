const RECENT_KEY = "mystack.games.recent";

export function getRecentGameIds(limit = 24): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, limit);
  } catch {
    return [];
  }
}

export function pushRecentGameId(gameId: string, limit = 24): void {
  const id = (gameId || "").trim();
  if (!id) return;
  const next = [id, ...getRecentGameIds(limit).filter((x) => x !== id)].slice(
    0,
    limit
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
