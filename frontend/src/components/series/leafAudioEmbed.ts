import type { SeriesMediaCard } from "./SeriesMediaGrid";

export type LeafAudioEmbed =
  | { mode: "release"; bandId: number; releaseId: string }
  | { mode: "oped" }
  | { mode: "grid" };

function isPlaylistCard(c: SeriesMediaCard): boolean {
  return Boolean(
    c.path?.startsWith("playlist:") ||
      c.category === "playlists" ||
      c.id.startsWith("series-op-ed:")
  );
}

function isResolvableRelease(c: SeriesMediaCard): boolean {
  return Boolean(c.navigate_band_id && c.navigate_release_id);
}

/**
 * Leaf / franchise Audio tab: embed a single Music release, embed Op/Ed-only,
 * or keep the card grid (including a single dead .lnk).
 */
export function resolveLeafAudioEmbed(
  cards: SeriesMediaCard[]
): LeafAudioEmbed {
  const playlists = cards.filter(isPlaylistCard);
  const music = cards.filter((c) => !isPlaylistCard(c));
  const resolvable = music.filter(isResolvableRelease);
  const dead = music.filter((c) => !isResolvableRelease(c));

  if (resolvable.length === 1 && dead.length === 0 && playlists.length === 0) {
    const card = resolvable[0];
    // Always open the resolved Music release id — never the .lnk path hash (`id`).
    const releaseId = String(card.navigate_release_id || "");
    return {
      mode: "release",
      bandId: card.navigate_band_id as number,
      releaseId,
    };
  }

  if (music.length === 0 && playlists.length > 0) {
    return { mode: "oped" };
  }

  return { mode: "grid" };
}
