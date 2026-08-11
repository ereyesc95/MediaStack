import { useEffect, useMemo, useState } from "react";
import {
  fetchBooksFilterOptions,
  fetchMoviesPublishers,
  fetchSeriesFilterOptions,
  patchBooksBookAbout,
  patchMoviesFilmAbout,
  patchSeriesAbout,
} from "../../api";
import type { SeriesOverview } from "../../types";
import ModalPortal from "../ModalPortal";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";
import { AddCastModal } from "./SeriesCast";

type ActivityRow = { start: string; end: string };

type GenreOpt = { id: string; name: string; group?: string };

type Props = {
  franchiseId: string;
  data: SeriesOverview;
  /** When set, edits about fields for this subseries only (series variant). */
  subseriesId?: string;
  /** Film id when variant is film (defaults to subseriesId). */
  filmId?: string;
  variant?: "series" | "film" | "book";
  title?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCastChanged?: () => void;
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
  if (!periods?.length) return [{ start: "", end: "" }];
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

function asWriterList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((w) => String(w).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(";")
      .map((w) => w.trim())
      .filter(Boolean);
  }
  return [];
}

export default function SeriesAboutEditModal({
  franchiseId,
  data,
  subseriesId,
  filmId,
  variant = "series",
  title,
  isAdmin = false,
  onClose,
  onSaved,
  onCastChanged,
}: Props) {
  const isFilm = variant === "film";
  const isBook = variant === "book";
  const aboutFilmId = filmId || subseriesId || "";
  const scoped =
    !isFilm && !isBook && subseriesId
      ? data.subseries_meta?.[subseriesId] ?? null
      : null;
  const writersSeed =
    isFilm || isBook
      ? asWriterList(
          isBook
            ? (data as SeriesOverview & { authors?: string[] }).authors?.length
              ? (data as SeriesOverview & { authors?: string[] }).authors
              : data.writers
            : (data as SeriesOverview & { directors?: string[] }).directors
                  ?.length
              ? (data as SeriesOverview & { directors?: string[] }).directors
              : data.writers
        )
      : asWriterList(scoped?.writers ?? data.writers);

  const [bio, setBio] = useState(
    (scoped?.bio != null ? scoped.bio : data.bio) ?? ""
  );
  const [writers, setWriters] = useState(writersSeed.join("; "));
  const [publishers, setPublishers] = useState(
    asWriterList(scoped?.publishers ?? data.publishers).join("; ")
  );
  const [countryId, setCountryId] = useState(
    (scoped?.country ?? data.country)?.id != null
      ? String((scoped?.country ?? data.country)!.id)
      : ""
  );
  const [selectedLangs, setSelectedLangs] = useState<string[]>(() => {
    const langs = scoped?.languages ?? data.languages;
    if (langs?.length) return [...langs];
    if (data.origin_language) return [data.origin_language];
    return [];
  });
  const [customLangLabels, setCustomLangLabels] = useState<
    Record<string, string>
  >({});
  const [addingCustomLang, setAddingCustomLang] = useState(false);
  const [customLangDraft, setCustomLangDraft] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<GenreOpt[]>(() =>
    (scoped?.genres ?? data.genres ?? []).map((g) => ({
      id: String(g.id),
      name: g.name,
    }))
  );
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(() =>
    periodsToRows(scoped?.activity_periods ?? data.activity_periods)
  );
  const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
  const [genreDropdownOptions, setGenreDropdownOptions] = useState<
    DropdownOption[]
  >([]);
  const [publisherOptions, setPublisherOptions] = useState<string[]>([]);
  const [publishersFocused, setPublishersFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addCastOpen, setAddCastOpen] = useState(false);

  const modalTitle =
    title ||
    (isBook
      ? "Edit book"
      : isFilm
        ? "Edit movie"
        : subseriesId
          ? "Edit series"
          : "Edit about");

  const languageCatalog = useMemo(() => {
    const opts = data.language_options?.length
      ? data.language_options.map((o) => ({
          code: o.code,
          label: stripOrigin(o.label),
        }))
      : [...FALLBACK_LANGS];
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
        .map((code) => {
          const opt = languageCatalog.find((o) => o.code === code);
          return { code, label: opt?.label || code };
        })
        .filter(Boolean),
    [selectedLangs, languageCatalog]
  );

  const addableLangs = useMemo(
    () => languageCatalog.filter((o) => !selectedLangs.includes(o.code)),
    [languageCatalog, selectedLangs]
  );

  useEffect(() => {
    const load = isBook ? fetchBooksFilterOptions : fetchSeriesFilterOptions;
    load()
      .then((opts) => {
        const countries =
          opts.all_country_groups?.length
            ? opts.all_country_groups
            : opts.country_groups;
        setCountryOptions(
          (countries || []).flatMap((g) =>
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
        const fromGroups = (genres || []).flatMap((g) =>
          g.items.map((s) => ({
            value: String(s.id),
            label: s.name ?? "",
            group: g.genre,
          }))
        );
        if (fromGroups.length) {
          setGenreDropdownOptions(fromGroups);
          return;
        }
        // Flat genres fallback (books filters always include this)
        const flat = (opts.genres || [])
          .map((g) => ({
            value: String(g.id ?? g.name),
            label: g.name ?? "",
            group: undefined as string | undefined,
          }))
          .filter((o) => o.label);
        setGenreDropdownOptions(flat);
      })
      .catch(() => {});
  }, [isBook]);

  useEffect(() => {
    fetchMoviesPublishers()
      .then((payload) => setPublisherOptions(payload.publishers || []))
      .catch(() => {});
  }, []);

  const selectedCountry = useMemo(
    () => countryOptions.find((o) => o.value === countryId) ?? null,
    [countryOptions, countryId]
  );

  const removeLang = (code: string) => {
    setSelectedLangs((prev) => prev.filter((c) => c !== code));
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

  const updateActivityRow = (
    index: number,
    field: keyof ActivityRow,
    value: string
  ) => {
    setActivityRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const publisherSegment = publishers.slice(publishers.lastIndexOf(";") + 1).trim();
  const publisherSuggestions = publisherSegment
    ? publisherOptions
        .filter(
          (publisher) =>
            publisher.toLowerCase().includes(publisherSegment.toLowerCase())
        )
        .filter(
          (publisher) =>
            publisher.toLowerCase() !== publisherSegment.toLowerCase()
        )
        .slice(0, 8)
    : [];

  const selectPublisher = (publisher: string) => {
    const separator = publishers.lastIndexOf(";");
    const prefix = separator >= 0 ? publishers.slice(0, separator + 1) : "";
    setPublishers(
      `${prefix}${prefix && !/\s$/.test(prefix) ? " " : ""}${publisher}`
    );
    setPublishersFocused(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const starts = isFilm || isBook
        ? (activityRows[0]?.start ?? "").trim()
        : activityRows.map((r) => r.start.trim()).join(";");
      const ends = isFilm || isBook
        ? starts
        : activityRows.map((r) => r.end.trim()).join(";");
      const genrePayload = selectedGenres.map((g) => ({
        id: Number.isFinite(Number(g.id)) ? Number(g.id) : g.id,
        name: g.name,
      }));
      if (isBook) {
        if (!aboutFilmId) throw new Error("Missing book id");
        await patchBooksBookAbout(aboutFilmId, {
          bio,
          writers,
          publishers,
          country_id: countryId ? Number(countryId) : null,
          activity_start: starts,
          activity_end: ends,
          languages: selectedLangs,
          genres: genrePayload,
        });
      } else if (isFilm) {
        if (!aboutFilmId) throw new Error("Missing film id");
        const directorList = writers
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        await patchMoviesFilmAbout(aboutFilmId, {
          bio,
          writers,
          directors: directorList,
          publishers,
          country_id: countryId ? Number(countryId) : null,
          activity_start: starts,
          activity_end: ends,
          languages: selectedLangs,
          genres: genrePayload,
        });
      } else {
        await patchSeriesAbout(franchiseId, {
          bio,
          writers,
          publishers,
          country_id: countryId ? Number(countryId) : null,
          activity_start: starts,
          activity_end: ends,
          languages: selectedLangs,
          genres: genrePayload,
          subseries_id: subseriesId || undefined,
        });
      }
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
        className="modal-panel artist-admin-modal artist-admin-modal--wide series-about-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{modalTitle}</h3>
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
            {isFilm
              ? "Directors / writers (semicolon-separated)"
              : "Writers (semicolon-separated)"}
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
                    const v = e.target.value;
                    if (v === "__custom__") {
                      setAddingCustomLang(true);
                      return;
                    }
                    if (v) {
                      setSelectedLangs((prev) =>
                        prev.includes(v) ? prev : [...prev, v]
                      );
                    }
                  }}
                >
                  <option value="">Add language…</option>
                  {addableLangs.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
              )}
            </div>
          </div>

          <div className="series-about-edit__block series-about-edit__genres">
            <span className="series-about-edit__label">Genres</span>
            <div className="series-about-edit__chips series-about-edit__genre-scroll">
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

          <label className="series-about-edit__publishers">
            Publishers (semicolon-separated)
            <input
              value={publishers}
              onChange={(e) => setPublishers(e.target.value)}
              onFocus={() => setPublishersFocused(true)}
              onBlur={() => setPublishersFocused(false)}
              autoComplete="off"
            />
            {publishersFocused && publisherSuggestions.length > 0 ? (
              <span className="series-about-edit__publisher-suggestions">
                {publisherSuggestions.map((publisher) => (
                  <button
                    key={publisher}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectPublisher(publisher)}
                  >
                    {publisher}
                  </button>
                ))}
              </span>
            ) : null}
          </label>

          <div className="artist-about-edit__periods">
            {isFilm || isBook ? (
              <label className="series-about-edit__release-date-row">
                <span className="series-about-edit__label">Release date</span>
                <input
                  value={activityRows[0]?.start || ""}
                  onChange={(e) =>
                    updateActivityRow(0, "start", e.target.value)
                  }
                  placeholder="YYYY-MM-DD"
                />
              </label>
            ) : (
              <>
                <div className="artist-about-edit__periods-head">
                  <span className="series-about-edit__label">Air Dates</span>
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
                      End
                      <input
                        value={row.end}
                        onChange={(e) =>
                          updateActivityRow(index, "end", e.target.value)
                        }
                      />
                    </label>
                    {activityRows.length > 1 ? (
                      <button
                        type="button"
                        className="artist-about-edit__period-remove"
                        onClick={() =>
                          setActivityRows((rows) =>
                            rows.filter((_, i) => i !== index)
                          )
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </>
            )}
          </div>

          {isAdmin && subseriesId && !isFilm ? (
            <div className="series-about-edit__cast-row">
              <button
                type="button"
                className="btn btn--small series-about-edit__cast-btn"
                onClick={() => setAddCastOpen(true)}
              >
                + Add cast member
              </button>
            </div>
          ) : null}
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
      {addCastOpen && !isFilm ? (
        <AddCastModal
          franchiseId={franchiseId}
          bucket="characters"
          languageOptions={languageCatalog.map((o) => ({
            code: o.code,
            label: o.label,
          }))}
          defaultLanguage={
            selectedLangs[0] || data.origin_language || null
          }
          subseries={data.subseries || []}
          defaultSubseriesIds={subseriesId ? [subseriesId] : undefined}
          onClose={() => setAddCastOpen(false)}
          onSaved={() => {
            setAddCastOpen(false);
            onCastChanged?.();
          }}
        />
      ) : null}
    </ModalPortal>
  );
}
