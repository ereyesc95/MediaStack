import type { BandOverview } from "../../../types";

const CATEGORY_LABELS: Record<string, string> = {
  albums: "Albums",
  extended_plays: "Extended Plays",
  compilations: "Compilations",
  soundtracks: "Soundtracks",
  live_albums: "Live Albums",
  singles: "Singles",
};

type Props = {
  audio: BandOverview["audio"];
};

export default function ArtistAudio({ audio }: Props) {
  const keys = Object.keys(CATEGORY_LABELS).filter(
    (k) => (audio[k] ?? []).length > 0
  );
  if (!keys.length) {
    return <p className="muted artist-section-empty">No audio folders found.</p>;
  }
  return (
    <div className="artist-audio">
      {keys.map((key) => (
        <section key={key} className="artist-audio__group">
          <h3>{CATEGORY_LABELS[key]}</h3>
          <div className="artist-audio__grid">
            {(audio[key] ?? []).map((album) => (
              <div key={album.id} className="artist-audio__card">
                <span
                  className="artist-audio__cover"
                  style={
                    album.cover_url
                      ? { backgroundImage: `url("${album.cover_url}")` }
                      : undefined
                  }
                />
                <span className="artist-audio__title">{album.title}</span>
                {album.date && (
                  <span className="artist-audio__date muted">{album.date}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
