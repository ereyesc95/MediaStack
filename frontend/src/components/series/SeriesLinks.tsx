import { useState } from "react";
import type { RelatedMediaApi } from "../../api";
import { IconEditProfile } from "../MenuIcons";
import SeriesLinkFormModal, {
  type SeriesLinkEditItem,
} from "./SeriesLinkFormModal";
import type { SeriesOverview } from "../../types";

function absoluteLinkUrl(raw: string): string {
  const url = (raw || "").trim();
  if (!url) return "#";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

type Props = {
  franchiseId: string;
  links: SeriesOverview["links"];
  tab: string;
  isAdmin?: boolean;
  linkApi?: RelatedMediaApi;
  leafId?: string | null;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

export default function SeriesLinks({
  franchiseId,
  links,
  tab,
  isAdmin,
  linkApi = "series",
  leafId,
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
              href={absoluteLinkUrl(item.url)}
              target="_blank"
              rel="noreferrer"
              className="artist-link-card"
              title={item.label}
            >
              <span className="artist-link-card__logo">
                <img src={item.logo_url || "/api/assets/links/link.svg"} alt="" />
              </span>
            </a>
            {isAdmin && item.id ? (
              <button
                type="button"
                className="artist-link-card__edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditLink({
                    id: String(item.id),
                    label: item.label,
                    url: item.url,
                    category: item.category,
                    logo_url: item.logo_url ?? undefined,
                    logo_key: item.logo_key ?? null,
                  });
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
          linkApi={linkApi}
          leafId={leafId}
          onClose={() => setEditLink(null)}
          onSaved={onDataChanged}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <SeriesLinkFormModal
          franchiseId={franchiseId}
          defaultCategory={tab}
          linkApi={linkApi}
          leafId={leafId}
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
