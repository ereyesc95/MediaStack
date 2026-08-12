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
  Universe,
} from "../../types";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";
import { DEFAULT_DISC_URL } from "../music/release/releaseTrackPanelMeta";
import PlaylistBoot from "../PlaylistBoot";
import { usePhoneLayout } from "../../usePhoneLayout";
import { getStoredProfile } from "../../auth";
import { filterAdultCards } from "../../adultContent";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HASH = "#";

const FILTER_MODES: { id: SeriesFilterMode; label: string }[] = [
  { id: "name", label: "NAME" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "START DATE" },
  { id: "end", label: "END DATE" },
  { id: "genre", label: "GENRE" },
  { id: "publisher", label: "PUBLISHER" },
  { id: "writer", label: "WRITER" },
  { id: "most_played", label: "MOST PLAYED" },
];

export type SeriesCatalogScope = "franchises" | "shows" | "universes";

export type SeriesCatalogCard = {
  key: string;
  franchiseId: string;
  subseriesId?: string;
  /** When set, card opens a universe landing instead of a franchise. */
  universeId?: number;
  name: string;
  letter: string;
  cover_url: string | null;
  portrait_url?: string | null;
  landscape_url?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  icon_url?: string | null;
  badge_url?: string | null;
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

function franchiseMeta(
  f: SeriesFranchiseCard,
  unitNoun: "season" | "film" | "book" = "season"
): string {
  const unit = `${f.season_count} ${unitNoun}${f.season_count === 1 ? "" : "s"}`;
  if (unitNoun === "film" || unitNoun === "book") return unit;
  return f.subseries_count > 0
    ? `${f.subseries_count} subseries · ${unit}`
    : unit;
}

type Props = {
  franchises: SeriesFranchiseCard[];
  universes?: Universe[];
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
  /** Movies catalog uses film counts; Books uses book counts (mapped onto season_count). */
  unitNoun?: "season" | "film" | "book";
  /** Override filter tabs (e.g. Films scope hides END DATE, renames START). */
  filterModes?: { id: SeriesFilterMode; label: string }[];
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
    shell?: {
      name: string;
      cover_url: string | null;
      logo_url?: string | null;
      icon_url?: string | null;
    }
  ) => void;
  onOpenUniverse?: (universeId: number) => void;
};

export default function SeriesBrowse({
  franchises,
  universes = [],
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
  unitNoun = "season",
  filterModes = FILTER_MODES,
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
  onOpenUniverse,
}: Props) {
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [franchises, orientation, search, letter, filterMode, catalogScope, isPhone]);

  const catalogMetaPool = useMemo(() => {
    /** Unfiltered catalog cards used to derive which filter chips have media. */
    const continentIds = new Set<number>();
    const decadeSet = new Set<number>();

    const addFranchiseMeta = (f: SeriesFranchiseCard) => {
      if (f.continent_id != null) continentIds.add(f.continent_id);
      for (const s of f.subseries || []) {
        const d = decadeFromIso(s.date_iso);
        if (d != null) decadeSet.add(d);
      }
    };

    if (catalogScope === "universes") {
      const bySlug = new Map(
        franchises.map((f) => [f.id.toLowerCase(), f])
      );
      // MoviesModule maps films into franchise-shaped cards for "shows"; also
      // keep work-level franchises for group/universe member slug lookup.
      for (const u of universes) {
        for (const m of u.members || []) {
          const slug = (m.slug || "").toLowerCase();
          const leaf = (m.leaf_id || "").toLowerCase();
          const hit =
            bySlug.get(slug) ||
            (leaf ? bySlug.get(leaf) : undefined) ||
            franchises.find(
              (f) =>
                f.id.toLowerCase() === slug ||
                f.subseries?.some((s) => s.id.toLowerCase() === leaf)
            );
          if (hit) addFranchiseMeta(hit);
        }
        // Legacy work_slugs on movie universes
        for (const slug of u.work_slugs || []) {
          const hit = bySlug.get(slug.toLowerCase());
          if (hit) addFranchiseMeta(hit);
        }
      }
      return { continentIds, decades: decadeSet };
    }

    for (const f of franchises) addFranchiseMeta(f);
    return { continentIds, decades: decadeSet };
  }, [catalogScope, franchises, universes]);

  const availableContinents = useMemo(() => {
    const opts = filterOptions?.continents ?? [];
    if (!catalogMetaPool.continentIds.size) return [];
    return opts.filter((c) => catalogMetaPool.continentIds.has(c.id));
  }, [filterOptions, catalogMetaPool]);

  const availableDecades = useMemo(() => {
    if (!catalogMetaPool.decades.size) return [];
    // Prefer decades that actually appear on disk; ignore padded API lists.
    return [...catalogMetaPool.decades].sort((a, b) => a - b);
  }, [catalogMetaPool]);

  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    const add = (raw: string) => {
      const L = (raw || "").trim().charAt(0).toUpperCase();
      if (/[A-Z]/.test(L)) set.add(L);
      else if (raw.trim()) set.add(HASH);
    };
    if (catalogScope === "universes") {
      for (const u of universes) add(u.name || "");
    } else if (catalogScope === "shows") {
      for (const f of franchises) {
        for (const s of f.subseries || []) add(s.title || "");
      }
    } else {
      for (const f of franchises) {
        add(f.letter || f.name || "");
      }
    }
    const letters = LETTERS.filter((l) => set.has(l));
    if (set.has(HASH)) letters.push(HASH);
    return letters;
  }, [catalogScope, franchises, universes]);

  const visibleFilterModes = useMemo(() => {
    // While options are still loading, keep the active mode visible so pending
    // writer/publisher/genre jumps are not wiped by the fallback effect.
    if (!filterOptions) {
      return filterModes;
    }
    return filterModes.filter((f) => {
      switch (f.id) {
        case "continent":
          return availableContinents.length > 0;
        case "country":
          return (filterOptions.country_groups?.length ?? 0) > 0;
        case "start":
        case "end":
          return availableDecades.length > 0;
        case "genre":
          return (filterOptions.subgenre_groups?.length ?? 0) > 0;
        case "publisher":
          return (
            (filterOptions.publishers?.length ?? 0) > 0 || Boolean(publisher.trim())
          );
        case "writer":
          return (
            (filterOptions.writers?.length ?? 0) > 0 || Boolean(writer.trim())
          );
        default:
          return true;
      }
    });
  }, [
    filterModes,
    filterOptions,
    availableContinents,
    availableDecades,
    publisher,
    writer,
  ]);

  useEffect(() => {
    // Never auto-fallback while filter options are loading — that clears
    // writer/publisher values set by in-app browse jumps.
    if (!filterOptions) return;
    if (!visibleFilterModes.some((m) => m.id === filterMode)) {
      const fallback = visibleFilterModes[0]?.id;
      if (fallback) onFilterModeChange(fallback);
    }
  }, [visibleFilterModes, filterMode, onFilterModeChange, filterOptions]);

  // Auto-select first subbar option when entering a filter tab (Music catalog parity)
  useEffect(() => {
    if (filterMode === "name") {
      if (!letter || (availableLetters.length && !availableLetters.includes(letter))) {
        const first = availableLetters[0];
        if (first) onLetterChange(first);
      }
      return;
    }
    if (!filterOptions) return;
    if (filterMode === "continent" && continentId === "") {
      const first = availableContinents[0];
      if (first) onContinentIdChange(first.id);
      return;
    }
    if (
      filterMode === "continent" &&
      continentId !== "" &&
      availableContinents.length &&
      !availableContinents.some((c) => c.id === continentId)
    ) {
      const first = availableContinents[0];
      if (first) onContinentIdChange(first.id);
      return;
    }
    if (filterMode === "country" && countryId === "") {
      const first = filterOptions.country_groups.flatMap((g) => g.items)[0];
      if (first) onCountryIdChange(first.id);
      return;
    }
    if (filterMode === "start") {
      if (startDecade === "" && availableDecades.length) {
        onStartDecadeChange(availableDecades[0]!);
        return;
      }
      if (
        startDecade !== "" &&
        availableDecades.length &&
        !availableDecades.includes(startDecade)
      ) {
        onStartDecadeChange(availableDecades[0]!);
        return;
      }
    }
    if (filterMode === "end") {
      if (endDecade === "" && availableDecades.length) {
        onEndDecadeChange(availableDecades[0]!);
        return;
      }
      if (
        endDecade !== "" &&
        availableDecades.length &&
        !availableDecades.includes(endDecade)
      ) {
        onEndDecadeChange(availableDecades[0]!);
        return;
      }
    }
    if (filterMode === "genre" && subgenreId === "") {
      const first = filterOptions.subgenre_groups.flatMap((g) => g.items)[0];
      if (first) onSubgenreIdChange(first.id);
      return;
    }
    if (filterMode === "publisher" && !publisher.trim()) {
      const first = filterOptions.publishers[0];
      if (first) onPublisherChange(first);
      return;
    }
    if (filterMode === "writer" && !writer.trim()) {
      const first = filterOptions.writers[0];
      if (first) onWriterChange(first);
    }
  }, [
    filterMode,
    filterOptions,
    letter,
    availableLetters,
    availableContinents,
    availableDecades,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    publisher,
    writer,
    onLetterChange,
    onContinentIdChange,
    onCountryIdChange,
    onStartDecadeChange,
    onEndDecadeChange,
    onSubgenreIdChange,
    onPublisherChange,
    onWriterChange,
  ]);

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

  const selectedGenreOption = useMemo(() => {
    if (subgenreId === "") return null;
    return genreOptions.find((o) => o.value === String(subgenreId)) ?? null;
  }, [genreOptions, subgenreId]);

  const selectedCountryOption = useMemo(() => {
    if (countryId === "") return null;
    return countryOptions.find((o) => o.value === String(countryId)) ?? null;
  }, [countryOptions, countryId]);

  const matchesFranchiseMeta = useCallback(
    (f: SeriesFranchiseCard) => {
      if (filterMode === "country" && countryId !== "") {
        if (f.country_id != null && f.country_id === countryId) return true;
        const iso = selectedCountryOption?.iso?.toLowerCase();
        if (iso && (f.country_iso || "").toLowerCase() === iso) return true;
        return false;
      }
      if (filterMode === "continent" && continentId !== "") {
        return f.continent_id === continentId;
      }
      if (filterMode === "genre" && subgenreId !== "") {
        const wantId = String(subgenreId);
        const ids = (f.genre_ids || []).map(String);
        if (ids.includes(wantId)) return true;
        const wantName = (selectedGenreOption?.label || "").toLowerCase();
        if (
          wantName &&
          (f.genre_names || []).some((n) => n.toLowerCase() === wantName)
        ) {
          return true;
        }
        // Parent group match: e.g. franchise "Action & Adventure" under Action
        const group = (selectedGenreOption?.group || "").toLowerCase();
        if (
          group &&
          (f.genre_names || []).some((n) => {
            const lower = n.toLowerCase();
            return lower === group || lower.includes(group) || group.includes(lower);
          })
        ) {
          return true;
        }
        return false;
      }
      if (filterMode === "publisher" && publisher) {
        return (f.publishers || []).some(
          (p) => p.toLowerCase() === publisher.toLowerCase()
        );
      }
      if (filterMode === "writer" && writer) {
        return (f.writers || []).some(
          (w) => w.toLowerCase() === writer.toLowerCase()
        );
      }
      return true;
    },
    [
      filterMode,
      countryId,
      continentId,
      subgenreId,
      publisher,
      writer,
      selectedCountryOption,
      selectedGenreOption,
    ]
  );

  const filtered = useMemo(() => {
    if (!filterReady) return [] as SeriesCatalogCard[];

    const nsfwUnlocked = Boolean(getStoredProfile()?.nsfw_unlocked);
    const q = search.trim().toLowerCase();

    if (catalogScope === "universes") {
      let list = [...universes];
      if (q) {
        list = list.filter((u) => u.name.toLowerCase().includes(q));
      }
      if (filterMode === "name" && letter) {
        const want = letter === HASH ? "#" : letter.toUpperCase();
        list = list.filter((u) => {
          const L = (u.name.slice(0, 1) || "").toUpperCase();
          if (want === "#") return !/[A-Z]/.test(L);
          return L === want;
        });
      }
      if (filterMode === "continent" && continentId !== "") {
        const bySlug = new Map(
          franchises.map((f) => [f.id.toLowerCase(), f])
        );
        list = list.filter((u) => {
          const slugs = [
            ...(u.members || []).map((m) => m.slug),
            ...(u.work_slugs || []),
          ];
          return slugs.some((slug) => {
            const f = bySlug.get((slug || "").toLowerCase());
            return f?.continent_id === continentId;
          });
        });
      }
      if (filterMode === "country" && countryId !== "") {
        const bySlug = new Map(
          franchises.map((f) => [f.id.toLowerCase(), f])
        );
        list = list.filter((u) => {
          const slugs = [
            ...(u.members || []).map((m) => m.slug),
            ...(u.work_slugs || []),
          ];
          return slugs.some((slug) => {
            const f = bySlug.get((slug || "").toLowerCase());
            if (!f) return false;
            if (f.country_id != null && f.country_id === countryId) return true;
            const iso = selectedCountryOption?.iso?.toLowerCase();
            return Boolean(iso && (f.country_iso || "").toLowerCase() === iso);
          });
        });
      }
      if (
        (filterMode === "start" || filterMode === "end") &&
        (filterMode === "start" ? startDecade : endDecade) !== ""
      ) {
        const bySlug = new Map(
          franchises.map((f) => [f.id.toLowerCase(), f])
        );
        list = list.filter((u) => {
          const slugs = [
            ...(u.members || []).map((m) => m.slug),
            ...(u.work_slugs || []),
          ];
          return slugs.some((slug) => {
            const f = bySlug.get((slug || "").toLowerCase());
            return (f?.subseries || []).some((s) => matchesDate(s.date_iso));
          });
        });
      }
      list.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      return list.map(
        (u): SeriesCatalogCard => ({
          key: `universe:${u.id}`,
          franchiseId: "",
          universeId: u.id,
          name: u.name,
          letter: (u.name.slice(0, 1) || "#").toUpperCase(),
          cover_url: u.cover_url || u.portrait_url || null,
          portrait_url: u.portrait_url || u.cover_url || null,
          landscape_url: u.landscape_url || u.cover_url || null,
          banner_url: u.banner_url || u.landscape_url || u.cover_url || null,
          logo_url: u.logo_url || null,
          date_iso: null,
          meta: `${u.member_count ?? u.members?.length ?? 0} members`,
        })
      );
    }

    if (catalogScope === "shows") {
      const cards: SeriesCatalogCard[] = [];
      for (const f of filterAdultCards(franchises, nsfwUnlocked)) {
        if (!matchesFranchiseMeta(f)) continue;
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
            // Films/shows A–Z must use the leaf title, not the parent work letter
            // (e.g. Poison Arrow under HIM → P, not H).
            const raw = (s.title || "").trim().charAt(0).toUpperCase();
            const L = /[A-Z]/.test(raw) ? raw : "#";
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
          cards.push({
            key: `${f.id}::${s.id}`,
            franchiseId: f.id,
            subseriesId: f.subseries.length > 0 ? s.id : undefined,
            name: s.title,
            letter: (() => {
              const raw = (s.title || "").trim().charAt(0).toUpperCase();
              return /[A-Z]/.test(raw) ? raw : "#";
            })(),
            cover_url: s.cover_url || f.cover_url,
            portrait_url: s.portrait_url || f.portrait_url || s.cover_url || f.cover_url,
            landscape_url:
              s.landscape_url || f.landscape_url || s.cover_url || f.cover_url,
            banner_url:
              s.banner_url ||
              f.banner_url ||
              s.landscape_url ||
              f.landscape_url ||
              s.cover_url ||
              f.cover_url,
            logo_url: s.logo_url || f.logo_url,
            icon_url: s.icon_url || f.icon_url,
            badge_url: s.badge_url || f.badge_url,
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
    let list = [...filterAdultCards(franchises, nsfwUnlocked)];
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
    list = list.filter((f) => matchesFranchiseMeta(f));
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
        portrait_url: f.portrait_url || f.cover_url,
        landscape_url: f.landscape_url || f.cover_url,
        banner_url: f.banner_url || f.landscape_url || f.cover_url,
        logo_url: f.logo_url,
        icon_url: f.icon_url,
        badge_url: f.badge_url,
        date_iso: null,
        meta: franchiseMeta(f, unitNoun),
      })
    );
  }, [
    filterReady,
    catalogScope,
    franchises,
    universes,
    search,
    letter,
    filterMode,
    startDecade,
    endDecade,
    continentId,
    countryId,
    selectedCountryOption,
    matchesDate,
    matchesFranchiseMeta,
    unitNoun,
  ]);

  const handleCardClick = useCallback(
    (card: SeriesCatalogCard) => {
      const open = () => {
        if (card.universeId != null) {
          onOpenUniverse?.(card.universeId);
          return;
        }
        onOpen(card.franchiseId, card.subseriesId, {
          name: card.name,
          cover_url: card.cover_url,
          logo_url: card.logo_url,
          icon_url: card.icon_url,
        });
      };
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
    [isPhone, revealedId, onOpen, onOpenUniverse]
  );

  const subBar = useMemo(() => {
    if (!filterOptions && filterMode !== "name" && filterMode !== "writer" && filterMode !== "publisher" && filterMode !== "genre") {
      return null;
    }
    switch (filterMode) {
      case "name":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {availableLetters.map((l) => (
              <button
                key={l}
                type="button"
                className={letter === l ? "active" : ""}
                onClick={() => onLetterChange(l)}
              >
                {l}
              </button>
            ))}
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
            {availableContinents.map((c) => (
              <button
                key={c.id}
                type="button"
                className={continentId === c.id ? "active" : ""}
                onClick={() => onContinentIdChange(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        );
      case "start":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {availableDecades.map((d) => (
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
            {availableDecades.map((d) => (
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
      case "writer": {
        const writerLabel =
          filterModes.find((m) => m.id === "writer")?.label || "WRITER";
        const writerPlaceholder =
          writerLabel.charAt(0) + writerLabel.slice(1).toLowerCase();
        const writerOpts =
          writer &&
          !(filterOptions?.writers || []).some(
            (w) => w.toLowerCase() === writer.toLowerCase()
          )
            ? [
                { value: writer, label: writer },
                ...(filterOptions?.writers || []).map((w) => ({
                  value: w,
                  label: w,
                })),
              ]
            : writerOptions;
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={writerOpts}
              value={writer}
              onChange={(v) => onWriterChange(v)}
              placeholder={writerPlaceholder}
              visibleRows={7}
            />
          </div>
        );
      }
      default:
        return null;
    }
  }, [
    filterMode,
    filterOptions,
    letter,
    search,
    availableLetters,
    availableContinents,
    availableDecades,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    publisher,
    writer,
    countryOptions,
    genreOptions,
    publisherOptions,
    writerOptions,
    filterModes,
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
          {visibleFilterModes.map((f) => (
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
        {loading && filtered.length === 0 ? (
          <PlaylistBoot className="playlist-boot--compact" label="Loading…" />
        ) : null}
        {!loading && !filterReady ? (
          <div className="artist-browse-empty">
            <p className="muted">Choose a filter value to browse.</p>
          </div>
        ) : null}
        {filterReady && filtered.length > 0 ? (
          <div
            className={`artist-grid artist-grid--${
              orientation === "badge" ? "icons" : orientation
            }`}
          >
            {filtered.map((card) => {
              const cover =
                (orientation === "portrait"
                  ? card.portrait_url || card.landscape_url
                  : orientation === "landscape"
                    ? card.landscape_url || card.portrait_url
                    : orientation === "banner"
                      ? card.banner_url || card.landscape_url || card.portrait_url
                      : card.cover_url) ||
                card.cover_url ||
                DEFAULT_DISC_URL;
              const isIcons = orientation === "icons";
              const isBadge = orientation === "badge";
              const isLogoMode = isIcons || isBadge;
              const brandSrc = isBadge
                ? card.badge_url || card.logo_url || card.icon_url
                : isIcons
                  ? card.logo_url || card.icon_url || card.badge_url
                  : null;
              const revealed = isPhone && revealedId === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  className={[
                    "artist-card",
                    "media-beat-frame",
                    "media-beat-frame--card",
                    `artist-card--${orientation === "badge" ? "icons" : orientation}`,
                    isBadge ? "artist-card--badge" : "",
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
                      isLogoMode
                        ? undefined
                        : { backgroundImage: `url("${cover}")` }
                    }
                  />
                  <span className="artist-card-dim" />
                  <span className="artist-card-footer">
                    {brandSrc ? (
                      <img
                        src={brandSrc}
                        alt=""
                        className={
                          isBadge || isIcons
                            ? "artist-card-icon"
                            : "artist-card-logo"
                        }
                      />
                    ) : (
                      <span className="artist-card-name">{card.name}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {filterReady && !loading && !filtered.length ? (
          <div className="artist-browse-empty">
            <p className="muted">No media found</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
