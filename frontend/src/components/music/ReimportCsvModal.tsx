import { useRef, useState } from "react";
import { reimportPlaylistCsv } from "../../api";
import ModalPortal from "../ModalPortal";
import { IconFileImport } from "../MenuIcons";

type Props = {
  playlistId: number;
  playlistName: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

export default function ReimportCsvModal({
  playlistId,
  playlistName,
  onClose,
  onDone,
}: Props) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [addNewOnly, setAddNewOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const csvStem = csvFile
    ? csvFile.name.replace(/\.csv$/i, "").trim()
    : "";
  const nameLooksWrong =
    Boolean(csvStem) &&
    csvStem.toLowerCase() !== playlistName.trim().toLowerCase();
  const mode = addNewOnly ? "append" : "overwrite";

  async function handleSubmit() {
    if (!csvFile) {
      setError("Select a file to refresh this playlist.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await reimportPlaylistCsv(playlistId, {
        file: csvFile,
        mode,
      });
      const added = result.added ?? result.total ?? 0;
      const skipped = result.skipped ?? 0;
      const message =
        mode === "overwrite"
          ? `Refreshed “${result.name ?? playlistName}” (${added} tracks).`
          : skipped > 0
            ? `Added ${added} new track${added === 1 ? "" : "s"} to “${result.name ?? playlistName}” (${skipped} already present).`
            : added > 0
              ? `Added ${added} new track${added === 1 ? "" : "s"} to “${result.name ?? playlistName}”.`
              : `No new tracks to add to “${result.name ?? playlistName}”.`;
      onDone(message);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      try {
        const parsed = JSON.parse(raw) as { detail?: string };
        setError(parsed.detail ?? raw);
      } catch {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel add-playlist-modal release-add-playlist-modal reimport-csv-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head release-add-playlist-modal__head">
          <div className="release-add-playlist-modal__titles">
            <h3>Refresh Playlist: {playlistName}</h3>
          </div>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="add-playlist-modal__form reimport-csv-modal__form">
          <p className="add-playlist-modal__hint">
            Import your Spotify playlists from a file. Find them{" "}
            <a href="https://exportify.net/" target="_blank" rel="noopener noreferrer">
              here
            </a>
            .
          </p>
          <div className="add-playlist-modal__file-row">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                setCsvFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <button
              type="button"
              className="btn btn--small reimport-csv-modal__select"
              onClick={() => fileRef.current?.click()}
            >
              <IconFileImport className="add-playlist-modal__tab-icon" />
              Select a file
            </button>
            <span className="add-playlist-modal__file-name reimport-csv-modal__file-name">
              {csvFile?.name ?? "No file selected"}
            </span>
          </div>

          {nameLooksWrong && (
            <p className="error add-playlist-modal__error" role="alert">
              Filename “{csvStem}” does not match “{playlistName}”. Refresh
              will be rejected and the playlist will stay unchanged.
            </p>
          )}

          {error && (
            <p className="error add-playlist-modal__error" role="alert">
              {error}
            </p>
          )}

          <div className="reimport-csv-modal__footer">
            <label className="reimport-csv-modal__check">
              <input
                type="checkbox"
                checked={addNewOnly}
                onChange={(e) => setAddNewOnly(e.target.checked)}
              />
              <span>
                {addNewOnly ? "Add new songs only" : "Overwriting playlist"}
              </span>
            </label>
            <button
              type="button"
              className="btn reimport-csv-modal__refresh"
              onClick={() => void handleSubmit()}
              disabled={busy || !csvFile || nameLooksWrong}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
