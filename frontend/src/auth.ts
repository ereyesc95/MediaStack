export type ProfileUser = {
  user_id: number;
  username: string;
  role_id: number | null;
  is_admin: boolean;
  /** Admin unlocked adult catalog via mystacknsfw password. */
  nsfw_unlocked?: boolean;
  avatar?: string | null;
  token?: string | null;
};

const TOKEN_KEY = "mystack-profile-token";
const USER_KEY = "mystack-profile-user";
const LEGACY_TOKEN_KEY = "mediastack-profile-token";
const LEGACY_USER_KEY = "mediastack-profile-user";

function migrateLegacyProfileKeys() {
  try {
    if (!localStorage.getItem(TOKEN_KEY)) {
      const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
      if (legacy) localStorage.setItem(TOKEN_KEY, legacy);
    }
    if (!localStorage.getItem(USER_KEY)) {
      const legacy = localStorage.getItem(LEGACY_USER_KEY);
      if (legacy) localStorage.setItem(USER_KEY, legacy);
    }
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* ignore */
  }
}

migrateLegacyProfileKeys();

export function getProfileToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredProfile(): ProfileUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProfileUser;
  } catch {
    return null;
  }
}

export function saveProfile(user: ProfileUser, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify({ ...user, token }));
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function clearProfile() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Fired when the API says the profile session is missing/invalid. */
export const PROFILE_REQUIRED_EVENT = "mystack:profile-required";

export function isProfileAuthFailure(
  status: number,
  message: string
): boolean {
  if (status !== 401) return false;
  const m = message.trim().toLowerCase();
  return m === "profile not selected" || m === "invalid profile";
}

/** Clear stored session and send the user to the profile picker. */
export function forceProfileReauth(): void {
  clearProfile();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_REQUIRED_EVENT));
}

export function authHeaders(): HeadersInit {
  const token = getProfileToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
