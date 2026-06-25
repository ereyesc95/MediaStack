import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTrackDate } from "../../../formatDate";
import { playTrack } from "../../../api";
import {
  getCachedArtistPlaylistDetail,
  prefetchArtistPlaylistDetail,
} from "../../../artistPlaylistDetailCache";
import { useBeatPulse } from "../../../useBeatPulse";
import type { ArtistPlaylistDetail, ArtistPlaylistTrack } from "../../../types";
import { MiniAudioPlayerControls, useMiniAudio } from "./MiniAudioPlayer";
import { ReleaseTrackTitle } from "../release/releaseTrackTitle";
import { DEFAULT_DISC_URL } from "../release/releaseTrackPanelMeta";

type Props = {
  bandId: number;
  slug: string;
  onBack: () => void;
};

function parseApiError(message: string): string {
  try {
    const data = JSON.parse(message) as { detail?: string };
    if (data.detail) return data.detail;
  } catch {
    /* ignore */
  }
  return message;
}

export default function SystemPlaylistPage({ bandId, slug, onBack }: Props) {
  const [detail, setDetail] = useState<ArtistPlaylistDetail | null>(
    () => getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [loading, setLoading] = useState(
    () => !getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const miniAudio = useMiniAudio();

  useBeatPulse(miniAudio.audioRef, Boolean(miniAudio.src), miniAudio.playing);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const cached = getCachedArtistPlaylistDetail(bandId, slug);
    if (cached) {
      setDetail(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    prefetchArtistPlaylistDetail(bandId, slug, { force: true })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(parseApiError(e instanceof Error ? e.message : String(e)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, slug]);

  useEffect(() => () => miniAudio.clear(), [miniAudio.clear]);

  const tracks = detail?.tracks ?? [];
  const nowPlaying = useMemo(
    () => tracks.find((t) => t.play_path === playingPath) ?? null,
    [tracks, playingPath]
  );

  const handlePlay = useCallback(
    async (track: ArtistPlaylistTrack) => {
      if (!track.play_path) return;
      if (playingPath === track.play_path && miniAudio.src) {
        miniAudio.toggle();
        return;
      }
      setPlayingPath(track.play_path);
      try {
        const res = await playTrack({
          path: track.play_path,
          artist_id: bandId,
          title: track.title,
        });
        miniAudio.loadSrc(res.stream_url, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, miniAudio, playingPath]
  );

  const coverUrl =
    detail?.cover_url || `/api/assets/system/playlists/${slug}`;
  const panelCover = nowPlaying?.cover_url ?? coverUrl;
  const panelDisc = DEFAULT_DISC_URL;

  if (loading && !detail) {
    return <p className="muted artist-section-empty">Loading playlist…</p>;
  }

  if (error && !detail) {
    return (
      <div className="release-page">
        <p className="error artist-section-empty">{error}</p>
        <button type="button" className="btn" onClick={onBack}>
          ← Playlists
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="release-page">
        <p className="muted artist-section-empty">Playlist not found.</p>
        <button type="button" className="btn" onClick={onBack}>
          ← Playlists
        </button>
      </div>
    );
  }

  if (slug === "setlists" && !tracks.length) {
    return (
      <div className="release-page">
        <button type="button" className="btn" onClick={onBack}>
          ← Playlists
        </button>
        <h1 className="release-page__album-title">{detail.name}</h1>
        <p className="muted">
          Choose a year and show to build a setlist playlist.
          {detail.years?.length ? ` Years available: ${detail.years.join(", ")}.` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="release-page release-page--tracklist-only">
      <div className="release-page__layout">
        <aside className="release-page__panel release-page__panel--track">
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div className="release-page__art-stage">
                {panelCover && (
                  <span className="release-page__cover-wrap">
                    <img
                      src={panelCover}
                      alt=""
                      className="release-page__cover"
                      draggable={false}
                    />
                  </span>
                )}
                <img
                  src={panelDisc}
                  alt=""
                  className={`release-page__disc${
                    playingPath && miniAudio.playing ? " release-page__disc--spin" : ""
                  }${playingPath && !miniAudio.playing ? " release-page__disc--spin-paused" : ""}`}
                  draggable={false}
                />
              </div>
            </div>
            <div className="release-page__panel-meta">
              <div className="release-page__panel-body">
                <button type="button" className="btn release-page__back-link" onClick={onBack}>
                  ← Playlists
                </button>
                <h1 className="release-page__album-title">{detail.name}</h1>
                {nowPlaying ? (
                  <>
                    <h2 className="release-page__track-title">
                      <ReleaseTrackTitle title={nowPlaying.title} />
                    </h2>
                    {nowPlaying.release_date && (
                      <p className="release-page__date">
                        {formatTrackDate(nowPlaying.release_date)}
                      </p>
                    )}
                    {nowPlaying.album_title && (
                      <p className="release-page__track-panel-line muted">
                        {nowPlaying.album_title}
                      </p>
                    )}
                    {typeof nowPlaying.play_count === "number" && (
                      <p className="release-page__track-panel-line">
                        {nowPlaying.play_count} play
                        {nowPlaying.play_count === 1 ? "" : "s"}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">{tracks.length} tracks</p>
                )}
                {playingPath && (
                  <div className="release-page__mini-player">
                    <MiniAudioPlayerControls
                      playing={miniAudio.playing}
                      progress={miniAudio.progress}
                      duration={miniAudio.duration}
                      toggle={miniAudio.toggle}
                      seek={miniAudio.seek}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
        <div className="release-page__body release-page__body--tracklist">
          <ol className="release-tracklist__tracks release-tracklist__tracks--flat">
            {tracks.map((track, index) => {
              const active = playingPath === track.play_path;
              return (
                <li
                  key={`${track.play_path ?? track.title}-${index}`}
                  className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                >
                  <button
                    type="button"
                    className="release-tracklist__play"
                    onClick={() => void handlePlay(track)}
                    disabled={!track.play_path}
                    aria-label={`Play ${track.title}`}
                  >
                    <span className="release-tracklist__num">{index + 1}</span>
                    <span className="release-tracklist__title-wrap">
                      <ReleaseTrackTitle title={track.title} />
                      {track.album_title && (
                        <span className="release-tracklist__subtitle">{track.album_title}</span>
                      )}
                    </span>
                    {typeof track.play_count === "number" && (
                      <span className="release-tracklist__duration">{track.play_count}×</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
    </div>
  );
}
