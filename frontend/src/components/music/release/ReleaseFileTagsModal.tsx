import { useEffect, useRef, useState } from "react";
import {
  fetchFileTagsCoverPreviewUrl,
  pickReleaseCoverForFileTags,
  syncReleaseFileTags,
  type FileTagEditionCover,
  type FileTagValues,
  type WriteFileTagsTrackIn,
} from "../../../api";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  releaseId: string;
  releaseTitle: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type EditionCoverState = {
  id: string;
  label: string;
  coverPath: string | null;
  previewUrl: string | null;
  loadingPreview: boolean;
};

type EditableRow = {
  play_path: string;
  edition_id: string;
  file_name: string | null;
  selected: boolean;
  includeLyrics: boolean;
  hasLyrics: boolean;
  tags: Required<{ [K in keyof FileTagValues]: string }>;
  writers: string;
};

function MsCheckbox({
  checked,
  disabled,
  indeterminate,
  onChange,
  label,
  title,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  title?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <label
      className={`ms-checkbox${disabled ? " ms-checkbox--disabled" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <input
        ref={inputRef}
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
  wrap,
}: {
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  className?: string;
  wrap?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={`release-file-tags-modal__cell-input${className ? ` ${className}` : ""}`}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (numeric && next !== "" && !/^\d+$/.test(next)) return;
          onChange(next);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`release-file-tags-modal__cell-display${
        wrap ? " release-file-tags-modal__cell-display--wrap" : ""
      }${className ? ` ${className}` : ""}`}
      onClick={() => setEditing(true)}
    >
      {value || "\u00a0"}
    </button>
  );
}

function mapApiTrack(track: {
  play_path: string;
  edition_id?: string | null;
  file_name: string | null;
  tags: FileTagValues;
  writers?: string | null;
  has_lyrics?: boolean;
}): EditableRow {
  const tags = track.tags ?? {};
  return {
    play_path: track.play_path,
    edition_id: track.edition_id ?? "",
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
  };
}

export default function ReleaseFileTagsModal({
  bandId,
  releaseId,
  releaseTitle,
  onClose,
  onDone,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [includeCover, setIncludeCover] = useState(false);
  const [editions, setEditions] = useState<EditionCoverState[]>([]);
  const [pickingEditionId, setPickingEditionId] = useState<string | null>(null);
  const coverBlobRefs = useRef<Map<string, string>>(new Map());

  const revokeEditionBlob = (editionId: string) => {
    const url = coverBlobRefs.current.get(editionId);
    if (url) {
      URL.revokeObjectURL(url);
      coverBlobRefs.current.delete(editionId);
    }
  };

  const revokeAllBlobs = () => {
    for (const url of coverBlobRefs.current.values()) {
      URL.revokeObjectURL(url);
    }
    coverBlobRefs.current.clear();
  };

  useEffect(() => {
    return () => {
      revokeAllBlobs();
    };
  }, []);

  const loadEditionPreview = async (
    editionId: string,
    previewUrl: string
  ) => {
    setEditions((prev) =>
      prev.map((ed) =>
        ed.id === editionId ? { ...ed, loadingPreview: true } : ed
      )
    );
    try {
      revokeEditionBlob(editionId);
      const blobUrl = await fetchFileTagsCoverPreviewUrl(previewUrl);
      coverBlobRefs.current.set(editionId, blobUrl);
      setEditions((prev) =>
        prev.map((ed) =>
          ed.id === editionId
            ? { ...ed, previewUrl: blobUrl, loadingPreview: false }
            : ed
        )
      );
    } catch {
      setEditions((prev) =>
        prev.map((ed) =>
          ed.id === editionId ? { ...ed, loadingPreview: false } : ed
        )
      );
    }
  };

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
        const editionList = (res.editions ?? []).map((ed) => ({
          id: ed.id,
          label: ed.label,
          coverPath: ed.cover_path ?? null,
          previewUrl: null as string | null,
          loadingPreview: Boolean(ed.preview_url),
        }));
        setEditions(editionList);
        const hasAnyCover = editionList.some((ed) => ed.coverPath);
        setIncludeCover(hasAnyCover);
        for (const ed of res.editions ?? []) {
          if (ed.preview_url) {
            void loadEditionPreview(ed.id, ed.preview_url);
          }
        }
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

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const someSelected = rows.some((r) => r.selected);

  const setAllSelected = (checked: boolean) => {
    setRows((prev) => prev.map((row) => ({ ...row, selected: checked })));
  };

  const handlePickCover = async (editionId: string) => {
    setPickingEditionId(editionId);
    setError(null);
    try {
      const res = await pickReleaseCoverForFileTags(
        bandId,
        releaseId,
        editionId
      );
      if (!res.ok) {
        setError(res.error ?? "Could not open cover picker");
        return;
      }
      if (res.cancelled) return;
      if (res.cover_path) {
        setEditions((prev) =>
          prev.map((ed) =>
            ed.id === editionId ? { ...ed, coverPath: res.cover_path! } : ed
          )
        );
        setIncludeCover(true);
      }
      if (res.preview_url) {
        await loadEditionPreview(editionId, res.preview_url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPickingEditionId(null);
    }
  };

  const handleWrite = async () => {
    setWriting(true);
    setError(null);
    if (includeCover) {
      const neededEditionIds = new Set(
        rows.filter((r) => r.selected).map((r) => r.edition_id).filter(Boolean)
      );
      const missing = [...neededEditionIds].some(
        (id) => !editions.find((ed) => ed.id === id)?.coverPath
      );
      if (missing) {
        setError(
          "Choose a cover for each edition with selected tracks, or uncheck Embed cover art."
        );
        setWriting(false);
        return;
      }
    }
    const tracks: WriteFileTagsTrackIn[] = rows.map((row) => ({
      play_path: row.play_path,
      selected: row.selected,
      include_lyrics: row.includeLyrics,
      writers: row.writers.trim() || null,
      tags: { ...row.tags },
    }));
    const editionCovers: FileTagEditionCover[] | undefined = includeCover
      ? editions.map((ed) => ({
          edition_id: ed.id,
          cover_path: ed.coverPath,
        }))
      : undefined;
    try {
      const res = await syncReleaseFileTags(bandId, releaseId, false, {
        includeCover,
        editionCovers,
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
            <p className="release-file-tags-modal__intro">
              Embed metadata into local audio files for{" "}
              <strong>{releaseTitle}</strong>.
            </p>
            {!loading && editions.length > 0 && (
              <div className="release-file-tags-modal__cover-section">
                <div className="release-file-tags-modal__editions">
                  {editions.map((edition) => (
                    <div
                      key={edition.id}
                      className="release-file-tags-modal__edition-cover"
                    >
                      <button
                        type="button"
                        className="release-file-tags-modal__cover-btn"
                        onClick={() => void handlePickCover(edition.id)}
                        disabled={pickingEditionId === edition.id}
                        title={`Choose cover for ${edition.label}`}
                      >
                        {edition.previewUrl ? (
                          <img
                            src={edition.previewUrl}
                            alt=""
                            className="release-file-tags-modal__cover-thumb"
                            draggable={false}
                          />
                        ) : (
                          <div
                            className={`release-file-tags-modal__cover-thumb release-file-tags-modal__cover-thumb--empty${edition.loadingPreview ? " release-file-tags-modal__cover-thumb--loading" : ""}`}
                            aria-hidden
                          />
                        )}
                      </button>
                      <span className="release-file-tags-modal__edition-label">
                        {edition.label}
                      </span>
                    </div>
                  ))}
                </div>
                <MsCheckbox
                  checked={includeCover}
                  onChange={setIncludeCover}
                  label="Embed cover art"
                  className="release-file-tags-modal__cover-toggle"
                />
              </div>
            )}
            {loading && <p className="muted">Loading tracks, please wait.</p>}
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
                        <th className="release-file-tags-modal__check-col">
                          <MsCheckbox
                            checked={allSelected}
                            indeterminate={someSelected && !allSelected}
                            onChange={setAllSelected}
                            title="Select all tracks"
                          />
                        </th>
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
                              wrap
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.artist}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "artist", v)
                              }
                              wrap
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.tags.album}
                              onChange={(v) =>
                                updateRowTags(row.play_path, "album", v)
                              }
                              wrap
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
                              wrap
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.writers}
                              onChange={(v) =>
                                updateRow(row.play_path, { writers: v })
                              }
                              wrap
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
