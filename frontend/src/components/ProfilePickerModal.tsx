import { useEffect, useState, type KeyboardEvent } from "react";
import { fetchProfiles, selectProfile } from "../api";
import type { ProfileUser } from "../auth";
import AdminPasswordModal from "./AdminPasswordModal";
import { IconPencil } from "./MenuIcons";
import MyStackWordmark from "./MyStackWordmark";
import PlaylistBoot from "./PlaylistBoot";
import ProfileAvatar, { ProfileWelcomeLogo } from "./ProfileAvatar";
import ProfileEditModal from "./ProfileEditModal";
import WelcomeAmbient from "./WelcomeAmbient";

type Props = {
  onSelected: (user: ProfileUser, token: string) => void;
  highlightUserId?: number | null;
  /** Shown after “Close …” so the user can cancel without picking. */
  onBack?: () => void;
  /** Active profile name for the switch-flow back control. */
  backProfileName?: string | null;
};

export default function ProfilePickerModal({
  onSelected,
  highlightUserId = null,
  onBack,
  backProfileName = null,
}: Props) {
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminPwOpen, setAdminPwOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ProfileUser | null>(null);

  function loadProfiles() {
    setError(null);
    fetchProfiles()
      .then((items) => setProfiles(items))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  // If Chrome opened before the API was listening, retry a few times.
  useEffect(() => {
    if (!error || profiles.length) return;
    if (!/cannot reach the api/i.test(error)) return;
    let cancelled = false;
    let tries = 0;
    const id = window.setInterval(() => {
      if (cancelled) return;
      tries += 1;
      if (tries > 8) {
        window.clearInterval(id);
        return;
      }
      fetchProfiles()
        .then((items) => {
          if (cancelled) return;
          setProfiles(items);
          setError(null);
          window.clearInterval(id);
        })
        .catch(() => {
          /* keep waiting */
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [error, profiles.length]);

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
    if (busy !== null) return;
    if (p.is_admin) {
      setError(null);
      setAdminPwOpen(true);
      return;
    }
    pick(p.user_id);
  }

  function handleTileKey(e: KeyboardEvent, p: ProfileUser) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePick(p);
    }
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
      <div
        className={`modal-backdrop modal-backdrop--profiles${
          onBack ? " modal-backdrop--profiles-switch" : ""
        }`}
      >
        <WelcomeAmbient />

        <header
          className={`profile-picker-brand${
            onBack ? " profile-picker-brand--switch" : ""
          }`}
        >
          <ProfileWelcomeLogo />
          <MyStackWordmark className="profile-picker-brand__wordmark" height={26} />
        </header>

        {onBack ? (
          <button
            type="button"
            className="artist-page__catalog-back profile-picker-back"
            onClick={onBack}
            aria-label={
              backProfileName?.trim()
                ? `Back to ${backProfileName.trim()}`
                : "Back"
            }
          >
            <svg
              className="artist-page__catalog-chevron"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="artist-page__catalog-label">
              {backProfileName?.trim()
                ? `Back to ${backProfileName.trim()}`
                : "Back"}
            </span>
          </button>
        ) : null}

        <div className="profile-picker-stage">
          <ul className="profile-picker-list">
            {[...profiles]
              .sort((a, b) => Number(a.is_admin) - Number(b.is_admin))
              .map((p, i) => {
              const label = p.is_admin ? "Admin" : p.username;
              return (
                <li
                  key={p.user_id}
                  className="profile-picker-item"
                  style={{ ["--profile-i" as string]: i }}
                >
                  <div
                    role="button"
                    tabIndex={busy !== null ? -1 : 0}
                    className={`profile-picker-tile${
                      highlightUserId === p.user_id
                        ? " profile-picker-tile--active"
                        : ""
                    }${busy !== null ? " profile-picker-tile--disabled" : ""}`}
                    onClick={() => handlePick(p)}
                    onKeyDown={(e) => handleTileKey(e, p)}
                    aria-label={label}
                  >
                    <div className="profile-picker-avatar-wrap">
                      <ProfileAvatar
                        userId={p.user_id}
                        name={label}
                        avatar={p.avatar}
                        isAdmin={p.is_admin}
                        className="profile-picker-avatar"
                      />
                    </div>
                    <span className="profile-picker-name-row">
                      <span className="profile-picker-name">{label}</span>
                      <button
                        type="button"
                        className="profile-picker-edit"
                        aria-label={`Edit ${label}`}
                        disabled={busy !== null}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditProfile(p);
                        }}
                      >
                        <IconPencil className="profile-picker-edit__icon" />
                      </button>
                    </span>
                    {busy === p.user_id ? (
                      <span className="profile-picker-busy">…</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {error && !adminPwOpen && <p className="error-inline">{error}</p>}
          {!profiles.length && !error && (
            <PlaylistBoot
              className="playlist-boot--compact"
              label="Loading profiles…"
            />
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
          lockName={Boolean(editProfile.is_admin)}
          onClose={() => setEditProfile(null)}
          onSaved={handleProfileSaved}
        />
      )}
    </>
  );
}
