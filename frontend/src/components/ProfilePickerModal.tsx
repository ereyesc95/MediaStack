import { useEffect, useState } from "react";
import { fetchProfiles, selectProfile } from "../api";
import type { ProfileUser } from "../auth";
import AdminPasswordModal from "./AdminPasswordModal";
import ProfileAvatar from "./ProfileAvatar";
import ProfileEditModal from "./ProfileEditModal";

type Props = {
  onSelected: (user: ProfileUser, token: string) => void;
  highlightUserId?: number | null;
};

export default function ProfilePickerModal({
  onSelected,
  highlightUserId = null,
}: Props) {
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminPwOpen, setAdminPwOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ProfileUser | null>(null);

  function loadProfiles() {
    fetchProfiles()
      .then((items) => setProfiles(items))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  async function pick(userId: number, password?: string) {
    setBusy(userId);
    setError(null);
    try {
      const res = await selectProfile(userId, password);
      if (!res.token) throw new Error("No session token returned");
      setAdminPwOpen(false);
      onSelected(res, res.token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (userId === 1 && msg.toLowerCase().includes("password")) {
        setError("Incorrect admin password");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  function handlePick(p: ProfileUser) {
    if (p.is_admin) {
      setError(null);
      setAdminPwOpen(true);
      return;
    }
    pick(p.user_id);
  }

  function handleProfileSaved(user: ProfileUser) {
    setProfiles((prev) =>
      prev.map((p) => (p.user_id === user.user_id ? { ...p, ...user } : p))
    );
    if (editProfile?.user_id === user.user_id) {
      setEditProfile({ ...editProfile, ...user });
    }
  }

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-panel modal-panel--profiles" onClick={(e) => e.stopPropagation()}>
          <h3>Who&apos;s using MediaStack?</h3>
          <p className="muted">Choose a profile to continue.</p>
          <ul className="profile-picker-list">
            {profiles.map((p) => (
              <li key={p.user_id} className="profile-picker-item">
                <button
                  type="button"
                  className={`profile-picker-btn${
                    highlightUserId === p.user_id ? " profile-picker-btn--active" : ""
                  }`}
                  disabled={busy !== null}
                  onClick={() => handlePick(p)}
                >
                  <ProfileAvatar
                    userId={p.user_id}
                    name={p.username}
                    avatar={p.avatar}
                    isAdmin={p.is_admin}
                    className="profile-picker-avatar"
                  />
                  <span className="profile-picker-name">
                    {p.is_admin ? "Admin" : p.username}
                  </span>
                  {busy === p.user_id && (
                    <span className="profile-picker-busy">…</span>
                  )}
                </button>
                {!p.is_admin && (
                  <button
                    type="button"
                    className="profile-picker-edit"
                    aria-label={`Edit ${p.username}`}
                    disabled={busy !== null}
                    onClick={() => setEditProfile(p)}
                  >
                    ✎
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error && !adminPwOpen && <p className="error-inline">{error}</p>}
          {!profiles.length && !error && (
            <p className="muted">Loading profiles…</p>
          )}
        </div>
      </div>

      {adminPwOpen && (
        <AdminPasswordModal
          busy={busy === 1}
          error={error}
          onCancel={() => {
            setAdminPwOpen(false);
            setError(null);
          }}
          onSubmit={(password) => pick(1, password)}
        />
      )}

      {editProfile && (
        <ProfileEditModal
          profile={editProfile}
          onClose={() => setEditProfile(null)}
          onSaved={handleProfileSaved}
        />
      )}
    </>
  );
}
