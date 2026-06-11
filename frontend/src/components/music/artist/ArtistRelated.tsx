import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteBandRelated, resolveBandRelatedPhotos } from "../../../api";
import type {
  CardOrientation,
  EntityRelatedPayload,
  RelatedCardItem,
  RelatedTab,
} from "../../../types";
import ArtistCard from "../../ArtistCard";
import ConfirmDialog from "../../ConfirmDialog";
import { isMobilePortraitLayout, useDeviceLayout } from "../../../usePhoneLayout";

type Props = {
  related: EntityRelatedPayload;
  tab: RelatedTab;
  hidden?: boolean;
  orientation: CardOrientation;
  bandId: number;
  isAdmin?: boolean;
  fetchInProgress?: boolean;
  onOpenArtist: (id: number) => void;
  onDataChanged: (options?: { silent?: boolean }) => void;
};

type ViaTag = {
  text: string;
  x: number;
  y: number;
};

const MAX_PHOTO_BATCHES = 6;

function externalUrl(item: RelatedCardItem): string | null {
  const u = item.external_urls || {};
  if (u.wikipedia) return u.wikipedia;
  if (u.musicbrainz) return u.musicbrainz;
  const name = encodeURIComponent((item.name || "artist").replace(/■/g, ","));
  return `https://www.google.com/search?q=${name}+music`;
}

function toArtistCard(item: RelatedCardItem) {
  return {
    id: item.local_band_id ?? item.id,
    code: item.code,
    name: item.name,
    photo_url: item.photo_url,
    logo_url: item.logo_url,
    icon_url: item.icon_url,
    era_year: item.era_year,
    show_name_on_hover: item.show_name_on_hover,
  };
}

function viaMembersTag(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export default function ArtistRelated({
  related,
  tab,
  hidden,
  orientation,
  bandId,
  isAdmin,
  fetchInProgress = false,
  onOpenArtist,
  onDataChanged,
}: Props) {
  const deviceLayout = useDeviceLayout();
  const isPhone = isMobilePortraitLayout(deviceLayout);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RelatedCardItem | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [viaTag, setViaTag] = useState<ViaTag | null>(null);
  const [mobileViaTag, setMobileViaTag] = useState<string | null>(null);
  const photoResolveAttempts = useRef(0);
  const photoResolveBandId = useRef(bandId);

  const items = useMemo(
    () => (tab === "similar" ? related.similar : related.participations),
    [related, tab]
  );

  const needsPhotos = useMemo(
    () =>
      items.some(
        (item) =>
          !item.photo_url &&
          !item.logo_url &&
          !item.icon_url &&
          Boolean(item.code || item.local_band_id)
      ),
    [items]
  );

  useEffect(() => {
    setRevealedId(null);
    setViaTag(null);
    setMobileViaTag(null);
  }, [items, tab, orientation, isPhone]);

  useEffect(() => {
    photoResolveAttempts.current = 0;
  }, [bandId, tab]);

  useEffect(() => {
    if (
      hidden ||
      fetchInProgress ||
      !needsPhotos ||
      photoResolveAttempts.current >= MAX_PHOTO_BATCHES
    ) {
      return;
    }
    const requestedBand = bandId;
    photoResolveBandId.current = requestedBand;
    photoResolveAttempts.current += 1;
    let cancelled = false;
    resolveBandRelatedPhotos(requestedBand)
      .then(() => {
        if (!cancelled && photoResolveBandId.current === requestedBand) {
          onDataChanged({ silent: true });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hidden, fetchInProgress, needsPhotos, bandId, onDataChanged]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".artist-card")) {
        setRevealedId(null);
        setMobileViaTag(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [isPhone, revealedId]);

  const openExternal = useCallback((item: RelatedCardItem) => {
    const url = externalUrl(item);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleCardClick = useCallback(
    (item: RelatedCardItem) => {
      const cardId = item.local_band_id ?? item.id;
      const viaText =
        tab === "participations"
          ? viaMembersTag(item.via_members ?? [])
          : "";
      const openInApp = Boolean(item.local_band_id && item.in_library);

      if (openInApp) {
        if (!isPhone) {
          onOpenArtist(item.local_band_id!);
          return;
        }
        if (revealedId === cardId) {
          setRevealedId(null);
          setMobileViaTag(null);
          onOpenArtist(item.local_band_id!);
        } else {
          setRevealedId(cardId);
          setMobileViaTag(viaText || null);
        }
        return;
      }

      if (isPhone) {
        if (revealedId === cardId) {
          setRevealedId(null);
          setMobileViaTag(null);
          openExternal(item);
        } else {
          setRevealedId(cardId);
          setMobileViaTag(viaText || null);
        }
        return;
      }

      openExternal(item);
    },
    [isPhone, revealedId, onOpenArtist, tab, openExternal]
  );

  function showViaTag(e: React.MouseEvent, text: string) {
    if (!text || isPhone) return;
    setViaTag({ text, x: e.clientX, y: e.clientY });
  }

  function hideViaTag() {
    setViaTag(null);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await deleteBandRelated(bandId, removeTarget.id);
      setRemoveTarget(null);
      onDataChanged();
    } catch {
      /* ignore */
    } finally {
      setRemoveBusy(false);
    }
  }

  const fetching = fetchInProgress && items.length === 0;

  return (
    <div className={`artist-related${hidden ? " artist-panel--hidden" : ""}`}>
      {fetching && items.length === 0 && (
        <p className="muted artist-related__loading">Loading related artists…</p>
      )}
      {!fetching && items.length === 0 && (
        <p className="muted artist-related__empty">
          {isAdmin
            ? "No entries yet. Use the menu to refresh or add similar artists."
            : "No related artists available."}
        </p>
      )}
      {items.length > 0 && (
        <div className={`artist-grid artist-grid--${orientation} artist-related__grid`}>
          {items.map((item) => {
            const cardId = item.local_band_id ?? item.id;
            const showRemove = isAdmin && tab === "similar";
            const viaText =
              tab === "participations"
                ? viaMembersTag(item.via_members ?? [])
                : "";
            return (
              <div
                key={item.id}
                className="artist-related-card-wrap"
                onMouseEnter={
                  viaText ? (e) => showViaTag(e, viaText) : undefined
                }
                onMouseMove={viaText ? (e) => showViaTag(e, viaText) : undefined}
                onMouseLeave={viaText ? hideViaTag : undefined}
              >
                <ArtistCard
                  artist={toArtistCard(item)}
                  orientation={orientation}
                  tapReveal={isPhone}
                  revealed={isPhone && revealedId === cardId}
                  onClick={() => handleCardClick(item)}
                />
                {isPhone && revealedId === cardId && mobileViaTag && (
                  <span className="artist-related-card__via-mobile">
                    via {mobileViaTag}
                  </span>
                )}
                {showRemove && (
                  <button
                    type="button"
                    className="artist-related-card__remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoveTarget(item);
                    }}
                    aria-label={`Remove ${item.name}`}
                    title={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viaTag && !hidden && (
        <span
          className="artist-related-via-tag"
          style={{ left: viaTag.x, top: viaTag.y }}
        >
          via {viaTag.text}
        </span>
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove similar artist"
          message={`Remove “${removeTarget.name}” from similar artists? Manual entries stay removed after refresh.`}
          confirmLabel="Remove"
          destructive
          busy={removeBusy}
          onConfirm={() => void confirmRemove()}
          onClose={() => !removeBusy && setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
