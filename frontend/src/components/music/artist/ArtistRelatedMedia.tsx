import { useEffect, useMemo, useState } from "react";
import {
  addBandSubjectMediaLink,
  fetchBandMediaRelated,
  removeBandSubjectMediaLink,
  resolveBooksPath,
  resolveGamesPath,
} from "../../../api";
import type {
  ArtistCard as ArtistCardType,
  BandMediaRelatedPayload,
  CardOrientation,
  FranchiseMediaEntry,
  RelatedTab,
} from "../../../types";
import { moviesLeafFromFolderPath } from "../../../openMediaFromPath";
import { usePhoneLayout } from "../../../usePhoneLayout";
import ArtistCard from "../../ArtistCard";
import ConfirmDialog from "../../ConfirmDialog";
import ModalPortal from "../../ModalPortal";

const MEDIA_TABS: RelatedTab[] = ["movies", "series", "books", "games"];

type Props = {
  bandId: number;
  tab: RelatedTab;
  hidden?: boolean;
  orientation: CardOrientation;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged?: () => void;
  onOpenMoviesLeaf?: (
    franchiseId: string,
    filmId: string,
    opts?: { franchiseName?: string; filmTitle?: string }
  ) => void;
  onOpenSeriesFolder?: (folderPath: string) => void;
  onOpenBooksLeaf?: (
    franchiseId: string,
    bookId?: string,
    opts?: { franchiseName?: string; bookTitle?: string }
  ) => void;
  onOpenGamesLeaf?: (
    franchiseId: string,
    gameId?: string,
    opts?: { franchiseName?: string; gameTitle?: string }
  ) => void;
};

function toCard(
  entry: FranchiseMediaEntry,
  orient: CardOrientation
): ArtistCardType {
  const year =
    entry.date_iso && entry.date_iso.length >= 4
      ? Number(entry.date_iso.slice(0, 4)) || null
      : null;
  const portrait = entry.portrait_url || entry.cover_url || null;
  const landscape = entry.landscape_url || entry.banner_url || portrait;
  const banner = entry.banner_url || entry.landscape_url || portrait;
  const photo =
    orient === "banner"
      ? banner
      : orient === "landscape"
        ? landscape
        : orient === "icons"
          ? null
          : portrait;
  return {
    id: 0,
    name: entry.title || "Untitled",
    photo_url: photo,
    logo_url: entry.logo_url || null,
    icon_url: null,
    era_year: year,
    show_name_on_hover: true,
    starting_dates: entry.date_iso || null,
  };
}

function AddSubjectModal({
  bandId,
  onClose,
  onSaved,
}: {
  bandId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [path, setPath] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!path.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addBandSubjectMediaLink(bandId, {
        path: path.trim(),
        reason: reason.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add link");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add subject media link"
      >
        <div className="modal-panel-header">
          <h3>Add related media</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            Media folder path
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Movies/E/Elvis/2022.06.24. Elvis"
              autoFocus
            />
          </label>
          <label>
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="biopic subject"
            />
          </label>
        </div>
        <div className="modal-actions-row">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !path.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function ArtistRelatedMedia({
  bandId,
  tab,
  hidden,
  orientation,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
  onOpenMoviesLeaf,
  onOpenSeriesFolder,
  onOpenBooksLeaf,
  onOpenGamesLeaf,
}: Props) {
  const mobilePortrait = usePhoneLayout();
  const orient: CardOrientation =
    orientation === "badge" ? "banner" : orientation;
  const [payload, setPayload] = useState<BandMediaRelatedPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FranchiseMediaEntry | null>(
    null
  );
  const [removeBusy, setRemoveBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const active = MEDIA_TABS.includes(tab);

  useEffect(() => {
    if (hidden || !active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBandMediaRelated(bandId)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, hidden, active]);

  useEffect(() => {
    setRevealedId(null);
    setOpenError(null);
  }, [tab, bandId]);

  const items = useMemo(() => {
    if (!payload || !MEDIA_TABS.includes(tab)) return [];
    const list = payload[tab] || [];
    return [...list].sort((a, b) =>
      (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
        numeric: true,
      })
    );
  }, [payload, tab]);

  const openEntry = async (entry: FranchiseMediaEntry) => {
    const path = (entry.path || "").replace(/\\/g, "/");
    if (!path) return;
    setOpenError(null);
    if (tab === "movies" && onOpenMoviesLeaf) {
      try {
        const leaf = await moviesLeafFromFolderPath(path);
        if (!leaf) {
          setOpenError("Could not open that movie path.");
          return;
        }
        onOpenMoviesLeaf(leaf.franchiseId, leaf.filmId, {
          franchiseName: leaf.franchiseName,
          filmTitle: leaf.filmTitle,
        });
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Could not open movie.");
      }
      return;
    }
    if (tab === "series" && onOpenSeriesFolder) {
      onOpenSeriesFolder(path);
      return;
    }
    if (tab === "books" && onOpenBooksLeaf) {
      try {
        const hit = await resolveBooksPath(path);
        onOpenBooksLeaf(hit.work_id, hit.book_id ?? undefined, {
          franchiseName: hit.name,
          bookTitle: hit.book_title,
        });
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Could not open book.");
      }
      return;
    }
    if (tab === "games" && onOpenGamesLeaf) {
      try {
        const hit = await resolveGamesPath(path);
        onOpenGamesLeaf(hit.franchise_id, hit.game_id ?? undefined, {
          franchiseName: hit.name || entry.franchise_display || entry.title,
          gameTitle: hit.game_title || undefined,
        });
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Could not open game.");
      }
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const linkId = (removeTarget as FranchiseMediaEntry & {
      subject_link_id?: number;
    }).subject_link_id;
    if (linkId == null) {
      setRemoveTarget(null);
      return;
    }
    setRemoveBusy(true);
    try {
      await removeBandSubjectMediaLink(bandId, linkId);
      const next = await fetchBandMediaRelated(bandId);
      setPayload(next);
      onDataChanged?.();
    } catch {
      /* ignore */
    } finally {
      setRemoveBusy(false);
      setRemoveTarget(null);
    }
  };

  if (hidden || !active) return null;

  return (
    <div className="artist-related">
      {openError ? <p className="error artist-related__empty">{openError}</p> : null}
      {loading && !payload ? (
        <p className="muted artist-related__empty">Loading related media…</p>
      ) : error ? (
        <p className="muted artist-related__empty">{error}</p>
      ) : items.length === 0 ? (
        <p className="muted artist-related__empty">
          No related {tab} yet
          {isAdmin
            ? " — add a subject link (biopic / tribute) or match franchise folders."
            : "."}
        </p>
      ) : (
        <div
          className={`artist-grid artist-grid--${orient} artist-related__grid`}
        >
          {items.map((entry) => {
            const key = entry.path || entry.title;
            const card = toCard(entry, orient);
            const linkId = (
              entry as FranchiseMediaEntry & { subject_link_id?: number }
            ).subject_link_id;
            return (
              <div key={key} className="artist-related-card-wrap">
                <ArtistCard
                  artist={card}
                  orientation={orient}
                  showDateOnHover
                  tapReveal={mobilePortrait}
                  revealed={mobilePortrait && revealedId === key}
                  onClick={() => {
                    if (mobilePortrait) {
                      if (revealedId === key) {
                        void openEntry(entry);
                      } else {
                        setRevealedId(key);
                      }
                      return;
                    }
                    void openEntry(entry);
                  }}
                />
                {isAdmin && linkId != null ? (
                  <button
                    type="button"
                    className="artist-related-card__remove"
                    title="Remove subject link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoveTarget(entry);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && isAdmin ? (
        <AddSubjectModal
          bandId={bandId}
          onClose={() => onAddClose?.()}
          onSaved={() => {
            void fetchBandMediaRelated(bandId).then(setPayload);
            onDataChanged?.();
          }}
        />
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          title="Remove subject link"
          message={`Unlink “${removeTarget.title}” from this artist?`}
          confirmLabel={removeBusy ? "Removing…" : "Remove"}
          destructive
          busy={removeBusy}
          onConfirm={() => void confirmRemove()}
          onClose={() => !removeBusy && setRemoveTarget(null)}
        />
      ) : null}
    </div>
  );
}
