import { useEffect, useMemo, useState } from "react";
import {
  fetchBooksFilterOptions,
  fetchMediaAuthors,
  fetchMediaDirectors,
  fetchMediaGenres,
  fetchMediaPublishers,
  patchMediaItemOverview,
} from "../../../api";
import type { MediaItemOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";
import SearchableDropdown, {
  type DropdownOption,
} from "../../SearchableDropdown";
import GenreTagsInput, {
  joinSemicolonList,
  splitSemicolonList,
} from "./GenreTagsInput";
import PublisherSuggestInput from "./PublisherSuggestInput";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  data: MediaItemOverview;
  onClose: () => void;
  onSaved: (data: MediaItemOverview) => void;
};

const FALLBACK_LANGS = [
  { code: "ja", label: "Japanese" },
  { code: "en", label: "English" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-419", label: "Spanish (Latin America)" },
];

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizePublisher(raw: string, catalog: string[]): string {
  const typed = titleCaseWords(raw.trim());
  if (!typed) return "";
  const match = catalog.find((p) => p.toLowerCase() === typed.toLowerCase());
  return match ?? typed;
}

function stripOrigin(label: string): string {
  return label.replace(/\s*\(origin\)\s*$/i, "").trim();
}

export default function MediaItemAboutEditModal({
  bandId,
  kind,
  itemId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [description, setDescription] = useState(data.description ?? "");
  const [directors, setDirectors] = useState<string[]>(() =>
    splitSemicolonList(data.director)
  );
  const [authors, setAuthors] = useState<string[]>(() =>
    splitSemicolonList(data.author)
  );
  const [publisher, setPublisher] = useState(data.publisher ?? "");
  const [contentCategory, setContentCategory] = useState(
    data.content_category || data.release_type || "Book"
  );
  const [genres, setGenres] = useState<string[]>(data.genres ?? []);
  const [genreOptions, setGenreOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [publisherOptions, setPublisherOptions] = useState<string[]>([]);
  const [directorOptions, setDirectorOptions] = useState<string[]>([]);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
  const [countryId, setCountryId] = useState("");
  const [countryIso, setCountryIso] = useState(data.country_iso || "");
  const [langOptions] = useState(FALLBACK_LANGS);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(
    () => (data.languages?.length ? [...data.languages] : [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const peopleFetch =
      kind === "video"
        ? fetchMediaDirectors(kind).then((r) => r.directors)
        : fetchMediaAuthors(kind).then((r) => r.authors);
    void Promise.all([
      fetchMediaGenres(kind),
      fetchMediaPublishers(kind),
      peopleFetch,
      fetchBooksFilterOptions().catch(() => null),
    ])
      .then(([genreRes, pubRes, people, bookOpts]) => {
        if (cancelled) return;
        setGenreOptions(genreRes.genres.map((g) => g.name).filter(Boolean));
        setCategoryOptions(genreRes.content_categories || []);
        setPublisherOptions(pubRes.publishers.filter(Boolean));
        if (kind === "video") {
          setDirectorOptions(people.filter(Boolean));
        } else {
          setAuthorOptions(people.filter(Boolean));
        }
        if (bookOpts) {
          const groups =
            bookOpts.all_country_groups?.length
              ? bookOpts.all_country_groups
              : bookOpts.country_groups || [];
          const opts: DropdownOption[] = (groups || []).flatMap((g) =>
            (g.items || []).map((c) => ({
              value: String(c.id),
              label: c.name ?? String(c.id),
              iso: c.iso ?? undefined,
              group: g.continent,
            }))
          );
          setCountryOptions(opts);
          const iso = (data.country_iso || "").toLowerCase();
          if (iso) {
            const hit = opts.find(
              (o) => (o.iso || "").toLowerCase() === iso
            );
            if (hit) setCountryId(hit.value);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGenreOptions([]);
          setCategoryOptions([]);
          setPublisherOptions([]);
          setDirectorOptions([]);
          setAuthorOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, data.country_iso]);

  const selectedCountry = useMemo(
    () => countryOptions.find((o) => o.value === countryId) ?? null,
    [countryOptions, countryId]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const iso =
        (selectedCountry?.iso || countryIso || "").trim().toLowerCase() ||
        null;
      const updated = await patchMediaItemOverview(bandId, kind, itemId, {
        description,
        director: kind === "video" ? joinSemicolonList(directors) : null,
        author: kind === "library" ? joinSemicolonList(authors) : null,
        publisher: normalizePublisher(publisher, publisherOptions),
        genres,
        content_category: kind === "library" ? contentCategory : null,
        country_iso: iso,
        languages: selectedLangs,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-about-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>{kind === "library" ? "Edit book" : "Edit Release"}</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form release-about-edit-modal__form">
          {kind === "library" ? (
            <label>
              Type
              <select
                value={contentCategory}
                onChange={(e) => setContentCategory(e.target.value)}
                disabled={saving}
              >
                {(categoryOptions.length
                  ? categoryOptions
                  : [contentCategory || "Book"]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="release-about-edit-modal__field--description">
            Description
            <textarea
              className="release-about-edit-modal__textarea ms-scrollbar"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {kind === "video" ? (
            <GenreTagsInput
              label="Director"
              options={directorOptions}
              value={directors}
              onChange={setDirectors}
              allowCustom
              placeholder="Directors separated with ;"
              disabled={saving}
            />
          ) : (
            <GenreTagsInput
              label="Author"
              options={authorOptions}
              value={authors}
              onChange={setAuthors}
              allowCustom
              placeholder="Authors separated with ;"
              disabled={saving}
            />
          )}
          <PublisherSuggestInput
            label="Publisher"
            value={publisher}
            options={publisherOptions}
            onChange={setPublisher}
            onCommit={(next) =>
              setPublisher(normalizePublisher(next, publisherOptions))
            }
            disabled={saving}
            placeholder="Type to search publishers…"
          />
          <label>
            Country
            <SearchableDropdown
              options={countryOptions}
              value={countryId}
              onChange={(v) => {
                setCountryId(v);
                const hit = countryOptions.find((o) => o.value === v);
                setCountryIso((hit?.iso || "").toLowerCase());
              }}
              placeholder={
                selectedCountry?.label ||
                (countryIso ? countryIso.toUpperCase() : "Search country…")
              }
            />
          </label>
          <fieldset className="series-about-edit__langs">
            <legend>Languages</legend>
            <div className="series-about-edit__lang-chips">
              {langOptions.map((l) => {
                const on = selectedLangs.some(
                  (c) => c.toLowerCase() === l.code.toLowerCase()
                );
                return (
                  <button
                    key={l.code}
                    type="button"
                    className={
                      on
                        ? "series-about-edit__lang-chip is-on"
                        : "series-about-edit__lang-chip"
                    }
                    disabled={saving}
                    onClick={() => {
                      setSelectedLangs((prev) => {
                        if (
                          prev.some(
                            (c) => c.toLowerCase() === l.code.toLowerCase()
                          )
                        ) {
                          return prev.filter(
                            (c) => c.toLowerCase() !== l.code.toLowerCase()
                          );
                        }
                        return [...prev, l.code];
                      });
                    }}
                  >
                    {stripOrigin(l.label)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <GenreTagsInput
            label="Genres"
            options={genreOptions}
            value={genres}
            onChange={setGenres}
            placeholder="Genres separated with ;"
            disabled={saving}
          />
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
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
