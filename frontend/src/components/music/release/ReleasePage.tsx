import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchReleaseLyrics,
  fetchReleaseOverview,
  fetchReleaseTracklist,
  fetchReleaseYoutubeCandidates,
  fetchTrackSourceArt,
  playTrack,
  refreshReleaseMetadata,
  resolveArtistName,
} from "../../../api";
import {
  clearReleaseReferrer,
  getReleaseReferrer,
  pushArtistRoute,
  type ReleaseTab,
} from "../../../musicRoute";
import {
  applyAlbumTheme,
  beginAlbumPageSession,
  beginArtistPageSession,
  clearAlbumTheme,
  colorsFromImageUrl,
} from "../../../mediaTheme";
import {
  getCachedOverview,
} from "../../../overviewCache";
import {
  getCachedReleaseOverview,
  setCachedReleaseOverview,
} from "../../../releaseOverviewCache";
import { getCachedReleaseTracklist } from "../../../releaseTracklistCache";
import {
  getCachedReleaseGallery,
  prefetchReleaseGallery,
} from "../../../releaseGalleryCache";
import {
  getCachedTrackCredits,
  prefetchTrackCredits,
} from "../../../releaseTrackCreditsCache";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isPhoneLayout,
  useDeviceLayout,
  isTabletLayout,
} from "../../../usePhoneLayout";
import type { LineupMember, ReleaseNeighbor, ReleaseOverview, ReleaseTrackItem, TrackYoutubeVideo } from "../../../types";
import { formatTrackDate } from "../../../formatDate";
import AppMenu from "../../AppMenu";
import MediaInlineSearch from "../MediaInlineSearch";
import ArtistMemberModal from "../artist/ArtistMemberModal";
import NotInLibraryDialog from "../artist/NotInLibraryDialog";
import ReleaseAboutEditModal from "./ReleaseAboutEditModal";
import ReleaseVideoSetModal from "./ReleaseVideoSetModal";
import ReleaseLyricsSetModal from "./ReleaseLyricsSetModal";
import ReleaseFileTagsModal from "./ReleaseFileTagsModal";
import { invalidateWordCloud } from "../../../wordCloudInvalidation";
import ReleaseVideoFetchModal, {
  type YoutubeFetchItem,
} from "./ReleaseVideoFetchModal";
import { openYoutubeFullscreen, youtubeVideoId } from "../../../utils/youtube";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "../artist/MiniAudioPlayer";
import MediaBeatFx from "../MediaBeatFx";
import MediaBeatFrame from "../MediaBeatFrame";
import { useBeatPulse } from "../../../useBeatPulse";
import ReleaseGallery, { type ReleaseGalleryTab } from "./ReleaseGallery";
import {
  ReleasePhotocardGroup,
  type ReleasePhotocardSet,
} from "./ReleasePhotocard";
import { openArtistByName } from "../artist/openArtistByName";
import ReleaseTracklist, {
  type ReleaseMobileTrackView,
  type ReleasePlaybackArt,
  type ReleaseTracklistHandle,
  clearReleaseTracklistCache,
  prefetchReleaseTracklist,
} from "./ReleaseTracklist";
import {
  ChevronIcon,
  DEFAULT_DISC_URL,
  DEFAULT_LABEL_URL,
  VARIOUS_ARTISTS_BAND_ID,
  parseTrackPanelMeta,
  isAdaptationLine,
  writerSearchUrl,
} from "./releaseTrackPanelMeta";
import {
  TrackActionLyricsIcon,
  TrackActionPlaylistIcon,
  TrackActionVersionsIcon,
  TrackActionYoutubeIcon,
} from "./releaseTrackActionIcons";

const TABS: { id: ReleaseTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "tracklist", label: "TRACKLIST" },
  { id: "gallery", label: "GALLERY" },
];

function normalizePlaybackArt(art: ReleasePlaybackArt): ReleasePlaybackArt {
  return {
    cover_url: art.cover_url ?? null,
    cover_animation_url: art.cover_animation_url ?? null,
    canvas_url: art.canvas_url ?? null,
    disc_url: art.disc_url ?? null,
    logo_url: art.logo_url ?? null,
    group_kind: art.group_kind ?? null,
    background_layers: art.background_layers ?? [],
  };
}

type Props = {
  bandId: number;
  releaseId: string;
  tab: ReleaseTab;
  userId?: number;
  onBack: () => void;
  onOpenArtist: (id: number) => void;
  onBrowseArtistAudio: (
    id: number,
    category: string,
    options?: { compilationBoxSetsOnly?: boolean }
  ) => void;
  onOpenRelease: (bandId: number, releaseId: string) => void;
  onOpenCatalogProducer?: (producerName: string) => void;
  onOpenCatalogLabel?: (labelName: string) => void;
  onOpenCatalogSubgenre?: (subgenreId: number, subgenreName?: string) => void;
  onTab: (tab: ReleaseTab) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

function isVideoMedia(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url));
}

function ReleaseNeighborLink({
  neighbor,
  direction,
  onClick,
}: {
  neighbor: ReleaseNeighbor;
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const compact = neighbor.title.length > 18;
  return (
    <button
      type="button"
      className={`release-page__neighbor release-page__neighbor--${direction}${
        compact ? " release-page__neighbor--compact" : ""
      }`}
      onClick={onClick}
      title={neighbor.title}
    >
      {direction === "prev" && (
        <span className="release-page__neighbor-arrow" aria-hidden>
          <ChevronIcon direction="left" />
        </span>
      )}
      <span className="release-page__neighbor-text">{neighbor.title}</span>
      {direction === "next" && (
        <span className="release-page__neighbor-arrow" aria-hidden>
          <ChevronIcon direction="right" />
        </span>
      )}
    </button>
  );
}

function FeaturedArtistCard({
  artist,
  onSelect,
}: {
  artist: NonNullable<ReleaseOverview["featured_artists"]>[number];
  onSelect: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = artist.photo_url ?? artist.icon_url ?? artist.logo_url;
  const showPhoto = photoUrl && !photoFailed;
  return (
    <button
      type="button"
      className="release-lineup-card release-lineup-card--featured-artist"
      onClick={onSelect}
    >
      <span className="release-lineup-card__photo">
        {showPhoto ? (
          <img src={photoUrl!} alt="" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="release-lineup-card__initials">
            {artist.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="release-lineup-card__name">{artist.name}</span>
    </button>
  );
}

function LineupMiniCard({
  member,
  onSelect,
}: {
  member: LineupMember;
  onSelect: (id: number) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = member.photo_url && !photoFailed;
  return (
    <button
      type="button"
      className="release-lineup-card"
      onClick={() => onSelect(member.id)}
    >
      <span className="release-lineup-card__photo">
        {showPhoto ? (
          <img
            src={member.photo_url!}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="release-lineup-card__initials">
            {member.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="release-lineup-card__name">{member.name}</span>
      {member.roles?.length ? (
        <span className="release-lineup-card__roles">
          {member.roles.join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

type PanelVersionSource = {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
  is_single?: boolean;
} | null;

function tracksEqual(
  a: ReleaseTrackItem | null | undefined,
  b: ReleaseTrackItem | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.id === b.id && a.play_path === b.play_path;
}

function panelYoutubeVideos(track: ReleaseTrackItem | null): TrackYoutubeVideo[] {
  if (!track) return [];
  const fromList = (track.youtube_videos ?? []).filter((video) =>
    youtubeVideoId(video.url)
  );
  if (fromList.length > 0) return fromList;
  if (track.youtube_url && youtubeVideoId(track.youtube_url)) {
    return [{ url: track.youtube_url, label: "Official video", primary: true }];
  }
  return [];
}

function versionSourcesEqual(
  a: PanelVersionSource | undefined,
  b: PanelVersionSource | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.album_title === b.album_title &&
    a.navigate_release_id === b.navigate_release_id &&
    a.navigate_band_id === b.navigate_band_id &&
    a.date_iso === b.date_iso &&
    a.display_date === b.display_date &&
    a.is_single === b.is_single
  );
}

function formatFetchError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw || raw === "Internal Server Error") {
    return `${fallback}. The lyrics service may be slow or unavailable — try again in a moment.`;
  }
  try {
    const parsed = JSON.parse(raw) as { detail?: string; error?: string };
    if (parsed.error) return parsed.error;
    if (parsed.detail) return String(parsed.detail);
  } catch {
    /* plain text */
  }
  return raw;
}

export default function ReleasePage({
  bandId,
  releaseId,
  tab,
  userId,
  onBack,
  onOpenArtist,
  onBrowseArtistAudio,
  onOpenRelease,
  onOpenCatalogProducer,
  onOpenCatalogLabel,
  onOpenCatalogSubgenre,
  onTab,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const tabletPortrait = layout === "tablet-portrait";
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const isPhone = isPhoneLayout(layout);
  const [data, setData] = useState<ReleaseOverview | null>(() =>
    getCachedReleaseOverview(bandId, releaseId)
  );
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [mobileTrackView, setMobileTrackView] =
    useState<ReleaseMobileTrackView>("tracks");
  const [overviewDescExpanded, setOverviewDescExpanded] = useState(false);
  const [galleryTab, setGalleryTab] = useState<ReleaseGalleryTab>("artwork");
  const [galleryTabsMeta, setGalleryTabsMeta] = useState<
    { id: ReleaseGalleryTab; label: string; count: number }[]
  >([]);
  const [showGalleryTab, setShowGalleryTab] = useState(() => {
    const cached = getCachedReleaseGallery(bandId, releaseId);
    return Boolean(
      cached &&
        (cached.artwork.length > 0 ||
          cached.photos.length > 0 ||
          cached.extras.length > 0)
    );
  });
  const [repeatOne, setRepeatOne] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [videoSetOpen, setVideoSetOpen] = useState(false);
  const [lyricsSetOpen, setLyricsSetOpen] = useState(false);
  const [fileTagsOpen, setFileTagsOpen] = useState(false);
  const [videoFetchOpen, setVideoFetchOpen] = useState(false);
  const [videoFetchItems, setVideoFetchItems] = useState<YoutubeFetchItem[]>([]);
  const [busy, setBusy] = useState("");
  const [refreshWiki, setRefreshWiki] = useState(true);
  const [playbackArt, setPlaybackArt] = useState<ReleasePlaybackArt | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [trackPhotocards, setTrackPhotocards] = useState<
    ReleaseOverview["photocards"] | null
  >(null);
  const [trackWriters, setTrackWriters] = useState<string[]>([]);
  const [, setActiveTrack] = useState<ReleaseTrackItem | null>(null);
  const [panelActionTrack, setPanelActionTrack] = useState<ReleaseTrackItem | null>(null);
  const [youtubePickerOpen, setYoutubePickerOpen] = useState(false);
  const youtubePickerRef = useRef<HTMLDivElement>(null);
  const [showLyricsAction, setShowLyricsAction] = useState(true);
  const [showVersionsAction, setShowVersionsAction] = useState(true);
  const [panelDateIso, setPanelDateIso] = useState<string | null>(null);
  const [versionSource, setVersionSource] = useState<{
    album_title: string;
    navigate_release_id: string;
    navigate_band_id?: number;
    date_iso?: string | null;
    display_date?: string | null;
    is_single?: boolean;
  } | null>(null);
  const [lineupMemberId, setLineupMemberId] = useState<number | null>(null);
  const [externalArtist, setExternalArtist] = useState<{
    name: string;
    urls: Record<string, string>;
  } | null>(null);
  const tracklistRef = useRef<ReleaseTracklistHandle>(null);
  const sourceArtCacheRef = useRef<
    Map<
      string,
      {
        playback: ReleasePlaybackArt;
        photocards: ReleaseOverview["photocards"] | null;
      }
    >
  >(new Map());
  const canvasVideoRef = useRef<HTMLVideoElement>(null);
  const overviewTopRef = useRef<HTMLDivElement>(null);
  const overviewDescRef = useRef<HTMLDivElement>(null);
  const overviewPhotocardsRef = useRef<HTMLDivElement>(null);
  const panelMetaRef = useRef<HTMLDivElement>(null);
  const panelFitRef = useRef<HTMLDivElement>(null);
  const panelFitInnerRef = useRef<HTMLDivElement>(null);
  const panelCreditsRef = useRef<HTMLDivElement>(null);
  const panelLabelRef = useRef<HTMLDivElement>(null);
  const panelBottomRef = useRef<HTMLDivElement>(null);
  const [tracklistKey, setTracklistKey] = useState(0);
  const miniAudio = useMiniAudio();
  const clearMiniAudio = miniAudio.clear;
  const isPlaying = Boolean(playingPath && miniAudio.playing);
  const displayPhotocards =
    isPlaying && trackPhotocards
      ? trackPhotocards
      : data?.photocards ?? {
          portrait_front: null,
          portrait_back: null,
          landscape_front: null,
          landscape_back: null,
        };
  const activePhotocards =
    isPlaying && trackPhotocards ? trackPhotocards : data?.photocards;
  const sharedCoverUrls = Boolean(
    displayPhotocards.portrait_front &&
      displayPhotocards.portrait_front === displayPhotocards.landscape_front &&
      (displayPhotocards.portrait_back ?? displayPhotocards.portrait_front) ===
        (displayPhotocards.landscape_back ?? displayPhotocards.landscape_front)
  );
  const looksLikeCoverArt = /cover/i.test(
    decodeURIComponent(displayPhotocards.portrait_front ?? "")
  );
  const photocardsCoverOnly = Boolean(
    activePhotocards?.cover_only || (sharedCoverUrls && looksLikeCoverArt)
  );
  const overviewPhotocards: ReleasePhotocardSet = {
    ...displayPhotocards,
    cover_only: photocardsCoverOnly || undefined,
  };
  const hasOverviewBottomSection = Boolean(
    data &&
      !data.is_various_artists &&
      (data.singles.length > 0 || (data.appears_on?.length ?? 0) > 0)
  );
  const isVaRelease = Boolean(
    data?.is_various_artists ||
      data?.band_id === VARIOUS_ARTISTS_BAND_ID ||
      data?.artist_name?.toLowerCase() === "various artists" ||
      data?.source_artist?.toLowerCase() === "various artists"
  );
  const vaFeaturedArtists = data?.featured_artists ?? [];
  const showVaFeaturedArtists = isVaRelease && vaFeaturedArtists.length > 0;
  const vaFeaturedRow1 = vaFeaturedArtists.slice(0, 5);
  const vaFeaturedRow2 =
    showVaFeaturedArtists && (data?.singles.length ?? 0) === 0
      ? vaFeaturedArtists.slice(5, 10)
      : [];
  const showBandLineup = Boolean(
    !isVaRelease && data?.show_lineup && (data?.lineup.length ?? 0) > 0
  );
  const showSoloLineup = Boolean(
    !isVaRelease && data?.is_solo && data?.lineup.length === 1
  );
  const showOverviewLineup = showBandLineup || showSoloLineup;
  const showOverviewPhotocards = Boolean(
    displayPhotocards.portrait_front || displayPhotocards.landscape_front
  );
  const vaHasDescription = Boolean(data?.description);
  const showVaPhotocardsBesideDesc =
    isVaRelease && showOverviewPhotocards && vaHasDescription;
  const showVaPhotocardsInStack =
    isVaRelease && showOverviewPhotocards && !vaHasDescription;
  const showOverviewSide =
    showVaPhotocardsBesideDesc ||
    (!isVaRelease && showOverviewPhotocards);
  const vaOverviewNoSingles = isVaRelease && (data?.singles.length ?? 0) === 0;
  const showOverviewBottom = Boolean(
    data &&
      ((showVaPhotocardsInStack && showVaFeaturedArtists) ||
        (showVaFeaturedArtists && !showVaPhotocardsInStack) ||
        showOverviewLineup ||
        data.singles.length > 0 ||
        (data.appears_on?.length ?? 0) > 0)
  );

  const openFeaturedArtist = useCallback(
    (artist: NonNullable<ReleaseOverview["featured_artists"]>[number]) => {
      if (artist.band_id && artist.in_library) {
        onOpenArtist(artist.band_id);
        return;
      }
      void openArtistByName(artist.name, onOpenArtist);
    },
    [onOpenArtist]
  );
  const beatActive = Boolean(playingPath && miniAudio.src);
  useBeatPulse(miniAudio.audioRef, beatActive, miniAudio.playing);
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>(() => {
    const cached = getCachedReleaseOverview(bandId, releaseId);
    if (!cached) return {};
    const url =
      cached.background_layers?.[0] ?? cached.cover_url ?? undefined;
    return url ? { current: url } : {};
  });
  const prevBgRef = useRef<string | undefined>(
    (() => {
      const cached = getCachedReleaseOverview(bandId, releaseId);
      if (!cached) return undefined;
      return cached.background_layers?.[0] ?? cached.cover_url ?? undefined;
    })()
  );
  const loadSeq = useRef(0);

  const load = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const seq = ++loadSeq.current;
      if (!silent) setError(null);
      fetchReleaseOverview(bandId, releaseId)
        .then((payload) => {
          if (seq !== loadSeq.current) return;
          setCachedReleaseOverview(bandId, releaseId, "landscape", payload);
          setData(payload);
        })
        .catch((e) => {
          if (seq !== loadSeq.current) return;
          if (!silent) {
            setError(e instanceof Error ? e.message : String(e));
          }
        });
    },
    [bandId, releaseId]
  );

  useLayoutEffect(() => {
    miniAudio.audioRef.current?.pause();
    clearMiniAudio();
    setPlayingPath(null);
    setNowPlayingTitle(null);
    setPlaybackArt(null);
    setCoverFailed(false);
    setTrackPhotocards(null);
    setVersionSource(null);
    setPanelDateIso(null);
    setPanelActionTrack(null);
    setActiveTrack(null);
    setTrackWriters([]);
    sourceArtCacheRef.current.clear();

    const cached = getCachedReleaseOverview(bandId, releaseId);
    setData(cached);
    setError(null);
    const url =
      cached?.background_layers?.[0] ?? cached?.cover_url ?? undefined;
    prevBgRef.current = url;
    setBgLayers(url ? { current: url } : {});
    void prefetchReleaseTracklist(bandId, releaseId);
    load({ silent: Boolean(cached) });
  }, [bandId, releaseId, load, clearMiniAudio, miniAudio.audioRef]);

  useEffect(() => {
    if (!data?.needs_metadata_fetch) return;
    const poll = window.setInterval(() => {
      load({ silent: true });
    }, 2500);
    const stop = window.setTimeout(() => window.clearInterval(poll), 20000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [data?.needs_metadata_fetch, load]);

  useLayoutEffect(() => {
    const top = overviewTopRef.current;

    const clearScale = () => {
      top?.style.removeProperty("--overview-photocard-scale");
    };

    if (stacked || mobileLandscape || tab !== "overview" || showVaPhotocardsInStack) {
      clearScale();
      return;
    }

    const desc = overviewDescRef.current;
    const cards = overviewPhotocardsRef.current;
    if (!top) return;

    const measure = () => {
      clearScale();
      if (!desc || !cards) return;

      const descH = desc.scrollHeight;
      const cardsH = cards.offsetHeight;
      const topH = top.clientHeight;
      if (cardsH <= 0 || topH <= 0) return;

      const descShort = descH < cardsH * 0.92;
      const slack = topH - Math.max(descH, cardsH);
      if (!descShort && slack <= 24) return;

      let scale = 1;
      if (descShort) {
        const ratio = Math.min(1, descH / cardsH);
        scale = 1 + Math.min(0.45, (1 - ratio) * 0.55);
      }
      if (slack > 24) {
        scale = Math.max(scale, 1 + Math.min(0.35, (slack / topH) * 0.55));
      }

      if (cardsH > 0 && topH > 0) {
        const maxFit = topH * 0.98;
        if (cardsH * scale > maxFit) {
          scale = Math.max(0.75, maxFit / cardsH);
        }
      }

      scale = Math.min(1.5, Math.max(1, scale));
      if (scale > 1.02) {
        top.style.setProperty("--overview-photocard-scale", scale.toFixed(3));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(top);
    if (desc) ro.observe(desc);
    if (cards) ro.observe(cards);

    const scheduleMeasure = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(measure);
      });
    };

    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", scheduleMeasure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      clearScale();
    };
  }, [
    stacked,
    mobileLandscape,
    tab,
    layout,
    isVaRelease,
    showVaPhotocardsInStack,
    data?.description,
    data?.photocards?.portrait_front,
    data?.photocards?.landscape_front,
    displayPhotocards.portrait_front,
    displayPhotocards.landscape_front,
  ]);

  useLayoutEffect(() => {
    if (stacked || mobileLandscape) return;
    const meta = panelMetaRef.current;
    const fit = panelFitRef.current;
    const inner = panelFitInnerRef.current;
    const credits = panelCreditsRef.current;
    const label = panelLabelRef.current;
    const bottom = panelBottomRef.current;
    if (!meta || !fit || !inner) return;

    const measure = () => {
      inner.style.removeProperty("transform");
      inner.style.removeProperty("transformOrigin");
      fit.style.height = "";

      const bottomHeight = bottom?.offsetHeight ?? 0;
      const creditsHeight = credits?.offsetHeight ?? 0;
      const fitStyles = window.getComputedStyle(fit);
      const fitGap = parseFloat(fitStyles.rowGap || fitStyles.gap || "0") || 0;
      const creditsGap = credits ? fitGap : 0;
      const available = meta.clientHeight - bottomHeight;
      const needed = inner.offsetHeight + creditsHeight + creditsGap;
      if (available <= 0 || needed <= 0) return;

      if (needed > available + 1) {
        const scale = Math.max(0.76, (available - creditsHeight - creditsGap - 1) / inner.offsetHeight);
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = "top center";
        fit.style.height = `${Math.ceil(inner.offsetHeight * scale + creditsHeight + creditsGap)}px`;
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(meta);
    ro.observe(inner);
    if (credits) ro.observe(credits);
    if (label) ro.observe(label);
    if (bottom) ro.observe(bottom);
    return () => ro.disconnect();
  }, [
    stacked,
    mobileLandscape,
    tab,
    data?.title,
    data?.display_date,
    data?.release_type,
    data?.artist_name,
    data?.subgenres?.map((s) => s.id).join(","),
    data?.producer,
    data?.label,
    data?.spotify_url,
    data?.qr_url,
    data?.source_artist,
    nowPlayingTitle,
    trackWriters.length,
    playingPath,
    isPlaying,
  ]);

  useEffect(() => {
    if (!nowPlayingTitle) {
      setTrackWriters([]);
      return;
    }
    const cached = getCachedTrackCredits(bandId, releaseId, nowPlayingTitle);
    if (cached) {
      setTrackWriters(cached.writers ?? []);
      return;
    }
    let cancelled = false;
    void prefetchTrackCredits(bandId, releaseId, nowPlayingTitle).then((res) => {
      if (!cancelled) setTrackWriters(res.writers ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [bandId, releaseId, nowPlayingTitle]);

  useEffect(() => {
    beginArtistPageSession(userId);
    beginAlbumPageSession();
  }, [userId]);

  useEffect(() => {
    return () => clearAlbumTheme(userId);
  }, [userId]);

  useEffect(() => {
    pushArtistRoute(
      {
        bandId,
        section: "audio",
        overviewTab: "about",
        releaseId,
        releaseTab: tab,
      },
      true
    );
  }, [bandId, releaseId, tab]);

  const resolveTrackSource = useCallback(
    async (
      path: string
    ): Promise<{
      playback: ReleasePlaybackArt;
      photocards: ReleaseOverview["photocards"] | null;
    } | null> => {
      const cached = sourceArtCacheRef.current.get(path);
      if (cached) return cached;
      try {
        const res = await fetchTrackSourceArt(bandId, releaseId, path);
        const entry = {
          playback: normalizePlaybackArt(res.playback),
          photocards:
            res.photocards &&
            (res.photocards.portrait_front || res.photocards.landscape_front)
              ? res.photocards
              : null,
        };
        sourceArtCacheRef.current.set(path, entry);
        return entry;
      } catch {
        const ctx = tracklistRef.current?.findTrackContext(path);
        if (!ctx?.art) return null;
        const entry = {
          playback: normalizePlaybackArt(ctx.art),
          photocards: null,
        };
        sourceArtCacheRef.current.set(path, entry);
        return entry;
      }
    },
    [bandId, releaseId]
  );

  const resolvePlaybackArt = useCallback(
    async (path: string): Promise<ReleasePlaybackArt | null> => {
      const source = await resolveTrackSource(path);
      return source?.playback ?? null;
    },
    [resolveTrackSource]
  );

  const hasActiveTrack = Boolean(playingPath);
  const showPlaybackMotion = hasActiveTrack && isPlaying;
  const displayCover = hasActiveTrack
    ? (playbackArt?.cover_url ?? data?.cover_url ?? null)
    : (data?.cover_url ?? null);
  const displayAnim =
    showPlaybackMotion ? (playbackArt?.cover_animation_url ?? null) : null;
  const displayCanvas =
    showPlaybackMotion ? (playbackArt?.canvas_url ?? null) : null;
  const displayDisc = hasActiveTrack
    ? (playbackArt?.disc_url ?? data?.disc_url ?? DEFAULT_DISC_URL)
    : (data?.disc_url ?? DEFAULT_DISC_URL);
  const showPanelCanvas =
    Boolean(displayCanvas) && isVideoMedia(displayCanvas);
  const albumCover = data?.cover_url ?? null;
  const albumDisc = data?.disc_url ?? DEFAULT_DISC_URL;
  const panelCoverSrc = hasActiveTrack
    ? displayAnim && isVideoMedia(displayAnim)
      ? displayAnim
      : displayCover
    : albumCover;
  const effectivePanelCover = coverFailed ? null : panelCoverSrc;
  const panelDiscSrc = hasActiveTrack ? displayDisc : albumDisc;
  const panelGroupKind = hasActiveTrack
    ? playbackArt?.group_kind ?? data?.playback_kind ?? "disc"
    : data?.playback_kind ?? "disc";
  const isTapePlayback = panelGroupKind === "tape";
  const isVinylPlayback = panelGroupKind === "side" || panelGroupKind === "vinyl";
  const panelCoverIsVideo = Boolean(
    effectivePanelCover && isVideoMedia(effectivePanelCover) && showPlaybackMotion
  );
  const bgUrl =
    playingPath
      ? (playbackArt?.background_layers?.[0] ??
        data?.background_layers[0] ??
        playbackArt?.cover_url ??
        displayCover ??
        undefined)
      : (playbackArt?.background_layers?.[0] ??
        data?.background_layers[0] ??
        displayCover ??
        undefined);

  const themeSampleUrl = displayCover ?? data?.cover_url ?? undefined;

  useEffect(() => {
    if (!themeSampleUrl) return;
    colorsFromImageUrl(themeSampleUrl).then((c) => {
      if (c) applyAlbumTheme(c);
    });
  }, [themeSampleUrl]);

  useEffect(() => {
    if (!bgUrl) return;
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
    if (!displayCanvas || !isVideoMedia(displayCanvas) || !showPanelCanvas) return;
    const el = canvasVideoRef.current;
    if (!el) return;
    if (isPlaying) void el.play().catch(() => {});
    else el.pause();
  }, [displayCanvas, showPanelCanvas, isPlaying]);

  const releaseReferrer = getReleaseReferrer();
  const referrerOverview = releaseReferrer
    ? getCachedOverview(releaseReferrer.bandId, "landscape")
    : null;
  const backLabel =
    releaseReferrer && releaseReferrer.bandId !== bandId
      ? (releaseReferrer.artistName ??
          referrerOverview?.name ??
          "Artist")
      : (data?.artist_name ?? "Artist");

  const handleBack = () => {
    const ref = releaseReferrer;
    clearReleaseReferrer();
    if (ref && ref.bandId !== bandId) {
      if (ref.section === "audio" && ref.category) {
        onBrowseArtistAudio(ref.bandId, ref.category);
      } else {
        onOpenArtist(ref.bandId);
      }
      return;
    }
    onBack();
  };

  const topLogoUrl =
    hasActiveTrack && playbackArt?.logo_url
      ? playbackArt.logo_url
      : data?.logo_url ?? null;

  const topLogo = topLogoUrl ? (
    <MediaBeatFrame variant="logo">
      <img
        src={topLogoUrl}
        alt=""
        className="release-page__brand-logo"
        draggable={false}
      />
    </MediaBeatFrame>
  ) : null;

  const panelArtistIcon =
    data?.era_icon_url ??
    getCachedOverview(bandId, "landscape")?.eras?.find(
      (e) => e.year === Number((data?.date_iso ?? "").slice(0, 4))
    )?.icon_url ??
    null;
  const panelArtistLogo =
    data?.era_logo_url ??
    getCachedOverview(bandId, "landscape")?.eras?.find(
      (e) => e.year === Number((data?.date_iso ?? "").slice(0, 4))
    )?.logo_url ??
    getCachedOverview(bandId, "landscape")?.eras?.[0]?.logo_url ??
    null;

  const openPersonName = useCallback(
    async (name: string) => {
      try {
        const res = await resolveArtistName(name);
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
        window.open(writerSearchUrl(name), "_blank", "noopener,noreferrer");
      } catch {
        window.open(writerSearchUrl(name), "_blank", "noopener,noreferrer");
      }
    },
    [onOpenArtist]
  );

  const scrollBody = !mobileLandscape && tab !== "overview";

  const handleRefreshTracklist = useCallback(() => {
    clearReleaseTracklistCache(bandId, releaseId);
    setTracklistKey((k) => k + 1);
    setBusy("Tracklist refreshed from disk");
    window.setTimeout(() => setBusy(""), 2500);
  }, [bandId, releaseId]);

  const handleFetchLyrics = async () => {
    setBusy("Fetching lyrics, please wait… This may take a few minutes.");
    setError(null);
    try {
      const res = await fetchReleaseLyrics(bandId, releaseId);
      if (!res.ok) {
        setBusy("");
        setError(res.error ?? "Lyrics fetch failed");
        return;
      }
      setBusy(
        `Lyrics fetched: ${res.fetched ?? 0} saved · ${res.skipped ?? 0} skipped · ${res.not_found ?? 0} not found`
      );
      setTracklistKey((k) => k + 1);
      invalidateWordCloud(bandId);
      window.setTimeout(() => setBusy(""), 8000);
    } catch (e) {
      setBusy("");
      setError(formatFetchError(e, "Lyrics fetch failed"));
    }
  };

  const handleFetchVideos = async () => {
    setBusy("Fetching videos, please wait…");
    setError(null);
    try {
      const res = await fetchReleaseYoutubeCandidates(bandId, releaseId, true);
      if (!res.ok) {
        setBusy("");
        setError(res.error ?? "Video fetch failed");
        return;
      }
      setBusy("");
      setVideoFetchItems(res.items ?? []);
      setVideoFetchOpen(true);
    } catch (e) {
      setBusy("");
      setError(formatFetchError(e, "Video fetch failed"));
    }
  };

  const handleVideoSaved = useCallback(async () => {
    setTracklistKey((k) => k + 1);
    const path = panelActionTrack?.play_path;
    if (!path) return;
    try {
      const payload = await fetchReleaseTracklist(bandId, releaseId);
      const updated = payload.editions
        .flatMap((ed) => ed.groups.flatMap((g) => g.tracks))
        .find((t) => t.play_path === path);
      if (updated) setPanelActionTrack(updated);
    } catch {
      /* tracklist will refresh on next load */
    }
  }, [bandId, releaseId, panelActionTrack?.play_path]);

  const handleOpenYoutube = useCallback(
    (url: string) => {
      setYoutubePickerOpen(false);
      openYoutubeFullscreen(url, () => {
        miniAudio.audioRef.current?.pause();
      });
    },
    [miniAudio.audioRef]
  );

  const panelVideos = useMemo(
    () => panelYoutubeVideos(panelActionTrack),
    [panelActionTrack]
  );

  useEffect(() => {
    setYoutubePickerOpen(false);
  }, [panelActionTrack?.play_path]);

  useEffect(() => {
    if (!youtubePickerOpen) return;
    function dismiss(event: PointerEvent) {
      const target = event.target as Node;
      if (youtubePickerRef.current && !youtubePickerRef.current.contains(target)) {
        setYoutubePickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [youtubePickerOpen]);

  const handlePanelActionsChange = useCallback(
    ({
      track,
      showLyrics,
      showVersions,
      panelDateIso: dateIso,
      versionSource: src,
    }: {
      track: ReleaseTrackItem | null;
      showLyrics: boolean;
      showVersions: boolean;
      panelDateIso?: string | null;
      versionSource?: PanelVersionSource;
    }) => {
      setPanelActionTrack((prev) => (tracksEqual(prev, track) ? prev : track));
      setShowLyricsAction((prev) => (prev === showLyrics ? prev : showLyrics));
      setShowVersionsAction((prev) => (prev === showVersions ? prev : showVersions));
      setPanelDateIso((prev) => {
        const next = dateIso ?? null;
        return prev === next ? prev : next;
      });
      setVersionSource((prev) =>
        versionSourcesEqual(prev, src ?? null) ? prev : src ?? null
      );
    },
    []
  );

  const handleGalleryTabsMeta = useCallback(
    (tabs: { id: ReleaseGalleryTab; label: string; count: number }[]) => {
      setGalleryTabsMeta((prev) => {
        if (
          prev.length === tabs.length &&
          prev.every(
            (item, i) =>
              item.id === tabs[i].id &&
              item.label === tabs[i].label &&
              item.count === tabs[i].count
          )
        ) {
          return prev;
        }
        return tabs;
      });
      setShowGalleryTab(tabs.length > 0);
    },
    []
  );

  const syncGalleryTabVisibility = useCallback(
    (payload: { artwork: unknown[]; photos: unknown[]; extras: unknown[] }) => {
      setShowGalleryTab(
        Boolean(
          payload.artwork.length > 0 ||
            payload.photos.length > 0 ||
            payload.extras.length > 0
        )
      );
    },
    []
  );

  useEffect(() => {
    void prefetchReleaseGallery(bandId, releaseId).then(syncGalleryTabVisibility);
  }, [bandId, releaseId, syncGalleryTabVisibility]);

  useEffect(() => {
    if (playingPath) {
      void fetchTrackSourceArt(bandId, releaseId, playingPath).then((res) => {
        if ((res.artwork?.length ?? 0) > 0) setShowGalleryTab(true);
      });
      return;
    }
    const cached = getCachedReleaseGallery(bandId, releaseId);
    if (cached) syncGalleryTabVisibility(cached);
  }, [playingPath, bandId, releaseId, syncGalleryTabVisibility]);

  useEffect(() => {
    if (!showGalleryTab && tab === "gallery") {
      onTab("overview");
    }
  }, [showGalleryTab, tab, onTab]);

  const pageTabs = useMemo(
    () => TABS.filter((t) => t.id !== "gallery" || showGalleryTab),
    [showGalleryTab]
  );

  const handleRefreshMetadata = async () => {
    setBusy("Refreshing metadata…");
    try {
      const res = await refreshReleaseMetadata(bandId, releaseId, refreshWiki);
      if (!res.ok) {
        setError(res.error ?? "Metadata refresh failed");
        return;
      }
      if (res.overview) {
        setData(res.overview);
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handlePlayTrack = useCallback(
    async (
      path: string,
      title: string,
      _art?: ReleasePlaybackArt,
      _editionLabel?: string | null
    ) => {
      if (playingPath === path && miniAudio.src) {
        if (!miniAudio.playing) {
          miniAudio.toggle();
          return;
        }
        return;
      }
      setPlayingPath(path);
      setNowPlayingTitle(title);
      setVersionSource(null);
      setPanelDateIso(null);
      if (_art) {
        setPlaybackArt(normalizePlaybackArt(_art));
      }
      let resolved = await resolveTrackSource(path);
      if (resolved?.playback) {
        setPlaybackArt(resolved.playback);
        setTrackPhotocards(resolved.photocards);
      } else if (!_art && data) {
        setPlaybackArt({
          cover_url: data.cover_url,
          cover_animation_url: data.cover_animation_url,
          canvas_url: data.canvas_url,
          disc_url: data.disc_url,
          background_layers: data.background_layers,
        });
        setTrackPhotocards(null);
      }
      const cachedCredits = getCachedTrackCredits(bandId, releaseId, title);
      if (cachedCredits) {
        setTrackWriters(cachedCredits.writers ?? []);
      }
      void prefetchTrackCredits(bandId, releaseId, title).then((res) => {
        setTrackWriters(res.writers ?? []);
      });
      try {
        const res = await playTrack({
          path,
          artist_id: bandId,
          title,
          release: data?.title,
        });
        miniAudio.loadSrc(res.stream_url, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, data, miniAudio, playingPath, releaseId, resolveTrackSource]
  );

  const playAdjacentTrack = useCallback(
    (direction: "prev" | "next") => {
      if (!playingPath || !tracklistRef.current) return;
      const tracks = tracklistRef.current
        .allTracks()
        .filter((t) => !t.is_video);
      if (!tracks.length) return;
      const idx = tracks.findIndex((t) => t.play_path === playingPath);
      if (idx < 0) return;
      const target =
        direction === "next"
          ? tracks[(idx + 1) % tracks.length]
          : tracks[(idx - 1 + tracks.length) % tracks.length];
      const ctx = tracklistRef.current.findTrackContext(target.play_path);
      void handlePlayTrack(
        target.play_path,
        target.title,
        ctx?.art ?? {
          cover_url: target.cover_url,
          cover_animation_url: target.cover_animation_url,
          canvas_url: target.canvas_url,
          disc_url: target.disc_url,
        }
      );
    },
    [handlePlayTrack, playingPath]
  );

  const handlePanelPlayToggle = useCallback(async () => {
    if (playingPath && miniAudio.src) {
      miniAudio.toggle();
      return;
    }
    let tracks = (tracklistRef.current?.allTracks() ?? []).filter(
      (t) => !t.is_video
    );
    if (!tracks.length) {
      try {
        const payload = await fetchReleaseTracklist(bandId, releaseId);
        tracks = payload.editions
          .flatMap((ed) => ed.groups.flatMap((g) => g.tracks))
          .filter((t) => !t.is_video);
      } catch {
        return;
      }
    }
    const first = tracks[0];
    if (!first) return;
    const ctx = tracklistRef.current?.findTrackContext(first.play_path);
    void handlePlayTrack(
      first.play_path,
      first.title,
      ctx?.art ?? {
        cover_url: first.cover_url,
        cover_animation_url: first.cover_animation_url,
        canvas_url: first.canvas_url,
        disc_url: first.disc_url,
      }
    );
  }, [bandId, releaseId, handlePlayTrack, miniAudio, playingPath]);

  useEffect(() => {
    const el = miniAudio.audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (!playingPath) return;
      if (repeatOne) {
        const audio = miniAudio.audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          void audio.play().catch(() => {});
        }
        return;
      }
      playAdjacentTrack("next");
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [miniAudio.audioRef, playAdjacentTrack, playingPath, repeatOne]);

  useEffect(() => {
    if (!playingPath) return;
    void resolvePlaybackArt(playingPath).then((resolved) => {
      if (resolved) setPlaybackArt(resolved);
    });
  }, [playingPath, resolvePlaybackArt]);

  useEffect(() => {
    if (tab !== "tracklist") {
      setMobileTrackView("tracks");
    }
    if (tab !== "gallery") {
      setGalleryTabsMeta([]);
    }
    if (tab !== "overview") {
      setOverviewDescExpanded(false);
    }
  }, [tab]);

  const tabletLayout = isTabletLayout(layout);

  const pageClass = [
    "release-page",
    stacked ? "release-page--stacked" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    layout === "tablet-portrait" ? "release-page--tablet-portrait" : "",
    layout === "tablet-landscape" ? "release-page--tablet-landscape" : "",
    tab === "overview" ? "release-page--overview" : "",
    scrollBody ? "release-page--scroll" : "",
    tab === "tracklist" && stacked && mobileTrackView === "player"
      ? "release-page--track-player"
      : "",
    tab === "tracklist" && stacked && mobileTrackView === "tracks"
      ? "release-page--track-tracks"
      : "",
    tab === "gallery" && (stacked || mobileLandscape)
      ? "release-page--tab-gallery"
      : "",
    beatActive ? "release-page--beat-ready" : "",
    playingPath && miniAudio.playing ? "release-page--playing" : "",
    playingPath && isTapePlayback ? "release-page--tape" : "",
    playingPath && isVinylPlayback ? "release-page--vinyl" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showTrackPanel =
    Boolean(nowPlayingTitle) &&
    (isPlaying || Boolean(versionSource));
  const panelFadedCover = displayCover ?? data?.cover_url ?? null;
  const trackPanelReleaseDate =
    versionSource?.display_date ??
    (versionSource?.date_iso ? formatTrackDate(versionSource.date_iso) : null) ??
    (panelDateIso ? formatTrackDate(panelDateIso) : null) ??
    data?.display_date ??
    null;

  const trackPanelMeta = nowPlayingTitle ? parseTrackPanelMeta(nowPlayingTitle) : null;
  const labelLogoSrc = data?.label_logo_url || DEFAULT_LABEL_URL;
  const showMobilePlayerMeta =
    stacked &&
    tab === "tracklist" &&
    mobileTrackView === "player" &&
    !showTrackPanel;
  const showPanelReleaseMeta =
    !showTrackPanel && (tab !== "tracklist" || showMobilePlayerMeta);
  const mountTracklist = tab === "tracklist" || Boolean(playingPath);
  const cachedTracklist = getCachedReleaseTracklist(bandId, releaseId);
  const cachedGallery = getCachedReleaseGallery(bandId, releaseId);
  const showPageBody = Boolean(
    data ||
      (tab === "tracklist" && cachedTracklist) ||
      (tab === "gallery" && (data || cachedGallery))
  );
  const tracklistMeta = {
    releaseNavigateId: data?.navigate_release_id ?? releaseId,
    artistName: data?.artist_name ?? cachedTracklist?.artist_name ?? "",
    releaseTitle: data?.title ?? cachedTracklist?.title ?? "",
  };

  const panelAside = data ? (
    <aside
      className={`release-page__panel${showTrackPanel ? " release-page__panel--track" : ""}${
        showPanelCanvas ? " release-page__panel--canvas" : ""
      }${showMobilePlayerMeta ? " release-page__panel--mobile-player" : ""}`}
      style={
        showTrackPanel && panelFadedCover
          ? ({ ["--panel-fade" as string]: `url("${panelFadedCover}")` } as CSSProperties)
          : undefined
      }
    >
      {showPanelCanvas && (
        <div className="release-page__panel-canvas-layer" aria-hidden>
          <video
            key={displayCanvas}
            ref={canvasVideoRef}
            className="release-page__panel-canvas"
            src={displayCanvas!}
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="release-page__panel-canvas-shade" />
        </div>
      )}
      <div className="release-page__panel-content">
      <div className="release-page__art">
        <div className={`release-page__art-stage${
          !effectivePanelCover && panelDiscSrc
            ? " release-page__art-stage--disc-only"
            : ""
        }`}>
          {effectivePanelCover &&
            (panelCoverIsVideo ? (
              <span className="release-page__cover-wrap">
                <video
                  key={effectivePanelCover}
                  src={effectivePanelCover!}
                  className="release-page__cover release-page__cover--video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  draggable={false}
                  onError={() => setCoverFailed(true)}
                />
              </span>
            ) : (
              <span className="release-page__cover-wrap">
                <img
                  key={effectivePanelCover}
                  src={effectivePanelCover}
                  alt=""
                  className="release-page__cover"
                  draggable={false}
                  onError={() => setCoverFailed(true)}
                />
              </span>
            ))}
          {(!hasActiveTrack ? data.playback_kind !== "tape" : !isTapePlayback) && (
            <img
              key={panelDiscSrc}
              src={panelDiscSrc}
              alt=""
              className={[
                "release-page__disc",
                hasActiveTrack ? "release-page__disc--spin" : "",
                hasActiveTrack && !miniAudio.playing ? "release-page__disc--spin-paused" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={false}
            />
          )}
        </div>
        {(hasActiveTrack ? isTapePlayback : data.playback_kind === "tape") && isPlaying && (
          <span className="release-page__tape-badge">TAPE</span>
        )}
      </div>

      <div className="release-page__panel-meta" ref={panelMetaRef}>
        <div className="release-page__panel-fit" ref={panelFitRef}>
          <div className="release-page__panel-fit-inner" ref={panelFitInnerRef}>
        <div className="release-page__panel-body">
          <div className="release-page__brand-row">
            {panelArtistIcon || panelArtistLogo ? (
              <button
                type="button"
                className="release-page__artist-link release-page__brand-row-btn"
                onClick={() => onOpenArtist(bandId)}
                aria-label={`Open ${data.artist_name}`}
              >
                {panelArtistIcon && (
                  <MediaBeatFrame variant="logo">
                    <img
                      src={panelArtistIcon}
                      alt=""
                      className="release-page__meta-icon"
                    />
                  </MediaBeatFrame>
                )}
                {panelArtistLogo && (
                  <MediaBeatFrame variant="logo">
                    <img
                      src={panelArtistLogo}
                      alt=""
                      className="release-page__meta-logo"
                    />
                  </MediaBeatFrame>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="release-page__artist-link release-page__artist-link--text"
                onClick={() => onOpenArtist(bandId)}
              >
                {data.artist_name}
              </button>
            )}
          </div>

          {showTrackPanel && trackPanelMeta ? (
              <div className="release-page__track-panel">
                <h2 className="release-page__track-panel-title">
                  {trackPanelMeta.mainTitle}
                </h2>
                {trackPanelReleaseDate && (
                  <p className="release-page__track-panel-date">
                    Released on {trackPanelReleaseDate}
                  </p>
                )}
                {trackPanelMeta.versionLabel && (
                  <p className="release-page__track-panel-version">
                    {trackPanelMeta.versionLabel}
                  </p>
                )}
                {trackPanelMeta.lines
                  .filter(isAdaptationLine)
                  .map((line, i) => (
                    <p key={`adapt-${i}`} className="release-page__track-panel-line">
                      {line.text}
                    </p>
                  ))}
                {versionSource && (
                  <p className="release-page__track-panel-source">
                    Taken from{versionSource.is_single ? " the " : " "}
                    <button
                      type="button"
                      className="release-page__release-link"
                      onClick={() =>
                        onOpenRelease(
                          versionSource.navigate_band_id ?? bandId,
                          versionSource.navigate_release_id
                        )
                      }
                    >
                      {versionSource.album_title}
                    </button>
                    {versionSource.is_single ? " single" : ""}
                  </p>
                )}
                {trackPanelMeta.lines
                  .filter((line) => !isAdaptationLine(line))
                  .map((line, i) => {
                  if (line.kind === "cover") {
                    return (
                      <p key={i} className="release-page__track-panel-line">
                        <button
                          type="button"
                          className="release-page__person-link"
                          onClick={() => void openPersonName(line.artist)}
                        >
                          {line.artist}
                        </button>{" "}
                        cover
                      </p>
                    );
                  }
                  if (line.kind === "featuring") {
                    return (
                      <p key={i} className="release-page__track-panel-line">
                        Featuring{" "}
                        {line.artists.map((name, j) => (
                          <span key={name}>
                            {j > 0 && (j === line.artists.length - 1 ? " and " : ", ")}
                            <button
                              type="button"
                              className="release-page__person-link"
                              onClick={() => void openPersonName(name)}
                            >
                              {name}
                            </button>
                          </span>
                        ))}
                      </p>
                    );
                  }
                  if (line.kind === "performer") {
                    return (
                      <p key={i} className="release-page__track-panel-line">
                        Performed by{" "}
                        <button
                          type="button"
                          className="release-page__person-link"
                          onClick={() => void openPersonName(line.artist)}
                        >
                          {line.artist}
                        </button>
                      </p>
                    );
                  }
                  if (line.kind === "other") {
                    return (
                      <p key={i} className="release-page__track-panel-line">
                        {line.text}
                      </p>
                    );
                  }
                  return null;
                })}
                {trackWriters.length > 0 && (
                  <p className="release-page__track-panel-writers">
                    Written by{" "}
                    {trackWriters.map((name, i) => (
                      <span key={name}>
                        {i > 0 && (i === trackWriters.length - 1 ? " and " : ", ")}
                        <button
                          type="button"
                          className="release-page__person-link"
                          onClick={() => void openPersonName(name)}
                        >
                          {name}
                        </button>
                      </span>
                    ))}
                  </p>
                )}
              </div>
          ) : (
            <>
              <div className="release-page__panel-head">
                <h1 className="release-page__album-title">{data.title}</h1>
                {data.display_date && (
                  <p className="release-page__date">{data.display_date}</p>
                )}
                <p className="release-page__type-line">
                  {data.category ? (
                    <button
                      type="button"
                      className="release-page__type-link"
                      onClick={() =>
                        onBrowseArtistAudio(bandId, data.category, {
                          compilationBoxSetsOnly:
                            data.category === "compilations" &&
                            data.release_type === "Box set",
                        })
                      }
                    >
                      {data.release_type}
                    </button>
                  ) : (
                    data.release_type
                  )}{" "}
                  by{" "}
                  <button
                    type="button"
                    className="release-page__artist-link release-page__artist-link--inline"
                    onClick={() => onOpenArtist(bandId)}
                  >
                    {data.artist_name}
                  </button>
                </p>
                {data.source_artist && (
                  <p className="release-page__source">Source: {data.source_artist}</p>
                )}
                {data.taken_from && (
                  <p className="release-page__track-panel-source">
                    Taken from{data.taken_from.is_single ? " the " : " "}
                    <button
                      type="button"
                      className="release-page__release-link"
                      onClick={() =>
                        onOpenRelease(
                          data.taken_from!.navigate_band_id ?? bandId,
                          data.taken_from!.navigate_release_id
                        )
                      }
                    >
                      {data.taken_from.album_title}
                    </button>
                    {data.taken_from.is_single ? " single" : ""}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
          </div>

          {showPanelReleaseMeta && (data.subgenres.length > 0 || data.producer) && (
            <div className="release-page__panel-credits" ref={panelCreditsRef}>
              {data.subgenres.length > 0 && (
                <p className="release-page__subgenres">
                  {data.subgenres.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && " · "}
                      <button
                        type="button"
                        className="release-page__genre-link"
                        onClick={() => onOpenCatalogSubgenre?.(s.id, s.name)}
                      >
                        {s.name}
                      </button>
                    </span>
                  ))}
                </p>
              )}
              {data.producer && (
                <p className="release-page__producer">
                  Produced by{" "}
                  {data.producer.split(/[;,]/).map((name, i) => {
                    const trimmed = name.trim();
                    if (!trimmed) return null;
                    return (
                      <span key={`${trimmed}-${i}`}>
                        {i > 0 && ", "}
                        <button
                          type="button"
                          className="release-page__person-link"
                          onClick={() => onOpenCatalogProducer?.(trimmed)}
                        >
                          {trimmed}
                        </button>
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          )}

        </div>

          <div className="release-page__panel-bottom" ref={panelBottomRef}>
          {showPanelReleaseMeta && data.label && (
            <div className="release-page__label" ref={panelLabelRef}>
              <button
                type="button"
                className="release-page__label-logo-btn"
                onClick={() => onOpenCatalogLabel?.(data.label!)}
                aria-label={`Browse ${data.label} label`}
              >
                <img
                  src={labelLogoSrc}
                  alt={data.label}
                  className="release-page__label-logo"
                />
              </button>
              <p className="release-page__label-name">
                Distributed by{" "}
                <button
                  type="button"
                  className="release-page__person-link"
                  onClick={() => onOpenCatalogLabel?.(data.label!)}
                >
                  {data.label}
                </button>
              </p>
            </div>
          )}

          {showPanelReleaseMeta && (data.spotify_url || data.qr_url) && (
            <div className="release-page__extras">
              {data.spotify_url && (
                <img src={data.spotify_url} alt="Spotify" className="release-page__spotify" />
              )}
              {data.qr_url && (
                <img src={data.qr_url} alt="QR" className="release-page__qr" />
              )}
            </div>
          )}

          {tab === "tracklist" && panelActionTrack && (
            <div className="release-page__track-actions release-page__track-actions--above-player">
              {showLyricsAction && (
                <button
                  type="button"
                  className="release-page__track-action"
                  data-tooltip="Lyrics"
                  aria-label="Lyrics"
                  onClick={() => {
                    if (stacked) setMobileTrackView("tracks");
                    tracklistRef.current?.openLyrics(panelActionTrack);
                  }}
                >
                  <TrackActionLyricsIcon className="release-page__track-action-icon" />
                </button>
              )}
              {showVersionsAction && (
                <button
                  type="button"
                  className="release-page__track-action"
                  data-tooltip="Versions"
                  aria-label="Versions"
                  onClick={() => {
                    if (stacked) setMobileTrackView("tracks");
                    tracklistRef.current?.openVersions(panelActionTrack);
                  }}
                >
                  <TrackActionVersionsIcon className="release-page__track-action-icon" />
                </button>
              )}
              <button
                type="button"
                className="release-page__track-action"
                data-tooltip="Add to playlist"
                aria-label="Add to playlist"
                onClick={() => tracklistRef.current?.openPlus(panelActionTrack)}
              >
                <TrackActionPlaylistIcon className="release-page__track-action-icon" />
              </button>
              {panelVideos.length > 0 && (
                <div
                  ref={youtubePickerRef}
                  className="release-page__youtube-picker-wrap"
                >
                  <button
                    type="button"
                    className="release-page__track-action"
                    data-tooltip={
                      panelVideos.length > 1 ? "Choose video" : "Official video"
                    }
                    aria-label={
                      panelVideos.length > 1 ? "Choose video" : "Official video"
                    }
                    aria-expanded={panelVideos.length > 1 ? youtubePickerOpen : undefined}
                    onClick={() => {
                      if (panelVideos.length <= 1) {
                        handleOpenYoutube(panelVideos[0]!.url);
                        return;
                      }
                      setYoutubePickerOpen((open) => !open);
                    }}
                  >
                    <TrackActionYoutubeIcon className="release-page__track-action-icon" />
                  </button>
                  {panelVideos.length > 1 && youtubePickerOpen && (
                    <div className="release-page__youtube-picker" role="menu">
                      {panelVideos.map((video) => (
                        <button
                          key={video.url}
                          type="button"
                          className="release-page__youtube-picker-item"
                          role="menuitem"
                          onClick={() => handleOpenYoutube(video.url)}
                        >
                          <span className="release-page__youtube-picker-label">
                            {video.label}
                            {video.primary ? " · Primary" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="release-page__panel-footer">
          <div className="release-page__panel-player">
            <MiniAudioPlayerControls
              {...miniAudio}
              toggle={handlePanelPlayToggle}
              onPrev={() => playAdjacentTrack("prev")}
              onNext={() => playAdjacentTrack("next")}
              repeatOne={repeatOne}
              onRepeatToggle={() => setRepeatOne((r) => !r)}
            />
          </div>
          <div className="release-page__panel-bottom-bar">
            {data.prev ? (
              <ReleaseNeighborLink
                neighbor={data.prev}
                direction="prev"
                onClick={() => onOpenRelease(bandId, data.prev!.id)}
              />
            ) : (
              <span className="release-page__neighbor-spacer" />
            )}
            {data.next ? (
              <ReleaseNeighborLink
                neighbor={data.next}
                direction="next"
                onClick={() => onOpenRelease(bandId, data.next!.id)}
              />
            ) : (
              <span className="release-page__neighbor-spacer" />
            )}
          </div>
        </div>
        </div>
      </div>
      </div>
    </aside>
  ) : null;

  return (
    <div className={pageClass}>
      <div className="release-page__bg-stack" aria-hidden>
        {bgLayers.outgoing && (
          <div
            className="release-page__bg release-page__bg--visible release-page__bg--out"
            style={{ backgroundImage: `url("${bgLayers.outgoing}")` }}
          />
        )}
        {bgLayers.current && (
          <div
            className={`release-page__bg release-page__bg--visible${bgLayers.outgoing ? " release-page__bg--in" : ""}`}
            style={{ backgroundImage: `url("${bgLayers.current}")` }}
          />
        )}
        <MediaBeatFx />
      </div>

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__back"
              onClick={handleBack}
              aria-label={`Back to ${backLabel}`}
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
              <span>{backLabel}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            {topLogo}
            {!topLogo && data && (
              <span className="release-page__title-center">{data.title}</span>
            )}
          </div>
          <div className="release-page__top-right">
            <MediaInlineSearch
              mode="artist-releases"
              bandId={bandId}
              onSelectRelease={(rid) => onOpenRelease(bandId, rid)}
              onSelectTrack={(path, title) => {
                onTab("tracklist");
                void handlePlayTrack(path, title);
              }}
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
              menuVariant="release"
              onEditAbout={isAdmin ? () => setAboutEditOpen(true) : undefined}
              onRefreshMetadata={
                isAdmin ? () => void handleRefreshMetadata() : undefined
              }
              onFetchLyrics={isAdmin ? () => void handleFetchLyrics() : undefined}
              onSetLyrics={isAdmin ? () => setLyricsSetOpen(true) : undefined}
              onFetchVideos={isAdmin ? () => void handleFetchVideos() : undefined}
              onSetVideo={isAdmin ? () => setVideoSetOpen(true) : undefined}
              onWriteFileTags={
                isAdmin && !isPhone ? () => setFileTagsOpen(true) : undefined
              }
              onRefreshTracklist={() => handleRefreshTracklist()}
              refreshIncludeBio={refreshWiki}
              onRefreshIncludeBioChange={setRefreshWiki}
              refreshIncludeLabel="Include description"
            />
          </div>
        </header>

        <nav className="release-page__tabs">
          {pageTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => onTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {stacked && tab === "tracklist" && (
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
        )}

        {(tab === "gallery" && galleryTabsMeta.length > 1) && (
          <nav className="release-page__subtabs release-page__subtabs--gallery" aria-label="Gallery sections">
            {galleryTabsMeta.map((t) => (
              <button
                key={t.id}
                type="button"
                className={galleryTab === t.id ? "active" : ""}
                onClick={() => setGalleryTab(t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {busy && (
        <p className="release-page__status release-page__status--loading" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="release-page__status release-page__status--error" role="alert">
          {error}
        </p>
      )}

      {showPageBody && (
        <div className="release-page__body">
          {panelAside}

          <main className="release-page__main">
            {tab === "overview" && data && (
              <div
                className={[
                  "release-page__overview",
                  isVaRelease ? "release-page__overview--va" : "",
                  isVaRelease && vaOverviewNoSingles
                    ? "release-page__overview--no-singles"
                    : "",
                  hasOverviewBottomSection ? "" : "release-page__overview--compact-lineup",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="release-page__overview-top" ref={overviewTopRef}>
                  {(data.description ||
                    data.needs_metadata_fetch ||
                    data.needs_description_fetch) && (
                    <div className="release-page__desc-block">
                      <div
                        className={`release-page__desc-scroll${
                          stacked
                            ? overviewDescExpanded
                              ? " release-page__desc-scroll--expanded"
                              : " release-page__desc-scroll--collapsed"
                            : ""
                        }`}
                        ref={overviewDescRef}
                      >
                        {data.description ? (
                          <>
                            {data.description.split(/\n+/).map((p, i) => (
                              <p key={i} className="release-page__desc-para">
                                {p}
                              </p>
                            ))}
                          </>
                        ) : data.needs_metadata_fetch ||
                          data.needs_description_fetch ? (
                          <p className="muted">Loading description…</p>
                        ) : null}
                      </div>
                      {stacked && data.description && (
                        <button
                          type="button"
                          className="release-page__desc-toggle"
                          onClick={() => setOverviewDescExpanded((o) => !o)}
                        >
                          {overviewDescExpanded ? "Show less" : "Read more"}
                        </button>
                      )}
                    </div>
                  )}

                  {showOverviewSide && (
                    <div className="release-page__overview-side">
                      {showOverviewPhotocards &&
                        (!isVaRelease || vaHasDescription) && (
                        <div
                          className={`release-page__photocards${
                            photocardsCoverOnly
                              ? " release-page__photocards--cover-only"
                              : ""
                          }`}
                          ref={overviewPhotocardsRef}
                        >
                          <ReleasePhotocardGroup cards={overviewPhotocards} />
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {showOverviewBottom && (
                  <div className="release-page__overview-bottom">
                {showVaPhotocardsInStack && showVaFeaturedArtists && (
                  <div className="release-page__va-stack">
                    <div
                      className={`release-page__va-photocards-row release-page__va-photocards-row--inline${
                        photocardsCoverOnly
                          ? " release-page__va-photocards-row--cover-only"
                          : ""
                      }`}
                      ref={overviewPhotocardsRef}
                    >
                      <ReleasePhotocardGroup cards={overviewPhotocards} />
                    </div>

                    <section className="release-page__section-glass release-page__lineup release-page__featured-artists release-page__va-panel">
                      <div className="release-page__featured-artists-rows">
                        <div
                          className="release-page__featured-artists-grid"
                          data-count={String(vaFeaturedRow1.length)}
                        >
                          {vaFeaturedRow1.map((artist) => (
                            <FeaturedArtistCard
                              key={artist.band_id ?? artist.name}
                              artist={artist}
                              onSelect={() => openFeaturedArtist(artist)}
                            />
                          ))}
                        </div>
                        {vaFeaturedRow2.length > 0 && (
                          <div
                            className="release-page__featured-artists-grid"
                            data-count={String(vaFeaturedRow2.length)}
                          >
                            {vaFeaturedRow2.map((artist) => (
                              <FeaturedArtistCard
                                key={artist.band_id ?? artist.name}
                                artist={artist}
                                onSelect={() => openFeaturedArtist(artist)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {showVaFeaturedArtists && !showVaPhotocardsInStack && (
                  <section className="release-page__section-glass release-page__lineup release-page__featured-artists release-page__va-panel">
                    <div className="release-page__featured-artists-rows">
                      <div
                        className="release-page__featured-artists-grid"
                        data-count={String(vaFeaturedRow1.length)}
                      >
                        {vaFeaturedRow1.map((artist) => (
                          <FeaturedArtistCard
                            key={artist.band_id ?? artist.name}
                            artist={artist}
                            onSelect={() => openFeaturedArtist(artist)}
                          />
                        ))}
                      </div>
                      {vaFeaturedRow2.length > 0 && (
                        <div
                          className="release-page__featured-artists-grid"
                          data-count={String(vaFeaturedRow2.length)}
                        >
                          {vaFeaturedRow2.map((artist) => (
                            <FeaturedArtistCard
                              key={artist.band_id ?? artist.name}
                              artist={artist}
                              onSelect={() => openFeaturedArtist(artist)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {showOverviewLineup && showBandLineup && (
                  <section className="release-page__section-glass release-page__lineup">
                    <div className="release-page__lineup-grid">
                      {data.lineup.map((m) => (
                        <LineupMiniCard
                          key={m.participation_id ?? m.id}
                          member={m}
                          onSelect={() => setLineupMemberId(m.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {showOverviewLineup && showSoloLineup && (
                  <section className="release-page__section-glass release-page__lineup">
                    <div className="release-page__lineup-grid">
                      <LineupMiniCard
                        member={data.lineup[0]}
                        onSelect={() => setLineupMemberId(data.lineup[0].id)}
                      />
                    </div>
                  </section>
                )}

                {data.singles.length > 0 && (
                  <section className="release-page__section-glass release-page__singles">
                    <div className="release-page__singles-grid">
                      {data.singles.map((s) => {
                        const dateLabel = formatTrackDate(
                          s.date_iso ?? s.display_date
                        );
                        const targetId = s.navigate_release_id ?? s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className="release-page__single"
                            onClick={() => onOpenRelease(bandId, targetId)}
                          >
                            {s.cover_url && (
                              <span className="release-page__single-cover">
                                <img src={s.cover_url} alt="" draggable={false} />
                              </span>
                            )}
                            <span className="release-page__single-title">{s.title}</span>
                            {dateLabel && (
                              <span className="release-page__single-date">{dateLabel}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {(data.appears_on?.length ?? 0) > 0 && (
                  <section className="release-page__section-glass release-page__singles release-page__appears-on">
                    <div className="release-page__singles-grid">
                      {data.appears_on!.map((s) => {
                        const dateLabel = formatTrackDate(
                          s.date_iso ?? s.display_date
                        );
                        const targetId = s.navigate_release_id ?? s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className="release-page__single"
                            onClick={() => onOpenRelease(bandId, targetId)}
                          >
                            {s.cover_url && (
                              <span className="release-page__single-cover">
                                <img src={s.cover_url} alt="" draggable={false} />
                              </span>
                            )}
                            <span className="release-page__single-title">{s.title}</span>
                            {dateLabel && (
                              <span className="release-page__single-date">{dateLabel}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                  </div>
                )}

              </div>
            )}

            {(data || cachedTracklist) && mountTracklist && (
              <div
                className={
                  tab === "tracklist"
                    ? "release-page__tracklist-pane"
                    : "release-page__tab-pane--hidden"
                }
              >
                <ReleaseTracklist
                  ref={tracklistRef}
                  bandId={bandId}
                  releaseId={releaseId}
                  releaseNavigateId={tracklistMeta.releaseNavigateId}
                  artistName={tracklistMeta.artistName}
                  releaseTitle={tracklistMeta.releaseTitle}
                  stacked={stacked}
                  compactLyricsHead={stacked || tabletPortrait}
                  playingPath={playingPath}
                  playbackProgress={tab === "tracklist" ? miniAudio.progress : 0}
                  mobileView={mobileTrackView}
                  onMobileViewChange={setMobileTrackView}
                  mobileBackdropUrl={displayCover}
                  onActiveTrackChange={setActiveTrack}
                  onPanelActionsChange={handlePanelActionsChange}
                  onResumeTrack={(path) => {
                    setVersionSource(null);
                    const ctx = tracklistRef.current?.findTrackContext(path);
                    void handlePlayTrack(path, ctx?.track.title ?? "", ctx?.art);
                  }}
                  onPlay={(path, title, art, editionLabel) =>
                    void handlePlayTrack(path, title, art, editionLabel)
                  }
                  reloadKey={tracklistKey}
                  isAdmin={isAdmin}
                  onOpenLyricsSet={isAdmin ? () => setLyricsSetOpen(true) : undefined}
                />
              </div>
            )}

            {tab === "gallery" && (
              <ReleaseGallery
                bandId={bandId}
                releaseId={releaseId}
                playingPath={playingPath}
                galleryTab={galleryTabsMeta.length > 1 ? galleryTab : undefined}
                onGalleryTabChange={galleryTabsMeta.length > 1 ? setGalleryTab : undefined}
                hideTabs={galleryTabsMeta.length > 1}
                onTabsMeta={handleGalleryTabsMeta}
              />
            )}
          </main>
        </div>
      )}

      {aboutEditOpen && data && (
        <ReleaseAboutEditModal
          bandId={bandId}
          releaseId={releaseId}
          data={data}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => void load()}
        />
      )}

      {videoSetOpen && data && (
        <ReleaseVideoSetModal
          bandId={bandId}
          releaseId={releaseId}
          artistName={data.artist_name}
          onClose={() => setVideoSetOpen(false)}
          onSaved={handleVideoSaved}
        />
      )}

      {lyricsSetOpen && data && (
        <ReleaseLyricsSetModal
          bandId={bandId}
          releaseId={releaseId}
          artistName={data.artist_name}
          onClose={() => setLyricsSetOpen(false)}
          onSaved={() => {
            clearReleaseTracklistCache(bandId, releaseId);
            setTracklistKey((k) => k + 1);
            invalidateWordCloud(bandId);
          }}
        />
      )}

      {fileTagsOpen && data && (
        <ReleaseFileTagsModal
          bandId={bandId}
          releaseId={releaseId}
          releaseTitle={data.title}
          onClose={() => setFileTagsOpen(false)}
          onDone={(message) => {
            setBusy(message);
            window.setTimeout(() => setBusy(""), 4000);
          }}
        />
      )}

      {videoFetchOpen && data && (
        <ReleaseVideoFetchModal
          bandId={bandId}
          artistName={data.artist_name}
          items={videoFetchItems}
          onClose={() => setVideoFetchOpen(false)}
          onApplied={() => setTracklistKey((k) => k + 1)}
        />
      )}

      {lineupMemberId != null && data && (
        <ArtistMemberModal
          artistId={lineupMemberId}
          bandId={bandId}
          bandName={data.artist_name}
          isAdmin={isAdmin}
          onClose={() => setLineupMemberId(null)}
          onOpenArtist={onOpenArtist}
          onDataChanged={() => void load()}
        />
      )}

      {externalArtist && (
        <NotInLibraryDialog
          name={externalArtist.name}
          urls={externalArtist.urls}
          onClose={() => setExternalArtist(null)}
        />
      )}

      <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
    </div>
  );
}
