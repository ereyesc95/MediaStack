import { useEffect, useState } from "react";
import { fetchListeningWrapped } from "../../api";
import type { ListeningWrapped } from "../../types";
import ModalPortal from "../ModalPortal";

type Props = {
  year?: number;
  onClose: () => void;
  onPlayTrack?: (
    path: string,
    artistId: number | null,
    title: string | null
  ) => void;
  onArtist?: (id: number) => void;
};

export default function MusicWrapped({
  year,
  onClose,
  onPlayTrack,
  onArtist,
}: Props) {
  const [data, setData] = useState<ListeningWrapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchListeningWrapped(year)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load Wrapped");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const y = data?.year ?? year ?? new Date().getFullYear();

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="music-wrapped"
        role="dialog"
        aria-modal="true"
        aria-label={`${y} Wrapped`}
        onMouseDown={(e) => e.stopPropagation()}
      >
          <header className="music-wrapped__header">
            <p className="music-wrapped__eyebrow">Your year in sound</p>
            <h2 className="music-wrapped__title">{y} Wrapped</h2>
            <button
              type="button"
              className="music-wrapped__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          {loading ? (
            <p className="muted music-wrapped__status">Loading…</p>
          ) : error ? (
            <p className="error music-wrapped__status">{error}</p>
          ) : data?.empty ? (
            <div className="music-wrapped__empty">
              <p>No dated listening yet for {y}.</p>
              <p className="muted">
                Play tracks from today onward — streaks and Wrapped fill in as
                you listen.
              </p>
            </div>
          ) : data ? (
            <>
              <div className="music-wrapped__stats">
                <div>
                  <strong>{data.total_plays.toLocaleString()}</strong>
                  <span>plays</span>
                </div>
                <div>
                  <strong>{data.active_days}</strong>
                  <span>days active</span>
                </div>
                <div>
                  <strong>{data.current_streak}</strong>
                  <span>day streak</span>
                </div>
                <div>
                  <strong>{data.longest_streak}</strong>
                  <span>best streak</span>
                </div>
              </div>

              {data.top_tracks.length > 0 ? (
                <section className="music-wrapped__section">
                  <h3>On repeat</h3>
                  <ol className="music-wrapped__list">
                    {data.top_tracks.slice(0, 5).map((t) => (
                      <li key={t.path || t.id}>
                        <button
                          type="button"
                          className="music-wrapped__row"
                          onClick={() => {
                            if (t.path) {
                              onPlayTrack?.(t.path, t.artist_id, t.title);
                            }
                          }}
                        >
                          {t.cover_url ? (
                            <img src={t.cover_url} alt="" />
                          ) : (
                            <span className="music-wrapped__art-fallback" />
                          )}
                          <span>
                            <strong>{t.title}</strong>
                            <em>{t.artist_name}</em>
                          </span>
                          <span className="music-wrapped__count">
                            {t.play_count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {data.top_artists.length > 0 ? (
                <section className="music-wrapped__section">
                  <h3>Top artists</h3>
                  <ol className="music-wrapped__list music-wrapped__list--artists">
                    {data.top_artists.slice(0, 5).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="music-wrapped__row"
                          onClick={() => onArtist?.(a.id)}
                        >
                          {a.photo_url || a.icon_url ? (
                            <img
                              src={a.photo_url || a.icon_url || ""}
                              alt=""
                            />
                          ) : (
                            <span className="music-wrapped__art-fallback" />
                          )}
                          <span>
                            <strong>{a.name}</strong>
                          </span>
                          <span className="music-wrapped__count">
                            {a.play_count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {data.top_genres.length > 0 ? (
                <section className="music-wrapped__section">
                  <h3>Vibes</h3>
                  <p className="music-wrapped__chips">
                    {data.top_genres.slice(0, 6).map((g) => (
                      <span key={String(g.id)}>{g.name}</span>
                    ))}
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
      </div>
    </ModalPortal>
  );
}
