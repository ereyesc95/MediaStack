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

type PickScope = "franchises" | "movies" | "series";

type PickRow = {
  key: string;
  module: "movies" | "series";
  slug: string;
  /** Omit for whole-franchise bulk link. */
  leafId?: string;
  title: string;
  cover_url?: string | null;
  subtitle?: string;
  /** When linking a shared franchise, also link this movies work slug. */
  moviesSlug?: string;
  /** When linking a shared franchise, also link this series franchise slug. */
  seriesSlug?: string;
};

function alreadyMember(
  existing: UniverseCard[],
  module: string,
  slug: string,
  leafId?: string,
  extra?: { moviesSlug?: string; seriesSlug?: string }
) {
  if (leafId) {
    return existing.some(
      (c) =>
        c.module === module &&
        String(c.leaf_id || c.id || "").toLowerCase() === leafId.toLowerCase()
    );
  }
  const slugs = [slug, extra?.moviesSlug, extra?.seriesSlug]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return existing.some(
    (c) =>
      slugs.includes(String(c.franchise_id || "").toLowerCase()) ||
      (c.module === module &&
        String(c.franchise_id || "").toLowerCase() === slug.toLowerCase())
  );
}

export default function UniverseAddMemberModal({
  universeId,
  existing,
  onClose,
  onSaved,
}: Props) {
  const [scope, setScope] = useState<PickScope>("franchises");
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
        if (scope === "movies") {
          const data = await fetchMoviesCatalog();
          const films = (data.films || []) as Array<{
            id: string;
            title?: string;
            work_id?: string;
            work_name?: string;
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
              subtitle: f.work_name || undefined,
              cover_url: f.portrait_url || f.cover_url,
            }))
          );
          return;
        }

        if (scope === "franchises") {
          const [movies, series] = await Promise.all([
            fetchMoviesCatalog(),
            fetchSeriesCatalog(),
          ]);
          if (cancelled) return;
          type Shared = {
            key: string;
            title: string;
            cover_url?: string | null;
            moviesSlug?: string;
            seriesSlug?: string;
          };
          const byName = new Map<string, Shared>();
          for (const f of (movies.franchises || []) as SeriesFranchiseCard[]) {
            const title = f.name || f.id;
            const k = title.toLowerCase();
            const cur = byName.get(k) || {
              key: `fr:${k}`,
              title,
              cover_url: f.cover_url,
            };
            cur.moviesSlug = f.id;
            cur.cover_url = cur.cover_url || f.cover_url;
            byName.set(k, cur);
          }
          for (const f of (series.franchises || []) as SeriesFranchiseCard[]) {
            const title = f.name || f.id;
            const k = title.toLowerCase();
            const cur = byName.get(k) || {
              key: `fr:${k}`,
              title,
              cover_url: f.cover_url,
            };
            cur.seriesSlug = f.id;
            cur.cover_url = cur.cover_url || f.cover_url;
            if (!cur.title || cur.title === cur.moviesSlug) cur.title = title;
            byName.set(k, cur);
          }
          const next: PickRow[] = [...byName.values()]
            .map((f) => ({
              key: f.key,
              module: (f.moviesSlug ? "movies" : "series") as "movies" | "series",
              slug: f.moviesSlug || f.seriesSlug || f.key,
              title: f.title,
              subtitle: "Franchise",
              cover_url: f.cover_url,
              moviesSlug: f.moviesSlug,
              seriesSlug: f.seriesSlug,
            }))
            .sort((a, b) =>
              a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
            );
          setRows(next);
          return;
        }

        // series shows / subseries
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
                subtitle: f.name || undefined,
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
  }, [scope]);

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        !alreadyMember(existing, r.module, r.slug, r.leafId, {
          moviesSlug: r.moviesSlug,
          seriesSlug: r.seriesSlug,
        })
    )
    .filter(
      (r) =>
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.subtitle || "").toLowerCase().includes(q)
    )
    .slice(0, 100);

  async function add(row: PickRow) {
    setBusy(true);
    setError(null);
    try {
      if (row.moviesSlug || row.seriesSlug) {
        if (row.moviesSlug) {
          await linkUniverseMember(universeId, "movies", row.moviesSlug);
        }
        if (row.seriesSlug) {
          await linkUniverseMember(universeId, "series", row.seriesSlug);
        }
      } else {
        await linkUniverseMember(
          universeId,
          row.module,
          row.slug,
          row.leafId
        );
      }
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
      <div
        className="modal-panel artist-admin-modal add-universe-modal artist-admin-modal--member"
        role="dialog"
        aria-modal
        aria-labelledby="universe-add-member-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3 id="universe-add-member-title">Add member</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="artist-admin-form add-universe-modal__member-form">
          <div className="add-universe-modal__scope" role="tablist">
            {(
              [
                ["franchises", "Franchises"],
                ["movies", "Movies"],
                ["series", "Series"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={scope === id ? "active" : ""}
                disabled={busy}
                onClick={() => {
                  setScope(id);
                  setQuery("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="artist-admin-form__inline">
            <span className="artist-admin-form__inline-label">Search</span>
            <input
              className="artist-admin-form__inline-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={busy}
              placeholder={
                scope === "franchises"
                  ? "Franchise name…"
                  : scope === "movies"
                    ? "Film title…"
                    : "Show title…"
              }
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
                    <span className="add-universe-modal__list-text">
                      <span className="add-universe-modal__list-title">
                        {r.title}
                      </span>
                      {r.subtitle ? (
                        <span className="add-universe-modal__list-sub">
                          {r.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
