import { useEffect, useMemo, useState } from "react";
import {
  fetchSeriesFilterOptions,
  patchSeriesAbout,
} from "../../api";
import type { SeriesOverview } from "../../types";
import ModalPortal from "../ModalPortal";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";

type ActivityRow = { start: string; end: string };

type GenreOpt = { id: string; name: string; group?: string };

type Props = {
  franchiseId: string;
  data: SeriesOverview;
  onClose: () => void;
  onSaved: () => void;
};

const FALLBACK_LANGS = [
  { code: "ja", label: "Japanese" },
  { code: "en", label: "English" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-419", label: "Spanish (Latin America)" },
];

function periodsToRows(
  periods: SeriesOverview["activity_periods"]
): ActivityRow[] {
  if (!periods.length) return [{ start: "", end: "" }];
  return periods.map((p) => ({
    start: p.start ?? "",
    end: p.end ?? "",
  }));
}

function stripOrigin(label: string): string {
  return label.replace(/\s*\(origin\)\s*$/i, "").trim();
}

function slugLangCode(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || `lang-${Date.now()}`;
}

export default function SeriesAboutEditModal({
  franchiseId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [bio, setBio] = useState(data.bio ?? "");
  const [writers, setWriters] = useState(data.writers.join("; "));
  const [publishers, setPublishers] = useState(data.publishers.join("; "));
  const [countryId, setCountryId] = useState(
    data.country?.id != null ? String(data.country.id) : ""
  );
  const [selectedLangs, setSelectedLangs] = useState<string[]>(() => {
    if (data.languages?.length) return [...data.languages];
    if (data.origin_language) return [data.origin_language];
    return [];
  });
  const [customLangLabels, setCustomLangLabels] = useState<
    Record<string, string>
  >({});
  const [addingCustomLang, setAddingCustomLang] = useState(false);
  const [customLangDraft, setCustomLangDraft] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<GenreOpt[]>(() =>
    (data.genres || []).map((g) => ({
      id: String(g.id),
      name: g.name,
    }))
  );
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(() =>
    periodsToRows(data.activity_periods)
  );
  const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
  const [genreDropdownOptions, setGenreDropdownOptions] = useState<
    DropdownOption[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const languageCatalog = useMemo(() => {
    const opts = data.language_options?.length
      ? data.language_options.map((o) => ({
          code: o.code,
          label: stripOrigin(o.label),
        }))
      : [...FALLBACK_LANGS];
    // Include custom labels
    for (const [code, label] of Object.entries(customLangLabels)) {
      if (!opts.some((o) => o.code === code)) {
        opts.push({ code, label });
      }
    }
    for (const code of selectedLangs) {
      if (!opts.some((o) => o.code === code)) {
        opts.push({
          code,
          label: customLangLabels[code] || code,
        });
      }
    }
    const origin = data.origin_language;
    if (!origin) return opts;
    return [
      ...opts.filter((o) => o.code === origin),
      ...opts.filter((o) => o.code !== origin),
    ];
  }, [
    data.language_options,
    data.origin_language,
    customLangLabels,
    selectedLangs,
  ]);

  const selectedLangMeta = useMemo(
    () =>
      selectedLangs
        .map((code) => languageCatalog.find((o) => o.code === code))
        .filter(Boolean) as { code: string; label: string }[],
    [selectedLangs, languageCatalog]
  );

  const addableLangs = useMemo(
    () => languageCatalog.filter((o) => !selectedLangs.includes(o.code)),
    [languageCatalog, selectedLangs]
  );

  useEffect(() => {
    fetchSeriesFilterOptions()
      .then((opts) => {
        const countries =
          opts.all_country_groups?.length
            ? opts.all_country_groups
            : opts.country_groups;
        setCountryOptions(
          countries.flatMap((g) =>
            g.items.map((c) => ({
              value: String(c.id),
              label: c.name ?? String(c.id),
              iso: c.iso ?? undefined,
              group: g.continent,
            }))
          )
        );
        const genres =
          opts.all_subgenre_groups?.length
            ? opts.all_subgenre_groups
            : opts.subgenre_groups;
        setGenreDropdownOptions(
          genres.flatMap((g) =>
            g.items.map((s) => ({
              value: String(s.id),
              label: s.name ?? "",
              group: g.genre,
            }))
          )
        );
      })
      .catch(() => {});
  }, []);

  const selectedCountry = useMemo(
    () => countryOptions.find((o) => o.value === countryId),
    [countryOptions, countryId]
  );

  const updateActivityRow = (
    index: number,
    field: keyof ActivityRow,
    value: string
  ) => {
    setActivityRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeLang = (code: string) => {
    setSelectedLangs((prev) => prev.filter((c) => c !== code));
  };

  const addLang = (code: string) => {
    if (!code || selectedLangs.includes(code)) return;
    if (code === "__custom__") {
      setAddingCustomLang(true);
      return;
    }
    setSelectedLangs((prev) => [...prev, code]);
  };

  const commitCustomLang = () => {
    const label = customLangDraft.trim();
    if (!label) {
      setAddingCustomLang(false);
      setCustomLangDraft("");
      return;
    }
    const code = slugLangCode(label);
    setCustomLangLabels((prev) => ({ ...prev, [code]: label }));
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev : [...prev, code]
    );
    setAddingCustomLang(false);
    setCustomLangDraft("");
  };

  const removeGenre = (id: string) => {
    setSelectedGenres((prev) => prev.filter((g) => g.id !== id));
  };

  const addGenreFromDropdown = (value: string) => {
    if (!value) return;
    const opt = genreDropdownOptions.find((o) => o.value === value);
    if (!opt) return;
    setSelectedGenres((prev) => {
      if (prev.some((g) => g.id === opt.value || g.name === opt.label)) {
        return prev;
      }
      return [
        ...prev,
        { id: opt.value, name: opt.label, group: opt.group },
      ];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const starts = activityRows.map((r) => r.start.trim()).join(";");
      const ends = activityRows.map((r) => r.end.trim()).join(";");
      await patchSeriesAbout(franchiseId, {
        bio,
        writers,
        publishers,
        country_id: countryId ? Number(countryId) : null,
        activity_start: starts,
        activity_end: ends,
        languages: selectedLangs,
        genres: selectedGenres.map((g) => ({
          id: Number.isFinite(Number(g.id)) ? Number(g.id) : g.id,
          name: g.name,
        })),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal artist-admin-modal--wide"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Edit about</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="artist-admin-form">
          <label>
            Description / bio
            <textarea
              rows={8}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label>
            Writers (semicolon-separated)
            <input
              value={writers}
              onChange={(e) => setWriters(e.target.value)}
            />
          </label>
          <label>
            Country
            <SearchableDropdown
              options={countryOptions}
              value={countryId}
              onChange={setCountryId}
              placeholder={
                selectedCountry?.label ?? data.country?.name ?? "Search country…"
              }
            />
          </label>

          <div className="series-about-edit__block">
            <span className="series-about-edit__label">Languages</span>
            <div className="series-about-edit__chips">
              {selectedLangMeta.map((opt) => (
                <span key={opt.code} className="series-about-edit__chip">
                  {opt.label}
                  <button
                    type="button"
                    className="series-about-edit__chip-x"
                    aria-label={`Remove ${opt.label}`}
                    onClick={() => removeLang(opt.code)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {addingCustomLang ? (
                <span className="series-about-edit__custom-lang">
                  <input
                    value={customLangDraft}
                    onChange={(e) => setCustomLangDraft(e.target.value)}
                    placeholder="Language name…"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCustomLang();
                      }
                      if (e.key === "Escape") {
                        setAddingCustomLang(false);
                        setCustomLangDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={commitCustomLang}
                  >
                    Add
                  </button>
                </span>
              ) : (
                <select
                  className="series-about-edit__add-select"
                  value=""
                  onChange={(e) => {
                    addLang(e.target.value);
                    e.target.value = "";
                  }}
                  aria-label="Add language"
                >
                  <option value="">+ Add</option>
                  {addableLangs.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom language…</option>
                </select>
              )}
            </div>
          </div>

          <div className="series-about-edit__block">
            <span className="series-about-edit__label">Genres</span>
            <div className="series-about-edit__chips">
              {selectedGenres.map((g) => (
                <span key={g.id} className="series-about-edit__chip">
                  {g.name}
                  <button
                    type="button"
                    className="series-about-edit__chip-x"
                    aria-label={`Remove ${g.name}`}
                    onClick={() => removeGenre(g.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <SearchableDropdown
              options={genreDropdownOptions.filter(
                (o) =>
                  !selectedGenres.some(
                    (g) => g.id === o.value || g.name === o.label
                  )
              )}
              value=""
              onChange={addGenreFromDropdown}
              placeholder="Add genre…"
              visibleRows={8}
              portal
            />
          </div>

          <label>
            Publishers (semicolon-separated)
            <input
              value={publishers}
              onChange={(e) => setPublishers(e.target.value)}
            />
          </label>
          <div className="artist-about-edit__periods">
            <div className="artist-about-edit__periods-head">
              <span className="series-about-edit__label">Activity periods</span>
              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  setActivityRows((rows) => [...rows, { start: "", end: "" }])
                }
              >
                + Add period
              </button>
            </div>
            {activityRows.map((row, index) => (
              <div key={index} className="artist-about-edit__period-row">
                <label>
                  Start
                  <input
                    value={row.start}
                    onChange={(e) =>
                      updateActivityRow(index, "start", e.target.value)
                    }
                  />
                </label>
                <label>
                  End (empty = present)
                  <input
                    value={row.end}
                    onChange={(e) =>
                      updateActivityRow(index, "end", e.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="artist-about-edit__period-remove"
                  onClick={() =>
                    setActivityRows((rows) =>
                      rows.length > 1
                        ? rows.filter((_, i) => i !== index)
                        : rows
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
