import { useState } from "react";
import { IconEditProfile } from "../MenuIcons";
import SeriesLinkFormModal, {
  type SeriesLinkEditItem,
} from "./SeriesLinkFormModal";

type SeriesLinkItem = SeriesLinkEditItem;

type SeriesLinksPayload = {
  categories: { id: string; label: string; count: number }[];
  groups: Partial<Record<string, SeriesLinkItem[]>>;
};

type Props = {
  franchiseId: string;
  links: SeriesLinksPayload;
  tab: string;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

export default function SeriesLinks({
  franchiseId,
  links,
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
}: Props) {
  const [editLink, setEditLink] = useState<SeriesLinkEditItem | null>(null);
  const items = links.groups?.[tab] || [];

  if (!items.length && !addOpen) {
    return (
      <p className="muted artist-section-empty artist-links__empty">
        No links yet. Refresh metadata from TMDb via the menu
        {isAdmin ? ", or add one from the menu." : "."}
      </p>
    );
  }

  const count = Math.min(Math.max(items.length, 1), 8);
  return (
    <div className="artist-links">
      <div
        className="artist-links-grid"
        data-count={count}
        data-many={items.length > 8 ? "" : undefined}
      >
        {items.map((item) => (
          <div
            key={`${item.id ?? item.label}-${item.url}`}
            className="artist-link-card-wrap"
          >
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="artist-link-card"
              title={item.label}
            >
              <span className="artist-link-card__logo">
                <img src={item.logo_url || "/assets/links/link.svg"} alt="" />
              </span>
            </a>
            {isAdmin && item.id ? (
              <button
                type="button"
                className="artist-link-card__edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditLink(item);
                }}
                aria-label={`Edit ${item.label}`}
                title={`Edit ${item.label}`}
              >
                <IconEditProfile />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {editLink ? (
        <SeriesLinkFormModal
          franchiseId={franchiseId}
          link={editLink}
          defaultCategory={tab}
          onClose={() => setEditLink(null)}
          onSaved={onDataChanged}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <SeriesLinkFormModal
          franchiseId={franchiseId}
          defaultCategory={tab}
          onClose={onAddClose}
          onSaved={() => {
            onAddClose();
            onDataChanged();
          }}
        />
      ) : null}
    </div>
  );
}
