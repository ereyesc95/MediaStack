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
import { openArtistByName } from "../music/artist/openArtistByName";
import ReleaseAddToPlaylistModal from "../music/release/ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "../music/release/ReleaseInlineLyrics";
import LyricsStatusBadge from "../music/release/LyricsStatusBadge";
import {
  ChevronIcon,
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

type RightView = "tracks" | "lyrics" | "versions";
type MobileTrackView = "player" | "tracks";

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
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onOpenArtist?: (bandId: number) => void;
};

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function displayTitleParts(t: SeriesOpEdTrack): {
  main: string;
  suffix: string | null;
} {
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

function openAlbumGoogleSearch(album: string, artist?: string | null) {
  const q = [`"${album}"`, artist?.trim()].filter(Boolean).join(" ");
  window.open(
    `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    "_blank",
    "noopener,noreferrer"
  );
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
  onOpenMusicRelease,
  onOpenArtist,
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
  const [rightView, setRightView] = useState<RightView>("tracks");
  const [mobileTrackView, setMobileTrackView] =
    useState<MobileTrackView>("tracks");
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const indexRef = useRef(0);
  const lyricsRequestRef = useRef(0);

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
    (active && (active.cover_animation_url || active.cover_url)) ||
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
  const lyricsTitle = titleParts?.main || active?.title || "Lyrics";
  const versionsTitle = `${lyricsTitle} Versions`;

  const openLyrics = async () => {
    if (!active?.artist || !active.title) return;
    if (stacked) setMobileTrackView("tracks");
    const requestId = ++lyricsRequestRef.current;
    setRightView("lyrics");
    setLyricsLoading(true);
    setLyricsText(null);
    setSyncedLyrics(null);
    try {
      const res = await fetchTrackLyrics(
        active.artist,
        trackMainTitle(active.title),
        active.play_path || undefined
      );
      if (requestId !== lyricsRequestRef.current) return;
      setLyricsText(res.lyrics);
      setSyncedLyrics(res.synced_lyrics ?? null);
    } catch {
      if (requestId !== lyricsRequestRef.current) return;
      setLyricsText(null);
      setSyncedLyrics(null);
    } finally {
      if (requestId === lyricsRequestRef.current) setLyricsLoading(false);
    }
  };

  const openVersions = async () => {
    if (!active?.title) return;
    if (stacked) setMobileTrackView("tracks");
    setRightView("versions");
    setVersionsError(null);
    const bandId = active.navigate_band_id;
    const releaseId = active.navigate_release_id;
    if (bandId == null || !releaseId || !active.play_path) {
      setVersions([]);
      setVersionsLoading(false);
      return;
    }
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
    } catch (e) {
      setVersions([]);
      setVersionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setVersionsLoading(false);
    }
  };

  const backToTracks = () => {
    setRightView("tracks");
  };

  const openExtrasVideo = () => {
    const url = active?.video_url?.trim();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleArtistClick = () => {
    const name = active?.artist?.trim();
    if (!name) return;
    void openArtistByName(name, onOpenArtist ?? (() => {}));
  };

  const handleAlbumClick = () => {
    if (!active?.album) return;
    if (
      active.navigate_band_id != null &&
      active.navigate_release_id &&
      onOpenMusicRelease
    ) {
      onOpenMusicRelease(active.navigate_band_id, active.navigate_release_id);
      return;
    }
    openAlbumGoogleSearch(active.album, active.artist);
  };

  const pageClass = [
    "release-page",
    "series-oped-playlist-page",
    stacked ? "release-page--stacked" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    layout === "tablet-portrait" ? "release-page--tablet-portrait" : "",
    stacked && mobileTrackView === "player"
      ? "release-page--track-player"
      : "",
    stacked && mobileTrackView === "tracks"
      ? "release-page--track-tracks"
      : "",
    audio.playing ? "release-page--beat-ready release-page--playing" : "",
    panelCanvas ? "release-page--has-panel-canvas" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bgImage =
    active?.cover_url || coverUrl || panelCover || DEFAULT_DISC_URL;

  const mainWrapperClass = [
    rightView === "lyrics" ? "release-tracklist release-tracklist--lyrics" : "",
    rightView === "versions" ? "release-tracklist" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

        {stacked ? (
          <nav className="release-page__subtabs" aria-label="Tracklist views">
            <button
              type="button"
              className={mobileTrackView === "player" ? "active" : ""}
              onClick={() => setMobileTrackView("player")}
            >
              <span>PLAYER</span>
            </button>
            <button
              type="button"
              className={mobileTrackView === "tracks" ? "active" : ""}
              onClick={() => setMobileTrackView("tracks")}
            >
              <span>TRACKS</span>
            </button>
          </nav>
        ) : null}
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
                    <h2 className="release-page__track-panel-title">
                      {titleParts?.main || active.title}
                    </h2>
                    {titleParts?.suffix ? (
                      <p className="release-page__track-panel-version">
                        {titleParts.suffix}
                      </p>
                    ) : null}
                    {active.artist ? (
                      <p className="release-page__track-panel-line">
                        {active.artist_icon_url ? (
                          <MediaBeatFrame variant="logo">
                            <img
                              src={active.artist_icon_url}
                              alt=""
                              className="release-page__meta-icon"
                            />
                          </MediaBeatFrame>
                        ) : null}
                        <button
                          type="button"
                          className="release-page__person-link"
                          onClick={handleArtistClick}
                        >
                          {active.artist}
                        </button>
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
                        Taken from{" "}
                        <button
                          type="button"
                          className="release-page__release-link"
                          onClick={handleAlbumClick}
                        >
                          {active.album}
                        </button>
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
          <div className={mainWrapperClass || undefined}>
            <div
              className={
                rightView === "lyrics" || rightView === "versions"
                  ? "release-tracklist__body"
                  : undefined
              }
            >
              {rightView === "lyrics" ? (
                <div className="release-tracklist__lyrics-view">
                  <div className="release-tracklist__lyrics-toolbar">
                    <button
                      type="button"
                      className="release-tracklist__back"
                      onClick={backToTracks}
                      aria-label="Back to tracklist"
                    >
                      <ChevronIcon direction="left" />
                    </button>
                    <div className="release-tracklist__subview-actions">
                      {!lyricsLoading && syncedLyrics ? (
                        <LyricsStatusBadge
                          synced
                          title="Timestamped synced lyrics"
                        />
                      ) : null}
                    </div>
                  </div>
                  <ReleaseInlineLyrics
                    title={lyricsTitle}
                    lyrics={lyricsText}
                    syncedLyrics={syncedLyrics}
                    currentTime={audio.progress}
                    loading={lyricsLoading}
                  />
                </div>
              ) : null}

              {rightView === "versions" ? (
                <>
                  <div className="release-tracklist__subview-head">
                    <button
                      type="button"
                      className="release-tracklist__back"
                      onClick={backToTracks}
                      aria-label="Back to tracklist"
                    >
                      <ChevronIcon direction="left" />
                    </button>
                    <h2 className="release-tracklist__subview-title">
                      {versionsTitle}
                    </h2>
                  </div>
                  <div className="release-tracklist__content">
                    {versionsLoading ? (
                      <p className="muted">Scanning library…</p>
                    ) : null}
                    {versionsError ? (
                      <p className="error">{versionsError}</p>
                    ) : null}
                    {!versionsLoading &&
                    !versionsError &&
                    versions.length === 0 ? (
                      <p className="muted">
                        No other versions found in this artist&apos;s library.
                      </p>
                    ) : null}
                    {!versionsLoading &&
                    !versionsError &&
                    versions.length > 0 ? (
                      <ul className="release-versions-modal__list">
                        {versions.map((v) => (
                          <li key={v.play_path}>
                            <button
                              type="button"
                              className="release-versions-modal__item"
                              onClick={() => {
                                audio.loadSrc(
                                  `/api/media/file?path=${encodeURIComponent(v.play_path)}`,
                                  true
                                );
                              }}
                            >
                              {v.cover_url ? (
                                <img
                                  src={v.cover_url}
                                  alt=""
                                  className="release-versions-modal__cover"
                                />
                              ) : null}
                              <span className="release-versions-modal__meta">
                                <span className="release-versions-modal__album">
                                  {v.album_title ?? "Unknown album"}
                                </span>
                                {v.date_iso ? (
                                  <span className="release-versions-modal__date">
                                    {v.date_iso}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              ) : null}

              {rightView === "tracks" ? (
                <>
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
                            <SortChevron
                              desc={sortKey === key && sortDir === "desc"}
                            />
                          </button>
                        ))}
                      </div>
                      <ul className="series-oped-tracklist__rows">
                        {sortedTracks.map((t, i) => {
                          const playing = t.id === activeId;
                          const parts = displayTitleParts(t);
                          const origIndex = tracks.findIndex(
                            (x) => x.id === t.id
                          );
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
                        <p className="muted">
                          No openings or endings found in Extras.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </main>
      </div>
      <audio
        ref={audio.audioRef}
        src={audio.src ?? undefined}
        preload="metadata"
      />
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
