/** Parent-genre type line: Anime > Animation > rest of genres. */

function namesOf(
  genres:
    | { name?: string | null }[]
    | string[]
    | null
    | undefined
): string[] {
  if (!genres?.length) return [];
  return genres
    .map((g) => (typeof g === "string" ? g : g?.name || ""))
    .map((n) => n.trim())
    .filter(Boolean);
}

export function screenKindLabel(
  noun: "film" | "series" | "book",
  opts: {
    kindLabel?: string | null;
    parentGenreNames?: string[] | null;
    genres?: { name?: string | null }[] | string[] | null;
  }
): string {
  const parents = (opts.parentGenreNames || [])
    .map((n) => n.trim())
    .filter(Boolean);
  const genreNames = namesOf(opts.genres);
  const folded = new Set(
    [...parents, ...genreNames].map((n) => n.toLowerCase())
  );
  if (folded.has("anime")) return `Anime ${noun}`;
  if (folded.has("animation")) return `Animation ${noun}`;
  const firstParent = parents.find(
    (n) => n.toLowerCase() !== "other" && n.toLowerCase() !== "unknown"
  );
  if (firstParent) return `${firstParent} ${noun}`;
  if (opts.kindLabel?.trim()) return opts.kindLabel.trim();
  if (noun === "film") return "Film";
  if (noun === "book") return "Book";
  return "Series";
}
