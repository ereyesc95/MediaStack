import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { searchRosterArtists, searchRosterBands } from "../../api";
import SearchableDropdown, { type DropdownOption } from "../SearchableDropdown";
import type {
  AlbumCard as AlbumCardType,
  AlbumFilterMode,
  ArtistCard as ArtistCardType,
  ArtistFilterMode,
  CardOrientation,
  FilterOptions,
  MusicCatalogScope,
  ReleaseCardLayout,
} from "../../types";
import ArtistCard from "../ArtistCard";
import CatalogAlbumCard from "./CatalogAlbumCard";
import PlaylistBoot from "../PlaylistBoot";
import { usePhoneLayout } from "../../usePhoneLayout";
import { AUDIO_CATEGORY_META } from "./artist/ArtistAudio";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HASH = "#";

const ARTIST_FILTER_MODES: { id: ArtistFilterMode; label: string }[] = [
  { id: "name", label: "ARTISTS" },
  { id: "group", label: "LINEUP" },
  { id: "members", label: "PEOPLE" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "START DATE" },
  { id: "end", label: "END DATE" },
  { id: "genre", label: "GENRE" },
  { id: "gender", label: "GENDER" },
  { id: "label", label: "LABEL" },
  { id: "producer", label: "PRODUCER" },
  { id: "most_played", label: "MOST PLAYED" },
];

const ALBUM_FILTER_MODES: { id: AlbumFilterMode; label: string }[] = [
  { id: "name", label: "ALBUMS" },
  { id: "artists", label: "ARTISTS" },
  { id: "continent", label: "CONTINENT" },
  { id: "country", label: "COUNTRY" },
  { id: "start", label: "RELEASE DATE" },
  { id: "genre", label: "GENRE" },
  { id: "label", label: "LABEL" },
  { id: "producer", label: "PRODUCER" },
  { id: "most_played", label: "MOST PLAYED" },
];

const GROUP_SIZES = [
  ...Array.from({ length: 9 }, (_, i) => i + 1),
  10,
] as const;

function decadeLabel(d: number) {
  return `${d}s`;
}

type Props = {
  catalogScope?: MusicCatalogScope;
  artists: ArtistCardType[];
  albums?: AlbumCardType[];
  albumCardLayout?: ReleaseCardLayout;
  albumLetters?: string[];
  albumCategories?: string[];
  albumCategory?: string;
  albumArtistId?: number | "";
  total: number;
  page: number;
  orientation: CardOrientation;
  search: string;
  letter: string;
  filterMode: ArtistFilterMode | AlbumFilterMode;
  filterOptions: FilterOptions | null;
  memberCount: number | "";
  memberArtistId: number | "";
  continentId: number | "";
  countryId: number | "";
  startDecade: number | "";
  endDecade: number | "";
  subgenreId: number | "";
  gender: string;
  label: string;
  producer: string;
  backgroundUrl: string | null;
  backgroundIso?: string | null;
  onSearchChange: (v: string) => void;
  onLetterChange: (v: string) => void;
  onFilterModeChange: (m: ArtistFilterMode | AlbumFilterMode) => void;
  onMemberCountChange: (v: number | "") => void;
  onMemberArtistIdChange: (v: number | "") => void;
  onContinentIdChange: (v: number | "") => void;
  onCountryIdChange: (v: number | "") => void;
  onStartDecadeChange: (v: number | "") => void;
  onEndDecadeChange: (v: number | "") => void;
  onSubgenreIdChange: (v: number | "") => void;
  onGenderChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onProducerChange: (v: string) => void;
  onPageChange: (p: number) => void;
  onArtist: (id: number) => void;
  onAlbum?: (album: AlbumCardType) => void;
  onAlbumCategoryChange?: (key: string) => void;
  onAlbumArtistIdChange?: (v: number | "") => void;
  filterLabel?: string;
  onClearFilter?: () => void;
  loading?: boolean;
};

export default function ArtistBrowse({
  catalogScope = "artists",
  artists,
  albums = [],
  albumCardLayout = "cover",
  albumLetters,
  albumCategories = [],
  albumCategory = "",
  albumArtistId = "",
  total,
  page,
  orientation,
  search,
  letter,
  filterMode,
  filterOptions,
  memberCount,
  memberArtistId,
  continentId,
  countryId,
  startDecade,
  endDecade,
  subgenreId,
  gender,
  label,
  producer,
  backgroundUrl,
  backgroundIso,
  onSearchChange,
  onLetterChange,
  onFilterModeChange,
  onMemberCountChange,
  onMemberArtistIdChange,
  onContinentIdChange,
  onCountryIdChange,
  onStartDecadeChange,
  onEndDecadeChange,
  onSubgenreIdChange,
  onGenderChange,
  onLabelChange,
  onProducerChange,
  onPageChange,
  onArtist,
  onAlbum,
  onAlbumCategoryChange,
  onAlbumArtistIdChange,
  filterLabel,
  onClearFilter,
  loading,
}: Props) {
  const isAlbums = catalogScope === "albums";
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<number | string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupPopoverStyle, setGroupPopoverStyle] = useState<CSSProperties>({});
  const [pageInput, setPageInput] = useState(String(page));
  const groupRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);

  const handleArtistCardClick = useCallback(
    (artistId: number) => {
      if (!isPhone) {
        onArtist(artistId);
        return;
      }
      if (revealedId === artistId) {
        setRevealedId(null);
        onArtist(artistId);
      } else {
        setRevealedId(artistId);
      }
    },
    [isPhone, revealedId, onArtist]
  );

  const handleAlbumCardClick = useCallback(
    (album: AlbumCardType) => {
      if (!onAlbum) return;
      if (!isPhone) {
        onAlbum(album);
        return;
      }
      if (revealedId === album.id) {
        setRevealedId(null);
        onAlbum(album);
      } else {
        setRevealedId(album.id);
      }
    },
    [isPhone, revealedId, onAlbum]
  );

  useEffect(() => {
    setRevealedId(null);
  }, [
    artists,
    albums,
    orientation,
    albumCardLayout,
    search,
    letter,
    filterMode,
    page,
    catalogScope,
    isPhone,
  ]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as Element;
      if (
        !target.closest(".artist-card") &&
        !target.closest(".media-release-card")
      ) {
        setRevealedId(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [isPhone, revealedId]);

  const updateGroupPopover = useCallback(() => {
    const btn = chevronRef.current;
    if (!btn) return;
    if (!window.matchMedia("(max-width: 900px)").matches) {
      setGroupPopoverStyle({});
      return;
    }
    const r = btn.getBoundingClientRect();
    setGroupPopoverStyle({
      position: "fixed",
      top: r.bottom + 4,
      left: r.left,
      right: "auto",
      width: Math.max(r.width, 52),
      zIndex: 500,
    });
  }, []);

  useLayoutEffect(() => {
    if (!groupOpen) return;
    updateGroupPopover();
    window.addEventListener("resize", updateGroupPopover);
    window.addEventListener("scroll", updateGroupPopover, true);
    return () => {
      window.removeEventListener("resize", updateGroupPopover);
      window.removeEventListener("scroll", updateGroupPopover, true);
    };
  }, [groupOpen, updateGroupPopover]);

  useEffect(() => {
    if (filterMode !== "group") {
      setGroupOpen(false);
    }
  }, [filterMode]);

  const pageSize = isAlbums ? 24 : 48;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated =
    isAlbums || filterMode === "most_played" || filterMode === "gender";

  const availableLetters = useMemo(() => {
    if (isAlbums && albumLetters?.length) return albumLetters;
    const fromApi = filterOptions?.letters;
    if (fromApi?.length) return fromApi;
    return [...LETTERS, HASH];
  }, [filterOptions, isAlbums, albumLetters]);

  const filterModeList = isAlbums ? ALBUM_FILTER_MODES : ARTIST_FILTER_MODES;

  const visibleFilterModes = useMemo(() => {
    return filterModeList.filter((f) => {
      if (f.id === filterMode) return true;
      if (!filterOptions) {
        if (isAlbums) {
          return f.id === "name" || f.id === "artists" || f.id === "most_played";
        }
        return true;
      }
      switch (f.id) {
        case "continent":
          return (filterOptions.continents?.length ?? 0) > 0;
        case "country":
          return (filterOptions.country_groups?.length ?? 0) > 0;
        case "start":
        case "end":
          return (filterOptions.decades?.length ?? 0) > 0;
        case "genre":
          return (filterOptions.subgenre_groups?.length ?? 0) > 0;
        case "label":
          return (filterOptions.labels?.length ?? 0) > 0;
        case "producer":
          return (filterOptions.producers?.length ?? 0) > 0;
        default:
          return true;
      }
    });
  }, [filterOptions, filterModeList, isAlbums, filterMode]);

  useEffect(() => {
    if (!filterOptions) return;
    if (!visibleFilterModes.some((m) => m.id === filterMode)) {
      const fallback = visibleFilterModes[0]?.id;
      if (fallback) onFilterModeChange(fallback);
    }
  }, [visibleFilterModes, filterMode, onFilterModeChange, filterOptions]);

  useEffect(() => {
    if (filterMode !== "name") return;
    if (
      !letter ||
      (availableLetters.length && !availableLetters.includes(letter))
    ) {
      const first = availableLetters[0];
      if (first) onLetterChange(first);
    }
  }, [filterMode, letter, availableLetters, onLetterChange]);

  const commitPageInput = () => {
    const n = parseInt(pageInput.trim(), 10);
    if (!Number.isFinite(n)) {
      setPageInput(String(page));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, n));
    setPageInput(String(clamped));
    if (clamped !== page) onPageChange(clamped);
  };

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

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

  const searchMembers = useCallback(async (q: string) => {
    const data = await searchRosterArtists(q);
    return data.items.map((a) => ({
      value: String(a.id),
      label: a.name,
    }));
  }, []);

  const searchBands = useCallback(async (q: string) => {
    const data = await searchRosterBands(q);
    return data.items.map((a) => ({
      value: String(a.id),
      label: a.name,
    }));
  }, []);

  const producerOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.producers.map((p) => ({
      value: p.id,
      label: p.name,
    }));
  }, [filterOptions]);

  const labelOptions: DropdownOption[] = useMemo(() => {
    if (!filterOptions) return [];
    return filterOptions.labels.map((l) => ({ value: l, label: l }));
  }, [filterOptions]);

  const visibleAlbumCategories = useMemo(() => {
    if (!albumCategories.length) return [];
    return AUDIO_CATEGORY_META.filter((c) => albumCategories.includes(c.key));
  }, [albumCategories]);

  const subBar = useMemo(() => {
    if (!filterOptions && filterMode !== "artists" && filterMode !== "name") {
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
      case "artists":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={[]}
              value={albumArtistId === "" ? "" : String(albumArtistId)}
              onChange={(v) => onAlbumArtistIdChange?.(v ? Number(v) : "")}
              placeholder="Search artist…"
              visibleRows={7}
              minQueryLength={1}
              onSearch={searchBands}
            />
          </div>
        );
      case "continent":
        if (!filterOptions) return null;
        return (
          <div className="filter-subbar filter-subbar--spread">
            {filterOptions.continents.map((c) => (
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
        if (!filterOptions) return null;
        return (
          <div className="filter-subbar filter-subbar--spread">
            {filterOptions.decades.map((d) => (
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
        if (!filterOptions) return null;
        return (
          <div className="filter-subbar filter-subbar--spread">
            {filterOptions.decades.map((d) => (
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
      case "gender":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {[
              { v: "male", l: "MALE" },
              { v: "female", l: "FEMALE" },
              { v: "other", l: "OTHER" },
            ].map((g) => (
              <button
                key={g.v}
                type="button"
                className={gender === g.v ? "active" : ""}
                onClick={() => onGenderChange(g.v)}
              >
                {g.l}
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
      case "members":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={[]}
              value={memberArtistId === "" ? "" : String(memberArtistId)}
              onChange={(v) => onMemberArtistIdChange(v ? Number(v) : "")}
              placeholder="Search artist…"
              visibleRows={7}
              minQueryLength={2}
              onSearch={searchMembers}
            />
          </div>
        );
      case "label":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={labelOptions}
              value={label}
              onChange={onLabelChange}
              placeholder="Label"
              visibleRows={7}
            />
          </div>
        );
      case "producer":
        return (
          <div className="filter-subbar filter-subbar--single">
            <SearchableDropdown
              options={producerOptions}
              value={producer}
              onChange={onProducerChange}
              placeholder="Producer"
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
    availableLetters,
    continentId,
    startDecade,
    endDecade,
    gender,
    countryId,
    subgenreId,
    memberArtistId,
    albumArtistId,
    label,
    producer,
    countryOptions,
    genreOptions,
    searchMembers,
    searchBands,
    labelOptions,
    producerOptions,
    onLetterChange,
    onSearchChange,
    onContinentIdChange,
    onStartDecadeChange,
    onEndDecadeChange,
    onGenderChange,
    onCountryIdChange,
    onSubgenreIdChange,
    onMemberArtistIdChange,
    onAlbumArtistIdChange,
    onLabelChange,
    onProducerChange,
  ]);

  const hasBackdrop = Boolean(backgroundUrl || backgroundIso);
  const showAlbumCategoryBar =
    isAlbums &&
    filterMode === "artists" &&
    albumArtistId !== "" &&
    visibleAlbumCategories.length > 1;

  return (
    <div
      className={`artist-browse${hasBackdrop ? " artist-browse--bg" : ""}`}
    >
      <div className="artist-browse-sticky">
        <nav className="sub-nav sub-nav--spread sub-nav--compact">
          {visibleFilterModes.map((f) => (
            <div key={f.id} className="sub-nav-item-wrap">
              {f.id === "group" ? (
                <div className="sub-nav-group" ref={groupRef}>
                  <button
                    type="button"
                    className={
                      filterMode === f.id && !filterLabel ? "active" : ""
                    }
                    onClick={() => {
                      setGroupOpen(false);
                      onFilterModeChange(f.id);
                    }}
                  >
                    {f.label}
                    {memberCount !== "" && (
                      <span className="filter-badge">
                        {memberCount >= 10 ? "10+" : memberCount}
                      </span>
                    )}
                  </button>
                  <button
                    ref={chevronRef}
                    type="button"
                    className="filter-chevron-btn"
                    aria-label="Lineup size"
                    aria-expanded={groupOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupOpen((o) => {
                        const next = !o;
                        if (next) {
                          requestAnimationFrame(updateGroupPopover);
                        }
                        return next;
                      });
                      onFilterModeChange("group");
                    }}
                  >
                    ▾
                  </button>
                  {groupOpen && (
                    <ul
                      className={`filter-popover${
                        groupPopoverStyle.position === "fixed"
                          ? " filter-popover--fixed"
                          : ""
                      }`}
                      style={
                        Object.keys(groupPopoverStyle).length > 0
                          ? groupPopoverStyle
                          : undefined
                      }
                    >
                      {GROUP_SIZES.map((n) => (
                        <li key={n}>
                          <button
                            type="button"
                            onClick={() => {
                              onMemberCountChange(n);
                              setGroupOpen(false);
                            }}
                          >
                            {n >= 10 ? "10+" : n}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={
                    filterMode === f.id && !filterLabel ? "active" : ""
                  }
                  onClick={() => {
                    setGroupOpen(false);
                    onFilterModeChange(f.id);
                  }}
                >
                  {f.label}
                </button>
              )}
            </div>
          ))}
        </nav>
        {subBar}
        {showAlbumCategoryBar ? (
          <nav className="artist-page__subtabs artist-audio__type-bar">
            {visibleAlbumCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                className={albumCategory === c.key ? "active" : ""}
                onClick={() => onAlbumCategoryChange?.(c.key)}
              >
                <span>{isPhone ? c.mobile : c.desktop}</span>
              </button>
            ))}
          </nav>
        ) : null}
        {paginated && totalPages > 1 && (
          <div className="filter-subbar filter-subbar--pagination">
            <button
              type="button"
              className="pagination-arrow"
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => onPageChange(page - 1)}
            >
              ‹ Prev
            </button>
            <div className="pagination-info">
              <input
                type="text"
                inputMode="numeric"
                className="pagination-page-input"
                aria-label="Page number"
                value={pageInput}
                onChange={(e) =>
                  setPageInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPageInput();
                  }
                }}
              />
              <span className="pagination-of">/ {totalPages}</span>
              <span className="pagination-count"> · {total}</span>
            </div>
            <button
              type="button"
              className="pagination-arrow"
              disabled={page >= totalPages}
              aria-label="Next page"
              onClick={() => onPageChange(page + 1)}
            >
              Next ›
            </button>
          </div>
        )}
        {filterLabel && (
          <div className="filter-banner">
            Filter: {filterLabel}
            {onClearFilter && (
              <button type="button" onClick={onClearFilter}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="artist-browse-scroll">
        {loading && !isAlbums && (
          <PlaylistBoot className="playlist-boot--compact" label="Loading…" />
        )}
        {isAlbums ? (
          <>
            {albums.length > 0 && (
              <div
                className={`media-release-grid${
                  albumCardLayout === "banner"
                    ? " media-release-grid--banner"
                    : ""
                }`}
              >
                {albums.map((a) => (
                  <CatalogAlbumCard
                    key={`${a.navigate_band_id}-${a.id}`}
                    album={a}
                    cardLayout={albumCardLayout}
                    tapReveal={isPhone}
                    revealed={isPhone && revealedId === a.id}
                    onReveal={() => setRevealedId(a.id)}
                    onOpen={handleAlbumCardClick}
                  />
                ))}
              </div>
            )}
            {!albums.length && !loading && (
              <div className="artist-browse-empty">
                <p className="muted">
                  {filterMode === "artists" && albumArtistId === ""
                    ? "Pick an artist"
                    : "No media found"}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {artists.length > 0 && (
              <div className={`artist-grid artist-grid--${orientation}`}>
                {artists.map((a) => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    orientation={orientation}
                    tapReveal={isPhone}
                    revealed={isPhone && revealedId === a.id}
                    onClick={() => handleArtistCardClick(a.id)}
                  />
                ))}
              </div>
            )}
            {!artists.length && !loading && (
              <div className="artist-browse-empty">
                <p className="muted">No media found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
