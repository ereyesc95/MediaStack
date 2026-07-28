import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchSeriesOpeningsEndings,
  fetchTrackLyrics,
  fetchTrackVersions,
} from "../../api";
import { formatTrackDate } from "../../formatDate";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../../mediaTheme";
import { pushSeriesRoute } from "../../seriesRoute";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import { useBeatPulse } from "../../useBeatPulse";
import AppMenu from "../AppMenu";
import MediaBeatFx from "../music/MediaBeatFx";
import MediaBeatFrame from "../music/MediaBeatFrame";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "../music/artist/MiniAudioPlayer";
import ReleaseAddToPlaylistModal from "../music/release/ReleaseAddToPlaylistModal";
import ReleaseLyricsModal from "../music/release/ReleaseLyricsModal";
import ReleaseVersionsModal from "../music/release/ReleaseVersionsModal";
import {
  DEFAULT_DISC_URL,
  parseTrackPanelMeta,
  trackMainTitle,
} from "../music/release/releaseTrackPanelMeta";
import {
  TrackActionLyricsIcon,
  TrackActionPlaylistIcon,
  TrackActionVersionsIcon,
  TrackActionYoutubeIcon,
} from "../music/release/releaseTrackActionIcons";
import type { ReleaseTrackItem, TrackVersionItem } from "../../types";
import SortChevron from "../music/SortChevron";

export type SeriesOpEdTrack = {
  id: string;
  number: number | null;
  title: string;
  kind?: string | null;
  video_suffix?: string | null;
  play_url?: string | null;
  open_url?: string | null;
  video_url?: string | null;
  play_path?: string | null;
  cover_url?: string | null;
  cover_animation_url?: string | null;
  disc_url?: string | null;
  canvas_url?: string | null;
  artist?: string | null;
  artist_logo_url?: string | null;
  artist_icon_url?: string | null;
  album?: string | null;
  year?: string | null;
  date_iso?: string | null;
  display_date?: string | null;
  duration?: string | null;
  duration_sec?: number | null;
  audio_matched?: boolean;
  subseries_id?: string | null;
  subseries_title?: string | null;
  navigate_band_id?: number | null;
  navigate_release_id?: string | null;
};

type SortKey =
  | "number"
  | "title"
  | "series"
  | "artist"
  | "album"
  | "year"
  | "duration";

type Props = {
  franchiseId: string;
  franchiseName?: string;
  onBack: () => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  isAdmin?: boolean;
  userId?: number;
};

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function displayTitleParts(t: SeriesOpEdTrack): { main: string; suffix: string | null } {
  const suffix = (t.video_suffix || "").trim() || null;
  let main = t.title || "";
  if (suffix) {
    const re = new RegExp(
      `\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i"
    );
    main = main.replace(re, "").trim() || main;
  }
  const meta = parseTrackPanelMeta(main);
  return {
    main: meta.mainTitle || main,
    suffix: suffix || meta.versionLabel,
  };
}

function toReleaseTrack(t: SeriesOpEdTrack): ReleaseTrackItem {
  return {
    id: t.id,
    number: t.number ?? 0,
    title: t.title,
    play_path: t.play_path || "",
    cover_url: t.cover_url || null,
    duration_sec: t.duration_sec ?? null,
    duration: t.duration || null,
    disc_url: t.disc_url || null,
    canvas_url: t.canvas_url || null,
    has_lrc: false,
    is_link: false,
  };
}

export default function SeriesOpeningsEndingsPage({
  franchiseId,
  franchiseName,
  onBack,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  isAdmin = false,
  userId,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const tabletLayout = isTabletLayout(layout);
  const audio = useMiniAudio();

  const [tracks, setTracks] = useState<SeriesOpEdTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const indexRef = useRef(0);

  useBeatPulse(audio.audioRef, Boolean(activeId), audio.playing);

  useEffect(() => {
    beginArtistPageSession();
    pushSeriesRoute(
      {
        franchiseId,
        section: "audio",
      },
      true
    );
    window.history.replaceState(
      null,
      "",
      `/series/franchise/${encodeURIComponent(franchiseId)}/playlist/openings-endings`
    );
  }, [franchiseId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSeriesOpeningsEndings(franchiseId)
      .then((data) => {
        if (cancelled) return;
        const openings = (data.openings || []) as SeriesOpEdTrack[];
        const endings = (data.endings || []) as SeriesOpEdTrack[];
        const list = [...openings, ...endings].filter(
          (t) => t.play_url || t.open_url
        );
        setTracks(list);
        const firstCover = list.find((t) => t.cover_url)?.cover_url || null;
        setCoverUrl(firstCover);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      audio.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear only on unmount
  }, [franchiseId]);

  useEffect(() => {
    if (!coverUrl || isPlaybackThemeActive()) return;
    void colorsFromImageUrl(coverUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [coverUrl, userId]);

  const playAt = useCallback(
    (i: number) => {
      const t = tracks[i];
      const url = t?.play_url || t?.open_url;
      if (!t || !url) return;
      indexRef.current = i;
      setActiveId(t.id);
      if (t.cover_url) setCoverUrl(t.cover_url);
      audio.loadSrc(url, true);
    },
    [audio, tracks]
  );

  const playNext = useCallback(() => {
    if (!tracks.length) return;
    playAt((indexRef.current + 1) % tracks.length);
  }, [playAt, tracks.length]);

  const playPrev = useCallback(() => {
    if (!tracks.length) return;
    playAt((indexRef.current - 1 + tracks.length) % tracks.length);
  }, [playAt, tracks.length]);

  useEffect(() => {
    const el = audio.audioRef.current;
    if (!el) return;
    const onEnd = () => playNext();
    el.addEventListener("ended", onEnd);
    return () => el.removeEventListener("ended", onEnd);
  }, [audio.audioRef, playNext]);

  const active = useMemo(
    () => tracks.find((t) => t.id === activeId) || null,
    [tracks, activeId]
  );

  const sortedTracks = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t: SeriesOpEdTrack): string | number => {
      switch (sortKey) {
        case "number":
          return t.number ?? 9999;
        case "title":
          return displayTitleParts(t).main.toLowerCase();
        case "series":
          return (t.subseries_title || "").toLowerCase();
        case "artist":
          return (t.artist || "").toLowerCase();
        case "album":
          return (t.album || "").toLowerCase();
        case "year":
          return t.year || t.date_iso || "";
        case "duration":
          return t.duration_sec ?? 0;
        default:
          return 0;
      }
    };
    return [...tracks].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [tracks, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const panelCover =
    (active &&
      (active.cover_animation_url || active.cover_url)) ||
    coverUrl ||
    null;
  const panelCoverIsVideo = isVideoUrl(panelCover);
  const panelDisc = active?.disc_url || DEFAULT_DISC_URL;
  const panelCanvas = active?.canvas_url || null;
  const releaseDate =
    active?.display_date ||
    formatTrackDate(active?.date_iso) ||
    (active?.year ? `Released in ${active.year}` : null);
  const titleParts = active ? displayTitleParts(active) : null;
  const title = franchiseName || "Franchise";

  const openLyrics = async () => {
    if (!active?.artist || !active.title) return;
    setLyricsOpen(true);
    setLyricsLoading(true);
    setLyricsText(null);
    try {
      const res = await fetchTrackLyrics(
        active.artist,
        trackMainTitle(active.title),
        active.play_path || undefined
      );
      setLyricsText(res.lyrics);
    } catch {
      setLyricsText(null);
    } finally {
      setLyricsLoading(false);
    }
  };

  const openVersions = async () => {
    if (!active?.title) return;
    const bandId = active.navigate_band_id;
    const releaseId = active.navigate_release_id;
    if (bandId == null || !releaseId || !active.play_path) {
      setVersionsOpen(true);
      setVersions([]);
      setVersionsLoading(false);
      return;
    }
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersions([]);
    try {
      const res = await fetchTrackVersions(
        bandId,
        releaseId,
        trackMainTitle(active.title),
        active.play_path
      );
      setVersions(res.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const openExtrasVideo = () => {
    const url = active?.video_url?.trim();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const pageClass = [
    "release-page",
    "series-oped-playlist-page",
    stacked ? "release-page--stacked" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    layout === "tablet-portrait" ? "release-page--tablet-portrait" : "",
    audio.playing ? "release-page--beat-ready release-page--playing" : "",
    panelCanvas ? "release-page--has-panel-canvas" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bgImage =
    active?.cover_url || coverUrl || panelCover || DEFAULT_DISC_URL;

  return (
    <div className={pageClass}>
      <div className="release-page__bg-stack" aria-hidden>
        <div
          className="release-page__bg release-page__bg--visible"
          style={
            {
              backgroundImage: `url("${bgImage}")`,
            } as CSSProperties
          }
        />
        <MediaBeatFx />
      </div>

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__back"
              onClick={onBack}
              aria-label={`Back to ${title}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{title.toUpperCase()}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            <span className="release-page__title-center">
              OPENINGS &amp; ENDINGS
            </span>
          </div>
          <div className="release-page__top-right">
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="release"
            />
          </div>
        </header>
      </div>

      <div className="release-page__body">
        <aside className="release-page__panel">
          {panelCanvas ? (
            <div className="release-page__panel-canvas-layer" aria-hidden>
              <video
                key={panelCanvas}
                className="release-page__panel-canvas"
                src={panelCanvas}
                autoPlay
                loop
                muted
                playsInline
              />
              <div className="release-page__panel-canvas-shade" />
            </div>
          ) : null}
          <div className="release-page__panel-content">
            <div className="release-page__art">
              <div className="release-page__art-stage">
                {panelCover ? (
                  <span className="release-page__cover-wrap">
                    {panelCoverIsVideo ? (
                      <video
                        key={panelCover}
                        src={panelCover}
                        className="release-page__cover release-page__cover--video"
                        autoPlay
                        loop
                        muted
                        playsInline
                        draggable={false}
                      />
                    ) : (
                      <img
                        key={panelCover}
                        src={panelCover}
                        alt=""
                        className="release-page__cover"
                        draggable={false}
                      />
                    )}
                  </span>
                ) : null}
                <img
                  key={panelDisc}
                  src={panelDisc}
                  alt=""
                  className={[
                    "release-page__disc",
                    activeId ? "release-page__disc--spin" : "",
                    activeId && !audio.playing
                      ? "release-page__disc--spin-paused"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable={false}
                />
              </div>
            </div>
            <div className="release-page__panel-meta">
              <div className="release-page__panel-body">
                {active ? (
                  <div className="release-page__track-panel">
                    <div className="release-page__brand-row">
                      {active.artist_icon_url || active.artist_logo_url ? (
                        <span className="release-page__brand-row-static">
                          {active.artist_icon_url ? (
                            <MediaBeatFrame variant="logo">
                              <img
                                src={active.artist_icon_url}
                                alt=""
                                className="release-page__meta-icon"
                              />
                            </MediaBeatFrame>
                          ) : null}
                          {active.artist_logo_url ? (
                            <MediaBeatFrame variant="logo">
                              <img
                                src={active.artist_logo_url}
                                alt=""
                                className="release-page__meta-logo"
                              />
                            </MediaBeatFrame>
                          ) : null}
                        </span>
                      ) : active.artist ? (
                        <p className="release-page__artist-link--text">
                          {active.artist}
                        </p>
                      ) : null}
                    </div>
                    <h2 className="release-page__track-panel-title">
                      {titleParts?.main || active.title}
                    </h2>
                    {titleParts?.suffix ? (
                      <p className="release-page__track-panel-version">
                        {titleParts.suffix}
                      </p>
                    ) : null}
                    {releaseDate ? (
                      <p className="release-page__track-panel-date">
                        {/^released/i.test(releaseDate)
                          ? releaseDate
                          : `Released on ${releaseDate}`}
                      </p>
                    ) : null}
                    {active.album ? (
                      <p className="release-page__track-panel-source">
                        Taken from {active.album}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="release-page__panel-head">
                    <h1 className="release-page__album-title">
                      Openings &amp; Endings
                    </h1>
                    <p className="release-page__type-line">
                      Playlist · {tracks.length} track
                      {tracks.length === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
              </div>
              <div className="release-page__panel-bottom">
                {active ? (
                  <div className="release-page__track-actions release-page__track-actions--above-player">
                    <button
                      type="button"
                      className="release-page__track-action"
                      data-tooltip="Lyrics"
                      aria-label="Lyrics"
                      onClick={() => void openLyrics()}
                    >
                      <TrackActionLyricsIcon className="release-page__track-action-icon" />
                    </button>
                    <button
                      type="button"
                      className="release-page__track-action"
                      data-tooltip="Versions"
                      aria-label="Versions"
                      onClick={() => void openVersions()}
                    >
                      <TrackActionVersionsIcon className="release-page__track-action-icon" />
                    </button>
                    <button
                      type="button"
                      className="release-page__track-action"
                      data-tooltip="Add to playlist"
                      aria-label="Add to playlist"
                      onClick={() => setPlusOpen(true)}
                    >
                      <TrackActionPlaylistIcon className="release-page__track-action-icon" />
                    </button>
                    {active.video_url ? (
                      <button
                        type="button"
                        className="release-page__track-action"
                        data-tooltip="Extras video"
                        aria-label="Extras video"
                        onClick={openExtrasVideo}
                      >
                        <TrackActionYoutubeIcon className="release-page__track-action-icon" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="release-page__panel-footer">
                  <div className="release-page__panel-player">
                    <MiniAudioPlayerControls
                      playing={audio.playing}
                      progress={audio.progress}
                      duration={audio.duration}
                      toggle={audio.toggle}
                      seek={audio.seek}
                      onPrev={playPrev}
                      onNext={playNext}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="release-page__main">
          {loading ? <p className="muted">Loading…</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!loading && !error ? (
            <div className="series-oped-tracklist">
              <div className="series-oped-tracklist__head">
                {(
                  [
                    ["number", "#"],
                    ["title", "Title"],
                    ["series", "Series"],
                    ["artist", "Artist"],
                    ["album", "Album"],
                    ["year", "Year"],
                    ["duration", "Duration"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`series-oped-tracklist__sort${
                      key === "number"
                        ? " series-oped-tracklist__col-num"
                        : key === "artist"
                          ? " series-oped-tracklist__col-artist"
                          : key === "album"
                            ? " series-oped-tracklist__col-album"
                            : key === "series"
                              ? " series-oped-tracklist__col-series"
                              : key === "year"
                                ? " series-oped-tracklist__col-year"
                                : key === "duration"
                                  ? " series-oped-tracklist__col-dur"
                                  : ""
                    }${sortKey === key ? " is-active" : ""}`}
                    onClick={() => toggleSort(key)}
                  >
                    <span>{label}</span>
                    <SortChevron desc={sortKey === key && sortDir === "desc"} />
                  </button>
                ))}
              </div>
              <ul className="series-oped-tracklist__rows">
                {sortedTracks.map((t, i) => {
                  const playing = t.id === activeId;
                  const parts = displayTitleParts(t);
                  const origIndex = tracks.findIndex((x) => x.id === t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`series-oped-tracklist__row${
                          playing ? " is-playing" : ""
                        }`}
                        onClick={() =>
                          playAt(origIndex >= 0 ? origIndex : i)
                        }
                      >
                        <span className="series-oped-tracklist__col-num">
                          {t.number ?? i + 1}
                        </span>
                        <span className="series-oped-tracklist__title">
                          <span className="series-oped-tracklist__title-main">
                            {parts.main}
                          </span>
                          {parts.suffix ? (
                            <span className="series-oped-tracklist__title-suffix">
                              {" "}
                              {parts.suffix}
                            </span>
                          ) : null}
                        </span>
                        <span className="series-oped-tracklist__col-series">
                          {t.subseries_title || "—"}
                        </span>
                        <span className="series-oped-tracklist__col-artist">
                          {t.artist || "—"}
                        </span>
                        <span className="series-oped-tracklist__col-album">
                          {t.album || "—"}
                        </span>
                        <span className="series-oped-tracklist__col-year">
                          {t.year || "—"}
                        </span>
                        <span className="series-oped-tracklist__col-dur">
                          {t.duration || "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!tracks.length ? (
                <p className="muted">No openings or endings found in Extras.</p>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
      <audio ref={audio.audioRef} src={audio.src ?? undefined} preload="metadata" />
      {lyricsOpen ? (
        <ReleaseLyricsModal
          title={titleParts?.main || active?.title || "Lyrics"}
          lyrics={lyricsText}
          loading={lyricsLoading}
          error={null}
          onClose={() => setLyricsOpen(false)}
        />
      ) : null}
      {versionsOpen && active ? (
        <ReleaseVersionsModal
          title={`${titleParts?.main || active.title} Versions`}
          versions={versions}
          loading={versionsLoading}
          error={null}
          onClose={() => setVersionsOpen(false)}
          onPlay={(path) => {
            audio.loadSrc(
              `/api/media/file?path=${encodeURIComponent(path)}`,
              true
            );
            setVersionsOpen(false);
          }}
        />
      ) : null}
      {plusOpen && active ? (
        <ReleaseAddToPlaylistModal
          track={toReleaseTrack(active)}
          artistName={active.artist || "Unknown"}
          releaseTitle={active.album || "Openings & Endings"}
          onClose={() => setPlusOpen(false)}
        />
      ) : null}
    </div>
  );
}
