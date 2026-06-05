import { useRef, useState } from "react";
import { updateProfile, uploadProfileAvatar } from "../api";
import type { ProfileUser } from "../auth";
import ProfileAvatar from "./ProfileAvatar";

const EMOJI_OPTIONS = ["🎵", "🎸", "🎤", "🎧", "🎹", "🎺", "🎻", "🥁", "🎼", "⭐", "🔥", "💜"];
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
  "#64748b",
];

type Props = {
  profile: ProfileUser;
  onSaved: (user: ProfileUser) => void;
  onClose: () => void;
};

export default function ProfileEditModal({ profile, onSaved, onClose }: Props) {
  const [name, setName] = useState(profile.username);
  const [avatar, setAvatar] = useState(profile.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile({
        display_name: name.trim(),
        avatar,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadProfileAvatar(file);
      setAvatar(updated.avatar ?? "photo");
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-panel--profile-edit"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Edit profile</h3>
        <div className="profile-edit-preview">
          <ProfileAvatar
            userId={profile.user_id}
            name={name}
            avatar={avatar}
            isAdmin={false}
          />
        </div>
        <label className="profile-edit-field">
          <span>Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            disabled={busy}
          />
        </label>
        <p className="muted profile-edit-label">Icon</p>
        <div className="profile-edit-emoji-grid">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className={`profile-edit-pick${avatar === e ? " active" : ""}`}
              onClick={() => setAvatar(e)}
              disabled={busy}
            >
              {e}
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
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn profile-edit-upload"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          Upload photo
        </button>
        {error && <p className="error-inline">{error}</p>}
        <div className="modal-actions-row">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
