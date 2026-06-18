import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchReleaseLyrics,
  fetchReleaseOverview,
  fetchReleaseTracklist,
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
import {
  getCachedTrackCredits,
  prefetchTrackCredits,
} from "../../../releaseTrackCreditsCache";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type { LineupMember, ReleaseNeighbor, ReleaseOverview, ReleaseTrackItem } from "../../../types";
import { formatTrackDate } from "../../../formatDate";
import AppMenu from "../../AppMenu";
import MediaInlineSearch from "../MediaInlineSearch";
import ArtistMemberModal from "../artist/ArtistMemberModal";
import NotInLibraryDialog from "../artist/NotInLibraryDialog";
import ReleaseAboutEditModal from "./ReleaseAboutEditModal";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "../artist/MiniAudioPlayer";
import MediaBeatFx from "../MediaBeatFx";
import MediaBeatFrame from "../MediaBeatFrame";
import { useBeatPulse } from "../../../useBeatPulse";
import ReleaseGallery from "./ReleaseGallery";
import ReleasePhotocard from "./ReleasePhotocard";
import ReleaseTracklist, {
  type ReleaseMobileTrackView,
  type ReleasePlaybackArt,
  type ReleaseTracklistHandle,
  prefetchReleaseTracklist,
} from "./ReleaseTracklist";
import {
  ChevronIcon,
  DEFAULT_DISC_URL,
  DEFAULT_LABEL_URL,
  parseTrackPanelMeta,
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

export default function ReleasePage({
  bandId,
  releaseId,
  tab,
  userId,
  onBack,
  onOpenArtist,
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
  const [data, setData] = useState<ReleaseOverview | null>(() =>
    getCachedReleaseOverview(bandId, releaseId)
  );
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [mobileTrackView, setMobileTrackView] =
    useState<ReleaseMobileTrackView>("tracks");
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [refreshWiki, setRefreshWiki] = useState(true);
  const [playbackArt, setPlaybackArt] = useState<ReleasePlaybackArt | null>(null);
  const [trackWriters, setTrackWriters] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<ReleaseTrackItem | null>(null);
  const [panelActionTrack, setPanelActionTrack] = useState<ReleaseTrackItem | null>(null);
  const [showLyricsAction, setShowLyricsAction] = useState(true);
  const [showVersionsAction, setShowVersionsAction] = useState(true);
  const [lineupMemberId, setLineupMemberId] = useState<number | null>(null);
  const [externalArtist, setExternalArtist] = useState<{
    name: string;
    urls: Record<string, string>;
  } | null>(null);
  const tracklistRef = useRef<ReleaseTracklistHandle>(null);
  const sourceArtCacheRef = useRef<Map<string, ReleasePlaybackArt>>(new Map());
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
  const isPlaying = Boolean(playingPath && miniAudio.playing);
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
    const cached = getCachedReleaseOverview(bandId, releaseId);
    setData(cached);
    setError(null);
    const url =
      cached?.background_layers?.[0] ?? cached?.cover_url ?? undefined;
    prevBgRef.current = url;
    setBgLayers(url ? { current: url } : {});
    load({ silent: Boolean(cached) });
  }, [bandId, releaseId, load]);

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
    if (stacked || tab !== "overview") return;
    const top = overviewTopRef.current;
    const desc = overviewDescRef.current;
    const cards = overviewPhotocardsRef.current;
    if (!top) return;

    const measure = () => {
      top.style.removeProperty("--overview-photocard-scale");
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
    return () => ro.disconnect();
  }, [
    stacked,
    tab,
    data?.description,
    data?.photocards?.portrait_front,
    data?.photocards?.landscape_front,
  ]);

  useLayoutEffect(() => {
    if (stacked) return;
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
    if (tab !== "tracklist" || !nowPlayingTitle) {
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
  }, [bandId, releaseId, tab, nowPlayingTitle]);

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

  useEffect(() => {
    setPlaybackArt(null);
    sourceArtCacheRef.current.clear();
  }, [releaseId, data?.cover_url]);

  const resolvePlaybackArt = useCallback(
    async (path: string): Promise<ReleasePlaybackArt | null> => {
      const cached = sourceArtCacheRef.current.get(path);
      if (cached) return cached;
      try {
        const res = await fetchTrackSourceArt(bandId, releaseId, path);
        const normalized = normalizePlaybackArt(res.playback);
        sourceArtCacheRef.current.set(path, normalized);
        return normalized;
      } catch {
        const ctx = tracklistRef.current?.findTrackContext(path);
        return ctx?.art ? normalizePlaybackArt(ctx.art) : null;
      }
    },
    [bandId, releaseId]
  );

  useEffect(() => {
    if (!data) return;
    void prefetchReleaseTracklist(bandId, releaseId);
  }, [bandId, releaseId, data]);

  const hasActiveTrack = Boolean(playingPath);
  const displayCover = hasActiveTrack
    ? (playbackArt?.cover_url ?? null)
    : (data?.cover_url ?? null);
  const displayAnim = hasActiveTrack
    ? (playbackArt?.cover_animation_url ?? null)
    : (data?.cover_animation_url ?? null);
  const displayCanvas = hasActiveTrack
    ? (playbackArt?.canvas_url ?? null)
    : (data?.canvas_url ?? null);
  const displayDisc = hasActiveTrack
    ? (playbackArt?.disc_url ?? data?.disc_url ?? DEFAULT_DISC_URL)
    : (data?.disc_url ?? DEFAULT_DISC_URL);
  const showPanelCanvas =
    hasActiveTrack && Boolean(displayCanvas) && isVideoMedia(displayCanvas);
  const albumCover = data?.cover_url ?? null;
  const albumDisc = data?.disc_url ?? DEFAULT_DISC_URL;
  const panelCoverSrc = hasActiveTrack ? displayAnim || displayCover : albumCover;
  const panelDiscSrc = hasActiveTrack ? displayDisc : albumDisc;
  const panelCoverIsVideo = isVideoMedia(panelCoverSrc);
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

  const backLabel = data?.artist_name ?? "Artist";

  const handleBack = () => {
    const ref = getReleaseReferrer();
    clearReleaseReferrer();
    if (ref && ref.bandId !== bandId) {
      onOpenArtist(ref.bandId);
      return;
    }
    onBack();
  };

  const topLogo = data?.logo_url ? (
    <MediaBeatFrame variant="logo">
      <img
        src={data.logo_url}
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

  const scrollBody = tab !== "overview";

  const handleFetchLyrics = async () => {
    setBusy("Fetching synced lyrics…");
    setError(null);
    try {
      const res = await fetchReleaseLyrics(bandId, releaseId);
      if (!res.ok) {
        setError(res.error ?? "Lyrics fetch failed");
        return;
      }
      setBusy(
        `Lyrics: ${res.fetched ?? 0} saved · ${res.skipped ?? 0} skipped · ${res.not_found ?? 0} not found`
      );
      setTracklistKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.setTimeout(() => setBusy(""), 6000);
    }
  };

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
      art?: ReleasePlaybackArt,
      _editionLabel?: string | null
    ) => {
      if (playingPath === path && miniAudio.src) {
        if (!miniAudio.playing) {
          miniAudio.toggle();
          return;
        }
        return;
      }
      let resolvedArt = await resolvePlaybackArt(path);
      if (resolvedArt) {
        setPlaybackArt(resolvedArt);
      } else if (data) {
        setPlaybackArt({
          cover_url: data.cover_url,
          cover_animation_url: data.cover_animation_url,
          canvas_url: data.canvas_url,
          disc_url: data.disc_url,
          background_layers: data.background_layers,
        });
      }
      setPlayingPath(path);
      setNowPlayingTitle(title);
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
    [bandId, data, miniAudio, playingPath, releaseId, resolvePlaybackArt]
  );

  const playAdjacentTrack = useCallback(
    (direction: "prev" | "next") => {
      if (!playingPath || !tracklistRef.current) return;
      const tracks = tracklistRef.current.allTracks();
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
    let tracks = tracklistRef.current?.allTracks() ?? [];
    if (!tracks.length) {
      try {
        const payload = await fetchReleaseTracklist(bandId, releaseId);
        tracks = payload.editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
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
    if (!playingPath) return;
    void resolvePlaybackArt(playingPath).then((resolved) => {
      if (resolved) setPlaybackArt(resolved);
    });
  }, [playingPath, resolvePlaybackArt]);

  useEffect(() => {
    if (tab !== "tracklist") {
      setMobileTrackView("tracks");
    }
  }, [tab]);

  const pageClass = [
    "release-page",
    stacked ? "release-page--stacked" : "",
    tab === "overview" ? "release-page--overview" : "",
    scrollBody ? "release-page--scroll" : "",
    tab === "tracklist" && stacked && mobileTrackView === "album"
      ? "release-page--track-album"
      : "",
    tab === "tracklist" && stacked && mobileTrackView === "tracks"
      ? "release-page--track-tracks"
      : "",
    beatActive ? "release-page--beat-ready" : "",
    playingPath && miniAudio.playing ? "release-page--playing" : "",
    playingPath && data?.playback_kind === "tape" ? "release-page--tape" : "",
    playingPath && data?.playback_kind === "vinyl" ? "release-page--vinyl" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showTrackPanel =
    tab === "tracklist" && Boolean(nowPlayingTitle) && isPlaying;
  const panelFadedCover = displayCover ?? data?.cover_url ?? null;
  const trackPanelMeta = nowPlayingTitle ? parseTrackPanelMeta(nowPlayingTitle) : null;
  const labelLogoSrc = data?.label_logo_url || DEFAULT_LABEL_URL;

  const panelAside = data ? (
    <aside
      className={`release-page__panel${showTrackPanel ? " release-page__panel--track" : ""}${
        showPanelCanvas ? " release-page__panel--canvas" : ""
      }`}
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
        <div className="release-page__art-stage">
          {panelCoverSrc &&
            (panelCoverIsVideo && hasActiveTrack ? (
              <video
                key={panelCoverSrc}
                src={panelCoverSrc}
                className="release-page__cover release-page__cover--video"
                autoPlay={isPlaying}
                loop
                muted
                playsInline
                draggable={false}
              />
            ) : (
              <img
                key={panelCoverSrc}
                src={panelCoverSrc}
                alt=""
                className="release-page__cover"
                draggable={false}
              />
            ))}
          {data.playback_kind !== "tape" && (
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
        {data.playback_kind === "tape" && isPlaying && (
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

          {tab === "tracklist" && showTrackPanel && trackPanelMeta ? (
              <div className="release-page__track-panel">
                <h2 className="release-page__track-panel-title">
                  {trackPanelMeta.mainTitle}
                </h2>
                {trackPanelMeta.lines
                  .filter((line) => line.kind === "version")
                  .map((line, i) => (
                    <p key={`version-${i}`} className="release-page__track-panel-version">
                      {line.label}
                    </p>
                  ))}
                {trackPanelMeta.lines
                  .filter((line) => line.kind !== "version")
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
                  return (
                    <p key={i} className="release-page__track-panel-line">
                      {line.text}
                    </p>
                  );
                })}
                {data.display_date && (
                  <p className="release-page__track-panel-date">
                    Released on {data.display_date}
                  </p>
                )}
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
                  {data.release_type} by{" "}
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
              </div>
            </>
          )}
        </div>
          </div>

          {tab !== "tracklist" && (data.subgenres.length > 0 || data.producer) && (
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
          {tab !== "tracklist" && data.label && (
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

          {tab !== "tracklist" && (data.spotify_url || data.qr_url) && (
            <div className="release-page__extras">
              {data.spotify_url && (
                <img src={data.spotify_url} alt="Spotify" className="release-page__spotify" />
              )}
              {data.qr_url && (
                <img src={data.qr_url} alt="QR" className="release-page__qr" />
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
            {tab === "tracklist" && panelActionTrack && (
              <div className="release-page__track-actions">
                {showLyricsAction && (
                  <button
                    type="button"
                    className="release-page__track-action"
                    title="Lyrics"
                    aria-label="Lyrics"
                    onClick={() => tracklistRef.current?.openLyrics(panelActionTrack)}
                  >
                    <TrackActionLyricsIcon className="release-page__track-action-icon" />
                  </button>
                )}
                {showVersionsAction && (
                  <button
                    type="button"
                    className="release-page__track-action"
                    title="Versions"
                    aria-label="Versions"
                    onClick={() => tracklistRef.current?.openVersions(panelActionTrack)}
                  >
                    <TrackActionVersionsIcon className="release-page__track-action-icon" />
                  </button>
                )}
                <button
                  type="button"
                  className="release-page__track-action"
                  title="Add to playlist"
                  aria-label="Add to playlist"
                  onClick={() => tracklistRef.current?.openPlus(panelActionTrack)}
                >
                  <TrackActionPlaylistIcon className="release-page__track-action-icon" />
                </button>
                {panelActionTrack.youtube_url && (
                  <a
                    href={panelActionTrack.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="release-page__track-action"
                    title="Official video"
                    aria-label="Official video"
                  >
                    <TrackActionYoutubeIcon className="release-page__track-action-icon" />
                  </a>
                )}
              </div>
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
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onEditAbout={isAdmin ? () => setAboutEditOpen(true) : undefined}
              onRefreshMetadata={
                isAdmin ? () => void handleRefreshMetadata() : undefined
              }
              onFetchLyrics={isAdmin ? () => void handleFetchLyrics() : undefined}
              refreshIncludeBio={refreshWiki}
              onRefreshIncludeBioChange={setRefreshWiki}
              refreshIncludeLabel="Include Wikipedia"
            />
          </div>
        </header>

        <nav className="release-page__tabs">
          {TABS.map((t) => (
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
      </div>

      {busy && <p className="muted release-page__busy">{busy}</p>}
      {error && <p className="error release-page__error">{error}</p>}

      {data && (
        <div className="release-page__body">
          {panelAside}

          <main className="release-page__main">
            {tab === "overview" && (
              <div
                className={[
                  "release-page__overview",
                  data.singles.length === 0 ? "release-page__overview--no-singles" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="release-page__overview-top" ref={overviewTopRef}>
                  <div className="release-page__desc-block">
                    <div className="release-page__desc-scroll" ref={overviewDescRef}>
                      {data.description ? (
                        <>
                          {data.description.split(/\n+/).map((p, i) => (
                            <p key={i} className="release-page__desc-para">
                              {p}
                            </p>
                          ))}
                        </>
                      ) : data.needs_metadata_fetch || data.needs_description_fetch ? (
                        <p className="muted">Loading description…</p>
                      ) : (
                        <p className="muted">No description available.</p>
                      )}
                    </div>
                  </div>

                  {(data.photocards.portrait_front || data.photocards.landscape_front) && (
                    <div className="release-page__photocards" ref={overviewPhotocardsRef}>
                      <ReleasePhotocard
                        variant="portrait"
                        frontUrl={data.photocards.portrait_front}
                        backUrl={data.photocards.portrait_back}
                      />
                      <ReleasePhotocard
                        variant="landscape"
                        frontUrl={data.photocards.landscape_front}
                        backUrl={data.photocards.landscape_back}
                      />
                    </div>
                  )}
                </div>

                {data.show_lineup && data.lineup.length > 0 && (
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

                {data.is_solo && data.lineup.length === 1 && (
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

              </div>
            )}

            {data && (
              <div className={tab === "tracklist" ? undefined : "release-page__tab-pane--hidden"}>
                <ReleaseTracklist
                  ref={tracklistRef}
                  bandId={bandId}
                  releaseId={releaseId}
                  artistName={data.artist_name}
                  releaseTitle={data.title}
                  stacked={stacked}
                  playingPath={playingPath}
                  playbackProgress={miniAudio.progress}
                  mobileView={mobileTrackView}
                  onMobileViewChange={setMobileTrackView}
                  mobileBackdropUrl={displayCover}
                  onActiveTrackChange={setActiveTrack}
                  onPanelActionsChange={({ track, showLyrics, showVersions }) => {
                    setPanelActionTrack(track);
                    setShowLyricsAction(showLyrics);
                    setShowVersionsAction(showVersions);
                  }}
                  onResumeTrack={(path) => {
                    const ctx = tracklistRef.current?.findTrackContext(path);
                    void handlePlayTrack(path, ctx?.track.title ?? "", ctx?.art);
                  }}
                  onPlay={(path, title, art, editionLabel) =>
                    void handlePlayTrack(path, title, art, editionLabel)
                  }
                  reloadKey={tracklistKey}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {tab === "gallery" && (
              <ReleaseGallery
                bandId={bandId}
                releaseId={releaseId}
                playingPath={playingPath}
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
