import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchReleaseTracklist,
  fetchTrackCredits,
  fetchTrackLyrics,
  fetchTrackVersions,
} from "../../../api";
import type {
  ReleaseEdition,
  ReleaseTrackItem,
  ReleaseTracklist,
  TrackVersionItem,
} from "../../../types";

export type ReleasePlaybackArt = {
  cover_url?: string | null;
  cover_animation_url?: string | null;
  disc_url?: string | null;
  background_layers?: string[];
};
import ReleaseAddToPlaylistModal from "./ReleaseAddToPlaylistModal";
import ReleaseLyricsModal from "./ReleaseLyricsModal";
import ReleaseTrackCreditsModal from "./ReleaseTrackCreditsModal";
import ReleaseVersionsModal from "./ReleaseVersionsModal";

export type ReleaseMobileTrackView = "album" | "tracks";

type Props = {
  bandId: number;
  releaseId: string;
  artistName: string;
  releaseTitle: string;
  stacked: boolean;
  playingPath: string | null;
  mobileView: ReleaseMobileTrackView;
  onMobileViewChange: (view: ReleaseMobileTrackView) => void;
  onPlay: (path: string, title: string, art?: ReleasePlaybackArt) => void;
  onEditionArt?: (edition: ReleaseEdition) => void;
  mobileBackdropUrl?: string | null;
  reloadKey?: number;
};

function flatTracks(edition: ReleaseEdition): ReleaseTrackItem[] {
  const out: ReleaseTrackItem[] = [];
  for (const group of edition.groups) {
    out.push(...group.tracks);
  }
  return out;
}

export default function ReleaseTracklist({
  bandId,
  releaseId,
  artistName,
  releaseTitle,
  stacked,
  playingPath,
  mobileView,
  onMobileViewChange,
  onPlay,
  onEditionArt,
  mobileBackdropUrl,
  reloadKey = 0,
}: Props) {
  const [data, setData] = useState<ReleaseTracklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editionIndex, setEditionIndex] = useState(0);
  const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);
  const [creditsTrack, setCreditsTrack] = useState<ReleaseTrackItem | null>(null);
  const [creditsWriters, setCreditsWriters] = useState<string[]>([]);
  const [creditsComposers, setCreditsComposers] = useState<string[]>([]);
  const [creditsLyricists, setCreditsLyricists] = useState<string[]>([]);
  const [creditsSource, setCreditsSource] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchReleaseTracklist(bandId, releaseId);
      setData(payload);
      setEditionIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const edition = data?.editions[editionIndex] ?? null;
  const showEditionBar = (data?.editions.length ?? 0) > 1;

  useEffect(() => {
    if (edition && onEditionArt) {
      onEditionArt(edition);
    }
  }, [edition, onEditionArt]);

  const totalTracks = useMemo(
    () => (data ? data.editions.reduce((n, e) => n + flatTracks(e).length, 0) : 0),
    [data]
  );

  const openLyrics = async (track: ReleaseTrackItem) => {
    setLyricsTrack(track);
    setLyricsText(null);
    setLyricsError(null);
    setLyricsLoading(true);
    try {
      const res = await fetchTrackLyrics(artistName, track.title, track.play_path);
      setLyricsText(res.lyrics);
    } catch (e) {
      setLyricsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLyricsLoading(false);
    }
  };

  const closeLyrics = () => {
    setLyricsTrack(null);
    setLyricsText(null);
    setLyricsError(null);
  };

  const openVersions = async (track: ReleaseTrackItem) => {
    setVersionsTrack(track);
    setVersions([]);
    setVersionsError(null);
    setVersionsLoading(true);
    try {
      const res = await fetchTrackVersions(
        bandId,
        releaseId,
        track.title,
        track.play_path
      );
      setVersions(res.versions);
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersionsLoading(false);
    }
  };

  const closeVersions = () => {
    setVersionsTrack(null);
    setVersions([]);
    setVersionsError(null);
  };

  const openCredits = async (track: ReleaseTrackItem) => {
    setCreditsTrack(track);
    setCreditsWriters([]);
    setCreditsComposers([]);
    setCreditsLyricists([]);
    setCreditsSource(null);
    setCreditsError(null);
    setCreditsLoading(true);
    try {
      const res = await fetchTrackCredits(bandId, releaseId, track.title);
      setCreditsWriters(res.writers);
      setCreditsComposers(res.composers);
      setCreditsLyricists(res.lyricists);
      setCreditsSource(res.source);
    } catch (e) {
      setCreditsError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreditsLoading(false);
    }
  };

  const closeCredits = () => {
    setCreditsTrack(null);
    setCreditsError(null);
  };

  if (loading && !data) {
    return <p className="muted release-tracklist__loading">Loading tracklist…</p>;
  }
  if (error) {
    return <p className="error release-tracklist__error">{error}</p>;
  }
  if (!data || !edition) {
    return <p className="muted release-tracklist__empty">No tracks found.</p>;
  }

  const tracklistBody = (
    <div className="release-tracklist__content">
      {showEditionBar && (
        <nav className="release-tracklist__editions">
          {data.editions.map((ed, i) => (
            <button
              key={ed.id}
              type="button"
              className={i === editionIndex ? "active" : ""}
              onClick={() => setEditionIndex(i)}
            >
              {ed.label}
            </button>
          ))}
        </nav>
      )}

      {edition.groups.map((group) => (
        <section key={group.id} className="release-tracklist__group">
          {group.label && (
            <h3 className="release-tracklist__group-label">{group.label}</h3>
          )}
          <ol className="release-tracklist__tracks">
            {group.tracks.map((track) => {
              const active = playingPath === track.play_path;
              return (
                <li
                  key={track.id}
                  className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                >
                  <button
                    type="button"
                    className="release-tracklist__play"
                    onClick={() =>
                      onPlay(track.play_path, track.title, {
                        disc_url: group.disc_url ?? edition.disc_url,
                        cover_url: edition.cover_url,
                        cover_animation_url: edition.cover_animation_url,
                        background_layers: edition.background_layers,
                      })
                    }
                    aria-label={`Play ${track.title}`}
                  >
                    <span className="release-tracklist__num">{track.number}</span>
                    <span className="release-tracklist__title">{track.title}</span>
                    {track.duration && (
                      <span className="release-tracklist__duration">{track.duration}</span>
                    )}
                  </button>
                  <div className="release-tracklist__actions">
                    <button
                      type="button"
                      title="Lyrics"
                      onClick={() => void openLyrics(track)}
                    >
                      Lyrics
                    </button>
                    <button
                      type="button"
                      title="Other versions in library"
                      onClick={() => void openVersions(track)}
                    >
                      Versions
                    </button>
                    <button
                      type="button"
                      title="Add to playlist"
                      onClick={() => setPlusTrack(track)}
                    >
                      Plus
                    </button>
                    <button
                      type="button"
                      title="Writing credits"
                      onClick={() => void openCredits(track)}
                    >
                      Credits
                    </button>
                    {track.youtube_url && (
                      <a
                        href={track.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="YouTube"
                        className="release-tracklist__yt"
                      >
                        YouTube
                      </a>
                    )}
                    {track.has_lrc && (
                      <span className="release-tracklist__badge" title="Local LRC">
                        LRC
                      </span>
                    )}
                    {track.is_link && (
                      <span className="release-tracklist__badge" title="Linked album">
                        Link
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );

  return (
    <div
      className={`release-tracklist${stacked ? " release-tracklist--stacked" : ""}${
        stacked && mobileView === "tracks" && mobileBackdropUrl
          ? " release-tracklist--mobile-canvas"
          : ""
      }`}
      style={
        stacked && mobileView === "tracks" && mobileBackdropUrl
          ? ({ ["--tracklist-bg" as string]: `url("${mobileBackdropUrl}")` } as CSSProperties)
          : undefined
      }
    >
      {stacked && (
        <nav className="release-tracklist__mobile-toggle">
          <button
            type="button"
            className={mobileView === "album" ? "active" : ""}
            onClick={() => onMobileViewChange("album")}
          >
            ALBUM
          </button>
          <button
            type="button"
            className={mobileView === "tracks" ? "active" : ""}
            onClick={() => onMobileViewChange("tracks")}
          >
            TRACKS
          </button>
        </nav>
      )}

      <p className="release-tracklist__meta muted">
        {totalTracks} track{totalTracks === 1 ? "" : "s"}
        {showEditionBar ? ` · ${data.editions.length} editions` : ""}
      </p>

      {(!stacked || mobileView === "tracks") && tracklistBody}

      {lyricsTrack && (
        <ReleaseLyricsModal
          title={lyricsTrack.title}
          lyrics={lyricsText}
          loading={lyricsLoading}
          error={lyricsError}
          onClose={closeLyrics}
        />
      )}

      {plusTrack && (
        <ReleaseAddToPlaylistModal
          track={plusTrack}
          artistName={artistName}
          releaseTitle={releaseTitle}
          onClose={() => setPlusTrack(null)}
        />
      )}

      {creditsTrack && (
        <ReleaseTrackCreditsModal
          title={creditsTrack.title}
          writers={creditsWriters}
          composers={creditsComposers}
          lyricists={creditsLyricists}
          source={creditsSource}
          loading={creditsLoading}
          error={creditsError}
          onClose={closeCredits}
        />
      )}

      {versionsTrack && (
        <ReleaseVersionsModal
          title={versionsTrack.title}
          versions={versions}
          loading={versionsLoading}
          error={versionsError}
          onClose={closeVersions}
          onPlay={(path, t) => {
            closeVersions();
            onPlay(path, t);
          }}
        />
      )}
    </div>
  );
}
