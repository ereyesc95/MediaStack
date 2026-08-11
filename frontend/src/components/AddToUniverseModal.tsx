import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUniverse,
  fetchUniverses,
  linkUniverseMember,
  lookupUniverse,
  patchUniverse,
  pullUniverseTmdbPortrait,
  unlinkUniverseMember,
  uploadUniverseArt,
} from "../api";
import type { Universe } from "../types";
import { IconEditRelease } from "./MenuIcons";
import ModalPortal from "./ModalPortal";

type Props = {
  module: "movies" | "series" | "books";
  franchiseId: string;
  /** When set, link/unlink this film or subseries only (not bulk franchise). */
  leafId?: string | null;
  leafLabel?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

const ART_KINDS = ["Portrait", "Landscape", "Banner", "Logo"] as const;

type FormMode = "pick" | "create" | "edit";

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

function artHint(u: Universe | null | undefined, kind: (typeof ART_KINDS)[number]) {
  if (!u) return "Choose image…";
  const url =
    kind === "Portrait"
      ? u.portrait_url || u.cover_url
      : kind === "Landscape"
        ? u.landscape_url
        : kind === "Banner"
          ? u.banner_url
          : u.logo_url;
  return url ? `Current ${kind.toLowerCase()} on file — choose to replace` : "Choose image…";
}

function formatMembershipNames(list: Universe[]): string {
  const names = list.map((u) => u.name).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function AddToUniverseModal({
  module,
  franchiseId,
  leafId = null,
  leafLabel = null,
  onClose,
  onSaved,
}: Props) {
  const isLeaf = Boolean(leafId);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [memberships, setMemberships] = useState<Universe[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>("pick");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newOverview, setNewOverview] = useState("");
  const [artFiles, setArtFiles] = useState<
    Partial<Record<(typeof ART_KINDS)[number], File | null>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedUniverse = useMemo(
    () => universes.find((u) => u.id === selectedId) ?? null,
    [universes, selectedId]
  );
  const editingUniverse = useMemo(
    () => universes.find((u) => u.id === editingId) ?? null,
    [universes, editingId]
  );
  const alreadyMember = useMemo(
    () =>
      selectedId != null && memberships.some((m) => m.id === selectedId),
    [memberships, selectedId]
  );
  const removeTarget = useMemo(() => {
    if (selectedId != null) {
      const hit = memberships.find((m) => m.id === selectedId);
      if (hit) return hit;
    }
    return memberships[0] ?? null;
  }, [memberships, selectedId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchUniverses(),
      lookupUniverse(module, franchiseId, leafId),
    ])
      .then(([list, lookup]) => {
        if (cancelled) return;
        setUniverses(list.universes || []);
        const many = lookup.universes?.length
          ? lookup.universes
          : lookup.universe
            ? [lookup.universe]
            : [];
        setMemberships(many);
      })
      .catch((e) => {
        if (!cancelled) setError(calmErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [module, franchiseId, leafId]);

  useEffect(() => {
    if (!openList) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (listRef.current && t && !listRef.current.contains(t)) {
        setOpenList(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return universes;
    return universes.filter((u) => u.name.toLowerCase().includes(q));
  }, [universes, query]);

  const backToPick = () => {
    setMode("pick");
    setEditingId(null);
    setArtFiles({});
    setOpenList(false);
    setError(null);
  };

  const startCreate = () => {
    setMode("create");
    setEditingId(null);
    setNewName(query.trim());
    setNewOverview("");
    setArtFiles({});
    setSelectedId(null);
    setOpenList(false);
    setError(null);
  };

  const startEdit = (u: Universe) => {
    setMode("edit");
    setEditingId(u.id);
    setSelectedId(u.id);
    setQuery(u.name);
    setNewName(u.name);
    setNewOverview(u.overview || "");
    setArtFiles({});
    setOpenList(false);
    setError(null);
  };

  const saveLink = async (universeId: number) => {
    if (memberships.some((m) => m.id === universeId)) return;
    setBusy(true);
    setError(null);
    try {
      await linkUniverseMember(universeId, module, franchiseId, leafId);
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
      await linkUniverseMember(created.id, module, franchiseId, leafId);
      onSaved();
      onClose();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (editingId == null || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchUniverse(editingId, {
        name: newName.trim(),
        overview: newOverview.trim() || null,
      });
      for (const kind of ART_KINDS) {
        const file = artFiles[kind];
        if (file) await uploadUniverseArt(editingId, kind, file);
      }
      const list = await fetchUniverses();
      setUniverses(list.universes || []);
      setMemberships((prev) =>
        prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      );
      setQuery(updated.name);
      setSelectedId(updated.id);
      backToPick();
      onSaved();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkUniverseMember(
        removeTarget.id,
        module,
        franchiseId,
        leafId
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(calmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pullPoster = async () => {
    const targetId =
      mode === "edit"
        ? editingId
        : mode === "create"
          ? null
          : selectedId;
    setBusy(true);
    setError(null);
    try {
      let id = targetId;
      if (mode === "create") {
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
        setEditingId(id);
        setMode("edit");
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

  const formUniverse = mode === "edit" ? editingUniverse : null;
  const membershipLabel = formatMembershipNames(memberships);

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal add-universe-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header add-universe-modal__header">
          <div className="add-universe-modal__titles">
            <h3>
              {mode === "edit"
                ? "Edit universe"
                : mode === "create"
                  ? "Create universe"
                  : isLeaf
                    ? "Add to universe"
                    : "Add franchise to universe"}
            </h3>
            {mode === "pick" && isLeaf && leafLabel ? (
              <p className="add-universe-modal__current">
                Adding {leafLabel}
              </p>
            ) : null}
            {mode === "pick" && !isLeaf ? (
              <p className="add-universe-modal__current">
                Adds all films/series under this franchise
              </p>
            ) : null}
            {memberships.length > 0 && mode === "pick" ? (
              <p className="add-universe-modal__current">
                Currently in {membershipLabel}
              </p>
            ) : null}
          </div>
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

        {mode === "pick" ? (
          <div className="artist-admin-form">
            <label className="artist-admin-form__inline">
              <span className="artist-admin-form__inline-label">Universe</span>
              <div
                ref={listRef}
                className="artist-admin-form__inline-field add-universe-modal__picker"
              >
                <div className="add-universe-modal__picker-row">
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelectedId(null);
                      setOpenList(true);
                    }}
                    onFocus={() => setOpenList(true)}
                    placeholder="Search or select…"
                    disabled={busy}
                    autoComplete="off"
                  />
                  {selectedUniverse ? (
                    <button
                      type="button"
                      className="add-universe-modal__edit-btn"
                      disabled={busy}
                      title="Edit universe"
                      aria-label="Edit universe"
                      onClick={() => startEdit(selectedUniverse)}
                    >
                      <IconEditRelease />
                    </button>
                  ) : null}
                </div>
                {openList ? (
                  <ul className="add-universe-modal__dropdown" role="listbox">
                    {filtered.map((u) => {
                      const member = memberships.some((m) => m.id === u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="add-universe-modal__dropdown-item"
                            onClick={() => {
                              setSelectedId(u.id);
                              setQuery(u.name);
                              setOpenList(false);
                            }}
                          >
                            <span>
                              {u.name}
                              {member ? " · member" : ""}
                            </span>
                            <span className="muted">({u.member_count ?? 0})</span>
                          </button>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        type="button"
                        className="add-universe-modal__dropdown-item add-universe-modal__dropdown-item--create"
                        onClick={startCreate}
                      >
                        + Create universe…
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            </label>
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
              <span className="artist-admin-form__inline-label">Overview</span>
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
                <span className="artist-admin-form__inline-label">{kind}</span>
                <span className="artist-admin-form__inline-field add-universe-modal__file">
                  <span className="add-universe-modal__file-label">
                    {artFiles[kind]?.name || artHint(formUniverse, kind)}
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
              onClick={backToPick}
            >
              Back to list
            </button>
          </div>
        )}

        <div className="modal-panel-actions add-universe-modal__actions">
          {(mode !== "pick" || selectedId) && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void pullPoster()}
            >
              Fetch cover
            </button>
          )}
          {removeTarget && mode === "pick" ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void remove()}
            >
              {isLeaf
                ? `Remove from ${removeTarget.name}`
                : `Remove all from ${removeTarget.name}`}
            </button>
          ) : null}
          {mode === "create" ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !newName.trim()}
              onClick={() => void createAndLink()}
            >
              {busy ? "Saving…" : "Create & add"}
            </button>
          ) : mode === "edit" ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !newName.trim()}
              onClick={() => void saveEdit()}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || selectedId == null || alreadyMember}
              onClick={() => selectedId != null && void saveLink(selectedId)}
            >
              {busy
                ? "Saving…"
                : alreadyMember
                  ? "Already a member"
                  : "Save"}
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
