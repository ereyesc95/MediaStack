/** Display name with Stack suffix (Series → SerieStack, Movies → MovieStack). */
export function toStackName(label: string): string {
  const trimmed = label.trim();
  const base = trimmed.endsWith("s") || trimmed.endsWith("S")
    ? trimmed.slice(0, -1)
    : trimmed;
  return `${base}Stack`;
}

export const MEDIA_TYPE_ICONS: Record<string, string> = {
  music: "♫",
  series: "▦",
  movies: "▣",
  books: "☰",
  games: "◉",
};

export function mediaTypeIcon(kind: string): string {
  return MEDIA_TYPE_ICONS[kind] ?? "▪";
}
