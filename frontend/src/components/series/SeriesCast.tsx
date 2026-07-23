import { useEffect, useMemo, useState } from "react";
import {
  addSeriesCastMember,
  removeSeriesCastMember,
} from "../../api";
import type { SeriesCastMember, SeriesCastTab } from "../../types";
import { useDeviceLayout } from "../../usePhoneLayout";
import { IconEditProfile } from "../MenuIcons";
import ModalPortal from "../ModalPortal";

type Props = {
  franchiseId: string;
  franchiseName: string;
  cast: {
    characters?: SeriesCastMember[];
    staff?: SeriesCastMember[];
    animated?: SeriesCastMember[];
    people?: SeriesCastMember[];
  };
  tab: SeriesCastTab;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function splitRows<T>(items: T[], perRow?: number): { top: T[]; bottom: T[] } {
  if (perRow != null && perRow > 0) {
    return { top: items.slice(0, perRow), bottom: items.slice(perRow) };
  }
  const topCount = Math.ceil(items.length / 2);
  return { top: items.slice(0, topCount), bottom: items.slice(topCount) };
}

function MemberCard({
  member,
  onSelect,
}: {
  member: SeriesCastMember;
  onSelect: (m: SeriesCastMember) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [charFailed, setCharFailed] = useState(false);
  const roles =
    member.roles?.filter(Boolean).join(" · ") ||
    member.character ||
    undefined;
  const front = member.photo_url && !photoFailed ? member.photo_url : null;
  const back =
    member.character_photo_url && !charFailed
      ? member.character_photo_url
      : null;

  useEffect(() => {
    setPhotoFailed(false);
    setCharFailed(false);
  }, [member.photo_url, member.character_photo_url]);

  return (
    <button
      type="button"
      className={`artist-lineup-card series-cast-card${
        member.is_deceased ? " artist-lineup-card--deceased" : ""
      }`}
      onClick={() => onSelect(member)}
    >
      <span
        className={`artist-lineup-card__photo series-cast-card__photo${
          back ? " series-cast-card__photo--flip" : ""
        }`}
      >
        <span className="series-cast-card__photo-inner">
          <span className="series-cast-card__face series-cast-card__face--front">
            {front ? (
              <img
                src={front}
                alt=""
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span className="artist-lineup-card__ph">
                {initials(member.name)}
              </span>
            )}
          </span>
          {back ? (
            <span className="series-cast-card__face series-cast-card__face--back">
              <img
                src={back}
                alt=""
                onError={() => setCharFailed(true)}
              />
            </span>
          ) : null}
        </span>
      </span>
      <span className="artist-lineup-card__name">
        {member.name}
        {member.is_deceased ? (
          <span className="artist-lineup-card__deceased" title="Deceased">
            †
          </span>
        ) : null}
      </span>
      {roles ? <span className="artist-lineup-card__roles">{roles}</span> : null}
    </button>
  );
}

function CastMemberModal({
  member,
  franchiseId,
  franchiseName,
  isAdmin,
  bucket,
  onClose,
  onDataChanged,
}: {
  member: SeriesCastMember;
  franchiseId: string;
  franchiseName: string;
  isAdmin?: boolean;
  bucket: SeriesCastTab;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleRemove = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      await removeSeriesCastMember(franchiseId, member.id, bucket);
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tmdbPerson =
    member.id != null && String(member.id).match(/^\d+$/)
      ? `https://www.themoviedb.org/person/${member.id}`
      : null;

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-member-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header artist-member-modal__header">
          <div className="artist-member-modal__header-actions">
            {isAdmin && member.id != null ? (
              <button
                type="button"
                className="artist-member-modal__edit-icon"
                aria-label="Remove member"
                title="Remove from cast"
                onClick={() => setConfirmRemove(true)}
              >
                <IconEditProfile />
              </button>
            ) : null}
            <button
              type="button"
              className="modal-close-x"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="artist-member-modal__body">
          <div className="artist-member-modal__hero">
            <span className="artist-member-modal__photo-btn">
              {member.photo_url && !photoFailed ? (
                <img
                  src={member.photo_url}
                  alt=""
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <span className="artist-member-modal__ph">
                  {initials(member.name)}
                </span>
              )}
            </span>

            <div className="artist-member-modal__info">
              <p className="artist-member-modal__title">
                {member.name}
                {member.is_deceased ? (
                  <span
                    className="artist-member-modal__deceased"
                    title="Deceased"
                  >
                    †
                  </span>
                ) : null}
              </p>

              {member.character ? (
                <p className="artist-member-modal__row">
                  <span className="artist-member-modal__label">
                    Character:
                  </span>
                  <span className="artist-member-modal__value">
                    {member.character}
                  </span>
                </p>
              ) : null}

              {member.roles && member.roles.length > 0 ? (
                <p className="artist-member-modal__row">
                  <span className="artist-member-modal__label">Roles:</span>
                  <span className="artist-member-modal__value">
                    {member.roles.filter(Boolean).join(" · ")}
                  </span>
                </p>
              ) : null}

              <div className="artist-member-modal__row artist-member-modal__row--projects">
                <span className="artist-member-modal__label">
                  Related projects:
                </span>
                <ul className="artist-member-modal__projects">
                  <li>
                    <span className="artist-member-modal__project-name">
                      {franchiseName}
                    </span>
                  </li>
                </ul>
              </div>

              {tmdbPerson ? (
                <p className="artist-member-modal__row artist-member-modal__row--links">
                  <span className="artist-member-modal__label">Links:</span>
                  <span className="artist-member-modal__links-inline">
                    <a
                      href={tmdbPerson}
                      target="_blank"
                      rel="noreferrer"
                      className="artist-member-modal__link-name"
                    >
                      TMDb
                    </a>
                  </span>
                </p>
              ) : null}

              {error ? <p className="error">{error}</p> : null}
            </div>
          </div>
        </div>

        {confirmRemove ? (
          <div className="modal-panel-actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {busy ? "Removing…" : "Remove from cast"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </ModalPortal>
  );
}

function AddCastModal({
  franchiseId,
  bucket,
  onClose,
  onSaved,
}: {
  franchiseId: string;
  bucket: SeriesCastTab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [character, setCharacter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addSeriesCastMember(franchiseId, {
        bucket,
        name: name.trim(),
        character: character.trim() || undefined,
        roles: character.trim() ? [character.trim()] : undefined,
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
          <h3>Add {bucket === "characters" ? "character" : "staff"}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {bucket === "characters" ? (
            <label>
              Character
              <input
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div className="modal-panel-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function SeriesCast({
  franchiseId,
  franchiseName,
  cast,
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
}: Props) {
  const [modalMember, setModalMember] = useState<SeriesCastMember | null>(null);
  const deviceLayout = useDeviceLayout();

  const members = useMemo(() => {
    const list =
      tab === "characters"
        ? cast.characters || cast.animated || []
        : cast.staff || cast.people || [];
    return list.slice(0, 8);
  }, [cast, tab]);

  const rows = useMemo(
    () =>
      splitRows(members, deviceLayout === "mobile-landscape" ? 5 : undefined),
    [members, deviceLayout]
  );

  if (!members.length && !addOpen) {
    return (
      <div className="artist-lineup">
        <p className="muted artist-lineup__empty">
          No {tab === "characters" ? "characters" : "staff"} yet. Refresh
          metadata from TMDb or add members from the menu.
        </p>
        {addOpen && onAddClose ? (
          <AddCastModal
            franchiseId={franchiseId}
            bucket={tab}
            onClose={onAddClose}
            onSaved={onDataChanged}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="artist-lineup series-cast">
      {members.length === 0 ? (
        <p className="muted artist-lineup__empty">No members in this group.</p>
      ) : (
        <div
          className="artist-lineup-grid"
          data-count={Math.min(Math.max(members.length, 1), 8)}
        >
          <div className="artist-lineup-row">
            {rows.top.map((m, i) => (
              <MemberCard
                key={`${m.id ?? m.name}-t${i}`}
                member={m}
                onSelect={setModalMember}
              />
            ))}
          </div>
          {rows.bottom.length > 0 ? (
            <div className="artist-lineup-row">
              {rows.bottom.map((m, i) => (
                <MemberCard
                  key={`${m.id ?? m.name}-b${i}`}
                  member={m}
                  onSelect={setModalMember}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {modalMember ? (
        <CastMemberModal
          member={modalMember}
          franchiseId={franchiseId}
          franchiseName={franchiseName}
          isAdmin={isAdmin}
          bucket={tab}
          onClose={() => setModalMember(null)}
          onDataChanged={onDataChanged}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <AddCastModal
          franchiseId={franchiseId}
          bucket={tab}
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      ) : null}
    </div>
  );
}
