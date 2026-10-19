import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  fetchMoviesRemote,
  saveMoviesRemote,
  type RemoteMovieLinkPayload,
} from "../../api";
import ModalPortal from "../ModalPortal";

type VideoDraft = {
  key: string;
  role: "trailer" | "extra";
  title: string;
  date_iso: string;
  url: string;
};

type Props = {
  folderPath: string;
  title?: string;
  onClose: () => void;
  onSaved: () => void;
};

let draftKey = 0;
function nextKey() {
  draftKey += 1;
  return `gv_${draftKey}`;
}

function emptyVideo(role: VideoDraft["role"]): VideoDraft {
  return {
    key: nextKey(),
    role,
    title: role === "trailer" ? "Trailer" : "",
    date_iso: "",
    url: "",
  };
}

export default function RemoteGameVideosModal({
  folderPath,
  onClose,
  onSaved,
}: Props) {
  const [trailer, setTrailer] = useState<VideoDraft>(emptyVideo("trailer"));
  const [extras, setExtras] = useState<VideoDraft[]>([emptyVideo("extra")]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMoviesRemote(folderPath)
      .then((data) => {
        if (cancelled) return;
        let nextTrailer = emptyVideo("trailer");
        const nextExtras: VideoDraft[] = [];
        for (const l of data.links || []) {
          const role = (l.role || "extra").toLowerCase();
          if (role === "movie") continue;
          const row: VideoDraft = {
            key: nextKey(),
            role: role === "trailer" ? "trailer" : "extra",
            title: l.title || "",
            date_iso: (l.date_iso || "").slice(0, 10),
            url: l.url || "",
          };
          if (row.role === "trailer" && !nextTrailer.url) nextTrailer = row;
          else if (row.role === "extra") nextExtras.push(row);
        }
        setTrailer(nextTrailer);
        setExtras(nextExtras.length ? nextExtras : [emptyVideo("extra")]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload: RemoteMovieLinkPayload[] = [];
    const trailerUrl = trailer.url.trim();
    if (trailerUrl) {
      payload.push({
        role: "trailer",
        title: trailer.title.trim() || "Trailer",
        url: trailerUrl,
        date_iso: trailer.date_iso.trim() || null,
        sort_order: payload.length,
      });
    }
    extras.forEach((l, i) => {
      const url = l.url.trim();
      if (!url) return;
      payload.push({
        role: "extra",
        title: l.title.trim() || `Extra ${i + 1}`,
        url,
        date_iso: l.date_iso.trim() || null,
        sort_order: payload.length,
      });
    });
    try {
      await saveMoviesRemote(folderPath, payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (
    row: VideoDraft,
    onPatch: (patch: Partial<VideoDraft>) => void,
    onRemove?: () => void,
    titlePlaceholder: string
  ) => (
    <div key={row.key} className="release-video-set-modal__video-row">
      <input
        type="text"
        className="release-video-set-modal__label-input remote-media-modal__title"
        value={row.title}
        placeholder={titlePlaceholder}
        onChange={(e) => onPatch({ title: e.target.value })}
      />
      <input
        type="date"
        className="release-video-set-modal__meta-input release-video-set-modal__meta-input--date remote-media-modal__date"
        value={row.date_iso}
        aria-label="Date"
        onChange={(e) => onPatch({ date_iso: e.target.value })}
      />
      <input
        type="text"
        className="release-video-set-modal__input"
        value={row.url}
        placeholder="URL"
        onChange={(e) => onPatch({ url: e.target.value })}
      />
      {onRemove ? (
        <button
          type="button"
          className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
          title="Remove"
          aria-label="Remove row"
          onClick={onRemove}
        >
          ×
        </button>
      ) : (
        <span className="release-video-set-modal__row-spacer" aria-hidden />
      )}
    </div>
  );

  const renderExtras = (
    rows: VideoDraft[],
    setRows: Dispatch<SetStateAction<VideoDraft[]>>
  ) => (
    <li className="release-video-set-modal__item">
      <div className="remote-media-modal__section-label remote-media-modal__section-label--with-add">
        <span>Extras</span>
        <button
          type="button"
          className="remote-media-modal__section-add"
          aria-label="Add extra"
          title="Add extra"
          onClick={() => setRows((prev) => [...prev, emptyVideo("extra")])}
        >
          +
        </button>
      </div>
      <div className="release-video-set-modal__videos">
        {rows.map((row) =>
          renderRow(
            row,
            (patch) =>
              setRows((prev) =>
                prev.map((x) => (x.key === row.key ? { ...x, ...patch } : x))
              ),
            rows.length > 1
              ? () => setRows((prev) => prev.filter((x) => x.key !== row.key))
              : undefined,
            "Extra title"
          )
        )}
      </div>
    </li>
  );

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal remote-media-modal remote-media-modal--videos"
        role="dialog"
        aria-labelledby="remote-game-videos-modal-title"
      >
        <div className="artist-word-cloud-modal__head">
          <h2 id="remote-game-videos-modal-title">Set videos</h2>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading ? (
          <ul className="release-video-set-modal__list ms-scrollbar">
            <li className="release-video-set-modal__item">
              <div className="remote-media-modal__section-label">Trailer</div>
              <div className="release-video-set-modal__videos">
                {renderRow(
                  trailer,
                  (patch) => setTrailer((prev) => ({ ...prev, ...patch })),
                  undefined,
                  "Trailer title"
                )}
              </div>
            </li>
            {renderExtras(extras, setExtras)}
          </ul>
        ) : null}
        <div className="modal-actions-row remote-media-modal__actions">
          <button
            type="button"
            className="btn"
            disabled={saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
