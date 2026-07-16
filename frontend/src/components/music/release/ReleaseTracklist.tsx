import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchTrackLyrics,
  fetchTrackVersions,
} from "../../../api";
import { prefetchReleaseTrackCredits } from "../../../releaseTrackCreditsCache";
import {
  clearReleaseTracklistCache as clearTracklistCache,
  getCachedReleaseTracklist,
  prefetchReleaseTracklist as prefetchTracklist,
} from "../../../releaseTracklistCache";
import { invalidateWordCloud } from "../../../wordCloudInvalidation";
import type {
  ReleaseEdition,
  ReleaseTrackGroup,
  ReleaseTrackItem,
  ReleaseTracklist,
  TrackVersionItem,
} from "../../../types";
import BillboardText from "../../BillboardText";
import { IconVideo } from "../../MenuIcons";
import { ReleaseTrackTitle } from "./releaseTrackTitle";
import ReleaseAddToPlaylistModal from "./ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "./ReleaseInlineLyrics";
import ReleaseLyricsEditModal from "./ReleaseLyricsEditModal";
import LyricsStatusBadge from "./LyricsStatusBadge";
import { ChevronIcon, parseTrackPanelMeta, trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import { TrackActionEditIcon, TrackActionRetryIcon } from "./releaseTrackActionIcons";

function openVideoTrack(track: ReleaseTrackItem) {
  const url =
    track.open_url ||
    (track.play_path
      ? `/api/media/file?path=${encodeURIComponent(track.play_path)}`
      : null);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export {
  clearReleaseTracklistCache,
  prefetchReleaseTracklist,
} from "../../../releaseTracklistCache";

function groupBsideGroups(groups: ReleaseTrackGroup[]) {
  const order: string[] = [];
  const map = new Map<string, ReleaseTrackGroup[]>();
  for (const group of groups) {
    const key = (group.single_title ?? group.label ?? group.id).trim();
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(group);
  }
  return order.map((singleTitle) => ({
    singleTitle,
    groups: map.get(singleTitle)!,
    showSingleHeader: (map.get(singleTitle)?.length ?? 0) > 1,
  }));
}

export type ReleasePlaybackArt = {
  cover_url?: string | null;
  cover_animation_url?: string | null;
  canvas_url?: string | null;
  disc_url?: string | null;
  group_kind?: "disc" | "side" | "tape" | null;
  background_layers?: string[];
};

export type ReleaseMobileTrackView = "player" | "tracks";
export type ReleaseRightView = "tracks" | "lyrics" | "versions";

export type ReleaseTracklistHandle = {
  openLyrics: (track: ReleaseTrackItem) => void;
  openVersions: (track: ReleaseTrackItem) => void;
  openPlus: (track: ReleaseTrackItem) => void;
  adjacentTracks: (path: string) => {
    prev: ReleaseTrackItem | null;
    next: ReleaseTrackItem | null;
  };
  allTracks: () => ReleaseTrackItem[];
  findTrackContext: (path: string) => {
    track: ReleaseTrackItem;
    edition: ReleaseEdition;
    group: ReleaseTrackGroup;
    art: ReleasePlaybackArt;
    editionIndex: number;
  } | null;
};

function stripBracketSuffix(text: string): string {
  return text.replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s+/g, " ").trim();
}

function isStandardEdition(label: string): boolean {
  const low = label.toLowerCase().trim();
  return low === "standard edition" || low === "standard";
}

function sourceAlbumDisplayTitle(title: string): string {
  const trimmed = title.trim();
  const sep = trimmed.lastIndexOf(": ");
  if (sep < 0) return trimmed;
  const edition = trimmed.slice(sep + 2).trim();
  if (isStandardEdition(edition)) return trimmed.slice(0, sep).trim();
  return trimmed;
}

function TrackExclusiveBadge() {
  return (
    <span
      className="release-tracklist__badge release-tracklist__badge--exclusive"
      title="Previously unreleased on this release"
      aria-label="Previously unreleased on this release"
    >
      <span className="release-tracklist__badge-label release-tracklist__badge-label--full">
        Exclusive
      </span>
      <span className="release-tracklist__badge-label release-tracklist__badge-label--short">
        New
      </span>
    </span>
  );
}

function bsideSourceFromGroup(
  group: ReleaseTrackGroup,
  bandId: number
): {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
  is_single?: boolean;
} | null {
  const title = group.source_single_title?.trim();
  const navId = group.navigate_release_id?.trim();
  if (!title || !navId) return null;
  return {
    album_title: title,
    navigate_release_id: navId,
    navigate_band_id: bandId,
    date_iso: group.date_iso ?? null,
    display_date: group.display_date ?? null,
    is_single: true,
  };
}

function linkSourceFromTrack(
  track: ReleaseTrackItem | null | undefined
): {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
} | null {
  if (!track?.is_link) return null;
  const title = sourceAlbumDisplayTitle(track.source_album_title?.trim() ?? "");
  const navId = track.navigate_release_id?.trim();
  if (!title || !navId) return null;
  return {
    album_title: title,
    navigate_release_id: navId,
    navigate_band_id: track.navigate_band_id ?? undefined,
    date_iso: track.source_date_iso ?? null,
    display_date: track.source_display_date ?? null,
  };
}

function versionSourceFromItem(
  version: TrackVersionItem,
  releaseId: string,
  releaseNavigateId: string | null | undefined,
  anchorPath?: string | null
): {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
} | null {
  if (anchorPath && version.play_path === anchorPath) return null;
  const navId = version.navigate_release_id?.trim();
  if (!navId) return null;

  const editionTitle = stripBracketSuffix(version.edition_title?.trim() ?? "");
  const releaseTitle = stripBracketSuffix(version.album_title?.trim() ?? "");
  const showEdition =
    Boolean(editionTitle) &&
    editionTitle.toLowerCase() !== releaseTitle.toLowerCase() &&
    !isStandardEdition(editionTitle);
  const label = showEdition
    ? releaseTitle
      ? `${releaseTitle}: ${editionTitle}`
      : editionTitle
    : releaseTitle || null;
  if (!label) return null;
  return {
    album_title: label,
    navigate_release_id: navId,
    navigate_band_id: version.navigate_band_id ?? undefined,
    date_iso: version.date_iso,
    display_date: version.display_date ?? null,
  };
}

type Props = {
  bandId: number;
  releaseId: string;
  releaseNavigateId?: string | null;
  artistName: string;
  releaseTitle: string;
  stacked: boolean;
  compactLyricsHead?: boolean;
  playingPath: string | null;
  playbackProgress?: number;
  mobileView: ReleaseMobileTrackView;
  onMobileViewChange: (view: ReleaseMobileTrackView) => void;
  onPlay: (
    path: string,
    title: string,
    art?: ReleasePlaybackArt,
    editionLabel?: string | null
  ) => void;
  onActiveTrackChange?: (track: ReleaseTrackItem | null) => void;
  onPanelActionsChange?: (state: {
    track: ReleaseTrackItem | null;
    showLyrics: boolean;
    showVersions: boolean;
    panelDateIso?: string | null;
    versionSource?: {
      album_title: string;
      navigate_release_id: string;
      navigate_band_id?: number;
      date_iso?: string | null;
      display_date?: string | null;
      is_single?: boolean;
    } | null;
  }) => void;
  onResumeTrack?: (path: string) => void;
  onRightViewChange?: (view: ReleaseRightView) => void;
  mobileBackdropUrl?: string | null;
  reloadKey?: number;
  isAdmin?: boolean;
  onOpenLyricsSet?: () => void;
};

function trackArt(
  track: ReleaseTrackItem,
  edition: ReleaseEdition,
  groupDisc?: string | null
): ReleasePlaybackArt {
  const trackLayers = track.background_layers;
  const hasTrackArt = Boolean(
    trackLayers?.length ||
      track.canvas_url ||
      track.cover_animation_url ||
      (track.cover_url && track.cover_url !== edition.cover_url)
  );

  if (hasTrackArt) {
    return {
      cover_url: track.cover_url ?? edition.cover_url ?? null,
      cover_animation_url: track.cover_animation_url ?? edition.cover_animation_url ?? null,
      canvas_url: track.canvas_url ?? edition.canvas_url ?? null,
      disc_url: track.disc_url ?? groupDisc ?? edition.disc_url ?? null,
      background_layers:
        trackLayers && trackLayers.length > 0 ? trackLayers : edition.background_layers,
    };
  }

  const useEditionArt = edition.kind === "bside" || edition.kind === "single";
  const cover = track.cover_url ?? edition.cover_url ?? null;
  const background_layers = useEditionArt
    ? track.cover_url
      ? [
          track.cover_url,
          ...(edition.background_layers ?? []).filter((url) => url !== track.cover_url),
        ]
      : edition.background_layers
    : edition.background_layers;
  return {
    cover_url: cover,
    cover_animation_url: track.cover_animation_url ?? edition.cover_animation_url ?? null,
    canvas_url: track.canvas_url ?? edition.canvas_url ?? null,
    disc_url: track.disc_url ?? groupDisc ?? edition.disc_url ?? null,
    background_layers,
  };
}

function versionPlaybackArt(version: TrackVersionItem): ReleasePlaybackArt {
  return {
    cover_url: version.cover_url,
    cover_animation_url: version.cover_animation_url ?? null,
    canvas_url: version.canvas_url ?? null,
    disc_url: version.disc_url ?? null,
    background_layers: version.background_layers,
  };
}

function versionToTrackItem(version: TrackVersionItem): ReleaseTrackItem {
  return {
    id: version.play_path,
    number: 0,
    title: version.title,
    play_path: version.play_path,
    duration_sec: null,
    duration: version.duration ?? null,
    has_lrc: false,
    has_synced_lrc: false,
    is_link: false,
    cover_url: version.cover_url,
    cover_animation_url: version.cover_animation_url,
    canvas_url: version.canvas_url,
    disc_url: version.disc_url,
    background_layers: version.background_layers,
  };
}

const ReleaseTracklist = forwardRef<ReleaseTracklistHandle, Props>(function ReleaseTracklist(
  {
    bandId,
    releaseId,
    releaseNavigateId,
    artistName,
    releaseTitle,
    stacked,
    compactLyricsHead = false,
    playingPath,
    playbackProgress = 0,
    mobileView,
    onMobileViewChange,
    onPlay,
    onActiveTrackChange,
    onPanelActionsChange,
    onResumeTrack,
    onRightViewChange,
    mobileBackdropUrl,
    reloadKey = 0,
    isAdmin = false,
    onOpenLyricsSet,
  },
  ref
) {
  const onActiveTrackChangeRef = useRef(onActiveTrackChange);
  const onPanelActionsChangeRef = useRef(onPanelActionsChange);
  onActiveTrackChangeRef.current = onActiveTrackChange;
  onPanelActionsChangeRef.current = onPanelActionsChange;
  const [data, setData] = useState<ReleaseTracklist | null>(() =>
    getCachedReleaseTracklist(bandId, releaseId)
  );
  const [loading, setLoading] = useState(
    () => !getCachedReleaseTracklist(bandId, releaseId)
  );
  const [error, setError] = useState<string | null>(null);
  const [rightView, setRightView] = useState<ReleaseRightView>("tracks");
  const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
  const [versions, setVersions] = useState<TrackVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);
  const [lyricsEditOpen, setLyricsEditOpen] = useState(false);
  const [versionsReturnPath, setVersionsReturnPath] = useState<string | null>(null);
  const [playingVersionPath, setPlayingVersionPath] = useState<string | null>(null);
  const [activeVersionSource, setActiveVersionSource] = useState<{
    album_title: string;
    navigate_release_id: string;
  } | null>(null);
  const lyricsRequestRef = useRef(0);

  const setView = useCallback(
    (view: ReleaseRightView) => {
      setRightView(view);
      onRightViewChange?.(view);
    },
    [onRightViewChange]
  );

  const load = useCallback(
    async (force = false) => {
      const cached = !force ? getCachedReleaseTracklist(bandId, releaseId) : null;
      if (cached) {
        setData(cached);
        setView("tracks");
        setLoading(false);
        setError(null);
        prefetchTracklist(bandId, releaseId, { force: true })
          .then((fresh) => {
            setData(fresh);
            setView("tracks");
          })
          .catch(() => {});
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await prefetchTracklist(bandId, releaseId, { force: true });
        setData(payload);
        setView("tracks");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [bandId, releaseId, setView]
  );

  useEffect(() => {
    if (reloadKey > 0) {
      clearTracklistCache(bandId, releaseId);
    }
    void load(reloadKey > 0);
  }, [load, reloadKey, bandId, releaseId]);

  useEffect(() => {
    if (!data) return;
    const titles = data.editions.flatMap((edition) =>
      edition.groups.flatMap((group) => group.tracks.map((track) => track.title))
    );
    prefetchReleaseTrackCredits(bandId, releaseId, titles);
  }, [data, bandId, releaseId]);

  const allTracksFlat = useMemo(() => {
    if (!data) return [] as ReleaseTrackItem[];
    return data.editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
  }, [data]);

  const trackContexts = useMemo(() => {
    if (!data) return [] as Array<{
      track: ReleaseTrackItem;
      edition: ReleaseEdition;
      group: ReleaseTrackGroup;
      editionIndex: number;
      groupDisc?: string | null;
      groupDateIso?: string | null;
    }>;
    return data.editions.flatMap((ed, editionIndex) =>
      ed.groups.flatMap((group) =>
        group.tracks.map((track) => ({
          track,
          edition: ed,
          group,
          editionIndex,
          groupDisc: group.disc_url,
          groupDateIso: group.date_iso ?? null,
        }))
      )
    );
  }, [data]);

  const resolvePanelDateIso = useCallback(
    (path: string | null) => {
      if (!path) return null;
      const ctx = trackContexts.find((c) => c.track.play_path === path);
      if (!ctx) return null;
      if (ctx.edition.date_iso) return ctx.edition.date_iso;
      if (ctx.groupDateIso) return ctx.groupDateIso;
      return null;
    },
    [trackContexts]
  );


  const editionSectionLabel = (edition: ReleaseEdition) => {
    if (edition.kind === "bside") return "B-sides";
    return edition.label;
  };

  const shouldShowEditionHeader = (edition: ReleaseEdition) => {
    if (edition.kind === "bside") return true;
    if (edition.unresolved || edition.is_link) return true;
    return data ? data.editions.length > 1 : false;
  };

  const resolveTrackContext = useCallback(
    (path: string) => {
      const match = trackContexts.find((ctx) => ctx.track.play_path === path);
      if (!match) return null;
      return {
        track: match.track,
        edition: match.edition,
        group: match.group,
        art: trackArt(match.track, match.edition, match.groupDisc),
        editionIndex: match.editionIndex,
      };
    },
    [trackContexts]
  );

  useEffect(() => {
    if (!onActiveTrackChangeRef.current) return;
    const current = resolveTrackContext(playingPath ?? "")?.track ?? null;
    onActiveTrackChangeRef.current(current);
  }, [playingPath, resolveTrackContext]);

  useEffect(() => {
    const onPanelActionsChange = onPanelActionsChangeRef.current;
    if (!onPanelActionsChange) return;

    const versionSourceForPath = (path: string | null) => {
      if (!path) return null;
      if (activeVersionSource && path === playingVersionPath) {
        return activeVersionSource;
      }
      const version = versions.find((v) => v.play_path === path);
      if (!version) return null;
      return versionSourceFromItem(
        version,
        releaseId,
        releaseNavigateId,
        versionsTrack?.play_path ?? null
      );
    };

    if (rightView === "lyrics") {
      const ctx = resolveTrackContext(playingPath ?? "");
      const bsideSource =
        ctx?.edition.kind === "bside"
          ? bsideSourceFromGroup(ctx.group, bandId)
          : null;
      onPanelActionsChange({
        track: lyricsTrack ?? ctx?.track ?? null,
        showLyrics: false,
        showVersions: true,
        panelDateIso: bsideSource?.date_iso ?? resolvePanelDateIso(playingPath ?? null),
        versionSource:
          bsideSource ??
          linkSourceFromTrack(lyricsTrack ?? ctx?.track) ??
          versionSourceForPath(playingPath ?? null),
      });
      return;
    }

    if (rightView === "versions") {
      if (playingVersionPath) {
        const version = versions.find((v) => v.play_path === playingVersionPath);
        onPanelActionsChange({
          track: version ? versionToTrackItem(version) : versionsTrack,
          showLyrics: true,
          showVersions: false,
          panelDateIso: null,
          versionSource: versionSourceForPath(playingVersionPath),
        });
        return;
      }
      onPanelActionsChange({
        track: versionsTrack,
        showLyrics: true,
        showVersions: false,
        panelDateIso: null,
        versionSource: null,
      });
      return;
    }

    const current = resolveTrackContext(playingPath ?? "");
    const bsideSource =
      current?.edition.kind === "bside"
        ? bsideSourceFromGroup(current.group, bandId)
        : null;
    onPanelActionsChange({
      track: current?.track ?? null,
      showLyrics: true,
      showVersions: true,
      panelDateIso: bsideSource?.date_iso ?? resolvePanelDateIso(playingPath ?? null),
      versionSource:
        bsideSource ??
        linkSourceFromTrack(current?.track) ??
        versionSourceForPath(playingPath ?? null),
    });
  }, [
    playingPath,
    playingVersionPath,
    rightView,
    lyricsTrack,
    resolveTrackContext,
    resolvePanelDateIso,
    bandId,
    versions,
    versionsTrack,
    releaseId,
    releaseNavigateId,
    activeVersionSource,
  ]);

  const loadLyricsForTrack = useCallback(
    (track: ReleaseTrackItem, options?: { switchView?: boolean; retry?: boolean }) => {
      const requestId = ++lyricsRequestRef.current;
      setLyricsTrack(track);
      setLyricsText(null);
      setSyncedLyrics(null);
      if (options?.switchView !== false) {
        setView("lyrics");
      }

      setLyricsLoading(true);

      const applyResult = (res: {
        lyrics: string | null;
        synced_lyrics?: string | null;
      }) => {
        if (requestId !== lyricsRequestRef.current) return;
        setLyricsText(res.lyrics);
        setSyncedLyrics(res.synced_lyrics ?? null);
      };

      void (async () => {
        try {
          const lyricsTitle = trackMainTitle(track.title);
          let res = await fetchTrackLyrics(artistName, lyricsTitle, track.play_path, {
            bandId,
            releaseId,
          });
          if (!res.lyrics && !options?.retry) {
            await new Promise((resolve) => window.setTimeout(resolve, 700));
            if (requestId !== lyricsRequestRef.current) return;
            res = await fetchTrackLyrics(artistName, lyricsTitle, track.play_path, {
              bandId,
              releaseId,
            });
          }
          applyResult(res);
        } catch {
          if (requestId !== lyricsRequestRef.current) return;
        } finally {
          if (requestId !== lyricsRequestRef.current) return;
          setLyricsLoading(false);
        }
      })();
    },
    [artistName, bandId, releaseId, setView]
  );

  const openLyrics = (track: ReleaseTrackItem) => {
    loadLyricsForTrack(track);
  };

  useEffect(() => {
    if (rightView !== "lyrics" || !playingPath) return;
    const ctx = resolveTrackContext(playingPath);
    if (!ctx) return;
    if (lyricsTrack?.play_path === ctx.track.play_path) return;
    loadLyricsForTrack(ctx.track, { switchView: false });
  }, [playingPath, rightView, resolveTrackContext, lyricsTrack?.play_path, loadLyricsForTrack]);

  const playMainTrackByPath = useCallback(
    (path: string) => {
      const match = trackContexts.find((ctx) => ctx.track.play_path === path);
      if (!match) return;
      setPlayingVersionPath(null);
      setActiveVersionSource(null);
      const art = trackArt(match.track, match.edition, match.groupDisc);
      onPlay(match.track.play_path, match.track.title, art, match.edition.label);
    },
    [trackContexts, onPlay]
  );

  const openVersions = (track: ReleaseTrackItem) => {
    setVersionsReturnPath(track.play_path);
    setPlayingVersionPath(null);
    setActiveVersionSource(null);
    setVersionsTrack(track);
    setVersions([]);
    setVersionsError(null);
    setView("versions");
    setVersionsLoading(true);
    void fetchTrackVersions(bandId, releaseId, track.title, track.play_path)
      .then((res) =>
        setVersions(
          [...res.versions].sort((a, b) =>
            (a.date_iso || "9999-12-31").localeCompare(b.date_iso || "9999-12-31")
          )
        )
      )
      .catch((e) => {
        setVersionsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setVersionsLoading(false));
  };

  const handleBack = useCallback(() => {
    if (rightView === "versions") {
      const returnPath = versionsReturnPath;
      setPlayingVersionPath(null);
      setActiveVersionSource(null);
      setVersionsReturnPath(null);
      setView("tracks");
      if (returnPath) {
        playMainTrackByPath(returnPath);
      } else {
        onPanelActionsChangeRef.current?.({
          track: null,
          showLyrics: true,
          showVersions: true,
          versionSource: null,
        });
      }
      return;
    }
    setView("tracks");
  }, [playMainTrackByPath, rightView, setView, versionsReturnPath]);

  const adjacentTracks = useCallback(
    (path: string) => {
      const tracks = allTracksFlat.filter((t) => !t.is_video);
      const idx = tracks.findIndex((t) => t.play_path === path);
      if (idx < 0 || tracks.length === 0) return { prev: null, next: null };
      return {
        prev: tracks[(idx - 1 + tracks.length) % tracks.length],
        next: tracks[(idx + 1) % tracks.length],
      };
    },
    [allTracksFlat]
  );

  useImperativeHandle(
    ref,
    () => ({
      openLyrics: (track) => openLyrics(track),
      openVersions: (track) => openVersions(track),
      openPlus: (track) => setPlusTrack(track),
      adjacentTracks,
      allTracks: () => allTracksFlat,
      findTrackContext: (path) => resolveTrackContext(path),
    }),
    [adjacentTracks, allTracksFlat, resolveTrackContext]
  );

  if (loading && !data) {
    return <p className="muted release-tracklist__loading">Loading tracklist…</p>;
  }
  if (error) {
    return <p className="error release-tracklist__error">{error}</p>;
  }
  if (!data || allTracksFlat.length === 0) {
    return <p className="muted release-tracklist__empty">No tracks found.</p>;
  }

  const tracklistBody = (
    <div className="release-tracklist__content">
      {data.editions.map((ed) => (
          <section
            key={ed.id}
            className="release-tracklist__edition-block"
          >
            {shouldShowEditionHeader(ed) && (
              <h2
                className={`release-tracklist__edition-title${
                  ed.unresolved ? " release-tracklist__edition-title--unresolved" : ""
                }`}
              >
                {editionSectionLabel(ed)}
              </h2>
            )}

            {ed.unresolved && ed.groups.length === 0 && (
              <p className="release-tracklist__edition-empty muted">
                Original release not found in library.
              </p>
            )}

            {ed.kind === "bside"
              ? groupBsideGroups(ed.groups).map(({ singleTitle, groups, showSingleHeader }) => (
                  <div key={singleTitle} className="release-tracklist__bside-single">
                    {showSingleHeader && (
                      <h3 className="release-tracklist__single-title">{singleTitle}</h3>
                    )}
                    {groups.map((group) => {
                      const showEditionLabel =
                        showSingleHeader || groups.length > 1 || Boolean(group.label);
                      return (
                        <div key={group.id} className="release-tracklist__group">
                          {showEditionLabel && group.label && (
                            <h4 className="release-tracklist__group-label">{group.label}</h4>
                          )}
                          <ol className="release-tracklist__tracks">
                            {group.tracks.map((track) => {
                              const active = playingPath === track.play_path;
                              const art = trackArt(track, ed, group.disc_url);
                              return (
                                <li
                                  key={track.id}
                                  className={
                                    active ? "release-tracklist__row active" : "release-tracklist__row"
                                  }
                                >
                                  <button
                                    type="button"
                                    className="release-tracklist__play"
                                    onClick={() => {
                                      if (track.is_video) {
                                        openVideoTrack(track);
                                        return;
                                      }
                                      setPlayingVersionPath(null);
                                      setActiveVersionSource(null);
                                      const linkSource = linkSourceFromTrack(track);
                                      if (linkSource) setActiveVersionSource(linkSource);
                                      onPlay(track.play_path, track.title, art, ed.label);
                                      onPanelActionsChange?.({
                                        track,
                                        showLyrics: true,
                                        showVersions: true,
                                        panelDateIso:
                                          linkSource?.date_iso ??
                                          resolvePanelDateIso(track.play_path),
                                        versionSource: linkSource,
                                      });
                                    }}
                                    aria-label={
                                      track.is_video
                                        ? `Open video ${track.title}`
                                        : `Play ${track.title}`
                                    }
                                  >
                                    <span className="release-tracklist__num">{track.number}</span>
                                    <span className="release-tracklist__title-wrap">
                                      <ReleaseTrackTitle title={track.title} billboard={stacked} />
                                      {track.is_video && (
                                        <span
                                          className="release-tracklist__video-badge"
                                          title="Video"
                                        >
                                          <IconVideo />
                                        </span>
                                      )}
                                      {track.is_exclusive && <TrackExclusiveBadge />}
                                    </span>
                                    {track.duration && (
                                      <span className="release-tracklist__duration">{track.duration}</span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                ))
              : ed.groups.map((group) => {
              const showGroupLabels = ed.groups.length > 1;
              return (
              <div key={group.id} className="release-tracklist__group">
                {showGroupLabels && group.label && (
                  <h3 className="release-tracklist__group-label">{group.label}</h3>
                )}
                <ol className="release-tracklist__tracks">
                  {group.tracks.map((track) => {
                    const active = playingPath === track.play_path;
                    const art = trackArt(track, ed, group.disc_url);
                    return (
                      <li
                        key={track.id}
                        className={
                          active ? "release-tracklist__row active" : "release-tracklist__row"
                        }
                      >
                        <button
                          type="button"
                          className="release-tracklist__play"
                          onClick={() => {
                            if (track.is_video) {
                              openVideoTrack(track);
                              return;
                            }
                            setPlayingVersionPath(null);
                            setActiveVersionSource(null);
                            const linkSource = linkSourceFromTrack(track);
                            if (linkSource) setActiveVersionSource(linkSource);
                            onPlay(track.play_path, track.title, art, ed.label);
                            onPanelActionsChange?.({
                              track,
                              showLyrics: true,
                              showVersions: true,
                              panelDateIso:
                                linkSource?.date_iso ?? resolvePanelDateIso(track.play_path),
                              versionSource: linkSource,
                            });
                          }}
                          aria-label={
                            track.is_video
                              ? `Open video ${track.title}`
                              : `Play ${track.title}`
                          }
                        >
                          <span className="release-tracklist__num">{track.number}</span>
                          <span className="release-tracklist__title-wrap">
                            <ReleaseTrackTitle title={track.title} billboard={stacked} />
                            {track.is_video && (
                              <span
                                className="release-tracklist__video-badge"
                                title="Video"
                              >
                                <IconVideo />
                              </span>
                            )}
                            {track.is_exclusive && <TrackExclusiveBadge />}
                          </span>
                          {track.duration && (
                            <span className="release-tracklist__duration">{track.duration}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
              );
            })}
          </section>
      ))}
    </div>
  );

  const versionsTitle = versionsTrack
    ? `${parseTrackPanelMeta(versionsTrack.title).mainTitle} Versions`
    : "Versions";

  const lyricsBody = lyricsTrack && (
    <ReleaseInlineLyrics
      title={trackDisplayTitle(lyricsTrack.title)}
      lyrics={lyricsText}
      syncedLyrics={syncedLyrics}
      currentTime={playbackProgress}
      loading={lyricsLoading}
    />
  );

  const lyricsToolbar = lyricsTrack ? (
    <div className="release-tracklist__lyrics-toolbar">
      <button
        type="button"
        className="release-tracklist__back"
        onClick={handleBack}
        aria-label="Back to tracklist"
      >
        <ChevronIcon direction="left" />
      </button>
      <div className="release-tracklist__subview-actions">
        {!lyricsLoading && !lyricsText && !syncedLyrics && (
          <button
            type="button"
            className="release-tracklist__lyrics-retry"
            onClick={() =>
              loadLyricsForTrack(lyricsTrack, { switchView: false, retry: true })
            }
            disabled={lyricsLoading}
            title="Retry"
            aria-label="Retry"
          >
            <TrackActionRetryIcon className="release-tracklist__lyrics-retry-icon" />
          </button>
        )}
        {!lyricsLoading && syncedLyrics && (
          <LyricsStatusBadge
            synced
            iconOnly={compactLyricsHead}
            title="Timestamped synced lyrics"
          />
        )}
        {!lyricsLoading && lyricsText && !syncedLyrics && (
          <LyricsStatusBadge
            synced={false}
            iconOnly={compactLyricsHead}
            actionable={Boolean(isAdmin && onOpenLyricsSet)}
            onClick={onOpenLyricsSet}
            title={
              isAdmin && onOpenLyricsSet
                ? "Upload synced lyrics"
                : "Lyrics without timestamps"
            }
          />
        )}
        {isAdmin && !lyricsLoading && (
          <button
            type="button"
            className="release-tracklist__lyrics-edit"
            onClick={() => setLyricsEditOpen(true)}
            title={lyricsText || syncedLyrics ? "Edit lyrics" : "Add lyrics"}
            aria-label={lyricsText || syncedLyrics ? "Edit lyrics" : "Add lyrics"}
          >
            <TrackActionEditIcon className="release-tracklist__lyrics-edit-icon" />
          </button>
        )}
      </div>
    </div>
  ) : null;

  const versionsListBody = (
    <div className="release-tracklist__content">
      {versionsLoading && <p className="muted">Loading versions…</p>}
      {versionsError && <p className="error">{versionsError}</p>}
      {!versionsLoading && !versionsError && versions.length === 0 && (
        <p className="muted">No alternate versions found.</p>
      )}
      {versions.length > 0 && (
        <section className="release-tracklist__group">
          <ol className="release-tracklist__tracks">
            {versions.map((v, i) => {
              const active = playingPath === v.play_path;
              return (
                <li
                  key={v.play_path}
                  className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                >
                  <button
                    type="button"
                    className="release-tracklist__play"
                    onClick={() => {
                      const source = versionSourceFromItem(
                        v,
                        releaseId,
                        releaseNavigateId,
                        versionsTrack?.play_path ?? null
                      );
                      setPlayingVersionPath(v.play_path);
                      setActiveVersionSource(source);
                      onPlay(v.play_path, v.title, versionPlaybackArt(v));
                      if (onPanelActionsChange) {
                        onPanelActionsChange({
                          track: versionToTrackItem(v),
                          showLyrics: true,
                          showVersions: false,
                          versionSource: source,
                        });
                      }
                    }}
                  >
                    <span className="release-tracklist__num">{i + 1}</span>
                    <ReleaseTrackTitle title={v.title} billboard={stacked} />
                    {v.duration && (
                      <span className="release-tracklist__duration">{v.duration}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );

  return (
    <div
      className={`release-tracklist${stacked ? " release-tracklist--stacked" : ""}${
        rightView === "lyrics" ? " release-tracklist--lyrics" : ""
      }${
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
      <div className="release-tracklist__body">
          {rightView === "lyrics" && lyricsTrack && (
            <div className="release-tracklist__lyrics-view">
              {lyricsToolbar}
              {lyricsBody}
            </div>
          )}
          {rightView === "tracks" && tracklistBody}
          {rightView === "versions" && (
            <>
              <div className="release-tracklist__subview-head release-tracklist__subview-head--left">
                <button
                  type="button"
                  className="release-tracklist__back"
                  onClick={handleBack}
                  aria-label="Back to tracklist"
                >
                  <ChevronIcon direction="left" />
                </button>
                {stacked ? (
                  <BillboardText
                    className="release-tracklist__subview-title"
                    short={versionsTitle}
                    full={versionsTitle}
                  />
                ) : (
                  <h2 className="release-tracklist__subview-title">{versionsTitle}</h2>
                )}
              </div>
              {versionsListBody}
            </>
          )}
      </div>

      {plusTrack && (
        <ReleaseAddToPlaylistModal
          track={plusTrack}
          artistName={artistName}
          releaseTitle={releaseTitle}
          onClose={() => setPlusTrack(null)}
        />
      )}

      {lyricsEditOpen && lyricsTrack && (
        <ReleaseLyricsEditModal
          artistName={artistName}
          bandId={bandId}
          trackTitle={lyricsTrack.title}
          displayTitle={trackMainTitle(lyricsTrack.title)}
          playPath={lyricsTrack.play_path}
          initialLyrics={lyricsText ?? ""}
          onClose={() => setLyricsEditOpen(false)}
          onSaved={(text, synced) => {
            setLyricsText(text);
            setSyncedLyrics(synced);
            invalidateWordCloud(bandId);
          }}
        />
      )}
    </div>
  );
});

export default ReleaseTracklist;
