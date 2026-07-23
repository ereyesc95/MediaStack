import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CardOrientation,
  SeriesFilterMode,
  SeriesFilterOptions,
  SeriesFranchiseCard,
  SeriesSubseriesCard,
} from "../../types";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import { usePhoneLayout } from "../../usePhoneLayout";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HASH = "#";

const FILTER_MODES: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "SERIES" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "START DATE" },
  { id: "end", label: "END DATE" },
  { id: "genre", label: "GENRE" },
  { id: "publisher", label: "PUBLISHER" },
  { id: "writer", label: "WRITER" },
  { id: "most_played", label: "MOST PLAYED" },
];

export type SeriesCatalogScope = "franchises" | "shows";

export type SeriesCatalogCard = {
  key: string;
  franchiseId: string;
  subseriesId?: string;
  name: string;
  letter: string;
  cover_url: string | null;
  date_iso: string | null;
  meta: string;
};

function decadeLabel(d: number) {
  return `${d}s`;
}

function decadeFromIso(iso: string | null | undefined): number | null {
  if (!iso || iso.length < 4) return null;
  const y = Number(iso.slice(0, 4));
  if (!Number.isFinite(y)) return null;
  return Math.floor(y / 10) * 10;
}

function showMeta(s: SeriesSubseriesCard): string {
  const seasons = `${s.season_count} season${s.season_count === 1 ? "" : "s"}`;
  return s.display_date ? `${seasons} · ${s.display_date}` : seasons;
}

function franchiseMeta(f: SeriesFranchiseCard): string {
  return f.subseries_count > 0
    ? `${f.subseries_count} subseries · ${f.season_count} seasons`
    : `${f.season_count} season${f.season_count === 1 ? "" : "s"}`;
}

type Props = {
  franchises: SeriesFranchiseCard[];
  orientation: CardOrientation;
  filterMode: SeriesFilterMode;
  filterOptions: SeriesFilterOptions | null;
  catalogScope: SeriesCatalogScope;
  search: string;
  letter: string;
  continentId: number | "";
  countryId: number | "";
  startDecade: number | "";
  endDecade: number | "";
  subgenreId: number | "";
  publisher: string;
  writer: string;
  loading?: boolean;
  onSearchChange: (v: string) => void;
  onLetterChange: (v: string) => void;
  onFilterModeChange: (m: SeriesFilterMode) => void;
  onContinentIdChange: (v: number | "") => void;
  onCountryIdChange: (v: number | "") => void;
  onStartDecadeChange: (v: number | "") => void;
  onEndDecadeChange: (v: number | "") => void;
  onSubgenreIdChange: (v: number | "") => void;
  onPublisherChange: (v: string) => void;
  onWriterChange: (v: string) => void;
  onOpen: (
    franchiseId: string,
    subseriesId?: string,
    shell?: { name: string; cover_url: string | null }
  ) => void;
};

export default function SeriesBrowse({
  franchises,
  orientation,
  filterMode,
  filterOptions,
  catalogScope,
  search,
  letter,
  continentId,
  countryId,
  startDecade,
  endDecade,
  subgenreId,
  publisher,
  writer,
  loading,
  onSearchChange,
  onLetterChange,
  onFilterModeChange,
  onContinentIdChange,
  onCountryIdChange,
  onStartDecadeChange,
  onEndDecadeChange,
  onSubgenreIdChange,
  onPublisherChange,
  onWriterChange,
  onOpen,
}: Props) {
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [franchises, orientation, search, letter, filterMode, catalogScope, isPhone]);

  const decades = filterOptions?.decades ?? [];

  // Auto-select first decade when entering start/end with nothing selected
  useEffect(() => {
    if (!decades.length) return;
    if (filterMode === "start" && startDecade === "") {
      onStartDecadeChange(decades[0]);
    }
    if (filterMode === "end" && endDecade === "") {
      onEndDecadeChange(decades[0]);
    }
  }, [filterMode, decades, startDecade, endDecade, onStartDecadeChange, onEndDecadeChange]);

  const filterReady = useMemo(() => {
    switch (filterMode) {
      case "name":
      case "most_played":
        return true;
      case "continent":
        return continentId !== "";
      case "country":
        return countryId !== "";
      case "start":
        return startDecade !== "";
      case "end":
        return endDecade !== "";
      case "genre":
        return subgenreId !== "";
      case "publisher":
        return publisher.trim() !== "";
      case "writer":
        return writer.trim() !== "";
      default:
        return true;
    }
  }, [
    filterMode,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    publisher,
    writer,
  ]);

  const countryOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.country_groups.flatMap((g) =>
      g.items.map((c) => ({
        value: String(c.id),
        label: c.name ?? "",
        iso: c.iso ?? undefined,
        group: g.continent,
      }))
    );
  }, [filterOptions]);

  const genreOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.subgenre_groups.flatMap((g) =>
      g.items.map((s) => ({
        value: String(s.id),
        label: s.name ?? "",
        group: g.genre,
      }))
    );
  }, [filterOptions]);

  const publisherOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.publishers.map((p) => ({ value: p, label: p }));
  }, [filterOptions]);

  const writerOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.writers.map((w) => ({ value: w, label: w }));
  }, [filterOptions]);

  const matchesDate = useCallback(
    (dateIso: string | null | undefined) => {
      const d = decadeFromIso(dateIso);
      if (filterMode === "start" && startDecade !== "") {
        return d === startDecade;
      }
      if (filterMode === "end" && endDecade !== "") {
        return d === endDecade;
      }
      return true;
    },
    [filterMode, startDecade, endDecade]
  );

  const filtered = useMemo(() => {
    if (!filterReady) return [] as SeriesCatalogCard[];

    const q = search.trim().toLowerCase();

    if (catalogScope === "shows") {
      const cards: SeriesCatalogCard[] = [];
      for (const f of franchises) {
        const shows =
          f.subseries.length > 0
            ? f.subseries
            : ([
                {
                  id: f.id,
                  title: f.name,
                  date_iso: null,
                  display_date: null,
                  folder_path: f.folder_path,
                  cover_url: f.cover_url,
                  season_count: f.season_count,
                } satisfies SeriesSubseriesCard,
              ] as SeriesSubseriesCard[]);

        for (const s of shows) {
          if (q && !s.title.toLowerCase().includes(q) && !f.name.toLowerCase().includes(q)) {
            continue;
          }
          if (filterMode === "name" && letter) {
            const want = letter === HASH ? "#" : letter.toUpperCase();
            const L = (f.letter || s.title.slice(0, 1)).toUpperCase();
            if (want === "#") {
              if (/[A-Z]/.test(L)) continue;
            } else if (L !== want) {
              continue;
            }
          }
          if (
            (filterMode === "start" || filterMode === "end") &&
            !matchesDate(s.date_iso)
          ) {
            continue;
          }
          // Genre / geo / people filters need per-show metadata (not on disk yet)
          if (
            filterMode === "genre" ||
            filterMode === "continent" ||
            filterMode === "country" ||
            filterMode === "publisher" ||
            filterMode === "writer"
          ) {
            continue;
          }
          cards.push({
            key: `${f.id}::${s.id}`,
            franchiseId: f.id,
            subseriesId: f.subseries.length > 0 ? s.id : undefined,
            name: s.title,
            letter: f.letter,
            cover_url: s.cover_url || f.cover_url,
            date_iso: s.date_iso,
            meta: showMeta(s),
          });
        }
      }
      if (filterMode === "most_played") {
        cards.sort(
          (a, b) =>
            (b.date_iso || "").localeCompare(a.date_iso || "") ||
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
      } else {
        cards.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
      }
      return cards;
    }

    // Franchise scope
    let list = [...franchises];
    if (q) {
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    if (filterMode === "name" && letter) {
      const want = letter === HASH ? "#" : letter.toUpperCase();
      list = list.filter((f) => {
        const L = (f.letter || f.name.slice(0, 1)).toUpperCase();
        if (want === "#") return !/[A-Z]/.test(L);
        return L === want;
      });
    }
    if (filterMode === "start" && startDecade !== "") {
      list = list.filter((f) =>
        f.subseries.some((s) => decadeFromIso(s.date_iso) === startDecade)
      );
    }
    if (filterMode === "end" && endDecade !== "") {
      list = list.filter((f) =>
        f.subseries.some((s) => decadeFromIso(s.date_iso) === endDecade)
      );
    }
    if (
      filterMode === "genre" ||
      filterMode === "continent" ||
      filterMode === "country" ||
      filterMode === "publisher" ||
      filterMode === "writer"
    ) {
      // No franchise-level metadata on disk yet — require a selection but match none
      list = [];
    }
    if (filterMode === "most_played") {
      list.sort(
        (a, b) =>
          b.season_count - a.season_count ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    } else {
      list.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    }
    return list.map(
      (f): SeriesCatalogCard => ({
        key: f.id,
        franchiseId: f.id,
        name: f.name,
        letter: f.letter,
        cover_url: f.cover_url,
        date_iso: null,
        meta: franchiseMeta(f),
      })
    );
  }, [
    filterReady,
    catalogScope,
    franchises,
    search,
    letter,
    filterMode,
    startDecade,
    endDecade,
    matchesDate,
  ]);

  const handleCardClick = useCallback(
    (card: SeriesCatalogCard) => {
      const open = () =>
        onOpen(card.franchiseId, card.subseriesId, {
          name: card.name,
          cover_url: card.cover_url,
        });
      if (!isPhone) {
        open();
        return;
      }
      if (revealedId === card.key) {
        setRevealedId(null);
        open();
      } else {
        setRevealedId(card.key);
      }
    },
    [isPhone, revealedId, onOpen]
  );

  const subBar = useMemo(() => {
    if (!filterOptions && filterMode !== "name") return null;
    switch (filterMode) {
      case "name":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                className={letter === l ? "active" : ""}
                onClick={() => onLetterChange(letter === l ? "" : l)}
              >
                {l}
              </button>
            ))}
            <button
              type="button"
              className={letter === HASH ? "active" : ""}
              onClick={() => onLetterChange(letter === HASH ? "" : HASH)}
            >
              {HASH}
            </button>
            <input
              className="filter-subbar-search"
              placeholder="Search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        );
      case "continent":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {(filterOptions?.continents ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                className={continentId === c.id ? "active" : ""}
                onClick={() =>
                  onContinentIdChange(continentId === c.id ? "" : c.id)
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        );
      case "start":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {decades.map((d) => (
              <button
                key={d}
                type="button"
                className={startDecade === d ? "active" : ""}
                onClick={() => onStartDecadeChange(d)}
              >
                {decadeLabel(d)}
              </button>
            ))}
          </div>
        );
      case "end":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {decades.map((d) => (
              <button
                key={d}
                type="button"
                className={endDecade === d ? "active" : ""}
                onClick={() => onEndDecadeChange(d)}
              >
                {decadeLabel(d)}
              </button>
            ))}
          </div>
        );
      case "country":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={countryOptions}
              value={countryId === "" ? "" : String(countryId)}
              onChange={(v) => onCountryIdChange(v ? Number(v) : "")}
              placeholder="Country"
              visibleRows={7}
            />
          </div>
        );
      case "genre":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={genreOptions}
              value={subgenreId === "" ? "" : String(subgenreId)}
              onChange={(v) => onSubgenreIdChange(v ? Number(v) : "")}
              placeholder="Genre"
              visibleRows={7}
            />
          </div>
        );
      case "publisher":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={publisherOptions}
              value={publisher}
              onChange={(v) => onPublisherChange(v)}
              placeholder="Publisher"
              visibleRows={7}
            />
          </div>
        );
      case "writer":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={writerOptions}
              value={writer}
              onChange={(v) => onWriterChange(v)}
              placeholder="Writer"
              visibleRows={7}
            />
          </div>
        );
      default:
        return null;
    }
  }, [
    filterMode,
    filterOptions,
    letter,
    search,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    publisher,
    writer,
    decades,
    countryOptions,
    genreOptions,
    publisherOptions,
    writerOptions,
    onLetterChange,
    onSearchChange,
    onContinentIdChange,
    onCountryIdChange,
    onStartDecadeChange,
    onEndDecadeChange,
    onSubgenreIdChange,
    onPublisherChange,
    onWriterChange,
  ]);

  return (
    <div className="series-browse artist-browse">
      <div className="artist-browse-sticky">
        <nav className="sub-nav sub-nav--spread sub-nav--compact">
          {FILTER_MODES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filterMode === f.id ? "active" : ""}
              onClick={() => onFilterModeChange(f.id)}
            >
              {f.label}
            </button>
          ))}
        </nav>
        {subBar}
      </div>

      <div className="artist-browse-scroll">
        {loading ? (
          <p className="muted artist-browse-status">Loading…</p>
        ) : null}
        {!loading && !filterReady ? (
          <div className="artist-browse-empty">
            <p className="muted">Choose a filter value to browse series.</p>
          </div>
        ) : null}
        {filterReady && filtered.length > 0 ? (
          <div className={`artist-grid artist-grid--${orientation}`}>
            {filtered.map((card) => {
              const cover = card.cover_url || DEFAULT_DISC_URL;
              const isIcons = orientation === "icons";
              const revealed = isPhone && revealedId === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  className={[
                    "artist-card",
                    "media-beat-frame",
                    "media-beat-frame--card",
                    `artist-card--${orientation}`,
                    isPhone ? "artist-card--tap-reveal" : "",
                    revealed ? "artist-card--revealed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleCardClick(card)}
                  title={card.name}
                >
                  <span
                    className="artist-card-bg card-bg-layer"
                    style={
                      isIcons
                        ? undefined
                        : { backgroundImage: `url("${cover}")` }
                    }
                  />
                  <span className="artist-card-dim" />
                  <span className="artist-card-footer">
                    <span className="artist-card-name">{card.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {filterReady && !loading && !filtered.length ? (
          <div className="artist-browse-empty">
            <p className="muted">No series match this filter.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
