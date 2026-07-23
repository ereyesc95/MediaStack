import { useMemo, useState } from "react";
import { addSeriesRelated, removeSeriesRelated } from "../../api";
import type { SeriesRelatedShow } from "../../types";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import ModalPortal from "../ModalPortal";
import ConfirmDialog from "../ConfirmDialog";

export type SeriesRelatedTab = "creator" | "similar";

type Props = {
  franchiseId: string;
  creator: SeriesRelatedShow[];
  similar: SeriesRelatedShow[];
  tab: SeriesRelatedTab;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

function AddRelatedModal({
  franchiseId,
  bucket,
  onClose,
  onSaved,
}: {
  franchiseId: string;
  bucket: SeriesRelatedTab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [year, setYear] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addSeriesRelated(franchiseId, {
        bucket,
        title: title.trim(),
        tmdb_id: tmdbId.trim() || null,
        date_iso: year.trim() ? `${year.trim().slice(0, 4)}-01-01` : null,
        poster_url: posterUrl.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>
            Add {bucket === "creator" ? "same author" : "similar"} series
          </h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            TMDb ID (optional)
            <input
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="e.g. 46298"
            />
          </label>
          <label>
            Year (optional)
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="1986"
            />
          </label>
          <label>
            Poster URL (optional)
            <input
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !title.trim()}
            onClick={() => void save()}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function SeriesRelatedPanel({
  franchiseId,
  creator,
  similar,
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
}: Props) {
  const items = useMemo(
    () => (tab === "creator" ? creator : similar),
    [tab, creator, similar]
  );
  const [removeTarget, setRemoveTarget] = useState<SeriesRelatedShow | null>(
    null
  );
  const [removeBusy, setRemoveBusy] = useState(false);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const id = removeTarget.id ?? removeTarget.tmdb_id;
    if (id == null) return;
    setRemoveBusy(true);
    try {
      await removeSeriesRelated(franchiseId, id, tab);
      setRemoveTarget(null);
      onDataChanged();
    } catch {
      /* ignore */
    } finally {
      setRemoveBusy(false);
    }
  };

  if (!items.length && !addOpen) {
    return (
      <>
        <p className="muted artist-section-empty artist-related__empty">
          {tab === "creator"
            ? isAdmin
              ? "No other series by the same author yet. Refresh metadata or add one from the menu."
              : "No other series by the same author yet. Refresh metadata from TMDb."
            : isAdmin
              ? "No similar series yet. Refresh metadata or add one from the menu."
              : "No similar series yet. Refresh metadata from TMDb."}
        </p>
        {addOpen && onAddClose ? (
          <AddRelatedModal
            franchiseId={franchiseId}
            bucket={tab}
            onClose={onAddClose}
            onSaved={onDataChanged}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="series-related artist-related">
      <div className="media-release-grid series-related__grid artist-related__grid">
        {items.map((it) => {
          const cover = it.cover_url || it.poster_url || DEFAULT_DISC_URL;
          const href = it.tmdb_id
            ? `https://www.themoviedb.org/tv/${it.tmdb_id}`
            : undefined;
          const key = `${tab}-${it.id || it.tmdb_id || it.title}`;
          const inner = (
            <>
              <span
                className="media-release-card__cover"
                style={{ backgroundImage: `url("${cover}")` }}
              />
              <span className="media-release-card__dim" aria-hidden />
              <span className="media-release-card__hover">
                <span className="media-release-card__title-hover">
                  {it.title || it.name}
                </span>
              </span>
              {it.date_iso ? (
                <span className="media-release-card__date">
                  <span className="media-release-card__date-label">
                    {it.date_iso.slice(0, 4)}
                  </span>
                </span>
              ) : null}
            </>
          );
          return (
            <div key={key} className="artist-related-card-wrap">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="media-release-card media-release-card--portrait"
                  title={it.title || it.name}
                >
                  {inner}
                </a>
              ) : (
                <article
                  className="media-release-card media-release-card--portrait"
                  title={it.title || it.name}
                >
                  {inner}
                </article>
              )}
              {isAdmin ? (
                <button
                  type="button"
                  className="artist-related-card__remove"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRemoveTarget(it);
                  }}
                  aria-label={`Remove ${it.title || it.name}`}
                  title="Remove"
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {removeTarget ? (
        <ConfirmDialog
          title={
            tab === "creator"
              ? "Remove same-author series"
              : "Remove similar series"
          }
          message={`Remove “${removeTarget.title || removeTarget.name}”? Manual entries stay removed after refresh.`}
          confirmLabel="Remove"
          destructive
          busy={removeBusy}
          onConfirm={() => void confirmRemove()}
          onClose={() => !removeBusy && setRemoveTarget(null)}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <AddRelatedModal
          franchiseId={franchiseId}
          bucket={tab}
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      ) : null}
    </div>
  );
}
