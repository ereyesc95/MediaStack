import { useEffect, useMemo, useState } from "react";
import {
  addTrackToPlaylist,
  createUserPlaylist,
  fetchListeningWrapped,
  fetchUserPlaylists,
} from "../../api";
import {
  getCachedListeningWrapped,
  setCachedListeningWrapped,
} from "../../listeningWrappedCache";
import type { ListeningWrapped } from "../../types";
import { IconCheck, IconPlus } from "../MenuIcons";
import ModalPortal from "../ModalPortal";

type TabId = "tracks" | "artists" | "vibes";

type Props = {
  year: number;
  onClose: () => void;
  onPlayTrack?: (
    path: string,
    artistId: number | null,
    title: string | null
  ) => void;
  onArtist?: (id: number) => void;
  onGenre?: (id: number) => void;
  /** Refresh Playlists tab after creating the Wrapped playlist. */
  onPlaylistCreated?: () => void;
};

export default function MusicWrapped({
  year,
  onClose,
  onPlayTrack,
  onArtist,
  onGenre,
  onPlaylistCreated,
}: Props) {
  const cached = getCachedListeningWrapped(year);
  const [data, setData] = useState<ListeningWrapped | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("tracks");
  const [playlistId, setPlaylistId] = useState<number | null>(null);
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);

  const playlistName = `${year} Wrapped`;

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedListeningWrapped(year);
    if (hit) {
      setData(hit);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void fetchListeningWrapped(year)
      .then((payload) => {
        if (cancelled) return;
        setCachedListeningWrapped(year, payload);
        setData(payload);
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

  useEffect(() => {
    let cancelled = false;
    void fetchUserPlaylists()
      .then(({ items }) => {
        if (cancelled) return;
        const hit = items.find(
          (p) => (p.name || "").trim().toLowerCase() === playlistName.toLowerCase()
        );
        if (hit) setPlaylistId(hit.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [playlistName]);

  const tracks = useMemo(
    () => (data?.top_tracks || []).slice(0, 100),
    [data]
  );
  const artists = useMemo(
    () => (data?.top_artists || []).slice(0, 15),
    [data]
  );
  const genres = useMemo(
    () => (data?.top_genres || []).slice(0, 15),
    [data]
  );

  async function addWrappedPlaylist() {
    if (playlistId != null || playlistBusy || !tracks.length) return;
    setPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const created = await createUserPlaylist({
        name: playlistName,
        description: `Your most played tracks in ${year} are here!`,
      });
      if (!created.ok || created.id == null) {
        throw new Error(created.error || "Could not create playlist");
      }
      const id = created.id;
      for (const t of tracks) {
        if (!t.path) continue;
        await addTrackToPlaylist(id, {
          title: t.title_full || t.title || "Track",
          artist: t.artist_name || "",
          release: t.release || "",
          path: t.path,
          allow_wrapped_fill: true,
        });
      }
      setPlaylistId(id);
      onPlaylistCreated?.();
    } catch (e) {
      setPlaylistError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlaylistBusy(false);
    }
  }

  const featuredTrack = tracks[0];
  const restTracks = tracks.slice(1);
  const featuredArtist = artists[0];
  const restArtists = artists.slice(1);
  const featuredGenre = genres[0];
  const restGenres = genres.slice(1);

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="music-wrapped"
        role="dialog"
        aria-modal="true"
        aria-label={`${year} Wrapped`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="music-wrapped__header">
          <p className="music-wrapped__eyebrow">Your year in sound</p>
          <h2 className="music-wrapped__title">{year} Wrapped</h2>
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
            <p>No dated listening yet for {year}.</p>
            <p className="muted">
              Play tracks from today onward — Wrapped fills in as you listen.
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

            <div className="music-wrapped__tabs" role="tablist">
              {(
                [
                  ["tracks", "On repeat"],
                  ["artists", "Top artists"],
                  ["vibes", "Vibes"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={tab === id ? "active" : ""}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="music-wrapped__body">
              {tab === "tracks" ? (
                <div className="music-wrapped__pane music-wrapped__pane--tracks">
                  <div className="music-wrapped__pane-scroll">
                    {tracks.length === 0 ? (
                      <p className="muted music-wrapped__status">No tracks yet.</p>
                    ) : (
                      <>
                        {featuredTrack ? (
                          <button
                            type="button"
                            className="music-wrapped__feature music-wrapped__feature--track"
                            onClick={() => {
                              if (featuredTrack.path) {
                                onPlayTrack?.(
                                  featuredTrack.path,
                                  featuredTrack.artist_id,
                                  featuredTrack.title
                                );
                              }
                            }}
                          >
                            {featuredTrack.cover_url ? (
                              <img
                                className="music-wrapped__feature-art music-wrapped__feature-art--square"
                                src={featuredTrack.cover_url}
                                alt=""
                              />
                            ) : (
                              <span className="music-wrapped__feature-art music-wrapped__feature-art--square music-wrapped__art-fallback" />
                            )}
                            <span className="music-wrapped__feature-meta">
                              <span className="music-wrapped__feature-rank">
                                #1 On repeat
                              </span>
                              <strong>{featuredTrack.title}</strong>
                              <em>
                                {featuredTrack.artist_name}
                                {featuredTrack.play_count != null
                                  ? ` · ${featuredTrack.play_count.toLocaleString()} plays`
                                  : ""}
                              </em>
                            </span>
                          </button>
                        ) : null}
                        <ol className="music-wrapped__list">
                          {restTracks.map((t, i) => {
                            const rank = i + 2;
                            const slim = rank > 10;
                            return (
                              <li key={t.path || t.id}>
                                <button
                                  type="button"
                                  className={`music-wrapped__row${
                                    slim ? " music-wrapped__row--slim" : ""
                                  }`}
                                  onClick={() => {
                                    if (t.path) {
                                      onPlayTrack?.(
                                        t.path,
                                        t.artist_id,
                                        t.title
                                      );
                                    }
                                  }}
                                >
                                  {!slim ? (
                                    t.cover_url ? (
                                      <img src={t.cover_url} alt="" />
                                    ) : (
                                      <span className="music-wrapped__art-fallback" />
                                    )
                                  ) : (
                                    <span className="music-wrapped__rank">
                                      {rank}
                                    </span>
                                  )}
                                  <span>
                                    <strong>{t.title}</strong>
                                    <em>{t.artist_name}</em>
                                  </span>
                                  <span className="music-wrapped__count">
                                    {t.play_count.toLocaleString()} plays
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      </>
                    )}
                  </div>
                  {tracks.length > 0 ? (
                    <div className="music-wrapped__playlist-bar">
                      {playlistError ? (
                        <p className="error music-wrapped__playlist-err">
                          {playlistError}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className={`btn music-wrapped__playlist-btn${
                          playlistId != null
                            ? " music-wrapped__playlist-btn--done"
                            : ""
                        }`}
                        disabled={playlistBusy || playlistId != null}
                        onClick={() => void addWrappedPlaylist()}
                      >
                        {playlistId != null ? (
                          <>
                            <IconCheck className="music-wrapped__playlist-icon" />
                            Added to your playlists
                          </>
                        ) : playlistBusy ? (
                          "Adding…"
                        ) : (
                          <>
                            <IconPlus className="music-wrapped__playlist-icon" />
                            Add to your playlists
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === "artists" ? (
                <div className="music-wrapped__pane">
                  {artists.length === 0 ? (
                    <p className="muted music-wrapped__status">No artists yet.</p>
                  ) : (
                    <>
                      {featuredArtist ? (
                        <button
                          type="button"
                          className="music-wrapped__feature"
                          onClick={() => {
                            onClose();
                            onArtist?.(featuredArtist.id);
                          }}
                        >
                          {featuredArtist.photo_url || featuredArtist.icon_url ? (
                            <img
                              className="music-wrapped__feature-art"
                              src={
                                featuredArtist.photo_url ||
                                featuredArtist.icon_url ||
                                ""
                              }
                              alt=""
                            />
                          ) : (
                            <span className="music-wrapped__feature-art music-wrapped__art-fallback" />
                          )}
                          <span className="music-wrapped__feature-meta">
                            <span className="music-wrapped__feature-rank">
                              #1 Artist
                            </span>
                            <strong>{featuredArtist.name}</strong>
                            <em>{featuredArtist.play_count} plays</em>
                          </span>
                        </button>
                      ) : null}
                      {restArtists.length > 0 ? (
                        <ul className="music-wrapped__grid">
                          {restArtists.map((a, i) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                className="music-wrapped__grid-card"
                                onClick={() => {
                                  onClose();
                                  onArtist?.(a.id);
                                }}
                              >
                                {a.photo_url || a.icon_url ? (
                                  <img
                                    src={a.photo_url || a.icon_url || ""}
                                    alt=""
                                  />
                                ) : (
                                  <span className="music-wrapped__art-fallback music-wrapped__art-fallback--round" />
                                )}
                                <span>
                                  <strong>
                                    <span className="music-wrapped__grid-rank">
                                      #{i + 2}
                                    </span>{" "}
                                    {a.name}
                                  </strong>
                                  <em>{a.play_count} plays</em>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {tab === "vibes" ? (
                <div className="music-wrapped__pane">
                  {genres.length === 0 ? (
                    <p className="muted music-wrapped__status">No vibes yet.</p>
                  ) : (
                    <>
                      {featuredGenre ? (
                        <button
                          type="button"
                          className="music-wrapped__feature"
                          onClick={() => {
                            const id = Number(featuredGenre.id);
                            if (!Number.isFinite(id)) return;
                            onClose();
                            onGenre?.(id);
                          }}
                        >
                          {featuredGenre.image_url ? (
                            <span
                              className="music-wrapped__feature-art music-wrapped__feature-art--genre"
                              style={{
                                backgroundImage: `url("${featuredGenre.image_url}")`,
                              }}
                            />
                          ) : (
                            <span className="music-wrapped__feature-art music-wrapped__art-fallback" />
                          )}
                          <span className="music-wrapped__feature-meta">
                            <span className="music-wrapped__feature-rank">
                              #1 Vibe
                            </span>
                            <strong>{featuredGenre.name}</strong>
                            <em>{featuredGenre.play_count} plays</em>
                          </span>
                        </button>
                      ) : null}
                      {restGenres.length > 0 ? (
                        <ul className="music-wrapped__grid">
                          {restGenres.map((g, i) => (
                            <li key={String(g.id)}>
                              <button
                                type="button"
                                className="music-wrapped__grid-card"
                                onClick={() => {
                                  const id = Number(g.id);
                                  if (!Number.isFinite(id)) return;
                                  onClose();
                                  onGenre?.(id);
                                }}
                              >
                                {g.image_url ? (
                                  <span
                                    className="music-wrapped__grid-genre"
                                    style={{
                                      backgroundImage: `url("${g.image_url}")`,
                                    }}
                                  />
                                ) : (
                                  <span className="music-wrapped__art-fallback music-wrapped__art-fallback--round" />
                                )}
                                <span>
                                  <strong>
                                    <span className="music-wrapped__grid-rank">
                                      #{i + 2}
                                    </span>{" "}
                                    {g.name}
                                  </strong>
                                  <em>{g.play_count} plays</em>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </ModalPortal>
  );
}
