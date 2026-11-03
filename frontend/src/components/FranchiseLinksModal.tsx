import { useEffect, useMemo, useState } from "react";
import {
  fetchFranchiseAliases,
  fetchFranchiseOverrides,
  saveFranchiseAliases,
  saveFranchiseOverrides,
  type FranchiseOverrideEdge,
} from "../api";
import ModalPortal from "./ModalPortal";

type Tab = "aliases" | "overrides";

type AliasRow = { alias: string; canonical: string };

type Props = {
  onClose: () => void;
};

function normalizeOverridePath(raw: string): string {
  return (raw || "").replace(/\\/g, "/").trim().replace(/\/+$/, "");
}

function serializeAliases(rows: AliasRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      alias: r.alias.trim(),
      canonical: r.canonical.trim(),
    }))
  );
}

function serializeOverrides(rows: FranchiseOverrideEdge[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      type: r.type,
      from: normalizeOverridePath(r.from),
      to: normalizeOverridePath(r.to),
      reason: (r.reason || "").trim(),
    }))
  );
}

function aliasDropWarnings(rows: AliasRow[]): string[] {
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let emptyHalf = 0;
  let sameAsCanon = 0;
  for (const row of rows) {
    const a = row.alias.trim();
    const c = row.canonical.trim();
    if ((a && !c) || (!a && c)) emptyHalf += 1;
    if (!a || !c) continue;
    const aKey = a.toLowerCase().replace(/\s+/g, " ");
    const cKey = c.toLowerCase().replace(/\s+/g, " ");
    if (aKey === cKey) sameAsCanon += 1;
    seen.set(aKey, (seen.get(aKey) || 0) + 1);
  }
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  if (emptyHalf)
    warnings.push(
      `${emptyHalf} alias row${emptyHalf === 1 ? "" : "s"} incomplete (need both sides)`
    );
  if (sameAsCanon)
    warnings.push(
      `${sameAsCanon} alias${sameAsCanon === 1 ? "" : "es"} equal canonical (dropped)`
    );
  if (dupes)
    warnings.push(
      `${dupes} duplicate alias key${dupes === 1 ? "" : "s"} (last wins)`
    );
  return warnings;
}

function overrideDropWarnings(rows: FranchiseOverrideEdge[]): string[] {
  const warnings: string[] = [];
  let emptyHalf = 0;
  for (const row of rows) {
    const frm = normalizeOverridePath(row.from);
    const to = normalizeOverridePath(row.to);
    if ((frm && !to) || (!frm && to)) emptyHalf += 1;
  }
  if (emptyHalf)
    warnings.push(
      `${emptyHalf} override row${emptyHalf === 1 ? "" : "s"} incomplete (need from + to)`
    );
  return warnings;
}

export default function FranchiseLinksModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("aliases");
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [overrides, setOverrides] = useState<FranchiseOverrideEdge[]>([]);
  const [baselineAliases, setBaselineAliases] = useState("[]");
  const [baselineOverrides, setBaselineOverrides] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      serializeAliases(aliases) !== baselineAliases ||
      serializeOverrides(overrides) !== baselineOverrides,
    [aliases, overrides, baselineAliases, baselineOverrides]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchFranchiseAliases(), fetchFranchiseOverrides()])
      .then(([a, o]) => {
        if (cancelled) return;
        const nextAliases = Object.entries(a.aliases || {}).map(
          ([alias, canonical]) => ({
            alias,
            canonical,
          })
        );
        const nextOverrides = (o.overrides || []).map((row) => ({
          type: (row.type === "exclude" ? "exclude" : "link") as
            | "link"
            | "exclude",
          from: String(row.from || ""),
          to: String(row.to || ""),
          reason: row.reason || "",
        }));
        setAliases(nextAliases);
        setOverrides(nextOverrides);
        setBaselineAliases(serializeAliases(nextAliases));
        setBaselineOverrides(serializeOverrides(nextOverrides));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function requestClose() {
    if (busy) return;
    if (
      dirty &&
      !window.confirm("Discard unsaved alias/override changes?")
    ) {
      return;
    }
    onClose();
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    setWarnMsg(null);
    try {
      const aliasWarn = aliasDropWarnings(aliases);
      const overrideWarn = overrideDropWarnings(overrides);

      const map: Record<string, string> = {};
      for (const row of aliases) {
        const a = row.alias.trim();
        const c = row.canonical.trim();
        if (a && c) map[a] = c;
      }
      const rows = overrides
        .map((r) => ({
          type: r.type,
          from: normalizeOverridePath(r.from),
          to: normalizeOverridePath(r.to),
          reason: (r.reason || "").trim() || undefined,
        }))
        .filter((r) => r.from && r.to);

      // Aliases first so the override rebuild picks up both DB settings.
      const aliasRes = await saveFranchiseAliases(map, false);
      const overrideRes = await saveFranchiseOverrides(rows, true);

      const nextAliases = Object.entries(aliasRes.aliases || map).map(
        ([alias, canonical]) => ({
          alias,
          canonical,
        })
      );
      const nextOverrides = (overrideRes.overrides || rows).map((row) => ({
        type: (row.type === "exclude" ? "exclude" : "link") as
          | "link"
          | "exclude",
        from: String(row.from || ""),
        to: String(row.to || ""),
        reason: row.reason || "",
      }));
      setAliases(nextAliases);
      setOverrides(nextOverrides);
      setBaselineAliases(serializeAliases(nextAliases));
      setBaselineOverrides(serializeOverrides(nextOverrides));

      const rebuilt = overrideRes.rebuilt || aliasRes.rebuilt;
      const parts = [
        `Saved ${aliasRes.count} aliases`,
        `${overrideRes.count} overrides`,
      ];
      if (rebuilt) {
        parts.push(`index rebuilt (${rebuilt.franchise_count} franchises)`);
      }
      setSavedMsg(parts.join(" · "));

      const drops = [...aliasWarn, ...overrideWarn];
      const keptAliases = Object.keys(aliasRes.aliases || map).length;
      const submittedAliases = Object.keys(map).length;
      if (submittedAliases > keptAliases) {
        drops.push(
          `${submittedAliases - keptAliases} alias${
            submittedAliases - keptAliases === 1 ? "" : "es"
          } dropped by server normalize`
        );
      }
      if (drops.length) setWarnMsg(drops.join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={requestClose}>
      <div
        className="modal-panel artist-admin-modal franchise-links-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Aliases & overrides</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={requestClose}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <p className="muted manage-files-modal__hint">
          Aliases merge folder names into one franchise slug. Overrides add{" "}
          <code>link</code> / <code>exclude</code> edges for biopics and
          subseries filters. Stored in the app database (not local JSON files).
          Saving writes both tabs and rebuilds the related index. Override paths
          use forward slashes (e.g. <code>Movies/E/Elvis</code>).
        </p>

        <div className="series-cast-add__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={tab === "aliases" ? "active" : ""}
            aria-selected={tab === "aliases"}
            onClick={() => setTab("aliases")}
          >
            Aliases
          </button>
          <button
            type="button"
            role="tab"
            className={tab === "overrides" ? "active" : ""}
            aria-selected={tab === "overrides"}
            onClick={() => setTab("overrides")}
          >
            Overrides
          </button>
        </div>

        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {savedMsg ? <p className="muted">{savedMsg}</p> : null}
        {warnMsg ? (
          <p className="franchise-links-modal__warn">{warnMsg}</p>
        ) : null}

        {!loading && tab === "aliases" ? (
          <div className="franchise-links-modal__table">
            {aliases.map((row, i) => (
              <div key={i} className="franchise-links-modal__row">
                <input
                  value={row.alias}
                  placeholder="alias (dbz)"
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...aliases];
                    next[i] = { ...row, alias: e.target.value };
                    setAliases(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                />
                <span className="muted">→</span>
                <input
                  value={row.canonical}
                  placeholder="canonical (dragon ball)"
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...aliases];
                    next[i] = { ...row, canonical: e.target.value };
                    setAliases(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setAliases(aliases.filter((_, idx) => idx !== i));
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setAliases([...aliases, { alias: "", canonical: "" }]);
                setSavedMsg(null);
              }}
            >
              Add alias
            </button>
          </div>
        ) : null}

        {!loading && tab === "overrides" ? (
          <div className="franchise-links-modal__table">
            {overrides.map((row, i) => (
              <div key={i} className="franchise-links-modal__override">
                <select
                  value={row.type}
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...overrides];
                    next[i] = {
                      ...row,
                      type: e.target.value as "link" | "exclude",
                    };
                    setOverrides(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                >
                  <option value="link">link</option>
                  <option value="exclude">exclude</option>
                </select>
                <input
                  value={row.from}
                  placeholder="from path (Music/H/HIM)"
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...overrides];
                    next[i] = { ...row, from: e.target.value };
                    setOverrides(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                  onBlur={() => {
                    const next = [...overrides];
                    next[i] = {
                      ...row,
                      from: normalizeOverridePath(row.from),
                    };
                    setOverrides(next);
                  }}
                />
                <input
                  value={row.to}
                  placeholder="to path (Movies/E/Elvis)"
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...overrides];
                    next[i] = { ...row, to: e.target.value };
                    setOverrides(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                  onBlur={() => {
                    const next = [...overrides];
                    next[i] = { ...row, to: normalizeOverridePath(row.to) };
                    setOverrides(next);
                  }}
                />
                <input
                  value={row.reason || ""}
                  placeholder="reason (optional)"
                  disabled={busy}
                  onChange={(e) => {
                    const next = [...overrides];
                    next[i] = { ...row, reason: e.target.value };
                    setOverrides(next);
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setOverrides(overrides.filter((_, idx) => idx !== i));
                    setSavedMsg(null);
                    setWarnMsg(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setOverrides([
                  ...overrides,
                  { type: "link", from: "", to: "", reason: "" },
                ]);
                setSavedMsg(null);
              }}
            >
              Add override
            </button>
          </div>
        ) : null}

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={requestClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : dirty ? "Save both & rebuild" : "Save & rebuild"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
