import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { fetchTrackSourceArt, playTrack, resolveArtistName, fetchTrackYoutube } from "../../../api";
import { getCachedOverview, prefetchBandOverview } from "../../../overviewCache";
import {
  getCachedArtistPlaylistDetail,
  prefetchArtistPlaylistDetail,
} from "../../../artistPlaylistDetailCache";
import { prefetchTrackCredits, getCachedTrackCredits } from "../../../releaseTrackCreditsCache";
import { pushArtistRoute } from "../../../musicRoute";
import {
  applyAlbumTheme,
  beginAlbumPageSession,
  beginArtistPageSession,
  clearAlbumTheme,
  colorsFromImageUrl,
} from "../../../mediaTheme";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import { useBeatPulse } from "../../../useBeatPulse";
import { formatTrackDate } from "../../../formatDate";
import type {
  ArtistPlaylistDetail,
  ArtistPlaylistTrack,
  BandOverview,
  ReleaseNeighbor,
  ReleaseTrackItem,
  TrackYoutubeVideo,
} from "../../../types";
import { MiniAudioPlayerControls, useMiniAudio } from "./MiniAudioPlayer";
import MediaBeatFx from "../MediaBeatFx";
import SystemPlaylistTracklist, {
  type SystemPlaylistTracklistHandle,
} from "./SystemPlaylistTracklist";
import SetlistsPlaylistContent, {
  type SetlistsPlaylistHandle,
} from "./SetlistsPlaylistContent";
import type { ReleaseMobileTrackView, ReleasePlaybackArt } from "../release/ReleaseTracklist";
import {
  ChevronIcon,
  DEFAULT_DISC_URL,
  isAdaptationLine,
  parseTrackPanelMeta,
  playlistTrackVersionSource,
  primaryArtistName,
  trackDisplayTitle,
  writerSearchUrl,
} from "../release/releaseTrackPanelMeta";
import {
  TrackActionLyricsIcon,
  TrackActionPlaylistIcon,
  TrackActionVersionsIcon,
  TrackActionYoutubeIcon,
} from "../release/releaseTrackActionIcons";
import MediaBeatFrame from "../MediaBeatFrame";
import AppMenu from "../../AppMenu";
import MediaInlineSearch from "../MediaInlineSearch";
import { openYoutubeFullscreen, youtubeVideoId } from "../../../utils/youtube";

type PanelBrand = {
  bandId: number;
  name: string;
  iconUrl: string | null;
  logoUrl: string | null;
  inLibrary: boolean;
};

function eraBrandingFromOverview(
  overview: BandOverview | null | undefined,
  dateIso: string | null | undefined
): { iconUrl: string | null; logoUrl: string | null } {
  if (!overview) return { iconUrl: null, logoUrl: null };
  const year = dateIso ? Number(String(dateIso).slice(0, 4)) : NaN;
  const era =
    Number.isFinite(year) && year > 0
      ? overview.eras?.find((entry) => entry.year === year)
      : null;
  return {
    iconUrl:
      era?.icon_url ?? overview.eras?.find((entry) => entry.icon_url)?.icon_url ?? null,
    logoUrl:
      era?.logo_url ??
      overview.eras?.find((entry) => entry.logo_url)?.logo_url ??
      overview.eras?.[0]?.logo_url ??
      null,
  };
}

type Props = {
  bandId: number;
  slug: string;
  userId?: number;
  isAdmin?: boolean;
  onBack: () => void;
  onOpenPlaylist: (slug: string) => void;
  onOpenRelease?: (bandId: number, releaseId: string) => void;
  onOpenArtist?: (bandId: number) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource: () => void;
  onSwitchProfile: () => void;
  onEditProfile: () => void;
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

function isVideoMedia(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url));
}

function normalizePlaybackArt(art: ReleasePlaybackArt): ReleasePlaybackArt {
  return {
    cover_url: art.cover_url ?? null,
    cover_animation_url: art.cover_animation_url ?? null,
    canvas_url: art.canvas_url ?? null,
    disc_url: art.disc_url ?? null,
    group_kind: art.group_kind ?? null,
    background_layers: art.background_layers ?? [],
  };
}

function PlaylistNeighborLink({
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

export default function SystemPlaylistPage({
  bandId,
  slug,
  userId,
  isAdmin = false,
  onBack,
  onOpenPlaylist,
  onOpenRelease,
  onOpenArtist,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const tabletLayout = isTabletLayout(layout);
  const tabletPortrait = layout === "tablet-portrait";

  const [detail, setDetail] = useState<ArtistPlaylistDetail | null>(
    () => getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [loading, setLoading] = useState(
    () => !getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [playbackArt, setPlaybackArt] = useState<ReleasePlaybackArt | null>(null);
  const [panelActionTrack, setPanelActionTrack] = useState<ReleaseTrackItem | null>(null);
  const [showLyricsAction, setShowLyricsAction] = useState(true);
  const [showVersionsAction, setShowVersionsAction] = useState(true);
  const [panelDateIso, setPanelDateIso] = useState<string | null>(null);
  const [versionSource, setVersionSource] = useState<{
    album_title: string;
    navigate_release_id: string;
    navigate_band_id?: number;
    date_iso?: string | null;
    display_date?: string | null;
  } | null>(null);
  const [repeatOne, setRepeatOne] = useState(false);
  const [mobileTrackView, setMobileTrackView] =
    useState<ReleaseMobileTrackView>("tracks");
  const [bgLayers, setBgLayers] = useState<{ current?: string; outgoing?: string }>({});
  const [youtubePickerOpen, setYoutubePickerOpen] = useState(false);
  const [trackWriters, setTrackWriters] = useState<string[]>([]);
  const [panelYoutubeVideos, setPanelYoutubeVideos] = useState<TrackYoutubeVideo[]>([]);
  const [panelBrand, setPanelBrand] = useState<PanelBrand | null>(null);
  const [setlistTourName, setSetlistTourName] = useState<string | null>(null);
  const [setlistTrackCount, setSetlistTrackCount] = useState<number | null>(null);
  const [setlistPlaybackKey, setSetlistPlaybackKey] = useState<string | null>(null);

  const tracklistRef = useRef<SystemPlaylistTracklistHandle>(null);
  const setlistRef = useRef<SetlistsPlaylistHandle>(null);
  const youtubePickerRef = useRef<HTMLDivElement>(null);
  const canvasVideoRef = useRef<HTMLVideoElement>(null);
  const sourceArtCacheRef = useRef<Map<string, ReleasePlaybackArt>>(new Map());
  const prevBgRef = useRef<string | undefined>(undefined);

  const miniAudio = useMiniAudio();
  const beatActive = Boolean(playingPath && miniAudio.src);
  useBeatPulse(miniAudio.audioRef, beatActive, miniAudio.playing);

  const overview = getCachedOverview(bandId, "landscape");
  const artistName = overview?.name ?? panelBrand?.name ?? "Artist";

  const openPersonName = useCallback(
    async (name: string) => {
      try {
        const res = await resolveArtistName(name);
        if (res.band_id && onOpenArtist) {
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

  useEffect(() => {
    void prefetchBandOverview(bandId, "landscape");
  }, [bandId]);

  useEffect(() => {
    if (userId) beginArtistPageSession(userId);
    beginAlbumPageSession();
    return () => {
      if (userId) clearAlbumTheme(userId);
    };
  }, [userId]);

  useEffect(() => {
    pushArtistRoute(
      {
        bandId,
        section: "audio",
        overviewTab: "about",
        playlistSlug: slug,
      },
      true
    );
  }, [bandId, slug]);

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

  useEffect(() => {
    miniAudio.clear();
    setPlayingPath(null);
    setNowPlayingTitle(null);
    setPlaybackArt(null);
    setPanelActionTrack(null);
    setShowLyricsAction(true);
    setShowVersionsAction(true);
    setVersionSource(null);
    setPanelDateIso(null);
    setTrackWriters([]);
    setPanelYoutubeVideos([]);
    setYoutubePickerOpen(false);
    setPanelBrand(null);
    setMobileTrackView("tracks");
    sourceArtCacheRef.current.clear();
    prevBgRef.current = undefined;
  }, [slug, miniAudio.clear]);

  useEffect(() => () => miniAudio.clear(), [miniAudio.clear]);

  const tracks = detail?.tracks ?? [];
  const coverUrl = detail?.cover_url ?? `/api/assets/system/playlists/${slug}`;
  const isPlaying = Boolean(playingPath && miniAudio.playing);
  const hasActiveTrack = Boolean(playingPath);
  const showTrackPanel = Boolean(nowPlayingTitle) && (isPlaying || Boolean(versionSource));

  const displayCover = hasActiveTrack
    ? (playbackArt?.cover_url ?? coverUrl)
    : coverUrl;
  const displayAnim = isPlaying ? (playbackArt?.cover_animation_url ?? null) : null;
  const displayCanvas = isPlaying ? (playbackArt?.canvas_url ?? null) : null;
  const displayDisc = hasActiveTrack
    ? (playbackArt?.disc_url ?? DEFAULT_DISC_URL)
    : DEFAULT_DISC_URL;
  const showPanelCanvas = Boolean(displayCanvas) && isVideoMedia(displayCanvas);
  const panelCoverSrc = hasActiveTrack
    ? displayAnim && isVideoMedia(displayAnim)
      ? displayAnim
      : displayCover
    : coverUrl;
  const panelDiscSrc = displayDisc;
  const panelGroupKind = playbackArt?.group_kind ?? "disc";
  const isVinylPlayback = panelGroupKind === "side" || panelGroupKind === "vinyl";

  const bgUrl = playingPath
    ? (playbackArt?.background_layers?.[0] ??
      playbackArt?.cover_url ??
      displayCover ??
      coverUrl)
    : coverUrl;

  useEffect(() => {
    if (!bgUrl) return;
    const outgoing = prevBgRef.current;
    prevBgRef.current = bgUrl;
    if (outgoing === bgUrl) {
      setBgLayers({ current: bgUrl });
      return;
    }
    setBgLayers({ current: bgUrl, outgoing });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgUrl]);

  const themeSampleUrl = displayCover ?? coverUrl;

  useEffect(() => {
    if (!themeSampleUrl) return;
    void colorsFromImageUrl(themeSampleUrl).then((colors) => {
      if (colors) applyAlbumTheme(colors);
    });
  }, [themeSampleUrl]);

  useEffect(() => {
    if (!displayCanvas || !showPanelCanvas) return;
    const el = canvasVideoRef.current;
    if (!el) return;
    if (isPlaying) void el.play().catch(() => {});
    else el.pause();
  }, [displayCanvas, showPanelCanvas, isPlaying]);

  const resolvePlaybackArt = useCallback(
    async (path: string, releaseId?: string | null): Promise<ReleasePlaybackArt | null> => {
      const cached = sourceArtCacheRef.current.get(path);
      if (cached) return cached;
      if (!releaseId) return null;
      try {
        const res = await fetchTrackSourceArt(bandId, releaseId, path);
        const art = normalizePlaybackArt(res.playback);
        sourceArtCacheRef.current.set(path, art);
        return art;
      } catch {
        return null;
      }
    },
    [bandId]
  );

  const playAdjacentTrack = useCallback(
    (direction: "prev" | "next") => {
      if (!playingPath) return;
      const adj =
        slug === "setlists" && setlistRef.current
          ? setlistRef.current.adjacentTracks(playingPath)
          : tracklistRef.current?.adjacentTracks(playingPath);
      if (!adj) return;
      const target = direction === "prev" ? adj.prev : adj.next;
      if (!target?.play_path) return;
      const source = tracks.find((t) => t.play_path === target.play_path);
      void (async () => {
        setPlayingPath(target.play_path!);
        setNowPlayingTitle(target.title);
        const art = await resolvePlaybackArt(
          target.play_path!,
          target.navigate_release_id ?? source?.navigate_release_id
        );
        if (art) setPlaybackArt(art);
        try {
          const res = await playTrack({
            path: target.play_path!,
            artist_id: bandId,
            title: target.title,
          });
          miniAudio.loadSrc(res.stream_url, true);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [bandId, miniAudio, playingPath, resolvePlaybackArt, slug, tracks]
  );

  const handlePlayTrack = useCallback(
    async (
      path: string,
      title: string,
      art?: ReleasePlaybackArt,
      source?: ArtistPlaylistTrack,
      playbackKey?: string
    ) => {
      const sameSetlistPlayback =
        slug === "setlists" &&
        playbackKey != null &&
        setlistPlaybackKey === playbackKey;
      if (playingPath === path && miniAudio.src && (slug !== "setlists" || sameSetlistPlayback)) {
        if (!miniAudio.playing) {
          miniAudio.toggle();
          return;
        }
        return;
      }
      if (playbackKey) setSetlistPlaybackKey(playbackKey);
      setPlayingPath(path);
      setNowPlayingTitle(title);
      setVersionSource(null);
      if (stacked) setMobileTrackView("player");
      if (art) {
        const normalized = normalizePlaybackArt(art);
        setPlaybackArt(normalized);
        sourceArtCacheRef.current.set(path, normalized);
      } else {
        const resolved = await resolvePlaybackArt(
          path,
          source?.navigate_release_id ?? panelActionTrack?.navigate_release_id
        );
        if (resolved) setPlaybackArt(resolved);
      }
      try {
        const res = await playTrack({ path, artist_id: bandId, title });
        const restart =
          slug === "setlists" && playingPath === path && !sameSetlistPlayback;
        miniAudio.loadSrc(res.stream_url, true, { restart });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      void prefetchTrackCredits(
        source?.navigate_band_id ?? bandId,
        source?.navigate_release_id ?? "",
        title
      ).then((res) => {
        if (res?.writers?.length) setTrackWriters(res.writers);
      });
    },
    [
      bandId,
      miniAudio,
      panelActionTrack?.navigate_release_id,
      playingPath,
      resolvePlaybackArt,
      setlistPlaybackKey,
      slug,
      stacked,
    ]
  );

  useEffect(() => {
    if (!playingPath) return;
    const source = tracks.find((t) => t.play_path === playingPath);
    void resolvePlaybackArt(playingPath, source?.navigate_release_id).then((resolved) => {
      if (resolved) setPlaybackArt(resolved);
    });
  }, [playingPath, resolvePlaybackArt, tracks]);

  const playingTrack = useMemo(() => {
    if (playingPath && slug === "setlists" && panelActionTrack?.play_path === playingPath) {
      return panelActionTrack;
    }
    return playingPath ? (tracks.find((track) => track.play_path === playingPath) ?? null) : null;
  }, [panelActionTrack, playingPath, slug, tracks]);
  const creditsBandId = playingTrack?.navigate_band_id ?? bandId;

  useEffect(() => {
    if (!nowPlayingTitle || !panelActionTrack?.navigate_release_id) {
      setTrackWriters([]);
      return;
    }
    const releaseId = panelActionTrack.navigate_release_id;
    const cached = getCachedTrackCredits(creditsBandId, releaseId, nowPlayingTitle);
    if (cached) {
      setTrackWriters(cached.writers ?? []);
      return;
    }
    let cancelled = false;
    void prefetchTrackCredits(creditsBandId, releaseId, nowPlayingTitle).then((res) => {
      if (!cancelled) setTrackWriters(res.writers ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [bandId, creditsBandId, nowPlayingTitle, panelActionTrack?.navigate_release_id]);

  useEffect(() => {
    if (!panelActionTrack?.play_path || !nowPlayingTitle) {
      setPanelYoutubeVideos([]);
      return;
    }
    let cancelled = false;
    void fetchTrackYoutube(
      artistName,
      trackDisplayTitle(nowPlayingTitle),
      panelActionTrack.play_path,
      bandId
    ).then((res) => {
      if (cancelled) return;
      const fromList = (res.youtube_videos ?? []).filter((video) =>
        youtubeVideoId(video.url)
      );
      if (fromList.length > 0) {
        setPanelYoutubeVideos(fromList);
        return;
      }
      if (res.youtube_url && youtubeVideoId(res.youtube_url)) {
        setPanelYoutubeVideos([
          { url: res.youtube_url, label: "Official video", primary: true },
        ]);
        return;
      }
      setPanelYoutubeVideos([]);
    });
    return () => {
      cancelled = true;
    };
  }, [artistName, bandId, nowPlayingTitle, panelActionTrack?.play_path]);

  useEffect(() => {
    const el = miniAudio.audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (!playingPath) return;
      if (repeatOne) {
        el.currentTime = 0;
        void el.play().catch(() => {});
        return;
      }
      playAdjacentTrack("next");
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [miniAudio.audioRef, playAdjacentTrack, playingPath, repeatOne]);

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

  const panelVideos = panelYoutubeVideos;

  const hidePerformerName =
    slug === "appearances" || slug === "features" ? artistName : undefined;
  const hideCoverArtist = slug === "tributes" ? artistName : undefined;
  const trackPanelMeta = nowPlayingTitle
    ? parseTrackPanelMeta(nowPlayingTitle, {
        hidePerformer: hidePerformerName,
        hideCoverArtist,
      })
    : null;
  const panelWriters = useMemo(() => {
    if (trackWriters.length > 0) return trackWriters;
    if (slug === "writing-credits" && nowPlayingTitle) return [artistName];
    return [];
  }, [artistName, nowPlayingTitle, slug, trackWriters]);
  const brandDateIso =
    panelDateIso ?? versionSource?.date_iso ?? playingTrack?.release_date ?? null;
  const trackPerformerName = useMemo(() => {
    const line = trackPanelMeta?.lines.find((entry) => entry.kind === "performer");
    if (!line || line.kind !== "performer") return null;
    return primaryArtistName(line.artist);
  }, [trackPanelMeta]);

  useEffect(() => {
    let cancelled = false;

    async function loadPanelBrand() {
      const applyOverview = (
        targetBandId: number,
        name: string,
        overviewData: BandOverview | null,
        inLibrary: boolean
      ) => {
        const branding = eraBrandingFromOverview(overviewData, brandDateIso);
        setPanelBrand({
          bandId: targetBandId,
          name: overviewData?.name ?? name,
          iconUrl: branding.iconUrl,
          logoUrl: branding.logoUrl,
          inLibrary,
        });
      };

      if (showTrackPanel && trackPerformerName) {
        const performerName = trackPerformerName;
        try {
          const resolved = await resolveArtistName(performerName);
          if (cancelled) return;
          if (resolved.band_id) {
            const performerOverview = await prefetchBandOverview(resolved.band_id, "landscape");
            if (cancelled) return;
            applyOverview(
              resolved.band_id,
              resolved.name || performerName,
              performerOverview,
              true
            );
            return;
          }
          setPanelBrand({
            bandId,
            name: performerName,
            iconUrl: null,
            logoUrl: null,
            inLibrary: false,
          });
        } catch {
          if (!cancelled) {
            setPanelBrand({
              bandId,
              name: performerName,
              iconUrl: null,
              logoUrl: null,
              inLibrary: false,
            });
          }
        }
        return;
      }

      try {
        const pageOverview = await prefetchBandOverview(bandId, "landscape");
        if (cancelled) return;
        applyOverview(bandId, pageOverview.name, pageOverview, true);
      } catch {
        if (!cancelled) {
          const cached = getCachedOverview(bandId, "landscape");
          const branding = eraBrandingFromOverview(cached, brandDateIso);
          setPanelBrand({
            bandId,
            name: cached?.name ?? artistName,
            iconUrl: branding.iconUrl,
            logoUrl: branding.logoUrl,
            inLibrary: true,
          });
        }
      }
    }

    void loadPanelBrand();
    return () => {
      cancelled = true;
    };
  }, [
    artistName,
    bandId,
    brandDateIso,
    showTrackPanel,
    trackPerformerName,
  ]);

  const panelBrandName =
    panelBrand?.name ??
    (trackPerformerName && showTrackPanel ? trackPerformerName : artistName);
  const panelBrandIconUrl = panelBrand?.iconUrl ?? null;
  const panelBrandLogoUrl = panelBrand?.logoUrl ?? null;

  const openPanelBrand = useCallback(() => {
    if (!panelBrand) return;
    if (panelBrand.inLibrary && onOpenArtist) {
      onOpenArtist(panelBrand.bandId);
      return;
    }
    void openPersonName(panelBrandName);
  }, [onOpenArtist, openPersonName, panelBrand, panelBrandName]);

  const trackPanelReleaseDate =
    versionSource?.display_date ??
    (versionSource?.date_iso ? formatTrackDate(versionSource.date_iso) : null) ??
    (slug !== "setlists" && panelDateIso ? formatTrackDate(panelDateIso) : null) ??
    ((playingTrack as ArtistPlaylistTrack | null)?.release_date
      ? formatTrackDate((playingTrack as ArtistPlaylistTrack).release_date!)
      : null) ??
    null;

  const pageClass = [
    "release-page",
    stacked ? "release-page--stacked" : "",
    mobileLandscape ? "release-page--mobile-landscape" : "",
    tabletLayout ? "release-page--tablet" : "",
    tabletPortrait ? "release-page--tablet-portrait" : "",
    stacked && mobileTrackView === "player" ? "release-page--track-player" : "",
    stacked && mobileTrackView === "tracks" ? "release-page--track-tracks" : "",
    beatActive ? "release-page--beat-ready" : "",
    isPlaying ? "release-page--playing" : "",
    hasActiveTrack && isVinylPlayback ? "release-page--vinyl" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
      versionSource?: typeof versionSource;
    }) => {
      setPanelActionTrack(track);
      setShowLyricsAction(showLyrics);
      setShowVersionsAction(showVersions);
      setPanelDateIso(dateIso ?? null);
      setVersionSource(src ?? null);
      if (track?.title) setNowPlayingTitle(track.title);
    },
    []
  );

  const applySetlistPanelTrack = useCallback(
    (track: ReleaseTrackItem) => {
      const source = track as ArtistPlaylistTrack;
      const version = playlistTrackVersionSource(source, bandId);
      handlePanelActionsChange({
        track,
        showLyrics: Boolean(source.navigate_release_id),
        showVersions: Boolean(source.navigate_release_id),
        panelDateIso: source.release_date ?? null,
        versionSource: version,
      });
    },
    [bandId, handlePanelActionsChange]
  );

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

  const panelFadedCover = displayCover ?? coverUrl;

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
            className={`release-page__bg release-page__bg--visible${
              bgLayers.outgoing ? " release-page__bg--in" : ""
            }`}
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
              onClick={onBack}
              aria-label="Back to Playlists"
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
              <span>Playlists</span>
            </button>
          </div>
          <div className="release-page__top-center">
            <span className="release-page__title-center">
              {detail.name.toLocaleUpperCase()}
            </span>
          </div>
          <div className="release-page__top-right">
            <MediaInlineSearch
              mode="artist-releases"
              bandId={bandId}
              onSelectRelease={(releaseId) => onOpenRelease?.(bandId, releaseId)}
              onSelectTrack={(path, title) => {
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
            />
          </div>
        </header>

        {stacked && (
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
      </div>

      {error && (
        <p className="release-page__status release-page__status--error" role="alert">
          {error}
        </p>
      )}

      <div className="release-page__body">
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
                key={displayCanvas ?? undefined}
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
              <div
                className={`release-page__art-stage${
                  panelCoverSrc && isVideoMedia(panelCoverSrc) && isPlaying
                    ? " release-page__art-stage--video"
                    : ""
                }`}
              >
                {panelCoverSrc &&
                  (panelCoverSrc && isVideoMedia(panelCoverSrc) && isPlaying ? (
                    <span className="release-page__cover-wrap">
                      <video
                        key={panelCoverSrc}
                        src={panelCoverSrc}
                        className="release-page__cover release-page__cover--video"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    </span>
                  ) : (
                    <span className="release-page__cover-wrap">
                      <img
                        src={panelCoverSrc}
                        alt=""
                        className="release-page__cover"
                        draggable={false}
                      />
                    </span>
                  ))}
                <img
                  src={panelDiscSrc}
                  alt=""
                  className={`release-page__disc${
                    playingPath && miniAudio.playing ? " release-page__disc--spin" : ""
                  }${playingPath && !miniAudio.playing ? " release-page__disc--spin-paused" : ""}`}
                  draggable={false}
                />
              </div>
            </div>

            <div className="release-page__panel-meta">
              <div className="release-page__panel-fit">
                <div className="release-page__panel-fit-inner">
                  <div className="release-page__panel-body">
                    <div className="release-page__brand-row">
                      {panelBrandIconUrl || panelBrandLogoUrl ? (
                        <button
                          type="button"
                          className="release-page__artist-link release-page__brand-row-btn"
                          onClick={openPanelBrand}
                          aria-label={`Open ${panelBrandName}`}
                        >
                          {panelBrandIconUrl && (
                            <MediaBeatFrame variant="logo">
                              <img
                                src={panelBrandIconUrl}
                                alt=""
                                className="release-page__meta-icon"
                              />
                            </MediaBeatFrame>
                          )}
                          {panelBrandLogoUrl && (
                            <MediaBeatFrame variant="logo">
                              <img
                                src={panelBrandLogoUrl}
                                alt=""
                                className="release-page__meta-logo"
                              />
                            </MediaBeatFrame>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`release-page__artist-link release-page__artist-link--text${
                            showTrackPanel && trackPerformerName
                              ? " release-page__artist-link--brand-name"
                              : ""
                          }`}
                          onClick={openPanelBrand}
                        >
                          {showTrackPanel && trackPerformerName
                            ? panelBrandName.toLocaleUpperCase()
                            : panelBrandName}
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
                        {slug === "setlists" && setlistTourName && showTrackPanel && (
                          <p className="release-page__track-panel-line">{setlistTourName}</p>
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
                            Taken from{" "}
                            {onOpenRelease ? (
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
                            ) : (
                              versionSource.album_title
                            )}
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
                                      {j > 0 &&
                                        (j === line.artists.length - 1 ? " and " : ", ")}
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
                        {panelWriters.length > 0 && (
                          <p className="release-page__track-panel-writers">
                            Written by{" "}
                            {panelWriters.map((name, i) => (
                              <span key={name}>
                                {i > 0 && (i === panelWriters.length - 1 ? " and " : ", ")}
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
                        {typeof playingTrack?.play_count === "number" &&
                          playingTrack.play_count > 0 && (
                            <p className="release-page__track-panel-line">
                              {playingTrack.play_count.toLocaleString()} reproduction
                              {playingTrack.play_count === 1 ? "" : "s"}
                            </p>
                          )}
                      </div>
                    ) : (
                      <div className="release-page__panel-head">
                        <h1 className="release-page__album-title">{detail.name}</h1>
                        <p className="release-page__type-line">
                          {slug === "setlists"
                            ? setlistTrackCount != null
                              ? `Playlist · ${setlistTrackCount} track${setlistTrackCount === 1 ? "" : "s"}`
                              : "Playlist"
                            : `Playlist · ${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
                        </p>
                        {detail.description && (
                          <p className="release-page__source">{detail.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="release-page__panel-bottom">
                {panelActionTrack && (
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
                      <div ref={youtubePickerRef} className="release-page__youtube-picker-wrap">
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
                              openYoutubeFullscreen(panelVideos[0]!.url);
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
                                onClick={() => openYoutubeFullscreen(video.url)}
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
                      playing={miniAudio.playing}
                      progress={miniAudio.progress}
                      duration={miniAudio.duration}
                      toggle={miniAudio.toggle}
                      seek={miniAudio.seek}
                      onPrev={() => playAdjacentTrack("prev")}
                      onNext={() => playAdjacentTrack("next")}
                      repeatOne={repeatOne}
                      onRepeatToggle={() => setRepeatOne((r) => !r)}
                    />
                  </div>
                  <div className="release-page__panel-bottom-bar">
                    {detail.prev ? (
                      <PlaylistNeighborLink
                        neighbor={{ id: detail.prev.slug, title: detail.prev.name }}
                        direction="prev"
                        onClick={() => onOpenPlaylist(detail.prev!.slug)}
                      />
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                    {detail.next ? (
                      <PlaylistNeighborLink
                        neighbor={{ id: detail.next.slug, title: detail.next.name }}
                        direction="next"
                        onClick={() => onOpenPlaylist(detail.next!.slug)}
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

        <main className="release-page__main">
          <div className="release-page__tracklist-pane">
            {slug === "setlists" ? (
              <SetlistsPlaylistContent
                ref={setlistRef}
                bandId={bandId}
                years={detail.years ?? []}
                playingPath={playingPath}
                onPlay={(path, title, playbackKey, track) => {
                  void handlePlayTrack(
                    path,
                    title,
                    undefined,
                    track as ArtistPlaylistTrack | undefined,
                    playbackKey
                  );
                  if (track) applySetlistPanelTrack(track);
                }}
                onPanelTrack={applySetlistPanelTrack}
                onContextChange={({ tourName, trackCount, setlistId }) => {
                  setSetlistTourName(tourName);
                  setSetlistTrackCount(trackCount);
                  if (setlistId !== setlistPlaybackKey?.split(":")[0]) {
                    setSetlistPlaybackKey(null);
                  }
                }}
              />
            ) : (
              <SystemPlaylistTracklist
                key={slug}
                ref={tracklistRef}
                bandId={bandId}
                artistName={artistName}
                tracks={tracks}
                stacked={stacked}
                compactLyricsHead={stacked || tabletPortrait}
                playingPath={playingPath}
                playbackProgress={miniAudio.progress}
                mobileView={mobileTrackView}
                mobileBackdropUrl={displayCover}
                onPlay={(path, title, art, track) =>
                  void handlePlayTrack(path, title, art, track)
                }
                onPanelActionsChange={handlePanelActionsChange}
                isAdmin={isAdmin}
                hidePerformer={hidePerformerName}
                hideCoverArtist={hideCoverArtist}
              />
            )}
          </div>
        </main>
      </div>

      <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
    </div>
  );
}
