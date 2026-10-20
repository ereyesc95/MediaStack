import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGamesRomPlatforms,
  organizeGamesPlatformRoms,
  scanGamesPlatformRoms,
  type GamesRomScanItem,
} from "../../api";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";

type Props = {
  onClose: () => void;
  onDone?: () => void;
};

type Step = "pick" | "preview" | "running" | "done";

type PlatformRow = { name: string; exists: boolean };

function PlatformLabel({
  name,
  empty,
}: {
  name: string;
  empty?: boolean;
}) {
  return (
    <span className="organize-roms-modal__plat-label">
      <span>{name}</span>
      {empty ? (
        <span className="organize-roms-modal__plat-empty">(empty)</span>
      ) : null}
    </span>
  );
}

export default function OrganizeLooseRomsModal({ onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
  const [platform, setPlatform] = useState("");
  const [items, setItems] = useState<GamesRomScanItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [maxBatch, setMaxBatch] = useState(500);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  useEffect(() => {
    setBusy(true);
    void fetchGamesRomPlatforms()
      .then((data) => {
        const list = data.platforms || [];
        setPlatforms(list);
        const firstExisting =
          list.find((p) => p.exists)?.name || list[0]?.name || "";
        setPlatform(firstExisting);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, []);

  const platformOptions: DropdownOption[] = useMemo(
    () => platforms.map((p) => ({ value: p.name, label: p.name })),
    [platforms]
  );

  const existsByName = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of platforms) map.set(p.name, p.exists);
    return map;
  }, [platforms]);

  const runnable = useMemo(
    () => items.filter((i) => selected.has(i.key) && !i.conflict),
    [items, selected]
  );
  const conflictCount = useMemo(
    () => items.filter((i) => i.conflict).length,
    [items]
  );

  const scan = useCallback(async () => {
    if (!platform || busy) return;
    setBusy(true);
    setError(null);
    setResultSummary(null);
    try {
      const data = await scanGamesPlatformRoms(platform);
      const next = data.items || [];
      setItems(next);
      setTruncated(Boolean(data.truncated));
      setMaxBatch(data.max_batch || 500);
      setSelected(new Set(next.filter((i) => !i.conflict).map((i) => i.key)));
      setStep("preview");
      setStatus(
        next.length
          ? `${data.count} game group${data.count === 1 ? "" : "s"} · ${data.file_count} file${data.file_count === 1 ? "" : "s"}`
          : "No loose ROM files found at platform root."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [platform, busy]);

  const toggle = (key: string, conflict: boolean) => {
    if (conflict) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllRunnable = () => {
    setSelected(new Set(items.filter((i) => !i.conflict).map((i) => i.key)));
  };

  const clearSelection = () => setSelected(new Set());

  const runOrganize = async () => {
    if (!platform || !runnable.length || busy) return;
    setBusy(true);
    setStep("running");
    setError(null);
    setStatus("Organizing folders and moving ROMs…");
    try {
      const result = await organizeGamesPlatformRoms(platform, {
        keys: runnable.map((i) => i.key),
        enrich: true,
      });
      const en = result.enrich;
      const parts = [
        `Organized ${result.organized_count}`,
        result.skipped_count ? `skipped ${result.skipped_count}` : null,
        en
          ? `IGDB enriched ${en.enriched_count}, no match ${en.skipped_count}`
          : null,
      ].filter(Boolean);
      setResultSummary(parts.join(" · "));
      setStatus("Fetching finished");
      setStep("done");
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const renderPlatformOption = (opt: DropdownOption) => (
    <PlatformLabel
      name={opt.label}
      empty={existsByName.get(opt.value) === false}
    />
  );

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal-panel artist-admin-modal manage-artists-modal organize-roms-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Organize ROMs</h3>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={() => !busy && onClose()}
            disabled={busy && step === "running"}
          >
            ×
          </button>
        </div>

        <div className="artist-admin-form">
          {error ? <p className="error">{error}</p> : null}
          {status ? <p className="muted">{status}</p> : null}
          {truncated ? (
            <p className="muted">
              Showing the first {maxBatch} files at platform root.
            </p>
          ) : null}

          {step === "pick" || step === "preview" ? (
            <div className="organize-roms-modal__platform">
              <span>Platform</span>
              {step === "pick" ? (
                <SearchableDropdown
                  options={platformOptions}
                  value={platform}
                  onChange={setPlatform}
                  placeholder="Search platforms…"
                  visibleRows={8}
                  portal
                  placement="below"
                  renderSelectedLabel={renderPlatformOption}
                  renderOptionLabel={renderPlatformOption}
                />
              ) : (
                <div className="organize-roms-modal__platform-locked">
                  <PlatformLabel
                    name={platform}
                    empty={existsByName.get(platform) === false}
                  />
                </div>
              )}
            </div>
          ) : null}

          {step === "pick" ? (
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !platform}
                onClick={() => void scan()}
              >
                {busy ? "Scanning…" : "Scan"}
              </button>
            </div>
          ) : null}

          {step === "preview" ? (
            <>
              <div className="organize-roms-modal__toolbar">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={selectAllRunnable}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={clearSelection}
                >
                  Clear
                </button>
                <span className="muted">
                  {runnable.length} selected
                  {conflictCount
                    ? ` · ${conflictCount} conflict(s) skipped`
                    : ""}
                </span>
              </div>
              <div className="organize-roms-modal__list">
                {items.length === 0 ? (
                  <p className="muted">Nothing to organize.</p>
                ) : (
                  items.map((item) => (
                    <label
                      key={item.key}
                      className={`organize-roms-modal__row${
                        item.conflict ? " is-conflict" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.key)}
                        disabled={item.conflict || busy}
                        onChange={() => toggle(item.key, item.conflict)}
                      />
                      <span className="organize-roms-modal__row-body">
                        <strong>{item.title}</strong>
                        <span className="muted">
                          {item.franchise
                            ? `Franchise: ${item.franchise}`
                            : "Standalone (3-tier)"}
                          {" · "}
                          {item.files.length} file
                          {item.files.length === 1 ? "" : "s"}
                          {item.conflict ? " · destination exists (skip)" : ""}
                        </span>
                        <span className="muted organize-roms-modal__path">
                          → {item.dest_rel}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="modal-actions-row manage-catalog-modal__actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setStep("pick");
                    setItems([]);
                    setSelected(new Set());
                    setStatus("");
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || runnable.length === 0}
                  onClick={() => void runOrganize()}
                >
                  Organize {runnable.length || ""}
                </button>
              </div>
            </>
          ) : null}

          {step === "running" ? (
            <div className="manage-artists-modal__progress" role="status">
              <span className="manage-artists-modal__spinner" />
              <div>
                <small className="muted manage-modal__wait">
                  Organizing ROMs and fetching IGDB matches, please wait...
                </small>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <>
              {resultSummary ? (
                <p className="modal-notice">{resultSummary}</p>
              ) : null}
              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
