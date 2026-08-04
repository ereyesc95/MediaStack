import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { addSeriesRelated, removeSeriesRelated } from "../../api";
import type {
  ArtistCard as ArtistCardType,
  CardOrientation,
  SeriesRelatedShow,
} from "../../types";
import { usePhoneLayout } from "../../usePhoneLayout";
import ArtistCard from "../ArtistCard";
import ModalPortal from "../ModalPortal";
import ConfirmDialog from "../ConfirmDialog";

export type SeriesRelatedTab = "universe" | "creator" | "similar";
type SeriesRelatedTmdbTab = "creator" | "similar";

type ViaTag = { text: string; x: number; y: number };

type Props = {
  franchiseId: string;
  creator: SeriesRelatedShow[];
  similar: SeriesRelatedShow[];
  tab: SeriesRelatedTab;
  orientation?: CardOrientation;
  /** TMDb deep-link kind for related cards. */
  tmdbKind?: "tv" | "movie";
  /** Fallback via names when stored related cards lack via_members. */
  fallbackViaMembers?: string[];
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
  /** Prefer in-app navigation when the title exists on disk. Return true if handled. */
  onOpenLocal?: (item: SeriesRelatedShow) => boolean;
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

function viaMembersTag(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function AddRelatedModal({
  franchiseId,
  bucket,
  onClose,
  onSaved,
}: {
  franchiseId: string;
  bucket: SeriesRelatedTmdbTab;
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
            Add {bucket === "creator" ? "same talent" : "similar"} title
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
  fallbackViaMembers,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
  onOpenLocal,
}: Props) {
  const isPhone = usePhoneLayout();
  const items = useMemo(
    () => (tab === "creator" ? creator : tab === "similar" ? similar : []),
    [tab, creator, similar]
  );
  const [removeTarget, setRemoveTarget] = useState<SeriesRelatedShow | null>(
    null
  );
  const [removeBusy, setRemoveBusy] = useState(false);
  const [revealedId, setRevealedId] = useState<number | string | null>(null);
  const [viaTag, setViaTag] = useState<ViaTag | null>(null);
  const [mobileViaTag, setMobileViaTag] = useState<string | null>(null);

  const confirmRemove = async () => {
    if (!removeTarget || tab === "universe") return;
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

  const showViaTag = (e: MouseEvent, text: string) => {
    setViaTag({ text, x: e.clientX + 12, y: e.clientY + 14 });
  };
  const hideViaTag = () => setViaTag(null);

  if (tab === "universe") {
    return null;
  }

  if (!items.length && !addOpen) {
    return (
      <>
        <p className="muted artist-section-empty artist-related__empty">
          {tab === "creator"
            ? isAdmin
              ? "No other titles by the same talent yet. Refresh metadata or add one from the menu."
              : "No other titles by the same talent yet. Refresh metadata from TMDb."
            : isAdmin
              ? "No similar titles yet. Refresh metadata or add one from the menu."
              : "No similar titles yet. Refresh metadata from TMDb."}
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
          const viaText =
            tab === "creator"
              ? viaMembersTag(
                  (it.via_members?.length
                    ? it.via_members
                    : fallbackViaMembers) ?? []
                )
              : "";
          const open = () => {
            const go = () => {
              if (onOpenLocal?.(it)) return;
              if (href) window.open(href, "_blank", "noreferrer");
            };
            if (isPhone) {
              if (revealedId === cardId) {
                go();
              } else {
                setRevealedId(cardId);
                setMobileViaTag(viaText || null);
              }
              return;
            }
            go();
          };
          return (
            <div
              key={`${tab}-${cardId}`}
              className="artist-related-card-wrap"
              onMouseEnter={
                viaText ? (e) => showViaTag(e, viaText) : undefined
              }
              onMouseMove={viaText ? (e) => showViaTag(e, viaText) : undefined}
              onMouseLeave={viaText ? hideViaTag : undefined}
            >
              <ArtistCard
                artist={card}
                orientation={orientation}
                tapReveal={isPhone}
                revealed={isPhone && revealedId === cardId}
                onClick={open}
              />
              {isPhone && revealedId === cardId && mobileViaTag ? (
                <span className="artist-related-card__via-mobile">
                  via {mobileViaTag}
                </span>
              ) : null}
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

      {viaTag ? (
        <span
          className="artist-related-via-tag"
          style={{ left: viaTag.x, top: viaTag.y }}
        >
          via {viaTag.text}
        </span>
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          title={
            tab === "creator"
              ? "Remove same-talent title"
              : "Remove similar title"
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
