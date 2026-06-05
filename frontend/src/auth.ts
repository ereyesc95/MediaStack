export type ProfileUser = {
  user_id: number;
  username: string;
  role_id: number | null;
  is_admin: boolean;
  avatar?: string | null;
  token?: string | null;
};

const TOKEN_KEY = "mediastack-profile-token";
const USER_KEY = "mediastack-profile-user";

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
}

export function clearProfile() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getProfileToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
