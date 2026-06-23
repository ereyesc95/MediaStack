import { resolveArtistName } from "../../../api";
import { writerSearchUrl } from "../release/releaseTrackPanelMeta";

export async function openArtistByName(
  name: string,
  onOpenArtist: (id: number) => void
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const res = await resolveArtistName(trimmed);
    if (res.band_id) {
      onOpenArtist(res.band_id);
      return;
    }
    if (res.urls?.wikipedia) {
      window.open(res.urls.wikipedia, "_blank", "noopener,noreferrer");
      return;
    }
    if (res.urls?.musicbrainz) {
      window.open(res.urls.musicbrainz, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(writerSearchUrl(trimmed), "_blank", "noopener,noreferrer");
  } catch {
    window.open(writerSearchUrl(trimmed), "_blank", "noopener,noreferrer");
  }
}
