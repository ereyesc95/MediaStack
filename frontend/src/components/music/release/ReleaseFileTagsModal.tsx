import { useEffect, useState } from "react";
import {
  pickReleaseCoverForFileTags,
  syncReleaseFileTags,
  type FileTagValues,
  type WriteFileTagsTrackIn,
} from "../../../api";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  releaseId: string;
  releaseTitle: string;
  coverUrl?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

type EditableRow = {
  play_path: string;
  file_name: string | null;
  selected: boolean;
  includeLyrics: boolean;
  hasLyrics: boolean;
  tags: Required<{ [K in keyof FileTagValues]: string }>;
  writers: string;
  status: string;
  message?: string | null;
};

function MsCheckbox({
  checked,
  disabled,
  onChange,
  label,
  title,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <label
      className={`ms-checkbox${disabled ? " ms-checkbox--disabled" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="ms-checkbox__box" aria-hidden="true" />
      {label ? <span className="ms-checkbox__label">{label}</span> : null}
    </label>
  );
}

function EditableCell({
  value,
  onChange,
  numeric,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      className={`release-file-tags-modal__cell-input${className ? ` ${className}` : ""}`}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (numeric && next !== "" && !/^\d+$/.test(next)) return;
        onChange(next);
      }}
    />
  );
}

function mapApiTrack(track: {
  play_path: string;
  file_name: string | null;
  tags: FileTagValues;
  writers?: string | null;
  has_lyrics?: boolean;
  status: string;
  message?: string | null;
}): EditableRow {
  const tags = track.tags ?? {};
  return {
    play_path: track.play_path,
    file_name: track.file_name,
    selected: true,
    includeLyrics: Boolean(track.has_lyrics),
    hasLyrics: Boolean(track.has_lyrics),
    tags: {
      title: tags.title ?? "",
      artist: tags.artist ?? "",
      album: tags.album ?? "",
      albumartist: tags.albumartist ?? "",
      date: tags.date ?? "",
      tracknumber: tags.tracknumber ?? "",
      discnumber: tags.discnumber ?? "",
      genre: tags.genre ?? "",
    },
    writers: track.writers ?? "",
    status: track.status,
    message: track.message,
  };
}

export default function ReleaseFileTagsModal({
  bandId,
  releaseId,
  releaseTitle,
  coverUrl: coverUrlProp,
  onClose,
  onDone,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [includeCover, setIncludeCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(coverUrlProp ?? null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void syncReleaseFileTags(bandId, releaseId, true)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error ?? "Preview failed");
          return;
        }
        setRows((res.tracks ?? []).map(mapApiTrack));
        if (res.cover_url) setCoverUrl(res.cover_url);
        if (res.cover_path) setCoverPath(res.cover_path);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, releaseId]);

  const updateRow = (playPath: string, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((row) =>
        row.play_path === playPath ? { ...row, ...patch } : row
      )
    );
  };

  const updateRowTags = (
    playPath: string,
    field: keyof EditableRow["tags"],
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.play_path === playPath
          ? { ...row, tags: { ...row.tags, [field]: value } }
          : row
      )
    );
  };

  const handlePickCover = async () => {
    setPickingCover(true);
    setError(null);
    try {
      const res = await pickReleaseCoverForFileTags(bandId, releaseId);
      if (!res.ok) {
        setError(res.error ?? "Could not open cover picker");
        return;
      }
      if (res.cancelled) return;
      if (res.cover_path) setCoverPath(res.cover_path);
      if (res.preview_url) setCoverUrl(res.preview_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPickingCover(false);
    }
  };

  const handleWrite = async () => {
    setWriting(true);
    setError(null);
    const tracks: WriteFileTagsTrackIn[] = rows.map((row) => ({
      play_path: row.play_path,
      selected: row.selected,
      include_lyrics: row.includeLyrics,
      writers: row.writers.trim() || null,
      tags: { ...row.tags },
    }));
    try {
      const res = await syncReleaseFileTags(bandId, releaseId, false, {
        includeCover,
        coverPath,
        tracks,
      });
      if (!res.ok) {
        setError(res.error ?? "Write failed");
        return;
      }
      const written = res.summary?.written ?? 0;
      const skipped = res.summary?.skipped ?? 0;
      const errors = res.summary?.errors ?? 0;
      onDone(
        `File tags updated: ${written} written · ${skipped} skipped · ${errors} errors`
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <ModalPortal>
      <div className="release-lyrics-modal release-file-tags-modal">
        <button
          type="button"
          className="release-lyrics-modal__backdrop"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="release-lyrics-modal__panel release-file-tags-modal__panel">
          <header className="release-lyrics-modal__head">
            <h2>Write file tags</h2>
            <button
              type="button"
              className="modal-close-x"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="release-lyrics-modal__body release-file-tags-modal__body">
            <div className="release-file-tags-modal__top">
              <div className="release-file-tags-modal__intro-block">
                <p className="release-file-tags-modal__intro">
                  Embed metadata into local audio files for{" "}
                  <strong>{releaseTitle}</strong>.
                </p>
                <p className="release-file-tags-modal__intro-detail">
                  Tags always include title, artist, album artist, album, year,
                  track number, disc number, and genre.
                </p>
              </div>
              <div className="release-file-tags-modal__cover-block">
                <button
                  type="button"
                  className="release-file-tags-modal__cover-btn"
                  onClick={() => void handlePickCover()}
                  disabled={pickingCover}
                  title="Choose cover art image"
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="release-file-tags-modal__cover-thumb"
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="release-file-tags-modal__cover-thumb release-file-tags-modal__cover-thumb--empty"
                      aria-hidden
                    />
                  )}
                </button>
                <MsCheckbox
                  checked={includeCover}
                  onChange={setIncludeCover}
                  label="Embed cover art"
                  className="release-file-tags-modal__cover-toggle"
                />
              </div>
            </div>
            {loading && <p className="muted">Loading preview…</p>}
            {error && <p className="error">{error}</p>}
            {!loading && !error && (
              <>
                <p className="release-file-tags-modal__summary">
                  {selectedCount} of {rows.length} files selected
                </p>
                <div className="release-file-tags-modal__table-wrap ms-scrollbar">
                  <table className="release-file-tags-modal__table">
                    <thead>
                      <tr>
                        <th className="release-file-tags-modal__check-col" aria-label="Include" />
                        <th>Track</th>
                        <th>Title</th>
                        <th>Artist</th>
                        <th>Album</th>
                        <th>Year</th>
                        <th>#</th>
                        <th>Disc</th>
                        <th>Genre</th>
                        <th>Writers</th>
                        <th>Lyrics</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.play_path}
                          className={
                            row.selected
                              ? undefined
                              : "release-file-tags-modal__row--off"
                          }
                        >
                          <td className="release-file-tags-modal__check-col">
                            <MsCheckbox
                              checked={row.selected}
                              onChange={(checked) =>
                                updateRow(row.play_path, { selected: checked })
                              }
                            />
                          </td>
                          <td className="release-file-tags-modal__file">
                            {row.file_name ?? row.play_path.split("/").pop()}
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.title}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "title", v)
                              }
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.artist}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "artist", v)
                              }
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.album}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "album", v)
                              }
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.date}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "date", v)
                              }
                              numeric
                              className="release-file-tags-modal__cell-input--narrow"
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.tracknumber}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "tracknumber", v)
                              }
                              numeric
                              className="release-file-tags-modal__cell-input--narrow"
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.discnumber}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "discnumber", v)
                              }
                              numeric
                              className="release-file-tags-modal__cell-input--narrow"
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.genre}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "genre", v)
                              }
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.writers}
                              onChange={(v) =>
                                updateRow(row.play_path, { writers: v })
                              }
                            />
                          </td>
                          <td className="release-file-tags-modal__check-col">
                            <MsCheckbox
                              checked={row.includeLyrics}
                              disabled={!row.hasLyrics}
                              onChange={(checked) =>
                                updateRow(row.play_path, {
                                  includeLyrics: checked,
                                })
                              }
                              title={
                                row.hasLyrics
                                  ? "Embed lyrics for this track"
                                  : "No lyrics stored for this track"
                              }
                            />
                          </td>
                          <td className="release-file-tags-modal__status">
                            {row.status === "ready" && "Ready"}
                            {row.status === "written" && "Written"}
                            {row.status === "skipped" &&
                              (row.message ?? "Skipped")}
                            {row.status === "error" &&
                              (row.message ?? "Error")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <footer className="release-file-tags-modal__foot modal-actions-row">
            <button
              type="button"
              className="btn"
              disabled={loading || writing || selectedCount === 0}
              onClick={() => void handleWrite()}
            >
              {writing ? "Writing…" : "Write file tags"}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
