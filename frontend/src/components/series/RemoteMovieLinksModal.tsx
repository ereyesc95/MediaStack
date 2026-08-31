import { useEffect, useState } from "react";
import {
  fetchMoviesRemote,
  saveMoviesRemote,
  type RemoteMovieLinkPayload,
} from "../../api";
import ModalPortal from "../ModalPortal";

type LinkDraft = {
  key: string;
  role: "movie" | "trailer" | "extra";
  title: string;
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
  return `lnk_${draftKey}`;
}

function emptyLink(role: LinkDraft["role"] = "extra"): LinkDraft {
  return {
    key: nextKey(),
    role,
    title: role === "movie" ? "Movie" : role === "trailer" ? "Trailer" : "",
    url: "",
  };
}

export default function RemoteMovieLinksModal({
  folderPath,
  onClose,
  onSaved,
}: Props) {
  const [movie, setMovie] = useState<LinkDraft>(emptyLink("movie"));
  const [trailer, setTrailer] = useState<LinkDraft>(emptyLink("trailer"));
  const [extras, setExtras] = useState<LinkDraft[]>([]);
  const [showExtras, setShowExtras] = useState(false);
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
        let nextMovie = emptyLink("movie");
        let nextTrailer = emptyLink("trailer");
        const nextExtras: LinkDraft[] = [];
        for (const l of data.links || []) {
          const row: LinkDraft = {
            key: nextKey(),
            role: (l.role || "extra") as LinkDraft["role"],
            title: l.title || "",
            url: l.url || "",
          };
          if (row.role === "movie" && !nextMovie.url) nextMovie = row;
          else if (row.role === "trailer" && !nextTrailer.url) nextTrailer = row;
          else nextExtras.push({ ...row, role: "extra" });
        }
        setMovie(nextMovie);
        setTrailer(nextTrailer);
        setExtras(nextExtras.length ? nextExtras : []);
        setShowExtras(nextExtras.length > 0);
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
    for (const l of [movie, trailer, ...(showExtras ? extras : [])]) {
      const url = l.url.trim();
      if (!url) continue;
      payload.push({
        role: l.role,
        title:
          l.title.trim() ||
          (l.role === "movie"
            ? "Movie"
            : l.role === "trailer"
              ? "Trailer"
              : "Extra"),
        url,
        sort_order: payload.length,
      });
    }
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
    link: LinkDraft,
    onPatch: (patch: Partial<LinkDraft>) => void,
    onRemove?: () => void
  ) => (
    <div key={link.key} className="release-video-set-modal__video-row">
      <input
        type="text"
        className="release-video-set-modal__label-input remote-media-modal__title"
        value={link.title}
        placeholder={
          link.role === "movie"
            ? "Movie"
            : link.role === "trailer"
              ? "Trailer"
              : "Extra title"
        }
        onChange={(e) => onPatch({ title: e.target.value })}
      />
      <input
        type="text"
        className="release-video-set-modal__input"
        value={link.url}
        placeholder="URL"
        onChange={(e) => onPatch({ url: e.target.value })}
      />
      {onRemove ? (
        <button
          type="button"
          className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
          title="Remove"
          aria-label="Remove link"
          onClick={onRemove}
        >
          ×
        </button>
      ) : (
        <span className="release-video-set-modal__row-spacer" aria-hidden />
      )}
    </div>
  );

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal remote-media-modal remote-media-modal--wide"
        role="dialog"
        aria-labelledby="remote-movie-modal-title"
      >
        <div className="artist-word-cloud-modal__head">
          <h2 id="remote-movie-modal-title">Set links</h2>
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
              <div className="remote-media-modal__section-label">Movie</div>
              <div className="release-video-set-modal__videos">
                {renderRow(movie, (patch) => setMovie({ ...movie, ...patch }))}
              </div>
            </li>
            <li className="release-video-set-modal__item">
              <div className="remote-media-modal__section-label">Trailer</div>
              <div className="release-video-set-modal__videos">
                {renderRow(trailer, (patch) =>
                  setTrailer({ ...trailer, ...patch })
                )}
              </div>
            </li>
            {showExtras ? (
              <li className="release-video-set-modal__item">
                <div className="remote-media-modal__section-label">Extras</div>
                <div className="release-video-set-modal__videos">
                  {(extras.length ? extras : [emptyLink("extra")]).map((link) =>
                    renderRow(
                      link,
                      (patch) =>
                        setExtras((prev) => {
                          const list = prev.length ? prev : [link];
                          return list.map((x) =>
                            x.key === link.key ? { ...x, ...patch } : x
                          );
                        }),
                      () =>
                        setExtras((prev) =>
                          prev.filter((x) => x.key !== link.key)
                        )
                    )
                  )}
                  <button
                    type="button"
                    className="btn ghost remote-media-modal__add-row"
                    onClick={() =>
                      setExtras((prev) => [...prev, emptyLink("extra")])
                    }
                  >
                    Add extra
                  </button>
                </div>
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="modal-actions-row remote-media-modal__actions">
          <div className="remote-media-modal__action-group">
            {!showExtras ? (
              <button
                type="button"
                className="btn ghost"
                disabled={saving || loading}
                onClick={() => {
                  setShowExtras(true);
                  setExtras((prev) =>
                    prev.length ? prev : [emptyLink("extra")]
                  );
                }}
              >
                Extras
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost"
                disabled={saving || loading}
                onClick={() => {
                  setShowExtras(false);
                  setExtras([]);
                }}
              >
                Remove extras
              </button>
            )}
          </div>
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
