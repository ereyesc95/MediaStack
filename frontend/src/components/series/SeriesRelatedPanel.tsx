import { useMemo, useState } from "react";
import { addSeriesRelated, removeSeriesRelated } from "../../api";
import type { ArtistCard as ArtistCardType, CardOrientation, SeriesRelatedShow } from "../../types";
import { usePhoneLayout } from "../../usePhoneLayout";
import ArtistCard from "../ArtistCard";
import ModalPortal from "../ModalPortal";
import ConfirmDialog from "../ConfirmDialog";

export type SeriesRelatedTab = "creator" | "similar";

type Props = {
  franchiseId: string;
  creator: SeriesRelatedShow[];
  similar: SeriesRelatedShow[];
  tab: SeriesRelatedTab;
  orientation?: CardOrientation;
  /** TMDb deep-link kind for related cards. */
  tmdbKind?: "tv" | "movie";
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

function toArtistCard(it: SeriesRelatedShow): ArtistCardType {
  const year =
    it.date_iso && it.date_iso.length >= 4
      ? Number(it.date_iso.slice(0, 4)) || null
      : null;
  const cover = it.cover_url || it.poster_url || null;
  return {
    id: Number(it.id ?? it.tmdb_id ?? 0) || 0,
    name: it.title || it.name || "Untitled",
    photo_url: cover,
    logo_url: null,
    icon_url: null,
    era_year: year,
    show_name_on_hover: true,
    starting_dates: it.date_iso || null,
  };
}

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
  orientation = "portrait",
  tmdbKind = "tv",
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
}: Props) {
  const isPhone = usePhoneLayout();
  const items = useMemo(
    () => (tab === "creator" ? creator : similar),
    [tab, creator, similar]
  );
  const [removeTarget, setRemoveTarget] = useState<SeriesRelatedShow | null>(
    null
  );
  const [removeBusy, setRemoveBusy] = useState(false);
  const [revealedId, setRevealedId] = useState<number | string | null>(null);

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
      <div
        className={`artist-grid artist-grid--${orientation} artist-related__grid`}
      >
        {items.map((it) => {
          const card = toArtistCard(it);
          const cardId = it.id ?? it.tmdb_id ?? card.name;
          const href = it.tmdb_id
            ? `https://www.themoviedb.org/${tmdbKind}/${it.tmdb_id}`
            : undefined;
          const open = () => {
            if (isPhone) {
              if (revealedId === cardId) {
                if (href) window.open(href, "_blank", "noreferrer");
              } else {
                setRevealedId(cardId);
              }
              return;
            }
            if (href) window.open(href, "_blank", "noreferrer");
          };
          return (
            <div key={`${tab}-${cardId}`} className="artist-related-card-wrap">
              <ArtistCard
                artist={card}
                orientation={orientation}
                tapReveal={isPhone}
                revealed={isPhone && revealedId === cardId}
                onClick={open}
              />
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
