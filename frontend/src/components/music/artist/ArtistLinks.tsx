import { useEffect, useMemo, useState } from "react";
import { IconEditProfile } from "../../MenuIcons";
import type { EntityLinksPayload, LinkCategory, LinkItem } from "../../../types";
import LinkFormModal from "./LinkFormModal";

type Props = {
  links: EntityLinksPayload;
  tab: LinkCategory;
  hidden?: boolean;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

function LinkCard({
  item,
  isAdmin,
  onEdit,
}: {
  item: LinkItem;
  isAdmin?: boolean;
  onEdit: (item: LinkItem) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [item.logo_url]);

  const isUploaded = item.logo_url.includes("/api/media/file");

  return (
    <div className="artist-link-card-wrap">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="artist-link-card"
        title={item.label}
      >
        <span className="artist-link-card__logo">
          {!logoFailed ? (
            <img
              src={item.logo_url}
              alt=""
              className={
                isUploaded ? "artist-link-card__logo-img--upload" : undefined
              }
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <img src="/assets/links/link.svg" alt="" />
          )}
        </span>
      </a>
      {isAdmin && (
        <button
          type="button"
          className="artist-link-card__edit"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(item);
          }}
          aria-label={`Edit ${item.label}`}
          title={`Edit ${item.label}`}
        >
          <IconEditProfile />
        </button>
      )}
    </div>
  );
}

export default function ArtistLinks({
  links,
  tab,
  hidden,
  isAdmin,
  addOpen = false,
  onAddClose,
  onDataChanged,
}: Props) {
  const [formLink, setFormLink] = useState<LinkItem | null>(null);

  const items = useMemo(() => links.groups[tab] ?? [], [links.groups, tab]);

  if (!links.categories.length) {
    return (
      <div className={`artist-links${hidden ? " artist-panel--hidden" : ""}`}>
        <p className="muted artist-links__empty">
          {isAdmin
            ? "No links yet. Use the menu to add one or refresh from MusicBrainz."
            : "No links available."}
        </p>
        {addOpen && onAddClose && (
          <LinkFormModal
            entityType={links.entity_type}
            entityId={links.entity_id}
            defaultCategory={tab}
            onClose={onAddClose}
            onSaved={() => {
              onAddClose();
              onDataChanged();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`artist-links${hidden ? " artist-panel--hidden" : ""}`}>
      <div
        className="artist-links-grid"
        data-count={Math.max(items.length, 1)}
        data-many={items.length > 6 ? "" : undefined}
      >
        {items.length === 0 ? (
          <p className="muted artist-links__empty">No links in this category.</p>
        ) : (
          items.map((item) => (
            <LinkCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onEdit={setFormLink}
            />
          ))
        )}
      </div>

      {addOpen && onAddClose && (
        <LinkFormModal
          entityType={links.entity_type}
          entityId={links.entity_id}
          defaultCategory={tab}
          onClose={onAddClose}
          onSaved={() => {
            onAddClose();
            onDataChanged();
          }}
        />
      )}

      {formLink && (
        <LinkFormModal
          entityType={links.entity_type}
          entityId={links.entity_id}
          link={formLink}
          onClose={() => setFormLink(null)}
          onSaved={() => {
            setFormLink(null);
            onDataChanged();
          }}
        />
      )}
    </div>
  );
}
