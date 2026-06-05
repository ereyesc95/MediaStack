import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { searchRosterArtists } from "../../api";
import SearchableDropdown, { type DropdownOption } from "../SearchableDropdown";
import type {
  ArtistCard as ArtistCardType,
  ArtistFilterMode,
  CardOrientation,
  FilterOptions,
} from "../../types";
import ArtistCard from "../ArtistCard";
import { usePhoneLayout } from "../../usePhoneLayout";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HASH = "#";

const FILTER_MODES: { id: ArtistFilterMode; label: string }[] = [
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

const GROUP_SIZES = [
  ...Array.from({ length: 9 }, (_, i) => i + 1),
  10,
] as const;

function decadeLabel(d: number) {
  return `${d}s`;
}

type Props = {
  artists: ArtistCardType[];
  total: number;
  page: number;
  orientation: CardOrientation;
  search: string;
  letter: string;
  filterMode: ArtistFilterMode;
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
  onFilterModeChange: (m: ArtistFilterMode) => void;
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
  filterLabel?: string;
  onClearFilter?: () => void;
  loading?: boolean;
};

export default function ArtistBrowse({
  artists,
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
  filterLabel,
  onClearFilter,
  loading,
}: Props) {
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<number | null>(null);
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

  useEffect(() => {
    setRevealedId(null);
  }, [
    artists,
    orientation,
    search,
    letter,
    filterMode,
    page,
    isPhone,
  ]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".artist-card")) {
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

  const pageSize = 48;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = filterMode === "most_played" || filterMode === "gender";

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

  const subBar = useMemo(() => {
    if (!filterOptions) return null;
    switch (filterMode) {
      case "name":
        return (
          <div className="filter-subbar filter-subbar--spread">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                className={letter === l ? "active" : ""}
                onClick={() => onLetterChange(l)}
              >
                {l}
              </button>
            ))}
            <button
              type="button"
              className={letter === HASH ? "active" : ""}
              onClick={() => onLetterChange(HASH)}
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
    continentId,
    startDecade,
    endDecade,
    gender,
    countryId,
    subgenreId,
    memberArtistId,
    label,
    countryOptions,
    genreOptions,
    searchMembers,
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
    onLabelChange,
    onProducerChange,
  ]);

  const hasBackdrop = Boolean(backgroundUrl || backgroundIso);

  return (
    <div
      className={`artist-browse${hasBackdrop ? " artist-browse--bg" : ""}`}
    >
      <div className="artist-browse-sticky">
        <nav className="sub-nav sub-nav--spread sub-nav--compact">
          {FILTER_MODES.map((f) => (
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
        {loading && <p className="muted artist-browse-status">Loading…</p>}
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
            <p className="muted">No artists match this filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
