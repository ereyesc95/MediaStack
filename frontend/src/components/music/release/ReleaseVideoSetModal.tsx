import { useEffect, useMemo, useState } from "react";
import { fetchReleaseTracklist, saveTrackYoutube } from "../../../api";
import type { ReleaseTrackItem, TrackYoutubeVideo } from "../../../types";
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

function allTracks(
  editions: { groups: { tracks: ReleaseTrackItem[] }[] }[]
): ReleaseTrackItem[] {
  return editions.flatMap((ed) => ed.groups.flatMap((g) => g.tracks));
}

function videosFromTrack(track: ReleaseTrackItem): VideoRow[] {
  const stored = track.youtube_videos ?? [];
  if (stored.length > 0) {
    return stored.map((v) => ({
      url: v.url,
      label: v.label || "Video",
      primary: Boolean(v.primary),
    }));
  }
  if (track.youtube_url) {
    return [{ url: track.youtube_url, label: "Official video", primary: true }];
  }
  return [{ url: "", label: "Official video", primary: true }];
}

function rowsEqual(a: VideoRow[], b: VideoRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.url.trim() === b[i].url.trim() &&
      row.label.trim() === b[i].label.trim() &&
      Boolean(row.primary) === Boolean(b[i].primary)
  );
}

function normalizeRows(rows: VideoRow[]): TrackYoutubeVideo[] {
  const cleaned = rows
    .map((row) => ({
      url: row.url.trim(),
      label: row.label.trim() || "Video",
      primary: Boolean(row.primary),
    }))
    .filter((row) => row.url.length > 0);
  if (cleaned.length === 0) return [];
  if (!cleaned.some((row) => row.primary)) {
    cleaned[0] = { ...cleaned[0], primary: true };
  }
  return cleaned;
}

export default function ReleaseVideoSetModal({
  bandId,
  releaseId,
  artistName,
  onClose,
  onSaved,
}: Props) {
  const [tracks, setTracks] = useState<ReleaseTrackItem[]>([]);
  const [rowsByPath, setRowsByPath] = useState<Record<string, VideoRow[]>>({});
  const [initialByPath, setInitialByPath] = useState<Record<string, VideoRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchReleaseTracklist(bandId, releaseId)
      .then((payload) => {
        if (cancelled) return;
        const list = allTracks(payload.editions);
        setTracks(list);
        const init: Record<string, VideoRow[]> = {};
        for (const track of list) {
          init[track.play_path] = videosFromTrack(track);
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
      tracks
        .map((track) => track.play_path)
        .filter((path) => !rowsEqual(rowsByPath[path] ?? [], initialByPath[path] ?? [])),
    [tracks, rowsByPath, initialByPath]
  );

  function updateRow(path: string, index: number, patch: Partial<VideoRow>) {
    setRowsByPath((prev) => {
      const nextRows = [...(prev[path] ?? [])];
      nextRows[index] = { ...nextRows[index], ...patch };
      return { ...prev, [path]: nextRows };
    });
  }

  function setPrimary(path: string, index: number) {
    setRowsByPath((prev) => ({
      ...prev,
      [path]: (prev[path] ?? []).map((row, i) => ({
        ...row,
        primary: i === index,
      })),
    }));
  }

  function addRow(path: string) {
    setRowsByPath((prev) => ({
      ...prev,
      [path]: [
        ...(prev[path] ?? []),
        { url: "", label: "Video", primary: (prev[path] ?? []).length === 0 },
      ],
    }));
  }

  function removeRow(path: string, index: number) {
    setRowsByPath((prev) => {
      const nextRows = (prev[path] ?? []).filter((_, i) => i !== index);
      if (nextRows.length > 0 && !nextRows.some((row) => row.primary)) {
        nextRows[0] = { ...nextRows[0], primary: true };
      }
      return { ...prev, [path]: nextRows.length ? nextRows : [{ url: "", label: "Official video", primary: true }] };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const path of changedPaths) {
        const track = tracks.find((t) => t.play_path === path);
        if (!track) continue;
        const videos = normalizeRows(rowsByPath[path] ?? []);
        await saveTrackYoutube({
          artist: artistName,
          title: trackMainTitle(track.title),
          play_path: path,
          youtube_url: videos.find((v) => v.primary)?.url ?? videos[0]?.url ?? null,
          youtube_videos: videos,
          band_id: bandId,
        });
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

        {!loading && tracks.length > 0 && (
          <ul className="release-video-set-modal__list ms-scrollbar">
            {tracks.map((track) => (
              <li key={track.play_path} className="release-video-set-modal__item">
                <div className="release-video-set-modal__title">
                  {trackDisplayTitle(track.title)}
                </div>
                <div className="release-video-set-modal__videos">
                  {(rowsByPath[track.play_path] ?? []).map((row, index) => (
                    <div
                      key={`${track.play_path}-${index}`}
                      className="release-video-set-modal__video-row"
                    >
                      <label className="release-video-set-modal__primary">
                        <input
                          type="radio"
                          name={`video-primary-${track.play_path}`}
                          checked={Boolean(row.primary)}
                          onChange={() => setPrimary(track.play_path, index)}
                        />
                        <span>Primary</span>
                      </label>
                      <input
                        type="text"
                        className="release-video-set-modal__label-input"
                        value={row.label}
                        placeholder="Label"
                        onChange={(e) =>
                          updateRow(track.play_path, index, { label: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        className="release-video-set-modal__input"
                        value={row.url}
                        placeholder="YouTube URL or video ID"
                        onChange={(e) =>
                          updateRow(track.play_path, index, { url: e.target.value })
                        }
                      />
                      {(rowsByPath[track.play_path] ?? []).length > 1 && (
                        <button
                          type="button"
                          className="btn btn--small release-video-set-modal__remove"
                          onClick={() => removeRow(track.play_path, index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn--small release-video-set-modal__add"
                    onClick={() => addRow(track.play_path)}
                  >
                    + Add video
                  </button>
                </div>
              </li>
            ))}
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
