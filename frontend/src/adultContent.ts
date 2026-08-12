/** Adult / NSFW genre visibility helpers (mirrors backend adult_content.py). */

const ADULT_PARENT_GENRES = new Set(["adult", "adult print"]);

const ADULT_SUBGENRES = new Set([
  "ecchi",
  "harem",
  "lolicon",
  "yuri",
  "yaoi",
  "reverse harem",
]);

function norm(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

export function isAdultGenreName(name: string | null | undefined): boolean {
  const n = norm(name);
  return ADULT_PARENT_GENRES.has(n) || ADULT_SUBGENRES.has(n);
}

export function cardHasAdultGenres(card: {
  genre_names?: string[] | null;
  parent_genre_names?: string[] | null;
}): boolean {
  for (const n of card.parent_genre_names || []) {
    if (isAdultGenreName(n)) return true;
  }
  for (const n of card.genre_names || []) {
    if (isAdultGenreName(n)) return true;
  }
  return false;
}

export function filterAdultCards<T extends { genre_names?: string[] | null; parent_genre_names?: string[] | null }>(
  cards: T[],
  nsfwUnlocked: boolean
): T[] {
  if (nsfwUnlocked) return cards;
  return cards.filter((c) => !cardHasAdultGenres(c));
}

export function filterAdultSubgenreGroups<
  T extends { name?: string; label?: string; items?: { name?: string; label?: string }[] },
>(groups: T[], nsfwUnlocked: boolean): T[] {
  if (nsfwUnlocked) return groups;
  return groups
    .filter((g) => !isAdultGenreName(g.name || g.label))
    .map((g) => ({
      ...g,
      items: (g.items || []).filter(
        (it) => !isAdultGenreName(it.name || it.label)
      ),
    }))
    .filter((g) => (g.items?.length ?? 0) > 0 || !(g.items && g.items.length === 0));
}
