import { useEffect, useMemo, useState } from "react";
import { fetchReleaseOverview, fetchReleaseTracklist, saveTrackYoutube } from "../../../api";
import type { ReleaseOverview, ReleaseTrackItem, TrackYoutubeVideo } from "../../../types";
import { youtubeVideoId } from "../../../utils/youtube";
import { normalizeVideoDateInput } from "../../../utils/videoMedia";
import { trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  releaseId: string;
  artistName: string;
  onClose: () => void;
  onSaved: () => void;
};

type VideoRow = TrackYoutubeVideo;

type VideoDefaults = {
  director: string;
  releaseDate: string;
};

function releaseYearFromIso(dateIso: string | null | undefined): string {
  if (!dateIso || dateIso.length < 4) return "";
  const year = dateIso.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function resolveLeadVocalist(overview: ReleaseOverview): string {
  if (overview.is_solo) {
    const fromLineup = overview.lineup.find((m) => m.name?.trim())?.name?.trim();
    return fromLineup || overview.artist_name?.trim() || "";
  }
  for (const member of overview.lineup) {
    const name = member.name?.trim();
    if (!name) continue;
    const roles = (member.roles ?? []).map((r) => r.toLowerCase());
    if (roles.some((r) => r === "lead vocals" || r.includes("lead vocal"))) {
      return name;
    }
  }
  for (const member of overview.lineup) {
    const name = member.name?.trim();
    if (!name) continue;
    const roles = (member.roles ?? []).map((r) => r.toLowerCase());
    if (roles.some((r) => r.includes("vocal") && !r.includes("backing"))) {
      return name;
    }
  }
  return "";
}

function videoDefaultsFromOverview(overview: ReleaseOverview): VideoDefaults {
  const iso = overview.date_iso?.trim();
  const releaseDate =
    iso && iso.length >= 10 ? iso.slice(0, 10) : releaseYearFromIso(overview.date_iso);
  return {
    director: resolveLeadVocalist(overview),
    releaseDate,
  };
}

function applyVideoDefaults(row: VideoRow, defaults: VideoDefaults): VideoRow {
  return {
    ...row,
    director: (row.director ?? "").trim() || defaults.director,
    release_date:
      row.release_date != null && String(row.release_date).trim()
        ? String(row.release_date)
        : row.release_year != null && String(row.release_year).trim()
          ? String(row.release_year)
          : defaults.releaseDate,
  };
}

function emptyVideoRow(defaults: VideoDefaults, primary = true): VideoRow {
  return {
    url: "",
    label: "",
    primary,
    director: defaults.director,
    release_date: defaults.releaseDate,
  };
}

type UniqueTrackEntry = {
  track: ReleaseTrackItem;
  /** All play_paths that share this track's main title (editions / b-sides). */
  relatedPaths: string[];
};

function allTracks(
  editions: { groups: { tracks: ReleaseTrackItem[] }[] }[]
): ReleaseTrackItem[] {
  return editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
}

function titleKey(title: string): string {
  return trackMainTitle(title).trim().toLowerCase();
}

function videoUrlKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const id = youtubeVideoId(trimmed);
  if (id) return id.toLowerCase();
  return trimmed.toLowerCase();
}

function videosFromTrack(track: ReleaseTrackItem, defaults: VideoDefaults): VideoRow[] {
  const stored = track.youtube_videos ?? [];
  if (stored.length > 0) {
    return stored.map((v) =>
      applyVideoDefaults(
        {
          url: v.url,
          label: v.label || "Video",
          primary: Boolean(v.primary),
          director: v.director ?? "",
          release_date:
            v.release_date != null
              ? String(v.release_date)
              : v.release_year != null
                ? String(v.release_year)
                : "",
        },
        defaults
      )
    );
  }
  if (track.youtube_url) {
    return [
      applyVideoDefaults(
        {
          url: track.youtube_url,
          label: "Official video",
          primary: true,
          director: "",
          release_date: "",
        },
        defaults
      ),
    ];
  }
  return [emptyVideoRow(defaults, true)];
}

function filledVideoCount(rows: VideoRow[]): number {
  return rows.filter((row) => row.url.trim().length > 0).length;
}

/** One modal row per song title; merge edition/b-side duplicates. */
function uniqueTracksForModal(
  tracks: ReleaseTrackItem[],
  defaults: VideoDefaults
): UniqueTrackEntry[] {
  const order: string[] = [];
  const byKey = new Map<string, UniqueTrackEntry>();

  for (const track of tracks) {
    if (track.is_video || !track.play_path) continue;
    const key = titleKey(track.title);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { track, relatedPaths: [track.play_path] });
      order.push(key);
      continue;
    }
    if (!existing.relatedPaths.includes(track.play_path)) {
      existing.relatedPaths.push(track.play_path);
    }
    // Prefer the occurrence that already has the richest video list.
    if (
      filledVideoCount(videosFromTrack(track, defaults)) >
      filledVideoCount(videosFromTrack(existing.track, defaults))
    ) {
      existing.track = track;
    }
  }

  return order.map((key) => byKey.get(key)!);
}

function rowsEqual(a: VideoRow[], b: VideoRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.url.trim() === b[i].url.trim() &&
      row.label.trim() === b[i].label.trim() &&
      Boolean(row.primary) === Boolean(b[i].primary) &&
      (row.director ?? "").trim() === (b[i].director ?? "").trim() &&
      String(row.release_date ?? row.release_year ?? "").trim() ===
        String(b[i].release_date ?? b[i].release_year ?? "").trim()
  );
}

function normalizeRows(rows: VideoRow[]): TrackYoutubeVideo[] {
  const cleaned = rows
    .map((row) => {
      const item: TrackYoutubeVideo = {
        url: row.url.trim(),
        label: row.label.trim() || "Video",
        primary: Boolean(row.primary),
      };
      const director = (row.director ?? "").trim();
      if (director) item.director = director;
      const date = normalizeVideoDateInput(
        String(row.release_date ?? row.release_year ?? "")
      );
      if (date) item.release_date = date;
      return item;
    })
    .filter((row) => row.url.length > 0);
  if (cleaned.length === 0) return [];
  if (!cleaned.some((row) => row.primary)) {
    cleaned[0] = { ...cleaned[0], primary: true };
  }
  return cleaned;
}

function findDuplicateUrlError(rows: VideoRow[]): string | null {
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const key = videoUrlKey(rows[i]?.url ?? "");
    if (!key) continue;
    const prev = seen.get(key);
    if (prev != null) {
      return "Each video link on a track must be unique — that URL is already registered for this song.";
    }
    seen.set(key, i);
  }
  return null;
}

export default function ReleaseVideoSetModal({
  bandId,
  releaseId,
  artistName,
  onClose,
  onSaved,
}: Props) {
  const [entries, setEntries] = useState<UniqueTrackEntry[]>([]);
  const [rowsByPath, setRowsByPath] = useState<Record<string, VideoRow[]>>({});
  const [initialByPath, setInitialByPath] = useState<Record<string, VideoRow[]>>({});
  const [videoDefaults, setVideoDefaults] = useState<VideoDefaults>({
    director: "",
    releaseDate: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchReleaseTracklist(bandId, releaseId),
      fetchReleaseOverview(bandId, releaseId),
    ])
      .then(([payload, overview]) => {
        if (cancelled) return;
        const defaults = videoDefaultsFromOverview(overview);
        setVideoDefaults(defaults);
        const unique = uniqueTracksForModal(allTracks(payload.editions), defaults);
        setEntries(unique);
        const init: Record<string, VideoRow[]> = {};
        for (const entry of unique) {
          init[entry.track.play_path] = videosFromTrack(entry.track, defaults);
        }
        setRowsByPath(init);
        setInitialByPath(init);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, releaseId]);

  const changedPaths = useMemo(
    () =>
      entries
        .map((entry) => entry.track.play_path)
        .filter((path) => !rowsEqual(rowsByPath[path] ?? [], initialByPath[path] ?? [])),
    [entries, rowsByPath, initialByPath]
  );

  function updateRow(path: string, index: number, patch: Partial<VideoRow>) {
    if (patch.url !== undefined) {
      const key = videoUrlKey(patch.url);
      if (key) {
        const rows = rowsByPath[path] ?? [];
        const duplicate = rows.some(
          (row, i) => i !== index && videoUrlKey(row.url) === key
        );
        if (duplicate) {
          setError(
            "Each video link on a track must be unique — that URL is already registered for this song."
          );
          return;
        }
      }
      setError((err) => (err?.includes("already registered") ? null : err));
    }
    setRowsByPath((prev) => {
      const nextRows = [...(prev[path] ?? [])];
      nextRows[index] = { ...nextRows[index], ...patch };
      return { ...prev, [path]: nextRows };
    });
  }

  function addRow(path: string) {
    setRowsByPath((prev) => ({
      ...prev,
      [path]: [...(prev[path] ?? []), emptyVideoRow(videoDefaults, false)],
    }));
    setError(null);
  }

  function removeRow(path: string, index: number) {
    setRowsByPath((prev) => {
      const nextRows = (prev[path] ?? []).filter((_, i) => i !== index);
      return {
        ...prev,
        [path]: nextRows.length ? nextRows : [emptyVideoRow(videoDefaults, true)],
      };
    });
    setError(null);
  }

  function datePickerValue(row: VideoRow): string {
    const iso = normalizeVideoDateInput(
      String(row.release_date ?? row.release_year ?? "")
    );
    return iso.length >= 10 ? iso.slice(0, 10) : "";
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const path of changedPaths) {
        const dup = findDuplicateUrlError(rowsByPath[path] ?? []);
        if (dup) {
          setError(dup);
          setSaving(false);
          return;
        }
      }
      for (const path of changedPaths) {
        const entry = entries.find((e) => e.track.play_path === path);
        if (!entry) continue;
        const videos = normalizeRows(rowsByPath[path] ?? []);
        const title = trackMainTitle(entry.track.title);
        const primary = videos.find((v) => v.primary)?.url ?? videos[0]?.url ?? null;
        // Apply to every edition/b-side path for this song so the modal stays consistent.
        for (const relatedPath of entry.relatedPaths) {
          await saveTrackYoutube({
            artist: artistName,
            title,
            play_path: relatedPath,
            youtube_url: primary,
            youtube_videos: videos,
            band_id: bandId,
          });
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>Set Official Videos</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading tracks…</p>}

        {!loading && entries.length > 0 && (
          <ul className="release-video-set-modal__list ms-scrollbar">
            {entries.map((entry) => {
              const track = entry.track;
              const path = track.play_path;
              return (
                <li key={path} className="release-video-set-modal__item">
                  <div className="release-video-set-modal__track-head">
                    <div className="release-video-set-modal__title-row">
                      <div className="release-video-set-modal__title">
                        {trackDisplayTitle(track.title)}
                      </div>
                      <button
                        type="button"
                        className="release-video-set-modal__icon-btn"
                        title="Add video"
                        aria-label="Add video"
                        onClick={() => addRow(path)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="release-video-set-modal__videos">
                    {(rowsByPath[path] ?? []).map((row, index) => (
                      <div
                        key={`${path}-${index}`}
                        className="release-video-set-modal__video-row"
                      >
                        <input
                          type="text"
                          className="release-video-set-modal__label-input"
                          value={row.label}
                          placeholder="Label"
                          onChange={(e) =>
                            updateRow(path, index, { label: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="release-video-set-modal__meta-input"
                          value={row.director ?? ""}
                          placeholder="Director"
                          onChange={(e) =>
                            updateRow(path, index, { director: e.target.value })
                          }
                        />
                        <input
                          type="date"
                          className="release-video-set-modal__meta-input release-video-set-modal__meta-input--date"
                          value={datePickerValue(row)}
                          aria-label={`Date for video ${index + 1}`}
                          onChange={(e) =>
                            updateRow(path, index, { release_date: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="release-video-set-modal__input"
                          value={row.url}
                          placeholder="Video URL"
                          onChange={(e) =>
                            updateRow(path, index, { url: e.target.value })
                          }
                        />
                        {(rowsByPath[path] ?? []).length > 1 ? (
                          <button
                            type="button"
                            className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
                            title="Remove video"
                            aria-label={`Remove video ${index + 1}`}
                            onClick={() => removeRow(path, index)}
                          >
                            ×
                          </button>
                        ) : (
                          <span className="release-video-set-modal__row-spacer" aria-hidden />
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={saving || loading || changedPaths.length === 0}
            onClick={() => void handleSave()}
          >
            {saving
              ? "Saving…"
              : changedPaths.length > 0
                ? `Save ${changedPaths.length} change${changedPaths.length === 1 ? "" : "s"}`
                : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
