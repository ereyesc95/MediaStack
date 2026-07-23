import { useEffect, useMemo, useState } from "react";
import {
  addSeriesCastMember,
  patchSeriesCastMember,
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

function actorNames(member: SeriesCastMember): string {
  if (member.actors?.length) {
    return member.actors.map((a) => a.name).filter(Boolean).join(" · ");
  }
  return (member.roles || []).filter(Boolean).join(" · ");
}

function MemberCard({
  member,
  characterCentered,
  onSelect,
}: {
  member: SeriesCastMember;
  characterCentered: boolean;
  onSelect: (m: SeriesCastMember) => void;
}) {
  const [frontFailed, setFrontFailed] = useState(false);
  const [backFailed, setBackFailed] = useState(false);

  // Characters tab: front = character art, back = actor
  // Staff tab: front = person only (no flip)
  const frontUrl = member.photo_url;
  const backUrl = characterCentered
    ? member.actor_photo_url || member.character_photo_url || null
    : null;
  const front = frontUrl && !frontFailed ? frontUrl : null;
  const back = backUrl && !backFailed && backUrl !== frontUrl ? backUrl : null;
  const subtitle = characterCentered
    ? actorNames(member)
    : member.roles?.filter(Boolean).join(" · ");

  useEffect(() => {
    setFrontFailed(false);
    setBackFailed(false);
  }, [member.photo_url, member.actor_photo_url, member.character_photo_url]);

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
              <img src={front} alt="" onError={() => setFrontFailed(true)} />
            ) : (
              <span className="artist-lineup-card__ph">
                {initials(member.name)}
              </span>
            )}
          </span>
          {back ? (
            <span className="series-cast-card__face series-cast-card__face--back">
              <img src={back} alt="" onError={() => setBackFailed(true)} />
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
      {subtitle ? (
        <span className="artist-lineup-card__roles">{subtitle}</span>
      ) : null}
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
  const characterCentered = bucket === "characters";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [charName, setCharName] = useState(
    member.character || member.name || ""
  );
  const [actorsText, setActorsText] = useState(actorNames(member));
  const [photoUrl, setPhotoUrl] = useState(member.photo_url || "");
  const [actorPhotoUrl, setActorPhotoUrl] = useState(
    member.actor_photo_url || member.character_photo_url || ""
  );

  const handleSave = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      const actors = actorsText
        .split(/[;·,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await patchSeriesCastMember(franchiseId, member.id, {
        bucket,
        name: characterCentered ? actors[0] || charName : charName,
        character: characterCentered ? charName : undefined,
        photo_url: photoUrl.trim() || null,
        actor_photo_url: actorPhotoUrl.trim() || null,
        actors: characterCentered ? actors : undefined,
        roles: actors,
      });
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (member.id == null) return;
    if (!window.confirm(`Remove “${member.name}” from cast?`)) return;
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

  const displayPhoto = member.photo_url;
  const actorsLabel = actorNames(member);

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
                aria-label="Edit member"
                title="Edit"
                onClick={() => setEditing((v) => !v)}
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

        {!editing ? (
          <div className="artist-member-modal__body">
            <div className="artist-member-modal__hero">
              <span className="artist-member-modal__photo-btn">
                {displayPhoto && !photoFailed ? (
                  <img
                    src={displayPhoto}
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
                <p className="artist-member-modal__title">{member.name}</p>
                {characterCentered && actorsLabel ? (
                  <p className="artist-member-modal__row">
                    <span className="artist-member-modal__label">
                      Portrayed by:
                    </span>
                    <span className="artist-member-modal__value">
                      {actorsLabel}
                    </span>
                  </p>
                ) : null}
                {!characterCentered && member.roles?.length ? (
                  <p className="artist-member-modal__row">
                    <span className="artist-member-modal__label">Roles:</span>
                    <span className="artist-member-modal__value">
                      {member.roles.join(" · ")}
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
                {error ? <p className="error">{error}</p> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="artist-admin-form" style={{ padding: "0.5rem 0 1rem" }}>
            <label>
              {characterCentered ? "Character name" : "Name"}
              <input
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
              />
            </label>
            {characterCentered ? (
              <label>
                Actors (semicolon-separated)
                <input
                  value={actorsText}
                  onChange={(e) => setActorsText(e.target.value)}
                  placeholder="Actor one; Actor two"
                />
              </label>
            ) : null}
            <label>
              {characterCentered ? "Character photo URL" : "Photo URL"}
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
            {characterCentered ? (
              <label>
                Actor photo URL (hover flip)
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn link-form__delete"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                Remove
              </button>
              <span className="modal-actions__spacer" />
              <button
                type="button"
                className="btn"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !charName.trim()}
                onClick={() => void handleSave()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
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
  const characterCentered = bucket === "characters";
  const [charName, setCharName] = useState("");
  const [actorName, setActorName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [actorPhotoUrl, setActorPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!charName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addSeriesCastMember(franchiseId, {
        bucket,
        name: characterCentered
          ? actorName.trim() || charName.trim()
          : charName.trim(),
        character: characterCentered ? charName.trim() : undefined,
        photo_url: characterCentered
          ? actorPhotoUrl.trim() || undefined
          : photoUrl.trim() || undefined,
        character_photo_url: characterCentered
          ? photoUrl.trim() || undefined
          : undefined,
        roles: actorName.trim() ? [actorName.trim()] : undefined,
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
            Add {characterCentered ? "character" : "staff member"}
          </h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            {characterCentered ? "Character name" : "Name"}
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              autoFocus
            />
          </label>
          {characterCentered ? (
            <>
              <label>
                Actor / portrayed by (optional)
                <input
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                />
              </label>
              <label>
                Character photo URL (optional)
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </label>
              <label>
                Actor photo URL (optional)
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              Photo URL (optional)
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="modal-panel-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !charName.trim()}
            onClick={() => void save()}
          >
            {saving ? "Adding…" : "Add"}
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
  const characterCentered = tab === "characters";

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
          No {tab === "characters" ? "characters" : "staff"} yet. Use the menu
          → <strong>Add member</strong>
          {isAdmin ? "" : " (admin)"}, or refresh metadata from TMDb.
        </p>
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
                characterCentered={characterCentered}
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
                  characterCentered={characterCentered}
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
