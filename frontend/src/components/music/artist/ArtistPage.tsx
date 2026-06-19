import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchBandOverview,
  fetchBandRelated,
  importBandLineup,
  playTrack,
  refreshBandLineup,
  refreshBandLinks,
  refreshBandMetadata,
  refreshBandPhotos,
  refreshBandRelatedParticipations,
  refreshBandRelatedSimilar,
  rescanBandLibrary,
} from "../../../api";
import {
  getCachedOverview,
  setCachedOverview,
} from "../../../overviewCache";
import {
  pushArtistRoute,
  type ArtistOverviewTab,
  type ArtistSection,
} from "../../../musicRoute";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  applyPlaybackThemeFromCover,
  endPlaybackThemeSession,
  isPlaybackThemeActive,
  onPlaybackPaused,
  onPlaybackResumed,
  setPlaybackPlaying,
} from "../../../mediaTheme";
import {
  isMobilePortraitLayout,
  isStackedArtistLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type {
  ArtistCard,
  BandOverview,
  CardOrientation,
  LinkCategory,
  RelatedTab,
} from "../../../types";
import AppMenu from "../../AppMenu";
import MediaInlineSearch from "../MediaInlineSearch";
import { IconCardLandscape, IconCardPortrait } from "../../MenuIcons";
import ArtistAbout from "./ArtistAbout";
import ArtistAudio, {
  ArtistAudioBars,
  useArtistAudio,
} from "./ArtistAudio";
import ArtistGallery, {
  ArtistGalleryBars,
  useArtistGallery,
} from "./ArtistGallery";
import ArtistAboutEditModal from "./ArtistAboutEditModal";
import ArtistLineup, { type LineupTab } from "./ArtistLineup";
import ArtistLinks from "./ArtistLinks";
import ArtistMediaGrid from "./ArtistMediaGrid";
import MediaBeatFx from "../MediaBeatFx";
import MediaBeatFrame from "../MediaBeatFrame";
import ArtistQuiz, { QUIZ_MODES, type QuizMode } from "./ArtistQuiz";
import ArtistRelated from "./ArtistRelated";
import AddSimilarModal from "./AddSimilarModal";
import ArtistMemberModal from "./ArtistMemberModal";
import MemberFormModal from "./MemberFormModal";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "./MiniAudioPlayer";
import { useBeatPulse } from "../../../useBeatPulse";

const SECTIONS: { id: ArtistSection; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "audio", label: "AUDIO" },
  { id: "video", label: "VIDEO" },
  { id: "library", label: "LIBRARY" },
  { id: "gallery", label: "GALLERY" },
  { id: "quiz", label: "QUIZ" },
];

const OVERVIEW_TABS: { id: ArtistOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "lineup", label: "LINEUP" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

const LINEUP_TABS: { id: LineupTab; label: string }[] = [
  { id: "official", label: "OFFICIAL" },
  { id: "original", label: "ORIGINAL" },
  { id: "former", label: "FORMER" },
];

const LINK_TAB_SHORT: Record<LinkCategory, string> = {
  social: "SOCIAL",
  streaming: "STREAM",
  shopping: "SHOP",
  downloads: "DL",
  databases: "DATA",
  lyrics: "LYRICS",
};

const RELATED_TABS: { id: RelatedTab; label: string; short: string }[] = [
  { id: "similar", label: "SIMILAR", short: "SIMILAR" },
  { id: "participations", label: "PROJECTS", short: "PROJECTS" },
];

type Props = {
  bandId: number;
  shell?: ArtistCard | null;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  cardOrientation: CardOrientation;
  isAdmin: boolean;
  userId?: number;
  onBack: () => void;
  onNavigate: (
    section: ArtistSection,
    overviewTab?: ArtistOverviewTab
  ) => void;
  onOpenArtist: (id: number) => void;
  onCountry: (id: number) => void;
  onSubgenre: (id: number) => void;
  onLabel: (label: string) => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onToggleOrientation?: () => void;
  onOpenReleaseNavigate?: (targetBandId: number, releaseId: string) => void;
  onOpenMediaItem?: (kind: "video" | "library", itemId: string) => void;
};

function pageBgUrl(
  era: BandOverview["eras"][number] | null,
  stacked: boolean
): string | undefined {
  if (!era) return undefined;
  if (stacked) return era.portrait_url ?? era.slide_url ?? undefined;
  return era.landscape_url ?? era.slide_url ?? undefined;
}

export default function ArtistPage({
  bandId,
  shell,
  section,
  overviewTab,
  cardOrientation,
  isAdmin,
  userId,
  onBack,
  onNavigate,
  onOpenArtist,
  onCountry,
  onSubgenre,
  onLabel,
  onSwitchProfile,
  onEditProfile,
  onImport,
  onSync,
  onChooseSource,
  onToggleOrientation,
  onOpenReleaseNavigate,
  onOpenMediaItem,
}: Props) {
  const [data, setData] = useState<BandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [playerHost, setPlayerHost] = useState<HTMLDivElement | null>(null);
  const [playerBarHidden, setPlayerBarHidden] = useState(false);
  const playerFallbackRef = useRef<HTMLDivElement>(null);
  const {
    audioRef,
    src: audioSrc,
    playing,
    progress,
    duration,
    toggle,
    seek,
    loadSrc,
    clear,
  } = useMiniAudio();
  const [refreshBio, setRefreshBio] = useState(false);
  const [busy, setBusy] = useState("");
  const [memberModalId, setMemberModalId] = useState<number | null>(null);
  const [lineupTab, setLineupTab] = useState<LineupTab>("official");
  const [linkTab, setLinkTab] = useState<LinkCategory>("social");
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [relatedTab, setRelatedTab] = useState<RelatedTab>("similar");
  const [quizMode, setQuizMode] = useState<QuizMode>("discography");
  const [addSimilarOpen, setAddSimilarOpen] = useState(false);
  const [audioRefreshKey, setAudioRefreshKey] = useState(0);
  const relatedFetchStarted = useRef(false);
  const lineupImportStarted = useRef(false);
  const loadSeq = useRef(0);
  const [relatedFetchInProgress, setRelatedFetchInProgress] = useState(false);
  const [lineupImporting, setLineupImporting] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [eraIndex, setEraIndex] = useState(0);
  const deviceLayout = useDeviceLayout();
  const stacked = isStackedArtistLayout(deviceLayout);
  const mobilePortrait = isMobilePortraitLayout(deviceLayout);
  const audioEnabled =
    section === "audio" && Boolean(data?.media?.has_audio);
  const audioState = useArtistAudio(bandId, audioRefreshKey, audioEnabled);
  const galleryEnabled =
    section === "gallery" && Boolean(data?.media?.has_gallery);
  const galleryState = useArtistGallery(bandId, galleryEnabled);

  const visibleSections = useMemo(() => {
    if (!data?.media) return SECTIONS;
    const m = data.media;
    return SECTIONS.filter((s) => {
      if (s.id === "overview" || s.id === "quiz") return true;
      if (s.id === "audio") return m.has_audio;
      if (s.id === "video") return m.has_video;
      if (s.id === "library") return m.has_library;
      if (s.id === "gallery") return m.has_gallery;
      return false;
    });
  }, [data?.media]);

  const load = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const seq = ++loadSeq.current;
      const requestedBand = bandId;
      const requestedOrientation = cardOrientation;
      if (!silent) {
        const cached = getCachedOverview(requestedBand, requestedOrientation);
        if (cached) {
          setData(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
        setError(null);
      }
      fetchBandOverview(requestedBand, requestedOrientation)
        .then((result) => {
          if (seq !== loadSeq.current) return;
          setCachedOverview(requestedBand, requestedOrientation, result);
          setData(result);
        })
        .catch((e) => {
          if (seq !== loadSeq.current) return;
          if (!silent) {
            setError(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => {
          if (seq !== loadSeq.current) return;
          if (!silent) setLoading(false);
        });
    },
    [bandId, cardOrientation]
  );

  useEffect(() => {
    lineupImportStarted.current = false;
    const cached = getCachedOverview(bandId, cardOrientation);
    if (cached) {
      setData(cached);
      setLoading(false);
      load({ silent: true });
    } else {
      setData(null);
      load();
    }
  }, [bandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    load({ silent: true });
  }, [cardOrientation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data?.needs_lineup_import || data.is_solo) return;
    if (lineupImportStarted.current) return;
    lineupImportStarted.current = true;
    setLineupImporting(true);
    importBandLineup(bandId)
      .then(() => load({ silent: true }))
      .catch(() => {})
      .finally(() => setLineupImporting(false));
  }, [bandId, data?.needs_lineup_import, data?.is_solo, load]);

  useEffect(() => {
    const cats = data?.links?.categories ?? [];
    if (!cats.some((c) => c.id === linkTab) && cats[0]) {
      setLinkTab(cats[0].id);
    }
  }, [data?.links?.categories, linkTab]);

  useEffect(() => {
    relatedFetchStarted.current = false;
  }, [bandId]);

  useEffect(() => {
    if (overviewTab !== "related" || !data?.related) return;
    const needs =
      data.related.needs_similar_fetch ||
      data.related.needs_participations_fetch;
    if (!needs || relatedFetchStarted.current) return;
    relatedFetchStarted.current = true;
    setRelatedFetchInProgress(true);
    fetchBandRelated(bandId)
      .then(() => load({ silent: true }))
      .catch(() => load({ silent: true }))
      .finally(() => setRelatedFetchInProgress(false));
  }, [
    overviewTab,
    bandId,
    data?.related?.needs_similar_fetch,
    data?.related?.needs_participations_fetch,
    load,
  ]);

  useEffect(() => {
    if (!data?.lineup?.all) return;
    for (const member of data.lineup.all) {
      if (!member.photo_url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = member.photo_url;
    }
  }, [data?.lineup]);

  useEffect(() => {
    setEraIndex(0);
    setPlayingPath(null);
    setPlayerBarHidden(false);
    clear();
  }, [bandId, clear]);

  useEffect(
    () => () => {
      clear();
    },
    [clear]
  );

  const carouselEras = useMemo(() => {
    if (!data?.eras.length) return [];
    const want = stacked ? "landscape" : "portrait";
    const filtered = data.eras.filter((e) => e.orientation === want);
    if (filtered.length) return filtered;
    return stacked
      ? data.eras.filter((e) => e.landscape_url)
      : data.eras.filter((e) => e.portrait_url);
  }, [data, stacked]);

  const era = useMemo(() => {
    if (!carouselEras.length) return null;
    return carouselEras[eraIndex % carouselEras.length];
  }, [carouselEras, eraIndex]);

  const bgUrl = pageBgUrl(era, stacked) ?? shell?.photo_url ?? undefined;
  const [bgLayers, setBgLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: bgUrl, outgoing: undefined }));
  const prevBgRef = useRef(bgUrl);

  useEffect(() => {
    if (!bgUrl) {
      setBgLayers({ current: undefined, outgoing: undefined });
      prevBgRef.current = undefined;
      return;
    }
    if (bgUrl === prevBgRef.current) return;
    const outgoing = prevBgRef.current;
    prevBgRef.current = bgUrl;
    setBgLayers({ current: bgUrl, outgoing });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgUrl]);

  useEffect(() => {
    beginArtistPageSession(userId);
  }, [userId]);

  const themeSampleUrl = useMemo(() => {
    const sampleUrl = stacked
      ? (era?.landscape_url ?? era?.slide_url)
      : (era?.portrait_url ?? era?.slide_url);
    return sampleUrl ?? shell?.photo_url ?? undefined;
  }, [era, stacked, shell?.photo_url]);

  useEffect(() => {
    if (!themeSampleUrl || isPlaybackThemeActive()) return;
    colorsFromImageUrl(themeSampleUrl).then((c) => {
      if (c && !isPlaybackThemeActive()) applyMediaTheme(c, userId);
    });
  }, [themeSampleUrl, userId]);

  useEffect(() => {
    const onPlaybackThemeEnded = () => {
      if (!themeSampleUrl) {
        beginArtistPageSession(userId);
        return;
      }
      void colorsFromImageUrl(themeSampleUrl).then((c) => {
        if (c) applyMediaTheme(c, userId);
      });
    };
    window.addEventListener("playback-theme-ended", onPlaybackThemeEnded);
    return () =>
      window.removeEventListener("playback-theme-ended", onPlaybackThemeEnded);
  }, [themeSampleUrl, userId]);

  useEffect(() => {
    pushArtistRoute({ bandId, section, overviewTab }, true);
  }, [bandId, section, overviewTab]);

  const visibleOverviewTabs = OVERVIEW_TABS.filter(
    (t) => t.id !== "lineup" || data?.show_lineup
  );

  const playableTracks = useMemo(
    () => (data?.top_tracks ?? []).filter((t) => t.play_path),
    [data?.top_tracks]
  );

  const [quizSongsBeat, setQuizSongsBeat] = useState({
    active: false,
    playing: false,
  });

  const beatActive = Boolean(playingPath && audioSrc) || quizSongsBeat.active;
  const beatPlaying =
    (Boolean(playingPath && audioSrc) && playing) || quizSongsBeat.playing;
  useBeatPulse(audioRef, Boolean(playingPath && audioSrc), playing);

  const handleQuizSongsBeatChange = useCallback(
    (active: boolean, playing: boolean) => {
      setQuizSongsBeat({ active, playing });
    },
    []
  );

  const stopPageAudio = useCallback(() => {
    audioRef.current?.pause();
    setPlayingPath(null);
    clear();
    endPlaybackThemeSession(userId);
  }, [audioRef, clear, userId]);

  const handlePlay = useCallback(
    async (path: string, title: string) => {
      if (playingPath === path && audioSrc) {
        if (!playing) {
          toggle();
          onPlaybackResumed(
            playableTracks.find((t) => t.play_path === path)?.cover_url ?? null,
            userId
          );
          return;
        }
        toggle();
        return;
      }
      setPlayingPath(path);
      const track = playableTracks.find((t) => t.play_path === path);
      try {
        const res = await playTrack({ path, artist_id: bandId, title });
        setPlaybackPlaying(true);
        loadSrc(res.stream_url, true);
        applyPlaybackThemeFromCover(track?.cover_url ?? res.cover_url ?? null, userId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, loadSrc, playingPath, audioSrc, playing, toggle, playableTracks, userId]
  );

  const stepTrack = useCallback(
    (dir: -1 | 1) => {
      if (!playableTracks.length) return;
      const idx = playableTracks.findIndex((t) => t.play_path === playingPath);
      const base =
        idx >= 0 ? idx : dir === 1 ? -1 : playableTracks.length;
      const next =
        (base + dir + playableTracks.length) % playableTracks.length;
      const t = playableTracks[next];
      void handlePlay(t.play_path!, t.title);
    },
    [playableTracks, playingPath, handlePlay]
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    const onPause = () => onPlaybackPaused(userId);
    const onPlay = () => {
      setPlaybackPlaying(true);
      if (playingPath) {
        const track = playableTracks.find((t) => t.play_path === playingPath);
        onPlaybackResumed(track?.cover_url ?? null, userId);
      }
    };
    const onEnded = () => {
      setPlaybackPlaying(false);
      endPlaybackThemeSession(userId);
      setPlayingPath(null);
    };
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("ended", onEnded);
    };
  }, [audioRef, audioSrc, playingPath, playableTracks, userId]);

  const onAboutTab = section === "overview" && overviewTab === "about";
  const playerPortalTarget = onAboutTab
    ? playerHost ?? playerFallbackRef.current
    : playerFallbackRef.current;
  const showFloatingPlayer =
    Boolean(audioSrc) &&
    section === "overview" &&
    !onAboutTab &&
    !playerBarHidden;
  const showPlayerRestore =
    Boolean(audioSrc) &&
    section === "overview" &&
    !onAboutTab &&
    playerBarHidden;

  const handleRefreshMetadata = async () => {
    setBusy("Refreshing metadata…");
    try {
      await refreshBandMetadata(bandId, refreshBio);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
      setRefreshBio(false);
    }
  };

  const handleRescanLibrary = async () => {
    setBusy("Scanning library…");
    try {
      await rescanBandLibrary(bandId);
      setAudioRefreshKey((k) => k + 1);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshLineup = async () => {
    setBusy("Refreshing lineup (may take a minute)…");
    try {
      await refreshBandLineup(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshPhotos = async () => {
    setBusy("Refreshing photos (may take a minute)…");
    try {
      await refreshBandPhotos(bandId, true);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshLinks = async () => {
    setBusy("Refreshing links from MusicBrainz…");
    try {
      await refreshBandLinks(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshRelatedSimilar = async () => {
    setBusy("Refreshing similar artists…");
    try {
      await refreshBandRelatedSimilar(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshRelatedParticipations = async () => {
    setBusy("Refreshing participations…");
    try {
      await refreshBandRelatedParticipations(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const topBrand = era?.icon_url ? (
    <img src={era.icon_url} alt="" className="artist-page__brand-icon" />
  ) : shell?.icon_url ? (
    <img src={shell.icon_url} alt="" className="artist-page__brand-icon" />
  ) : null;
  const topLogo = era?.logo_url ? (
    <img src={era.logo_url} alt="" className="artist-page__brand-logo" />
  ) : shell?.logo_url ? (
    <img src={shell.logo_url} alt="" className="artist-page__brand-logo" />
  ) : null;

  const pageClass = [
    "artist-page",
    `artist-page--${deviceLayout}`,
    stacked ? "artist-page--stacked" : "",
    mobilePortrait ? "artist-page--mobile-portrait" : "",
    bgLayers.current ? "artist-page--has-bg" : "",
    beatActive ? "artist-page--beat-ready" : "",
    beatPlaying ? "artist-page--playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClass}>
      <div className="artist-page__bg-stack" aria-hidden="true">
        {bgLayers.outgoing && (
          <div
            className="artist-page__bg artist-page__bg--visible artist-page__bg--out"
            style={
              {
                backgroundImage: `url("${bgLayers.outgoing}")`,
              } as CSSProperties
            }
          />
        )}
        {bgLayers.current && (
          <div
            className={`artist-page__bg artist-page__bg--visible${
              bgLayers.outgoing ? " artist-page__bg--in" : ""
            }`}
            style={
              {
                backgroundImage: `url("${bgLayers.current}")`,
              } as CSSProperties
            }
          />
        )}
        <MediaBeatFx />
      </div>
      <div className="artist-page__chrome">
        <header className="artist-page__top">
          <div className="artist-page__top-left">
            <button
              type="button"
              className="artist-page__catalog-back"
              onClick={onBack}
              aria-label="Back to catalog"
            >
              <svg
                className="artist-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="artist-page__catalog-label">CATALOG</span>
            </button>
          </div>
          <div className="artist-page__top-center">
            {topBrand && (
              <MediaBeatFrame variant="logo">{topBrand}</MediaBeatFrame>
            )}
            {topLogo && (
              <MediaBeatFrame variant="logo">{topLogo}</MediaBeatFrame>
            )}
            {!topBrand && !topLogo && (data?.name ?? shell?.name) && (
              <span className="artist-page__brand-name">
                {data?.name ?? shell?.name}
              </span>
            )}
          </div>
          <div className="artist-page__top-right">
            {busy && <span className="muted">{busy}</span>}
            {section === "overview" &&
              overviewTab === "related" &&
              onToggleOrientation && (
                <button
                  type="button"
                  className="card-orientation-toggle"
                  aria-label={`Cards: ${cardOrientation}. Tap to switch layout.`}
                  onClick={onToggleOrientation}
                >
                  {cardOrientation === "landscape" ? (
                    <IconCardLandscape />
                  ) : (
                    <IconCardPortrait />
                  )}
                </button>
              )}
            {showPlayerRestore && (
              <button
                type="button"
                className={`artist-page__player-restore${
                  playing ? " artist-page__player-restore--live" : ""
                }`}
                onClick={() => setPlayerBarHidden(false)}
                aria-label="Show player"
                title="Show player"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"
                  />
                </svg>
              </button>
            )}
            <MediaInlineSearch
              mode="catalog"
              onSelectBand={(id) => onOpenArtist(id)}
            />
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onRefreshMetadata={
                isAdmin && overviewTab === "about"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onRescanLibrary={
                isAdmin && overviewTab === "about"
                  ? () => void handleRescanLibrary()
                  : undefined
              }
              onRefreshLineup={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => void handleRefreshLineup()
                  : undefined
              }
              onRefreshPhotos={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => void handleRefreshPhotos()
                  : undefined
              }
              onRefreshLinks={
                isAdmin && overviewTab === "links"
                  ? () => void handleRefreshLinks()
                  : undefined
              }
              refreshIncludeBio={refreshBio}
              onRefreshIncludeBioChange={
                isAdmin && overviewTab === "about"
                  ? setRefreshBio
                  : undefined
              }
              onEditAbout={
                isAdmin && overviewTab === "about"
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onAddMember={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => setAddMemberOpen(true)
                  : undefined
              }
              onAddLink={
                isAdmin && overviewTab === "links"
                  ? () => setAddLinkOpen(true)
                  : undefined
              }
              onAddSimilar={
                isAdmin &&
                overviewTab === "related" &&
                relatedTab === "similar"
                  ? () => setAddSimilarOpen(true)
                  : undefined
              }
              onRefreshRelatedSimilar={
                isAdmin && overviewTab === "related"
                  ? () => void handleRefreshRelatedSimilar()
                  : undefined
              }
              onRefreshRelatedParticipations={
                isAdmin && overviewTab === "related"
                  ? () => void handleRefreshRelatedParticipations()
                  : undefined
              }
            />
          </div>
        </header>

        <nav className="artist-page__sections">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "active" : ""}
              onClick={() => onNavigate(s.id, overviewTab)}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        {section === "overview" && (
          <nav className="artist-page__subtabs">
            {visibleOverviewTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={overviewTab === t.id ? "active" : ""}
                onClick={() => onNavigate("overview", t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}

        {section === "quiz" && data && (
          <nav className="artist-page__subtabs artist-page__quiz-subtabs">
            {QUIZ_MODES.filter((m) => !(m.soloHidden && data.is_solo)).map(
              (m) => (
                <button
                  key={m.id}
                  type="button"
                  className={quizMode === m.id ? "active" : ""}
                  onClick={() => setQuizMode(m.id)}
                >
                  <span>{m.label}</span>
                </button>
              )
            )}
          </nav>
        )}

        {section === "overview" && overviewTab === "lineup" && data?.show_lineup && (
          <nav className="artist-page__subtabs artist-page__lineup-subtabs">
            {LINEUP_TABS.map((t) => {
              const count =
                t.id === "official"
                  ? data.lineup.current.length
                  : t.id === "original"
                    ? data.lineup.founding.length
                    : data.lineup.former.length;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={lineupTab === t.id ? "active" : ""}
                  onClick={() => setLineupTab(t.id)}
                >
                  <span>
                    {t.label}
                    <span className="artist-page__lineup-count">{count}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {section === "overview" &&
          overviewTab === "links" &&
          data?.links &&
          data.links.categories.length > 0 && (
            <nav className="artist-page__subtabs artist-page__links-subtabs">
              {data.links.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={linkTab === c.id ? "active" : ""}
                  onClick={() => setLinkTab(c.id)}
                >
                  <span>
                    {mobilePortrait
                      ? LINK_TAB_SHORT[c.id]
                      : c.label.toUpperCase()}
                    <span className="artist-page__lineup-count">{c.count}</span>
                  </span>
                </button>
              ))}
            </nav>
          )}

        {section === "audio" && data?.media?.has_audio && (
          <ArtistAudioBars
            state={audioState}
            mobilePortrait={mobilePortrait}
          />
        )}

        {section === "gallery" && data?.media?.has_gallery && (
          <ArtistGalleryBars
            state={galleryState}
            mobilePortrait={mobilePortrait}
          />
        )}

        {section === "overview" && overviewTab === "related" && data?.related && (
          <nav className="artist-page__subtabs artist-page__related-subtabs">
            {RELATED_TABS.map((t) => {
              const count =
                t.id === "similar"
                  ? data.related.similar_count
                  : data.related.participations_count;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={relatedTab === t.id ? "active" : ""}
                  onClick={() => setRelatedTab(t.id)}
                >
                  <span>
                    {mobilePortrait ? t.short : t.label}
                    <span className="artist-page__lineup-count">{count}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        <div
          ref={playerFallbackRef}
          className={`artist-page__player-bar${
            showFloatingPlayer ? " artist-page__player-bar--visible" : ""
          }`}
        />
      </div>

      <audio ref={audioRef} src={audioSrc ?? undefined} preload="auto" />
      {audioSrc &&
        playerPortalTarget &&
        createPortal(
          showFloatingPlayer ? (
            <div className="artist-page__player-bar-inner">
              <MiniAudioPlayerControls
                playing={playing}
                progress={progress}
                duration={duration}
                toggle={toggle}
                seek={seek}
                onPrev={() => stepTrack(-1)}
                onNext={() => stepTrack(1)}
              />
              <button
                type="button"
                className="artist-page__player-bar-dismiss"
                onClick={() => setPlayerBarHidden(true)}
                aria-label="Hide player"
                title="Hide player"
              >
                ×
              </button>
            </div>
          ) : (
            <MiniAudioPlayerControls
              playing={playing}
              progress={progress}
              duration={duration}
              toggle={toggle}
              seek={seek}
              onPrev={() => stepTrack(-1)}
              onNext={() => stepTrack(1)}
            />
          ),
          playerPortalTarget
        )}

      <div
        className={`artist-page__body${
          section === "overview" &&
          overviewTab === "lineup" &&
          data?.show_lineup
            ? " artist-page__body--lineup"
            : ""
        }`}
      >
        {error && <div className="error">{error}</div>}
        {loading && !data && (
          <p className="muted artist-page__loading">Loading…</p>
        )}

        {data && section === "overview" && overviewTab === "about" && (
          <ArtistAbout
            data={data}
            eraIndex={eraIndex}
            stacked={stacked}
            flatMeta={deviceLayout === "mobile-landscape"}
            onEraChange={setEraIndex}
            onCountry={onCountry}
            onSubgenre={onSubgenre}
            onLabel={onLabel}
            onPlayTrack={handlePlay}
            playingPath={playingPath}
            onPlayerHost={setPlayerHost}
            onOpenPerformer={setMemberModalId}
          />
        )}

        {data && section === "overview" && data.show_lineup && (
          <ArtistLineup
            bandId={bandId}
            bandName={data.name}
            lineup={data.lineup}
            tab={lineupTab}
            hidden={!(section === "overview" && overviewTab === "lineup")}
            isAdmin={isAdmin}
            loading={lineupImporting}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {memberModalId !== null && data && (
          <ArtistMemberModal
            artistId={memberModalId}
            bandId={bandId}
            bandName={data.name}
            isAdmin={isAdmin}
            onClose={() => setMemberModalId(null)}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {aboutEditOpen && data && (
          <ArtistAboutEditModal
            bandId={bandId}
            data={data}
            onClose={() => setAboutEditOpen(false)}
            onSaved={load}
          />
        )}

        {addMemberOpen && data && (
          <MemberFormModal
            mode="add"
            bandId={bandId}
            bandName={data.name}
            stackLayer={1}
            onClose={() => setAddMemberOpen(false)}
            onSaved={load}
          />
        )}

        {data && (
          <ArtistLinks
            links={data.links}
            tab={linkTab}
            hidden={!(section === "overview" && overviewTab === "links")}
            isAdmin={isAdmin}
            addOpen={addLinkOpen}
            onAddClose={() => setAddLinkOpen(false)}
            onDataChanged={load}
          />
        )}

        {data?.related && (
          <ArtistRelated
            related={data.related}
            tab={relatedTab}
            hidden={!(section === "overview" && overviewTab === "related")}
            orientation={cardOrientation}
            bandId={bandId}
            isAdmin={isAdmin}
            fetchInProgress={relatedFetchInProgress}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {data && section === "quiz" && (
          <ArtistQuiz
            bandId={bandId}
            isSolo={data.is_solo}
            mode={quizMode}
            onModeChange={setQuizMode}
            onStopPageAudio={stopPageAudio}
            onSongsBeatChange={handleQuizSongsBeatChange}
          />
        )}

        {addSimilarOpen && (
          <AddSimilarModal
            bandId={bandId}
            onClose={() => setAddSimilarOpen(false)}
            onSaved={() => {
              setAddSimilarOpen(false);
              load();
            }}
          />
        )}

        {data && section === "audio" && data.media?.has_audio && (
          <ArtistAudio
            state={audioState}
            bandId={bandId}
            onPlayTrack={(path, title) => void handlePlay(path, title)}
            onOpenReleaseNavigate={onOpenReleaseNavigate}
            onOpenArtist={(id) => onOpenArtist(id)}
          />
        )}
        {data && section === "audio" && !data.media?.has_audio && (
          <p className="muted artist-section-empty">No audio folders found.</p>
        )}

        {data && section === "video" && (
          <ArtistMediaGrid
            bandId={bandId}
            kind="video"
            onOpenItem={(id) => onOpenMediaItem?.("video", id)}
          />
        )}
        {data && section === "library" && (
          <ArtistMediaGrid
            bandId={bandId}
            kind="library"
            onOpenItem={(id) => onOpenMediaItem?.("library", id)}
          />
        )}
        {data && section === "gallery" && data.media?.has_gallery && (
          <ArtistGallery state={galleryState} />
        )}
        {data && section === "gallery" && !data.media?.has_gallery && (
          <p className="muted artist-section-empty">No gallery folders found.</p>
        )}
      </div>
    </div>
  );
}
