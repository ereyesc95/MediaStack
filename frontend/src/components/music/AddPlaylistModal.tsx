import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserPlaylist,
  disconnectSpotify,
  fetchSpotifyPlaylists,
  fetchSpotifySetup,
  fetchSpotifyStatus,
  importPlaylistCsv,
  importSpotifyPlaylist,
  saveSpotifyCredentials,
  startSpotifyAuth,
  type SpotifyPlaylistItem,
  type SpotifyUser,
} from "../../api";
import ModalPortal from "../ModalPortal";
import { IconFileImport, IconPlus, IconSpotify } from "../MenuIcons";
import {
  markSpotifyOAuthAwaiting,
  SPOTIFY_RETURN_PATH,
  waitForProfileReady,
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

const SPOTIFY_CONNECT_FAILED =
  "Spotify login did not finish. Click Connect Spotify again and keep this app running until you return.";

function spotifyPlaylistsErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    const detail = (parsed.detail ?? raw).trim();
    if (/premium subscription/i.test(detail)) {
      return "Spotify API unavailable for this app — use Import from file instead.";
    }
    if (detail && !/^Client error '/i.test(detail)) {
      return detail;
    }
    if (/403|401/i.test(detail)) {
      return "Spotify denied access to your playlists. Try Not you? to reconnect.";
    }
    return detail || "Could not load Spotify playlists.";
  } catch {
    if (/premium subscription/i.test(raw)) {
      return "Spotify API unavailable for this app — use Import from file instead.";
    }
    if (/403|401/.test(raw)) {
      return "Spotify denied access to your playlists. Try Not you? to reconnect.";
    }
    return raw || "Could not load Spotify playlists.";
  }
}

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    const detail = parsed.detail ?? raw;
    if (/403|401|session expired|not connected/i.test(detail)) {
      return SPOTIFY_CONNECT_FAILED;
    }
    const spotifyMatch = detail.match(/Spotify API error:\s*(.+)/);
    if (spotifyMatch?.[1]) {
      const line = spotifyMatch[1].split("\n")[0] ?? detail;
      if (/403|401/.test(line)) {
        return SPOTIFY_CONNECT_FAILED;
      }
      return line;
    }
    return detail;
  } catch {
    if (/403|401/.test(raw)) {
      return SPOTIFY_CONNECT_FAILED;
    }
    return raw;
  }
}

type Props = {
  onClose: () => void;
  onCreated: (message: string) => void;
  initialMode?: "local" | "spotify" | "file";
  spotifyOAuthReturn?: boolean;
  onSpotifyOAuthHandled?: () => void;
};

type Mode = "local" | "spotify" | "file";

export default function AddPlaylistModal({
  onClose,
  onCreated,
  initialMode = "local",
  spotifyOAuthReturn = false,
  onSpotifyOAuthHandled,
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
  const [spotifyPlaylistsError, setSpotifyPlaylistsError] = useState<string | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const spotifyLoadGenRef = useRef(0);
  const spotifyConnectRef = useRef(false);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyClientSecret, setSpotifyClientSecret] = useState("");
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showCredentialRepair, setShowCredentialRepair] = useState(
    () => Boolean(readSpotifyRepairMessage())
  );
  const [repairMessage, setRepairMessage] = useState<string | null>(readSpotifyRepairMessage);

  useEffect(() => {
    spotifyConnectRef.current = false;
    setSpotifyConnecting(false);
  }, []);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const loadSpotify = useCallback(async (): Promise<boolean> => {
    if (spotifyConnectRef.current) return false;
    const generation = ++spotifyLoadGenRef.current;
    setSpotifyLoading(true);
    setError(null);
    try {
      const [setup, status] = await Promise.all([
        fetchSpotifySetup(),
        fetchSpotifyStatus(),
      ]);
      if (generation !== spotifyLoadGenRef.current || spotifyConnectRef.current) return false;
      setSpotifyRedirectUri(setup.redirect_uri);
      setSpotifyConnected(status.connected);
      setSpotifyUser(status.user ?? null);
      if (status.connected) {
        clearSpotifyCredentialsRepair();
        setShowCredentialRepair(false);
        setRepairMessage(null);
        setSpotifyNotice(null);
        try {
          const res = await fetchSpotifyPlaylists();
          if (generation !== spotifyLoadGenRef.current || spotifyConnectRef.current) return true;
          setSpotifyPlaylists(res.items);
          setSpotifyPlaylistsError(
            res.items.length ? null : "No Spotify playlists found for this account."
          );
          if (res.items.length && !selectedSpotifyId) {
            setSelectedSpotifyId(res.items[0]!.id);
            setName(res.items[0]!.name);
          }
        } catch (e) {
          if (generation !== spotifyLoadGenRef.current || spotifyConnectRef.current) return true;
          setSpotifyPlaylists([]);
          setSelectedSpotifyId("");
          setSpotifyPlaylistsError(spotifyPlaylistsErrorMessage(e));
        }
        return true;
      }
      setSpotifyPlaylists([]);
      setSelectedSpotifyId("");
      setSpotifyPlaylistsError(null);
      return false;
    } catch (e) {
      if (generation !== spotifyLoadGenRef.current || spotifyConnectRef.current) return false;
      const msg = friendlyError(e);
      if (/403|401|session expired|could not connect|login did not/i.test(msg)) {
        setSpotifyConnected(false);
        setSpotifyUser(null);
      } else {
        setError(msg);
      }
      if (/client|credential|invalid/i.test(msg)) {
        setShowCredentialRepair(true);
        setRepairMessage(msg);
      }
      return false;
    } finally {
      if (generation === spotifyLoadGenRef.current) {
        setSpotifyLoading(false);
      }
    }
  }, [selectedSpotifyId]);

  useEffect(() => {
    if (mode === "spotify") void loadSpotify();
  }, [mode, loadSpotify]);

  useEffect(() => {
    if (!spotifyOAuthReturn || mode !== "spotify") return;
    let cancelled = false;
    void (async () => {
      setSpotifyNotice(null);
      await waitForProfileReady();
      const delays = [0, 400, 1000, 2000];
      for (const delay of delays) {
        if (cancelled) return;
        if (delay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        if (cancelled) return;
        const connected = await loadSpotify();
        if (connected) {
          setSpotifyNotice(null);
          onSpotifyOAuthHandled?.();
          return;
        }
      }
      if (!cancelled) {
        setSpotifyNotice(SPOTIFY_CONNECT_FAILED);
      }
      onSpotifyOAuthHandled?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [spotifyOAuthReturn, mode, loadSpotify, onSpotifyOAuthHandled]);

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
    onSpotifyOAuthHandled?.();
    setSpotifyConnecting(true);
    setError(null);
    setSpotifyNotice(null);
    try {
      if (options?.forceAccount) {
        await disconnectSpotify().catch(() => {});
        setSpotifyConnected(false);
        setSpotifyUser(null);
        setSpotifyPlaylists([]);
      }
      markSpotifyOAuthAwaiting();
      const { url } = await startSpotifyAuth(SPOTIFY_RETURN_PATH, options);
      spotifyConnectRef.current = true;
      window.location.href = url;
    } catch (e) {
      spotifyConnectRef.current = false;
      setSpotifyConnecting(false);
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

  const importFromFile = async () => {
    if (!csvFile) {
      setError("Choose a CSV file to import.");
      return;
    }
    const cleanName =
      name.trim() ||
      csvFile.name.replace(/\.csv$/i, "").trim() ||
      "Imported playlist";
    setBusy(true);
    setError(null);
    try {
      const result = await importPlaylistCsv({
        file: csvFile,
        name: cleanName,
        description: description.trim() || undefined,
        cover,
      });
      const matched = result.matched ?? 0;
      const unavailable = result.unavailable ?? 0;
      onCreated(
        `Playlist “${result.name ?? cleanName}” imported from file (${matched} matched, ${unavailable} unavailable).`
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPickCsv = (file: File | null) => {
    setCsvFile(file);
    if (file && !name.trim()) {
      setName(file.name.replace(/\.csv$/i, "").trim());
    }
  };

  const selectedSpotify = spotifyPlaylists.find((p) => p.id === selectedSpotifyId);
  const spotifyAccountLabel =
    spotifyUser?.display_name && spotifyUser.display_name !== "Spotify"
      ? spotifyUser.display_name
      : null;

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
            Import from Spotify Premium
          </button>
          <button
            type="button"
            className={mode === "file" ? "active" : ""}
            onClick={() => setMode("file")}
          >
            <IconFileImport className="add-playlist-modal__tab-icon" />
            Import from file
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
        ) : mode === "file" ? (
          <div className="add-playlist-modal__form">
            <p className="add-playlist-modal__hint">
              Import your Spotify playlists from a file. Find them{" "}
              <a href="https://exportify.net/" target="_blank" rel="noopener noreferrer">
                here
              </a>
              .
            </p>
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
                <div className="release-edit-modal__field">
                  <span>CSV file</span>
                  <label className="add-playlist-modal__file">
                    <span className="add-playlist-modal__file-label">
                      {csvFile ? csvFile.name : "Choose CSV file"}
                    </span>
                    <input
                      ref={csvInputRef}
                      type="file"
                      className="add-playlist-modal__file-input"
                      accept=".csv,text/csv"
                      onChange={(e) => onPickCsv(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <label className="release-edit-modal__field">
                  <span>Playlist name</span>
                  <input
                    type="text"
                    className="release-add-playlist-modal__input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Defaults to CSV file name"
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
            <div className="add-playlist-modal__actions modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={busy || !csvFile}
                onClick={() => void importFromFile()}
              >
                {busy ? "Importing…" : "Import playlist"}
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
                    <button
                      type="button"
                      className="btn"
                      disabled={spotifyConnecting}
                      onClick={() => void connectSpotify()}
                    >
                      {spotifyConnecting ? "Redirecting to Spotify…" : "Connect Spotify"}
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
                  <p className="add-playlist-modal__spotify-user-line">
                    Logged in as{" "}
                    {spotifyAccountLabel ? (
                      <strong>{spotifyAccountLabel}</strong>
                    ) : (
                      "Spotify"
                    )}
                    .{" "}
                    <button
                      type="button"
                      className="add-playlist-modal__spotify-switch"
                      onClick={switchSpotifyAccount}
                    >
                      Not you?
                    </button>
                  </p>
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
                        disabled={spotifyPlaylists.length === 0}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedSpotifyId(id);
                          const item = spotifyPlaylists.find((p) => p.id === id);
                          if (item) setName(item.name);
                        }}
                      >
                        {spotifyPlaylists.length === 0 ? (
                          <option value="">No playlists available</option>
                        ) : (
                          <>
                            {!selectedSpotifyId && (
                              <option value="">Select a playlist…</option>
                            )}
                            {spotifyPlaylists.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.track_count} tracks)
                                {p.collaborative ? " · collaborative" : ""}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      {spotifyPlaylistsError && (
                        <span className="add-playlist-modal__field-error">{spotifyPlaylistsError}</span>
                      )}
                    </label>
                    <label className="release-edit-modal__field">
                      <span>Playlist name</span>
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
