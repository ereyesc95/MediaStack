import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUniverse,
  fetchUniverses,
  linkUniverseMember,
  lookupUniverse,
  pullUniverseTmdbPortrait,
  unlinkUniverseMember,
  uploadUniverseArt,
} from "../api";
import type { Universe } from "../types";
import ModalPortal from "./ModalPortal";

type Props = {
  module: "movies" | "series";
  franchiseId: string;
  onClose: () => void;
  onSaved: () => void;
};

const ART_KINDS = ["Portrait", "Landscape", "Banner", "Logo"] as const;

function calmErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  if (!trimmed) return "Something went wrong. Please try again.";
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
  } catch {
    /* plain text */
  }
  if (/internal server error/i.test(trimmed)) {
    return "Couldn't complete that request right now. Please try again in a moment.";
  }
  return trimmed;
}

export default function AddToUniverseModal({
  module,
  franchiseId,
  onClose,
  onSaved,
}: Props) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [current, setCurrent] = useState<Universe | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOverview, setNewOverview] = useState("");
  const [artFiles, setArtFiles] = useState<
    Partial<Record<(typeof ART_KINDS)[number], File | null>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchUniverses(),
      lookupUniverse(module, franchiseId),
    ])
      .then(([list, lookup]) => {
        if (cancelled) return;
        setUniverses(list.universes || []);
        const u = lookup.universe;
        setCurrent(u);
        if (u) {
          setSelectedId(u.id);
          setQuery(u.name);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(calmErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [module, franchiseId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return universes;
    return universes.filter((u) => u.name.toLowerCase().includes(q));
  }, [universes, query]);

  const saveLink = async (universeId: number) => {
    setBusy(true);
    setError(null);
    try {
      await linkUniverseMember(universeId, module, franchiseId);
      onSaved();
      onClose();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createAndLink = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createUniverse({
        name: newName.trim(),
        overview: newOverview.trim() || null,
      });
      for (const kind of ART_KINDS) {
        const file = artFiles[kind];
        if (file) await uploadUniverseArt(created.id, kind, file);
      }
      await linkUniverseMember(created.id, module, franchiseId);
      onSaved();
      onClose();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkUniverseMember(current.id, module, franchiseId);
      onSaved();
      onClose();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pullPoster = async () => {
    if (!selectedId && !creating) return;
    setBusy(true);
    setError(null);
    try {
      let id = selectedId;
      if (creating) {
        if (!newName.trim()) {
          setError("Enter a universe name first.");
          setBusy(false);
          return;
        }
        const created = await createUniverse({
          name: newName.trim(),
          overview: newOverview.trim() || null,
        });
        id = created.id;
        setSelectedId(id);
        setCreating(false);
        setQuery(created.name);
        setUniverses((prev) => [...prev, created]);
      }
      if (id == null) return;
      await pullUniverseTmdbPortrait(id);
      const list = await fetchUniverses();
      setUniverses(list.universes || []);
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal artist-admin-modal--wide add-universe-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Add to universe</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error ? <p className="modal-notice">{error}</p> : null}

        {!creating ? (
          <div className="artist-admin-form">
            <label className="artist-admin-form__inline">
              <span className="artist-admin-form__inline-label">Universe</span>
              <div
                ref={listRef}
                className="artist-admin-form__inline-field"
                style={{ position: "relative" }}
              >
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedId(null);
                    setOpenList(true);
                    setCreating(false);
                  }}
                  onFocus={() => setOpenList(true)}
                  placeholder="Search or select…"
                  disabled={busy}
                  autoComplete="off"
                />
                {openList ? (
                  <ul
                    className="add-similar-results"
                    role="listbox"
                    style={{
                      position: "absolute",
                      zIndex: 5,
                      left: 0,
                      right: 0,
                      maxHeight: "12rem",
                      overflow: "auto",
                      margin: "0.25rem 0 0",
                      padding: 0,
                      listStyle: "none",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {filtered.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="add-similar-results__item"
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.45rem 0.65rem",
                            border: "none",
                            background: "transparent",
                            color: "inherit",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setSelectedId(u.id);
                            setQuery(u.name);
                            setOpenList(false);
                          }}
                        >
                          {u.name}
                          <span className="muted" style={{ marginLeft: 8 }}>
                            ({u.member_count ?? 0})
                          </span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "0.45rem 0.65rem",
                          border: "none",
                          background: "transparent",
                          color: "var(--accent)",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          setCreating(true);
                          setOpenList(false);
                          setNewName(query.trim());
                          setSelectedId(null);
                        }}
                      >
                        + Create universe…
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            </label>
            {current ? (
              <p className="muted" style={{ margin: "0.35rem 0" }}>
                Currently in <strong>{current.name}</strong>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="artist-admin-form">
            <label className="artist-admin-form__inline">
              <span className="artist-admin-form__inline-label">Name</span>
              <input
                className="artist-admin-form__inline-field"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="artist-admin-form__inline artist-admin-form__inline--top">
              <span className="artist-admin-form__inline-label">
                Overview
              </span>
              <textarea
                className="artist-admin-form__inline-field"
                value={newOverview}
                onChange={(e) => setNewOverview(e.target.value)}
                rows={3}
                disabled={busy}
                placeholder="Optional"
              />
            </label>
            {ART_KINDS.map((kind) => (
              <label key={kind} className="artist-admin-form__inline">
                <span className="artist-admin-form__inline-label">
                  {kind}
                </span>
                <span className="artist-admin-form__inline-field add-universe-modal__file">
                  <span className="add-universe-modal__file-label">
                    {artFiles[kind]?.name || "Choose image…"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="add-universe-modal__file-input"
                    disabled={busy}
                    onChange={(e) =>
                      setArtFiles((prev) => ({
                        ...prev,
                        [kind]: e.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </span>
              </label>
            ))}
            <button
              type="button"
              className="btn btn--small add-universe-modal__back"
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setOpenList(true);
              }}
            >
              Back to list
            </button>
          </div>
        )}

        <div
          className="modal-panel-actions"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            justifyContent: "flex-end",
            marginTop: "1rem",
          }}
        >
          {(creating || selectedId) && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void pullPoster()}
            >
              Fetch cover
            </button>
          )}
          {current ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove from universe
            </button>
          ) : null}
          {creating ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !newName.trim()}
              onClick={() => void createAndLink()}
            >
              {busy ? "Saving…" : "Create & add"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || selectedId == null}
              onClick={() => selectedId != null && void saveLink(selectedId)}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
