import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { fetchTrackLyrics, fetchTrackVersions, findPlaylistTrackInDisk, addTrackToPlaylist, removePlaylistTrack, reorderPlaylistTracks, searchLibraryTracks, type LibraryTrackSearchHit } from "../../../api";
import { formatTrackDate } from "../../../formatDate";
import type {
  ArtistPlaylistTrack,
  ReleaseTrackItem,
  TrackVersionItem,
} from "../../../types";
import { ReleaseTrackTitle } from "../release/releaseTrackTitle";
import ReleaseAddToPlaylistModal from "../release/ReleaseAddToPlaylistModal";
import ReleaseInlineLyrics from "../release/ReleaseInlineLyrics";
import LyricsStatusBadge from "../release/LyricsStatusBadge";
import {
  ChevronIcon,
  parseTrackPanelMeta,
  trackDisplayTitle,
  versionSourceFromVersionItem,
} from "../release/releaseTrackPanelMeta";
import { TrackActionEditIcon, TrackActionRetryIcon, TrackActionYoutubeIcon } from "../release/releaseTrackActionIcons";
import type { ReleaseMobileTrackView, ReleasePlaybackArt } from "../release/ReleaseTracklist";

export type SystemPlaylistTracklistHandle = {
  openLyrics: (track: ReleaseTrackItem) => void;
  openVersions: (track: ReleaseTrackItem) => void;
  openPlus: (track: ReleaseTrackItem) => void;
  adjacentTracks: (path: string) => {
    prev: ReleaseTrackItem | null;
    next: ReleaseTrackItem | null;
  };
  allTracks: () => ReleaseTrackItem[];
};

type Props = {
  bandId: number;
  artistName: string;
  tracks: ArtistPlaylistTrack[];
  multiArtist?: boolean;
  showTrackMeta?: boolean;
  userPlaylistId?: number;
  onTracksChanged?: () => void;
  editMode?: boolean;
  stacked: boolean;
  compactLyricsHead?: boolean;
  playingPath: string | null;
  playbackProgress?: number;
  mobileView: ReleaseMobileTrackView;
  mobileBackdropUrl?: string | null;
  onPlay: (
    path: string,
    title: string,
    art?: ReleasePlaybackArt,
    track?: ArtistPlaylistTrack
  ) => void;
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
    } | null;
  }) => void;
  isAdmin?: boolean;
  hidePerformer?: string;
  hideCoverArtist?: string;
};

function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function trackMetaLine(
  track: ArtistPlaylistTrack,
  showArtist: boolean
): string | null {
  const parts: string[] = [];
  if (showArtist && track.artist_name?.trim()) parts.push(track.artist_name.trim());
  const album = track.album_title?.trim();
  if (album) parts.push(album);
  const year =
    track.year?.trim() ||
    (track.release_date && /^\d{4}/.test(track.release_date)
      ? track.release_date.slice(0, 4)
      : "");
  if (year) parts.push(year);
  return parts.length ? parts.join(" · ") : null;
}

function UserPlaylistTrackMeta({
  track,
  showArtist,
}: {
  track: ArtistPlaylistTrack;
  showArtist: boolean;
}) {
  const album = track.album_title?.trim() ?? "";
  const year =
    track.year?.trim() ||
    (track.release_date && /^\d{4}/.test(track.release_date)
      ? track.release_date.slice(0, 4)
      : "");
  return (
    <span className="user-playlist-tracklist__meta">
      <span className="user-playlist-tracklist__meta-col">
        {showArtist ? track.artist_name?.trim() || "—" : ""}
      </span>
      <span className="user-playlist-tracklist__meta-col">{album || "—"}</span>
      <span className="user-playlist-tracklist__meta-col user-playlist-tracklist__meta-col--year">
        {year || "—"}
      </span>
    </span>
  );
}

function toTrackItem(track: ArtistPlaylistTrack, index: number): ReleaseTrackItem {
  return {
    id: track.play_path ?? (track.entry_id != null ? `entry-${track.entry_id}` : `${track.title}-${index}`),
    number: index + 1,
    title: track.title,
    play_path: track.play_path,
    duration: track.duration ?? null,
    duration_sec: track.duration_sec ?? null,
    has_lrc: false,
    has_synced_lrc: false,
    is_link: false,
    cover_url: track.cover_url,
    navigate_release_id: track.navigate_release_id ?? null,
    navigate_band_id: track.navigate_band_id ?? null,
    source_album_title: track.album_title ?? null,
    source_date_iso: track.release_date,
  };
}

function trackArt(track: ArtistPlaylistTrack): ReleasePlaybackArt {
  return {
    cover_url: track.cover_url,
    background_layers: track.cover_url ? [track.cover_url] : [],
  };
}

const SystemPlaylistTracklist = forwardRef<SystemPlaylistTracklistHandle, Props>(
  function SystemPlaylistTracklist(
    {
      bandId,
      artistName,
      tracks,
      multiArtist = false,
      showTrackMeta = false,
      userPlaylistId,
      onTracksChanged,
      editMode = false,
      stacked,
      compactLyricsHead = false,
      playingPath,
      playbackProgress = 0,
      mobileView,
      mobileBackdropUrl,
      onPlay,
      onPanelActionsChange,
      isAdmin = false,
      hidePerformer,
      hideCoverArtist,
    },
    ref
  ) {
    const trackItems = useMemo(
      () => tracks.map((t, i) => toTrackItem(t, i)),
      [tracks]
    );
    const trackByPath = useMemo(() => {
      const map = new Map<string, ArtistPlaylistTrack>();
      tracks.forEach((t) => {
        if (t.play_path) map.set(t.play_path, t);
      });
      return map;
    }, [tracks]);

    const [rightView, setRightView] = useState<"tracks" | "lyrics" | "versions">("tracks");
    const [lyricsTrack, setLyricsTrack] = useState<ReleaseTrackItem | null>(null);
    const [lyricsText, setLyricsText] = useState<string | null>(null);
    const [syncedLyrics, setSyncedLyrics] = useState<string | null>(null);
    const [lyricsLoading, setLyricsLoading] = useState(false);
    const [versionsTrack, setVersionsTrack] = useState<ReleaseTrackItem | null>(null);
    const [versions, setVersions] = useState<TrackVersionItem[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState<string | null>(null);
    const [plusTrack, setPlusTrack] = useState<ReleaseTrackItem | null>(null);
    const [findingEntryId, setFindingEntryId] = useState<number | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<LibraryTrackSearchHit[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [addingPath, setAddingPath] = useState<string | null>(null);

    useEffect(() => {
      if (!editMode || !searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      const q = searchQuery.trim();
      const t = window.setTimeout(() => {
        setSearchBusy(true);
        void searchLibraryTracks(q)
          .then((res) => setSearchResults(res.items))
          .catch(() => setSearchResults([]))
          .finally(() => setSearchBusy(false));
      }, 280);
      return () => window.clearTimeout(t);
    }, [editMode, searchQuery]);

    const handleRemoveTrack = useCallback(
      async (entryId: number | undefined) => {
        if (!userPlaylistId || !entryId) return;
        try {
          await removePlaylistTrack(userPlaylistId, entryId);
          onTracksChanged?.();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e));
        }
      },
      [onTracksChanged, userPlaylistId]
    );

    const handleAddSearchHit = useCallback(
      async (hit: LibraryTrackSearchHit) => {
        if (!userPlaylistId) return;
        setAddingPath(hit.path);
        try {
          await addTrackToPlaylist(userPlaylistId, {
            title: hit.title,
            artist: hit.artist_name,
            release: hit.album_title ?? "",
            path: hit.path,
          });
          setSearchQuery("");
          setSearchResults([]);
          onTracksChanged?.();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e));
        } finally {
          setAddingPath(null);
        }
      },
      [onTracksChanged, userPlaylistId]
    );

    const handleDrop = useCallback(
      async (targetIndex: number) => {
        if (dragIndex == null || dragIndex === targetIndex || !userPlaylistId) return;
        const reordered = [...tracks];
        const [moved] = reordered.splice(dragIndex, 1);
        if (!moved) return;
        reordered.splice(targetIndex, 0, moved);
        const entryIds = reordered
          .map((t) => t.entry_id)
          .filter((id): id is number => id != null);
        if (entryIds.length !== reordered.length) return;
        try {
          await reorderPlaylistTracks(userPlaylistId, entryIds);
          onTracksChanged?.();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e));
        } finally {
          setDragIndex(null);
        }
      },
      [dragIndex, onTracksChanged, tracks, userPlaylistId]
    );

    const handleFindInDisk = useCallback(
      async (track: ArtistPlaylistTrack) => {
        if (!userPlaylistId || !track.entry_id) return;
        setFindingEntryId(track.entry_id);
        try {
          const result = await findPlaylistTrackInDisk(userPlaylistId, track.entry_id);
          if (result.found) {
            onTracksChanged?.();
            return;
          }
          if (result.candidates?.length) {
            const list = result.candidates
              .slice(0, 5)
              .map((c) => `${c.title} — ${c.artist_name}${c.album_title ? ` (${c.album_title})` : ""}`)
              .join("\n");
            window.alert(`No exact match found. Possible matches:\n\n${list}`);
          } else {
            window.alert("No matching track found on disk.");
          }
        } catch (e) {
          window.alert(e instanceof Error ? e.message : String(e));
        } finally {
          setFindingEntryId(null);
        }
      },
      [onTracksChanged, userPlaylistId]
    );

    const loadLyricsForTrack = useCallback(
      async (track: ReleaseTrackItem, opts?: { switchView?: boolean; retry?: boolean }) => {
        if (opts?.switchView !== false) setRightView("lyrics");
        setLyricsTrack(track);
        setLyricsLoading(true);
        setLyricsText(null);
        setSyncedLyrics(null);
        const sourceTrack = tracks.find((t) => t.play_path === track.play_path);
        const lyricsArtist = multiArtist
          ? (sourceTrack?.artist_name ?? artistName)
          : artistName;
        const lyricsBandId = track.navigate_band_id ?? bandId;
        try {
          const res = await fetchTrackLyrics(
            lyricsArtist,
            trackDisplayTitle(track.title),
            track.play_path ?? undefined,
            {
              bandId: lyricsBandId,
              releaseId: track.navigate_release_id ?? undefined,
            }
          );
          setLyricsText(res.lyrics);
          setSyncedLyrics(res.synced_lyrics ?? null);
        } catch {
          if (!opts?.retry) {
            setLyricsText(null);
            setSyncedLyrics(null);
          }
        } finally {
          setLyricsLoading(false);
        }
      },
      [artistName, bandId, multiArtist, tracks]
    );

    const openLyrics = useCallback(
      (track: ReleaseTrackItem) => void loadLyricsForTrack(track),
      [loadLyricsForTrack]
    );

    const openVersions = useCallback(
      async (track: ReleaseTrackItem) => {
        setRightView("versions");
        setVersionsTrack(track);
        setVersions([]);
        setVersionsError(null);
        const releaseId = track.navigate_release_id;
        if (!releaseId || !track.play_path) {
          setVersionsError("Release not found for this track.");
          return;
        }
        setVersionsLoading(true);
        try {
          const res = await fetchTrackVersions(
            track.navigate_band_id ?? bandId,
            releaseId,
            trackDisplayTitle(track.title),
            track.play_path
          );
          setVersions(res.versions ?? []);
        } catch (e) {
          setVersionsError(e instanceof Error ? e.message : String(e));
        } finally {
          setVersionsLoading(false);
        }
      },
      [bandId]
    );

    const adjacentTracks = useCallback(
      (path: string) => {
        const idx = trackItems.findIndex((t) => t.play_path === path);
        if (idx < 0 || trackItems.length === 0) return { prev: null, next: null };
        return {
          prev: trackItems[(idx - 1 + trackItems.length) % trackItems.length],
          next: trackItems[(idx + 1) % trackItems.length],
        };
      },
      [trackItems]
    );

    useImperativeHandle(
      ref,
      () => ({
        openLyrics,
        openVersions,
        openPlus: (track) => setPlusTrack(track),
        adjacentTracks,
        allTracks: () => trackItems,
      }),
      [adjacentTracks, openLyrics, openVersions, trackItems]
    );

    useEffect(() => {
      if (rightView !== "tracks") return;
      setLyricsTrack(null);
      setVersionsTrack(null);
    }, [rightView]);

    const handleBack = () => setRightView("tracks");

    const handlePlayRow = (track: ArtistPlaylistTrack, item: ReleaseTrackItem) => {
      if (!track.play_path) return;
      const formattedDate = track.release_date
        ? formatTrackDate(track.release_date)
        : null;
      const versionSource =
        track.album_title && track.navigate_release_id
          ? {
              album_title: track.album_title,
              navigate_release_id: track.navigate_release_id,
              navigate_band_id: track.navigate_band_id ?? bandId,
              date_iso: track.release_date,
              display_date: formattedDate,
            }
          : null;
      onPlay(track.play_path, track.title, trackArt(track), track);
      onPanelActionsChange?.({
        track: item,
        showLyrics: true,
        showVersions: Boolean(track.navigate_release_id),
        panelDateIso: track.release_date,
        versionSource,
      });
    };

    const useMetaColumns = Boolean(showTrackMeta && userPlaylistId);

    const tracklistBody = (
      <div className="release-tracklist__content">
        {editMode && userPlaylistId && (
          <div className="user-playlist-edit__search-wrap">
            <input
              type="search"
              className="user-playlist-edit__search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library to add tracks…"
              autoComplete="off"
            />
            {searchBusy && searchQuery.trim() && (
              <p className="muted user-playlist-edit__result-meta" style={{ padding: "0.35rem 0" }}>
                Searching…
              </p>
            )}
            {!searchBusy && searchResults.length > 0 && (
              <div className="user-playlist-edit__results ms-scrollbar">
                {searchResults.map((hit) => (
                  <button
                    key={hit.path}
                    type="button"
                    className="user-playlist-edit__result"
                    disabled={addingPath === hit.path}
                    onClick={() => void handleAddSearchHit(hit)}
                  >
                    {hit.title}
                    <span className="user-playlist-edit__result-meta">
                      {hit.artist_name}
                      {hit.album_title ? ` · ${hit.album_title}` : ""}
                      {hit.year ? ` · ${hit.year}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <ol className="release-tracklist__tracks">
          {tracks.map((track, index) => {
            const item = trackItems[index]!;
            const active = Boolean(track.play_path && playingPath === track.play_path);
            const unavailable = Boolean(track.unavailable || !track.play_path);
            const meta = showTrackMeta && !useMetaColumns ? trackMetaLine(track, multiArtist) : null;
            const youtubeQuery = track.youtube_query ?? null;
            const rowClass = [
              "release-tracklist__row",
              active ? "active" : "",
              unavailable ? "release-tracklist__row--unavailable" : "",
              editMode ? "release-tracklist__row--edit" : "",
              dragIndex === index ? "dragging" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const metaNode =
              showTrackMeta && useMetaColumns ? (
                <UserPlaylistTrackMeta track={track} showArtist={multiArtist} />
              ) : meta ? (
                <span className="release-tracklist__track-meta">{meta}</span>
              ) : null;
            const titleWrapClass = `release-tracklist__title-wrap${
              useMetaColumns ? " release-tracklist__title-wrap--stacked" : ""
            }`;
            const playClass = [
              "release-tracklist__play",
              editMode ? "release-tracklist__play--edit" : "",
              unavailable ? "release-tracklist__play--static" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const lead = (
              <span className="release-tracklist__lead">
                {editMode && (
                  <span className="release-tracklist__drag-handle" aria-hidden>
                    ⠿
                  </span>
                )}
                <span className="release-tracklist__num">{index + 1}</span>
              </span>
            );
            const titleBlock = (
              <span className={titleWrapClass}>
                <ReleaseTrackTitle
                  title={track.title}
                  billboard={stacked}
                  hidePerformer={hidePerformer}
                  hideCoverArtist={hideCoverArtist}
                />
                {metaNode}
              </span>
            );
            const trailing =
              unavailable && !editMode ? (
                <span className="release-tracklist__row-actions">
                  {youtubeQuery ? (
                    <a
                      className="setlist-tracklist__youtube-link"
                      href={youtubeSearchUrl(youtubeQuery)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Search ${trackDisplayTitle(track.title)} on YouTube`}
                      title="Search on YouTube"
                    >
                      <TrackActionYoutubeIcon className="setlist-tracklist__youtube-icon" />
                    </a>
                  ) : (
                    <span className="release-tracklist__duration" aria-hidden />
                  )}
                  {userPlaylistId && track.entry_id ? (
                    <button
                      type="button"
                      className="release-tracklist__find-disk"
                      disabled={findingEntryId === track.entry_id}
                      title="Find in disk"
                      aria-label="Find in disk"
                      onClick={() => void handleFindInDisk(track)}
                    >
                      {findingEntryId === track.entry_id ? "…" : "Find"}
                    </button>
                  ) : null}
                </span>
              ) : (
                <>
                  {track.duration ? (
                    <span className="release-tracklist__duration">{track.duration}</span>
                  ) : (
                    <span className="release-tracklist__duration" aria-hidden />
                  )}
                  {editMode && track.entry_id ? (
                    <button
                      type="button"
                      className="release-tracklist__remove-track"
                      aria-label={`Remove ${track.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveTrack(track.entry_id);
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </>
              );
            return (
              <li
                key={item.id}
                className={rowClass}
                draggable={editMode && Boolean(track.entry_id)}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => {
                  if (editMode) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(index);
                }}
              >
                {unavailable || editMode ? (
                  <div className={playClass}>
                    {lead}
                    {titleBlock}
                    {trailing}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={playClass}
                    onClick={() => handlePlayRow(track, item)}
                    disabled={!track.play_path}
                    aria-label={`Play ${track.title}`}
                  >
                    {lead}
                    {titleBlock}
                    {trailing}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );

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
              onClick={() => void loadLyricsForTrack(lyricsTrack, { switchView: false, retry: true })}
              disabled={lyricsLoading}
              title="Retry"
              aria-label="Retry"
            >
              <TrackActionRetryIcon className="release-tracklist__lyrics-retry-icon" />
            </button>
          )}
          {!lyricsLoading && syncedLyrics && (
            <LyricsStatusBadge synced iconOnly={compactLyricsHead} title="Timestamped synced lyrics" />
          )}
          {!lyricsLoading && lyricsText && !syncedLyrics && (
            <LyricsStatusBadge synced={false} iconOnly={compactLyricsHead} title="Lyrics without timestamps" />
          )}
        </div>
      </div>
    ) : null;

    const versionsTitle = versionsTrack
      ? `${parseTrackPanelMeta(versionsTrack.title).mainTitle} Versions`
      : "Versions";

    return (
      <div
        className={`release-tracklist${stacked ? " release-tracklist--stacked" : ""}${
          rightView === "lyrics" ? " release-tracklist--lyrics" : ""
        }${
          editMode ? " release-tracklist--edit-mode" : ""
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
              <div className="release-tracklist__subview-head">
                <button
                  type="button"
                  className="release-tracklist__back"
                  onClick={handleBack}
                  aria-label="Back to tracklist"
                >
                  <ChevronIcon direction="left" />
                </button>
                <h2 className="release-tracklist__subview-title">{versionsTitle}</h2>
              </div>
              <div className="release-tracklist__content">
                {versionsLoading && <p className="muted">Loading versions…</p>}
                {versionsError && <p className="error">{versionsError}</p>}
                {!versionsLoading && !versionsError && versions.length === 0 && (
                  <p className="muted">No alternate versions found.</p>
                )}
                {versions.length > 0 && (
                  <ol className="release-tracklist__tracks">
                    {versions.map((v, i) => {
                      const active = playingPath === v.play_path;
                      const sourceTrack = trackByPath.get(versionsTrack?.play_path ?? "");
                      return (
                        <li
                          key={v.play_path}
                          className={active ? "release-tracklist__row active" : "release-tracklist__row"}
                        >
                          <button
                            type="button"
                            className="release-tracklist__play"
                            onClick={() => {
                              const source = versionSourceFromVersionItem(
                                v,
                                versionsTrack?.play_path ?? null
                              );
                              onPlay(v.play_path, v.title, {
                                cover_url: v.cover_url,
                                cover_animation_url: v.cover_animation_url,
                                canvas_url: v.canvas_url,
                                disc_url: v.disc_url,
                                background_layers: v.background_layers,
                              });
                              onPanelActionsChange?.({
                                track: {
                                  id: v.play_path,
                                  number: i + 1,
                                  title: v.title,
                                  play_path: v.play_path,
                                  duration: v.duration ?? null,
                                  duration_sec: null,
                                  has_lrc: false,
                                  has_synced_lrc: false,
                                  is_link: false,
                                  cover_url: v.cover_url,
                                  navigate_release_id:
                                    v.navigate_release_id ??
                                    sourceTrack?.navigate_release_id ??
                                    null,
                                },
                                showLyrics: true,
                                showVersions: false,
                                panelDateIso: v.date_iso ?? source?.date_iso ?? null,
                                versionSource: source,
                              });
                            }}
                          >
                            <span className="release-tracklist__num">{i + 1}</span>
                            <ReleaseTrackTitle
                              title={v.title}
                              billboard={stacked}
                              hidePerformer={hidePerformer}
                            />
                            {v.duration && (
                              <span className="release-tracklist__duration">{v.duration}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>

        {plusTrack && (
          <ReleaseAddToPlaylistModal
            track={plusTrack}
            artistName={
              plusTrack.play_path
                ? (trackByPath.get(plusTrack.play_path)?.artist_name ?? artistName)
                : artistName
            }
            releaseTitle={plusTrack.source_album_title ?? ""}
            onClose={() => setPlusTrack(null)}
          />
        )}
      </div>
    );
  }
);

export default SystemPlaylistTracklist;
