import { useRef, useState } from "react";
import { updateProfile, uploadProfileAvatar } from "../api";
import type { ProfileUser } from "../auth";
import ProfileAvatar, { PROFILE_ICON_OPTIONS } from "./ProfileAvatar";

/** Preset colors + trailing custom "+" picker; sized to share the icon row width. */
const COLOR_OPTIONS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
];

type Props = {
  profile: ProfileUser;
  /** When true, hide the username field (Admin always stays Admin). */
  lockName?: boolean;
  onSaved: (user: ProfileUser) => void;
  onClose: () => void;
};

function isCustomColor(avatar: string | null): boolean {
  if (!avatar || !avatar.startsWith("#")) return false;
  return !COLOR_OPTIONS.some((c) => c.toLowerCase() === avatar.toLowerCase());
}

export default function ProfileEditModal({
  profile,
  lockName = false,
  onSaved,
  onClose,
}: Props) {
  const [name, setName] = useState(
    lockName || profile.is_admin ? "Admin" : profile.username
  );
  const [avatar, setAvatar] = useState(profile.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  const customActive = isCustomColor(avatar);
  const displayName = lockName || profile.is_admin ? "Admin" : name;
  const isAdmin = lockName || profile.is_admin;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(
        {
          display_name: isAdmin ? "Admin" : name.trim(),
          avatar,
        },
        profile.user_id
      );
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadProfileAvatar(file, profile.user_id);
      setAvatar(updated.avatar ?? "photo");
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--profile-edit"
        role="dialog"
        aria-labelledby="profile-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3 id="profile-edit-title">Edit profile</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="profile-edit-layout">
          <button
            type="button"
            className="profile-edit-preview"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Add cover"
          >
            <ProfileAvatar
              userId={profile.user_id}
              name={displayName}
              avatar={avatar}
              isAdmin={isAdmin}
            />
            <span className="profile-edit-preview__overlay" aria-hidden>
              <span className="profile-edit-preview__hint">+ Add cover</span>
            </span>
          </button>
          <div className="profile-edit-picks">
            {!(lockName || profile.is_admin) ? (
              <label className="profile-edit-field profile-edit-field--inline">
                <span>Your User</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  disabled={busy}
                />
              </label>
            ) : null}
            <div className="profile-edit-emoji-grid" role="group" aria-label="Avatar icons">
              {PROFILE_ICON_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`profile-edit-pick${avatar === id ? " active" : ""}`}
                  onClick={() => setAvatar(id)}
                  disabled={busy}
                  aria-label={label}
                  title={label}
                >
                  <Icon className="profile-edit-pick__icon" />
                </button>
              ))}
            </div>
            <div className="profile-edit-color-grid">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`profile-edit-color${avatar === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setAvatar(c)}
                  disabled={busy}
                  aria-label={`Color ${c}`}
                />
              ))}
              <button
                type="button"
                className={`profile-edit-color profile-edit-color--custom${
                  customActive ? " active" : ""
                }`}
                style={
                  customActive && avatar ? { background: avatar } : undefined
                }
                onClick={() => colorRef.current?.click()}
                disabled={busy}
                aria-label="Pick custom color"
                title="Custom color"
              >
                +
              </button>
              <input
                ref={colorRef}
                type="color"
                className="profile-edit-color-input"
                value={avatar?.startsWith("#") ? avatar : "#64748b"}
                onChange={(e) => setAvatar(e.target.value)}
                disabled={busy}
                tabIndex={-1}
                aria-hidden
              />
            </div>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
        />
        {error && <p className="error-inline">{error}</p>}
        <div className="modal-actions-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={
              busy || (!(lockName || profile.is_admin) && !name.trim())
            }
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
