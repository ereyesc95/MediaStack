import { useEffect, useState } from "react";
import {
  fetchMoviesCatalog,
  fetchSeriesCatalog,
  linkUniverseMember,
} from "../api";
import type { SeriesFranchiseCard, UniverseCard } from "../types";
import ModalPortal from "./ModalPortal";

type Props = {
  universeId: number;
  existing: UniverseCard[];
  onClose: () => void;
  onSaved: () => void;
};

type PickRow = {
  key: string;
  module: "movies" | "series";
  slug: string;
  leafId: string;
  title: string;
  cover_url?: string | null;
};

function alreadyMember(existing: UniverseCard[], module: string, leafId: string) {
  return existing.some(
    (c) =>
      c.module === module &&
      String(c.leaf_id || c.id || "").toLowerCase() === leafId.toLowerCase()
  );
}

export default function UniverseAddMemberModal({
  universeId,
  existing,
  onClose,
  onSaved,
}: Props) {
  const [module, setModule] = useState<"movies" | "series">("movies");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        if (module === "movies") {
          const data = await fetchMoviesCatalog();
          const films = (data.films || []) as Array<{
            id: string;
            title?: string;
            work_id?: string;
            cover_url?: string | null;
            portrait_url?: string | null;
          }>;
          if (cancelled) return;
          setRows(
            films.map((f) => ({
              key: `movies:${f.id}`,
              module: "movies" as const,
              slug: f.work_id || f.id,
              leafId: f.id,
              title: f.title || f.id,
              cover_url: f.portrait_url || f.cover_url,
            }))
          );
        } else {
          const data = await fetchSeriesCatalog();
          const franchises = (data.franchises || []) as SeriesFranchiseCard[];
          if (cancelled) return;
          const next: PickRow[] = [];
          for (const f of franchises) {
            const shows = f.subseries || [];
            if (shows.length) {
              for (const s of shows) {
                next.push({
                  key: `series:${s.id}`,
                  module: "series",
                  slug: f.id,
                  leafId: s.id,
                  title: s.title || s.id,
                  cover_url: s.cover_url || f.cover_url,
                });
              }
            } else {
              next.push({
                key: `series:${f.id}`,
                module: "series",
                slug: f.id,
                leafId: f.id,
                title: f.name || f.id,
                cover_url: f.cover_url,
              });
            }
          }
          setRows(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [module]);

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !alreadyMember(existing, r.module, r.leafId))
    .filter((r) => !q || r.title.toLowerCase().includes(q))
    .slice(0, 80);

  async function add(row: PickRow) {
    setBusy(true);
    setError(null);
    try {
      await linkUniverseMember(universeId, row.module, row.slug, row.leafId);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal add-universe-modal" role="dialog" aria-modal>
        <header className="modal__header">
          <h2>Add member</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal__body">
          <div className="artist-admin-form">
            <div className="app-menu-submenu" style={{ border: "none", padding: 0 }}>
              <button
                type="button"
                className={module === "movies" ? "active" : ""}
                disabled={busy}
                onClick={() => setModule("movies")}
              >
                Movies
              </button>
              <button
                type="button"
                className={module === "series" ? "active" : ""}
                disabled={busy}
                onClick={() => setModule("series")}
              >
                Series
              </button>
            </div>
            <label className="artist-admin-form__inline">
              <span className="artist-admin-form__inline-label">Search</span>
              <input
                className="artist-admin-form__inline-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy}
                placeholder={module === "movies" ? "Film title…" : "Show title…"}
                autoFocus
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            {loading ? (
              <p className="muted">Loading catalog…</p>
            ) : filtered.length === 0 ? (
              <p className="muted">No matches.</p>
            ) : (
              <ul className="add-universe-modal__list">
                {filtered.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void add(r)}
                    >
                      {r.cover_url ? (
                        <img src={r.cover_url} alt="" />
                      ) : (
                        <span className="add-universe-modal__thumb-fallback" />
                      )}
                      <span>{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
