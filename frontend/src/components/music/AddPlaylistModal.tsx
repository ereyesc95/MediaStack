import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserPlaylist,
  disconnectSpotify,
  fetchSpotifyPlaylists,
  fetchSpotifySetup,
  fetchSpotifyStatus,
  importSpotifyPlaylist,
  saveSpotifyCredentials,
  startSpotifyAuth,
  type SpotifyPlaylistItem,
  type SpotifyUser,
} from "../../api";
import ModalPortal from "../ModalPortal";
import { IconPlus, IconSpotify } from "../MenuIcons";
import {
  markSpotifyOAuthAwaiting,
  SPOTIFY_RETURN_PATH,
} from "../../spotifyOAuth";

const SPOTIFY_REPAIR_KEY = "mediastack.spotify.credentials_repair";

export function markSpotifyCredentialsRepair(message: string) {
  try {
    sessionStorage.setItem(SPOTIFY_REPAIR_KEY, message);
  } catch {
    /* ignore */
  }
}

export function clearSpotifyCredentialsRepair() {
  try {
    sessionStorage.removeItem(SPOTIFY_REPAIR_KEY);
  } catch {
    /* ignore */
  }
}

function readSpotifyRepairMessage(): string | null {
  try {
    return sessionStorage.getItem(SPOTIFY_REPAIR_KEY);
  } catch {
    return null;
  }
}

const SPOTIFY_SESSION_NOTICE = "Session expired. Please log in again.";

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    const detail = parsed.detail ?? raw;
    if (/403|401|session expired|not connected/i.test(detail)) {
      return SPOTIFY_SESSION_NOTICE;
    }
    const spotifyMatch = detail.match(/Spotify API error:\s*(.+)/);
    if (spotifyMatch?.[1]) {
      const line = spotifyMatch[1].split("\n")[0] ?? detail;
      if (/403|401/.test(line)) {
        return SPOTIFY_SESSION_NOTICE;
      }
      return line;
    }
    return detail;
  } catch {
    if (/403|401/.test(raw)) {
      return SPOTIFY_SESSION_NOTICE;
    }
    return raw;
  }
}

type Props = {
  onClose: () => void;
  onCreated: (message: string) => void;
  initialMode?: "local" | "spotify";
  spotifyOAuthReturn?: boolean;
};

type Mode = "local" | "spotify";

export default function AddPlaylistModal({
  onClose,
  onCreated,
  initialMode = "local",
  spotifyOAuthReturn = false,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotifyNotice, setSpotifyNotice] = useState<string | null>(null);

  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylistItem[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState("");
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyClientSecret, setSpotifyClientSecret] = useState("");
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showCredentialRepair, setShowCredentialRepair] = useState(
    () => Boolean(readSpotifyRepairMessage())
  );
  const [repairMessage, setRepairMessage] = useState<string | null>(readSpotifyRepairMessage);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const loadSpotify = useCallback(async () => {
    setSpotifyLoading(true);
    setError(null);
    setSpotifyNotice(null);
    try {
      const [setup, status] = await Promise.all([
        fetchSpotifySetup(),
        fetchSpotifyStatus(),
      ]);
      setSpotifyRedirectUri(setup.redirect_uri);
      setSpotifyConnected(status.connected);
      setSpotifyUser(status.user ?? null);
      if (status.session_expired) {
        setSpotifyNotice(SPOTIFY_SESSION_NOTICE);
      }
      if (status.connected) {
        clearSpotifyCredentialsRepair();
        setShowCredentialRepair(false);
        setRepairMessage(null);
        setSpotifyNotice(null);
        const res = await fetchSpotifyPlaylists();
        setSpotifyPlaylists(res.items);
        if (res.items.length && !selectedSpotifyId) {
          setSelectedSpotifyId(res.items[0]!.id);
          setName(res.items[0]!.name);
        }
      } else {
        setSpotifyPlaylists([]);
        setSelectedSpotifyId("");
        if (status.session_expired) {
          setSpotifyNotice(SPOTIFY_SESSION_NOTICE);
        }
      }
    } catch (e) {
      const msg = friendlyError(e);
      if (/403|401|session expired/i.test(msg)) {
        setSpotifyNotice(msg);
        setSpotifyConnected(false);
        setSpotifyUser(null);
      } else {
        setError(msg);
      }
      if (/client|credential|invalid/i.test(msg)) {
        setShowCredentialRepair(true);
        setRepairMessage(msg);
      }
    } finally {
      setSpotifyLoading(false);
    }
  }, [selectedSpotifyId]);

  useEffect(() => {
    if (mode === "spotify") void loadSpotify();
  }, [mode, loadSpotify]);

  useEffect(() => {
    if (!spotifyOAuthReturn || mode !== "spotify") return;
    void loadSpotify();
    const retry = window.setTimeout(() => void loadSpotify(), 700);
    return () => window.clearTimeout(retry);
  }, [spotifyOAuthReturn, mode, loadSpotify]);

  const saveCredentials = async () => {
    const clientId = spotifyClientId.trim();
    const clientSecret = spotifyClientSecret.trim();
    if (!clientId || !clientSecret) {
      setError("Enter your Spotify Client ID and Client Secret.");
      return;
    }
    setSavingCredentials(true);
    setError(null);
    try {
      await saveSpotifyCredentials({ client_id: clientId, client_secret: clientSecret });
      setSpotifyClientSecret("");
      clearSpotifyCredentialsRepair();
      setShowCredentialRepair(false);
      setRepairMessage(null);
      await loadSpotify();
      await connectSpotify();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCredentials(false);
    }
  };

  const connectSpotify = async (options?: { forceAccount?: boolean }) => {
    setError(null);
    setSpotifyNotice(null);
    try {
      await disconnectSpotify().catch(() => {});
      setSpotifyConnected(false);
      setSpotifyUser(null);
      setSpotifyPlaylists([]);
      markSpotifyOAuthAwaiting();
      const { url } = await startSpotifyAuth(SPOTIFY_RETURN_PATH, options);
      window.location.href = url;
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      setShowCredentialRepair(true);
      setRepairMessage(msg);
      markSpotifyCredentialsRepair(msg);
    }
  };

  const switchSpotifyAccount = () => void connectSpotify({ forceAccount: true });

  const onPickCover = (file: File | null) => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCover(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const createLocal = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Enter a playlist name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createUserPlaylist({
        name: cleanName,
        description: description.trim() || undefined,
        cover,
      });
      onCreated(`Playlist “${cleanName}” created.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importFromSpotify = async () => {
    if (!selectedSpotifyId) {
      setError("Select a Spotify playlist.");
      return;
    }
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Enter a name for the new playlist.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await importSpotifyPlaylist({
        spotify_playlist_id: selectedSpotifyId,
        name: cleanName,
        description: description.trim() || undefined,
      });
      const matched = result.matched ?? 0;
      const unavailable = result.unavailable ?? 0;
      onCreated(
        `Playlist “${result.name ?? cleanName}” imported from Spotify (${matched} matched, ${unavailable} unavailable).`
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedSpotify = spotifyPlaylists.find((p) => p.id === selectedSpotifyId);

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel add-playlist-modal release-add-playlist-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head release-add-playlist-modal__head">
          <div className="release-add-playlist-modal__titles">
            <h3>Add playlist</h3>
          </div>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="add-playlist-modal__tabs">
          <button
            type="button"
            className={mode === "local" ? "active" : ""}
            onClick={() => setMode("local")}
          >
            <IconPlus className="add-playlist-modal__tab-icon" />
            New playlist
          </button>
          <button
            type="button"
            className={mode === "spotify" ? "active" : ""}
            onClick={() => setMode("spotify")}
          >
            <IconSpotify className="add-playlist-modal__tab-icon" />
            Import from Spotify
          </button>
        </div>

        {error && <p className="error add-playlist-modal__error">{error}</p>}
        {spotifyNotice && mode === "spotify" && !spotifyConnected && (
          <p className="add-playlist-modal__notice">{spotifyNotice}</p>
        )}

        {mode === "local" ? (
          <div className="add-playlist-modal__form">
            <div className="add-playlist-modal__local-row">
              <div className="add-playlist-modal__cover-col">
                <span className="add-playlist-modal__field-label">Cover</span>
                <label className="add-playlist-modal__cover-slot" title="Choose cover image">
                  {coverPreview ? (
                    <img src={coverPreview} alt="" className="add-playlist-modal__cover-slot-img" />
                  ) : (
                    <span className="add-playlist-modal__cover-slot-placeholder" aria-hidden>
                      +
                    </span>
                  )}
                  <input
                    ref={coverInputRef}
                    type="file"
                    className="add-playlist-modal__cover-slot-input"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => onPickCover(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="add-playlist-modal__local-fields">
                <label className="release-edit-modal__field">
                  <span>Name</span>
                  <input
                    type="text"
                    className="release-add-playlist-modal__input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Playlist name"
                    autoFocus
                  />
                </label>
                <label className="release-edit-modal__field">
                  <span>Short description</span>
                  <textarea
                    className="release-about-edit-modal__textarea add-playlist-modal__textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={3}
                  />
                </label>
              </div>
            </div>
            <div className="add-playlist-modal__actions modal-actions-row">
              <button type="button" className="btn" disabled={busy} onClick={() => void createLocal()}>
                {busy ? "Creating…" : "Create playlist"}
              </button>
            </div>
          </div>
        ) : (
          <div className="add-playlist-modal__form ms-scrollbar">
            {spotifyLoading && <p className="muted">Loading Spotify…</p>}
            {!spotifyLoading && !spotifyConnected && (
              <>
                {!showCredentialRepair ? (
                  <div className="add-playlist-modal__spotify-connect">
                    <p className="muted add-playlist-modal__hint">
                      Connect your Spotify account to browse and import playlists.
                    </p>
                    <button type="button" className="btn" onClick={() => void connectSpotify()}>
                      Connect Spotify
                    </button>
                  </div>
                ) : (
                  <div className="add-playlist-modal__spotify-setup">
                    <p className="add-playlist-modal__hint">
                      Spotify connection failed
                      {repairMessage ? `: ${repairMessage}` : ""}. Enter updated API credentials
                      below, then try connecting again.
                    </p>
                    {spotifyRedirectUri && (
                      <>
                        <p className="muted add-playlist-modal__hint">
                          Redirect URI for your Spotify app (use 127.0.0.1, not localhost):
                        </p>
                        <code className="add-playlist-modal__redirect">{spotifyRedirectUri}</code>
                      </>
                    )}
                    <label className="release-edit-modal__field">
                      <span>Client ID</span>
                      <input
                        type="text"
                        className="release-add-playlist-modal__input"
                        value={spotifyClientId}
                        onChange={(e) => setSpotifyClientId(e.target.value)}
                        placeholder="Spotify Client ID"
                        autoComplete="off"
                      />
                    </label>
                    <label className="release-edit-modal__field">
                      <span>Client Secret</span>
                      <input
                        type="password"
                        className="release-add-playlist-modal__input"
                        value={spotifyClientSecret}
                        onChange={(e) => setSpotifyClientSecret(e.target.value)}
                        placeholder="Spotify Client Secret"
                        autoComplete="new-password"
                      />
                    </label>
                    <div className="add-playlist-modal__actions modal-actions-row">
                      <button
                        type="button"
                        className="btn"
                        disabled={savingCredentials}
                        onClick={() => void saveCredentials()}
                      >
                        {savingCredentials ? "Saving…" : "Save & retry"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!spotifyLoading && spotifyConnected && (
              <>
                {spotifyUser && (
                  <div className="add-playlist-modal__spotify-user">
                    {spotifyUser.image_url ? (
                      <img
                        src={spotifyUser.image_url}
                        alt=""
                        className="add-playlist-modal__spotify-user-avatar"
                      />
                    ) : (
                      <span className="add-playlist-modal__spotify-user-avatar add-playlist-modal__spotify-user-avatar--empty">
                        <IconSpotify />
                      </span>
                    )}
                    <p className="add-playlist-modal__spotify-user-text">
                      Logged in as{" "}
                      <strong>{spotifyUser.display_name}</strong>.{" "}
                      <button
                        type="button"
                        className="add-playlist-modal__spotify-switch"
                        onClick={switchSpotifyAccount}
                      >
                        Not you?
                      </button>
                    </p>
                  </div>
                )}
                <div className="add-playlist-modal__local-row">
                  <div className="add-playlist-modal__cover-col">
                    <span className="add-playlist-modal__field-label">Cover</span>
                    <div
                      className="add-playlist-modal__cover-slot add-playlist-modal__cover-slot--readonly"
                      aria-hidden
                    >
                      {selectedSpotify?.cover_url ? (
                        <img
                          src={selectedSpotify.cover_url}
                          alt=""
                          className="add-playlist-modal__cover-slot-img"
                        />
                      ) : (
                        <span className="add-playlist-modal__cover-slot-placeholder">+</span>
                      )}
                    </div>
                  </div>
                  <div className="add-playlist-modal__local-fields">
                    <label className="release-edit-modal__field">
                      <span>Spotify playlist</span>
                      <select
                        className="release-add-playlist-modal__input"
                        value={selectedSpotifyId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedSpotifyId(id);
                          const item = spotifyPlaylists.find((p) => p.id === id);
                          if (item) setName(item.name);
                        }}
                      >
                        {spotifyPlaylists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.track_count} tracks)
                            {p.collaborative ? " · collaborative" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="release-edit-modal__field">
                      <span>MediaStack playlist name</span>
                      <input
                        type="text"
                        className="release-add-playlist-modal__input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name for the new playlist"
                      />
                    </label>
                    <label className="release-edit-modal__field add-playlist-modal__field-grow">
                      <span>Short description</span>
                      <textarea
                        className="release-about-edit-modal__textarea add-playlist-modal__textarea"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description"
                        rows={2}
                      />
                    </label>
                  </div>
                </div>
                <p className="muted add-playlist-modal__hint">
                  Creates a new MediaStack playlist with a snapshot of the Spotify tracklist.
                  Unmatched tracks are kept as unavailable until you add them to your library.
                </p>
                <div className="add-playlist-modal__actions modal-actions-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !selectedSpotifyId}
                    onClick={() => void importFromSpotify()}
                  >
                    {busy ? "Importing…" : "Import playlist"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
