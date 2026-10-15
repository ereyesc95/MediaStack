import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  createCatalogImport,
  previewCatalogImport,
  removeCatalogRegistration,
  searchCatalogImport,
  searchCatalogRegistrations,
  updateCatalogFolders,
  type CatalogImportItem,
  type CatalogImportModule,
  type CatalogImportSearchItem,
  type CatalogRegistration,
} from "../api";
import useSlowLookupHint from "../useSlowLookupHint";
import ModalPortal from "./ModalPortal";

type Props = {
  module: CatalogImportModule;
  onClose: () => void;
  onChanged: () => void;
};

/** A title queued for scaffolding. `key` is local only; `provider_id` may be empty. */
type PickedItem = CatalogImportItem & { key: string };

const LABELS: Record<
  CatalogImportModule,
  {
    singular: string;
    plural: string;
    titlePlaceholder: string;
    provider: string;
    providerUrl: string;
  }
> = {
  movies: {
    singular: "movie",
    plural: "Movies",
    titlePlaceholder: "Movie title or ID",
    provider: "TMDb",
    providerUrl: "https://www.themoviedb.org/",
  },
  series: {
    singular: "series",
    plural: "Series",
    titlePlaceholder: "Series title or ID",
    provider: "TMDb",
    providerUrl: "https://www.themoviedb.org/",
  },
  books: {
    singular: "book",
    plural: "Books",
    titlePlaceholder: "Book title or ID",
    provider: "Google Books",
    providerUrl: "https://books.google.com/",
  },
  games: {
    singular: "game",
    plural: "Games",
    titlePlaceholder: "Game title or IGDB ID",
    provider: "IGDB",
    providerUrl: "https://www.igdb.com/",
  },
};

/** Mirrors backend GAME_PLATFORMS for the create form. */
const GAMES_PLATFORM_OPTIONS = [
  "Amiga",
  "Arcade",
  "Browser",
  "Commodore 64",
  "Flash",
  "Game Boy",
  "Game Boy Advance",
  "Game Boy Color",
  "Mac",
  "Nintendo 3DS",
  "Nintendo 64",
  "Nintendo DS",
  "Nintendo Entertainment System",
  "Nintendo Switch",
  "Nintendo Wii",
  "Nintendo Wii U",
  "PC",
  "PlayStation",
  "PlayStation 2",
  "PlayStation 3",
  "PlayStation 4",
  "PlayStation 5",
  "PlayStation Portable",
  "PlayStation Vita",
  "Sega 32X",
  "Sega CD",
  "Sega Dreamcast",
  "Sega Genesis",
  "Sega Master System",
  "Sega Saturn",
  "Super Nintendo",
  "Xbox",
  "Xbox 360",
  "Xbox One",
  "Xbox Series",
];

/** Map common IGDB / shorthand names onto canonical folder names. */
const PLATFORM_ALIASES: Record<string, string> = {
  nes: "Nintendo Entertainment System",
  famicom: "Nintendo Entertainment System",
  "family computer": "Nintendo Entertainment System",
  "nintendo entertainment system": "Nintendo Entertainment System",
  "nintendo entertainment system (nes)": "Nintendo Entertainment System",
  snes: "Super Nintendo",
  "super nintendo entertainment system": "Super Nintendo",
  "super famicom": "Super Nintendo",
  "mega drive": "Sega Genesis",
  genesis: "Sega Genesis",
  "master system": "Sega Master System",
  dreamcast: "Sega Dreamcast",
  saturn: "Sega Saturn",
  n64: "Nintendo 64",
  "nintendo 64": "Nintendo 64",
  gba: "Game Boy Advance",
  gbc: "Game Boy Color",
  gb: "Game Boy",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  wii: "Nintendo Wii",
  "wii u": "Nintendo Wii U",
  switch: "Nintendo Switch",
  ps1: "PlayStation",
  psx: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
  psp: "PlayStation Portable",
  "ps vita": "PlayStation Vita",
  vita: "PlayStation Vita",
  pc: "PC",
  macos: "Mac",
  "mac os": "Mac",
  "xbox series x": "Xbox Series",
  "xbox series s": "Xbox Series",
  "xbox series x|s": "Xbox Series",
};

const CUSTOM_PLATFORMS_KEY = "mystack.games.customPlatforms";

function loadCustomPlatforms(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PLATFORMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveCustomPlatforms(names: string[]) {
  try {
    localStorage.setItem(CUSTOM_PLATFORMS_KEY, JSON.stringify(names));
  } catch {
    /* ignore quota */
  }
}

function titleCasePlatform(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[0-9]/.test(word)) return word.toUpperCase();
      if (word.length <= 3 && /^[a-z0-9]+$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function canonicalizePlatform(
  raw: string,
  options: string[]
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const alias = PLATFORM_ALIASES[lower];
  if (alias) return alias;
  // Strip parenthetical suffixes: "Nintendo Entertainment System (NES)"
  const bare = lower.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (bare && bare !== lower) {
    const bareAlias = PLATFORM_ALIASES[bare];
    if (bareAlias) return bareAlias;
  }
  const exact = options.find((opt) => opt.toLowerCase() === lower);
  if (exact) return exact;
  if (bare) {
    const bareExact = options.find((opt) => opt.toLowerCase() === bare);
    if (bareExact) return bareExact;
  }
  // Containment match against known options (longest first)
  const sorted = [...options].sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    const ol = opt.toLowerCase();
    if (lower === ol || bare === ol) return opt;
    if (lower.includes(ol) || ol.includes(bare || lower)) return opt;
  }
  return titleCasePlatform(trimmed);
}

function SearchIconButton({
  searching,
  disabled,
  onClick,
}: {
  searching: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="manage-artists-modal__search-btn"
      aria-label={searching ? "Searching" : "Search"}
      onClick={onClick}
      disabled={disabled}
    >
      {searching ? (
        <span
          className="manage-artists-modal__spinner manage-artists-modal__spinner--sm"
          aria-hidden="true"
        />
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10.4 10.4 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`ms-checkbox${disabled ? " ms-checkbox--disabled" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ms-checkbox__box" aria-hidden="true" />
      <span className="ms-checkbox__label">{children}</span>
    </label>
  );
}

function itemIdentity(item: CatalogImportItem) {
  return item.provider_id || item.title.trim().toLowerCase();
}

export default function ManageCatalogModal({
  module,
  onClose,
  onChanged,
}: Props) {
  const labels = LABELS[module];
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogImportSearchItem[]>([]);
  const [localFranchises, setLocalFranchises] = useState<
    CatalogImportSearchItem[]
  >([]);
  const [notFound, setNotFound] = useState(false);
  const [existingFranchise, setExistingFranchise] =
    useState<CatalogImportSearchItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [firstPick, setFirstPick] = useState<CatalogImportSearchItem | null>(
    null
  );
  const [items, setItems] = useState<PickedItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [franchiseName, setFranchiseName] = useState("");
  const [scope, setScope] = useState<"single" | "collection" | "series">(
    "single"
  );
  const [franchiseHome, setFranchiseHome] = useState(false);
  const [includeGuide, setIncludeGuide] = useState(true);
  const [nestedSeries, setNestedSeries] = useState(false);
  /** Platforms shown as pills (game-derived + manually added empty ones). */
  const [activePlatforms, setActivePlatforms] = useState<string[]>([]);
  const [platformOptions, setPlatformOptions] = useState<string[]>(() => {
    if (module !== "games") return [];
    const custom = loadCustomPlatforms();
    const merged = [...GAMES_PLATFORM_OPTIONS];
    for (const name of custom) {
      if (!merged.some((p) => p.toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
    }
    return merged.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  });
  const [newPlatformOpen, setNewPlatformOpen] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");
  /** Franchise-level "Add platform…" menu. */
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  /** Per-title platform picker: item key currently open. */
  const [itemPlatformMenuKey, setItemPlatformMenuKey] = useState<string | null>(
    null
  );
  const [itemPlatformMenuStyle, setItemPlatformMenuStyle] =
    useState<CSSProperties>({});
  const platformMenuRef = useRef<HTMLDivElement>(null);
  const itemPlatformMenuRef = useRef<HTMLDivElement>(null);
  const itemPlatformTriggerRefs = useRef<Map<string, HTMLButtonElement>>(
    new Map()
  );
  const creatingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeWarning, setCloseWarning] = useState(false);
  const [registrationQuery, setRegistrationQuery] = useState("");
  const [registrations, setRegistrations] = useState<CatalogRegistration[]>([]);
  const [selectedRegistrations, setSelectedRegistrations] = useState<
    Set<string>
  >(new Set());
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const slowLookup = useSlowLookupHint(searching);

  useEffect(() => {
    setNestedSeries(
      module === "series" &&
        Boolean(firstPick && franchiseName && franchiseName !== firstPick.title)
    );
  }, [franchiseName, module, firstPick]);

  useEffect(() => {
    if (!platformMenuOpen && !itemPlatformMenuKey) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        platformMenuOpen &&
        platformMenuRef.current &&
        !platformMenuRef.current.contains(t)
      ) {
        setPlatformMenuOpen(false);
      }
      if (itemPlatformMenuKey) {
        const trigger = itemPlatformTriggerRefs.current.get(itemPlatformMenuKey);
        const inMenu = itemPlatformMenuRef.current?.contains(t);
        const inTrigger = trigger?.contains(t);
        if (!inMenu && !inTrigger) setItemPlatformMenuKey(null);
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [platformMenuOpen, itemPlatformMenuKey]);

  const updateItemPlatformMenuPosition = () => {
    if (!itemPlatformMenuKey) return;
    const trigger = itemPlatformTriggerRefs.current.get(itemPlatformMenuKey);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = Math.min(18 * 16, Math.max(12 * 16, rect.width), vw - 16);
    let left = rect.left;
    if (left + menuWidth > vw - 8) left = Math.max(8, vw - 8 - menuWidth);
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxHeight = Math.min(12 * 16, Math.max(spaceBelow, spaceAbove, 8 * 16));
    const openUp = spaceBelow < Math.min(maxHeight, 10 * 16) && spaceAbove > spaceBelow;
    setItemPlatformMenuStyle({
      position: "fixed",
      left,
      width: menuWidth,
      maxHeight,
      zIndex: 7000,
      ...(openUp
        ? { bottom: vh - rect.top + 4, top: "auto" }
        : { top: rect.bottom + 4, bottom: "auto" }),
    });
  };

  useLayoutEffect(() => {
    if (!itemPlatformMenuKey) return;
    updateItemPlatformMenuPosition();
    window.addEventListener("resize", updateItemPlatformMenuPosition);
    window.addEventListener("scroll", updateItemPlatformMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateItemPlatformMenuPosition);
      window.removeEventListener("scroll", updateItemPlatformMenuPosition, true);
    };
  }, [itemPlatformMenuKey]);

  function stopLookup() {
    const controller = lookupControllerRef.current;
    lookupControllerRef.current = null;
    controller?.abort();
    setSearching(false);
  }

  async function search() {
    const value = query.trim();
    if (value.length < 1 || searching) return;
    setSearching(true);
    setError(null);
    setNotice(null);
    setNotFound(false);
    setExistingFranchise(null);
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    try {
      const data = await searchCatalogImport(module, value, controller.signal);
      setLocalFranchises(
        [...data.local_franchises].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        )
      );
      setResults(
        [...data.items].sort((a, b) => {
          const yearA = (a.date || "").slice(0, 4);
          const yearB = (b.date || "").slice(0, 4);
          const hasA = /^\d{4}$/.test(yearA);
          const hasB = /^\d{4}$/.test(yearB);
          if (hasA && hasB && yearA !== yearB) {
            return yearA.localeCompare(yearB);
          }
          if (hasA !== hasB) return hasA ? -1 : 1;
          return a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          });
        })
      );
      setNotFound(
        data.items.length === 0 && data.local_franchises.length === 0
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      setResults([]);
      setLocalFranchises([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  function addPicked(incoming: CatalogImportItem[]) {
    // Stable keys + pure updaters (no shared mutable `added`) so React Strict Mode
    // double-invoke cannot insert the same title twice.
    const identities = incoming
      .map(itemIdentity)
      .filter((identity): identity is string => Boolean(identity));
    setItems((current) => {
      const byId = new Map(
        current.map((item) => [itemIdentity(item) || item.key, item])
      );
      for (const entry of incoming) {
        const identity = itemIdentity(entry);
        if (!identity || byId.has(identity)) continue;
        byId.set(identity, { ...entry, key: identity });
      }
      return Array.from(byId.values());
    });
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const identity of identities) next.add(identity);
      return next;
    });
    if (module === "games") {
      const fromItems = incoming.flatMap((entry) => entry.platforms || []);
      if (fromItems.length) {
        setActivePlatforms((current) => {
          const next = [...current];
          for (const raw of fromItems) {
            const name = canonicalizePlatform(raw, platformOptions) || raw;
            if (
              name &&
              !next.some((p) => p.toLowerCase() === name.toLowerCase())
            ) {
              next.push(name);
            }
          }
          return next;
        });
      }
    }
  }

  function addActivePlatform(name: string) {
    const canonical = canonicalizePlatform(name, platformOptions) || name;
    if (!canonical) return;
    setActivePlatforms((current) => {
      if (current.some((p) => p.toLowerCase() === canonical.toLowerCase())) {
        return current;
      }
      return [...current, canonical];
    });
  }

  function removeActivePlatform(name: string) {
    const want = name.toLowerCase();
    setActivePlatforms((current) =>
      current.filter((p) => p.toLowerCase() !== want)
    );
    setItems((current) =>
      current.map((item) => ({
        ...item,
        platforms: (item.platforms || []).filter(
          (p) => p.toLowerCase() !== want
        ),
      }))
    );
  }

  function assignItemPlatform(itemKey: string, platformName: string) {
    const canonical =
      canonicalizePlatform(platformName, platformOptions) || platformName;
    if (!canonical) return;
    setItems((current) =>
      current.map((item) => {
        if (item.key !== itemKey) return item;
        const existing = item.platforms || [];
        if (existing.some((p) => p.toLowerCase() === canonical.toLowerCase())) {
          return item;
        }
        return { ...item, platforms: [...existing, canonical] };
      })
    );
    addActivePlatform(canonical);
    setItemPlatformMenuKey(null);
  }

  function removeItemPlatform(itemKey: string, platformName: string) {
    const want = platformName.toLowerCase();
    setItems((current) =>
      current.map((item) => {
        if (item.key !== itemKey) return item;
        return {
          ...item,
          platforms: (item.platforms || []).filter(
            (p) => p.toLowerCase() !== want
          ),
        };
      })
    );
  }

  async function choose(item: CatalogImportSearchItem) {
    if (item.source === "local") {
      if (item.kind === "franchise") {
        setExistingFranchise(item);
        setNotice(null);
      } else {
        addPicked([{ provider_id: "", title: item.title, date: null }]);
        setFranchiseName(item.title);
        setStep("details");
      }
      return;
    }
    setSearching(true);
    setError(null);
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    try {
      const data = await previewCatalogImport(module, item, controller.signal);
      const isFirstPick = !firstPick;
      if (isFirstPick) {
        setFirstPick(item);
        setScope(data.scope);
        setNestedSeries(false);
      }
      setFranchiseName(
        (current) => current || data.franchise_name || item.title
      );
      const baseOptions =
        platformOptions.length > 0
          ? platformOptions
          : [...GAMES_PLATFORM_OPTIONS, ...loadCustomPlatforms()];
      const previewOptions = (data as { platform_options?: string[] })
        .platform_options;
      const previewGamePlatforms = (data as { platforms?: string[] }).platforms;
      const toMerge = [
        ...(Array.isArray(previewOptions) ? previewOptions : []),
        ...(Array.isArray(previewGamePlatforms) ? previewGamePlatforms : []),
      ];
      let optionsForCanon = baseOptions;
      if (toMerge.length) {
        const next = [...baseOptions];
        for (const raw of toMerge) {
          const name = canonicalizePlatform(String(raw || ""), next);
          if (
            name &&
            !next.some((p) => p.toLowerCase() === name.toLowerCase())
          ) {
            next.push(name);
          }
        }
        optionsForCanon = next.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" })
        );
        setPlatformOptions(optionsForCanon);
      }
      const fromItems = (data.items || []).flatMap(
        (row) => row.platforms || []
      );
      const hintedList = [
        ...(item.platforms || []),
        ...(item.platform ? [item.platform] : []),
        ...fromItems,
        ...(Array.isArray(previewGamePlatforms) ? previewGamePlatforms : []),
      ]
        .map((p) => String(p || "").trim())
        .filter(Boolean);
      const matchedPlatforms: string[] = [];
      const seenPlat = new Set<string>();
      for (const hint of hintedList) {
        const hit = canonicalizePlatform(hint, optionsForCanon);
        if (hit && !seenPlat.has(hit.toLowerCase())) {
          seenPlat.add(hit.toLowerCase());
          matchedPlatforms.push(hit);
        }
      }
      // Stamp per-title platforms so each game lands only under its platforms.
      addPicked(
        (data.items || []).map((row) => ({
          ...row,
          platforms:
            module === "games"
              ? matchedPlatforms.length
                ? matchedPlatforms
                : row.platforms || []
              : row.platforms,
        }))
      );
      if (module === "games" && matchedPlatforms.length) {
        setActivePlatforms((current) => {
          const next = isFirstPick ? [] : [...current];
          for (const name of matchedPlatforms) {
            if (!next.some((p) => p.toLowerCase() === name.toLowerCase())) {
              next.push(name);
            }
          }
          return next;
        });
      }
      setStep("details");
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  async function updateExistingLocalFolders() {
    if (!existingFranchise || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateCatalogFolders(
        module,
        existingFranchise.title
      );
      setNotice(
        `${result.folders_created} missing folder${
          result.folders_created === 1 ? "" : "s"
        } created. Existing files were not changed.`
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  /** Queue the typed title with no provider metadata and stop the lookup. */
  function continueWithoutRegistration() {
    const title = query.trim();
    stopLookup();
    if (!title) return;
    addPicked([{ provider_id: "", title, date: null }]);
    setFranchiseName((current) => current || title);
    setResults([]);
    setNotFound(false);
    setStep("details");
  }

  function toggleItem(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosenItems = useMemo(
    () => items.filter((item) => selectedKeys.has(item.key)),
    [items, selectedKeys]
  );
  const gamesForPlatform = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const plat of activePlatforms) {
      map.set(plat, []);
    }
    for (const item of chosenItems) {
      for (const raw of item.platforms || []) {
        const name = canonicalizePlatform(raw, platformOptions) || raw;
        if (!name) continue;
        const hit =
          activePlatforms.find((p) => p.toLowerCase() === name.toLowerCase()) ||
          name;
        const list = map.get(hit) || [];
        if (!list.includes(item.title)) list.push(item.title);
        map.set(hit, list);
      }
    }
    return map;
  }, [activePlatforms, chosenItems, platformOptions]);
  const dropdownPlatformOptions = useMemo(() => {
    const active = new Set(activePlatforms.map((p) => p.toLowerCase()));
    return (platformOptions.length
      ? platformOptions
      : GAMES_PLATFORM_OPTIONS
    ).filter((p) => !active.has(p.toLowerCase()));
  }, [activePlatforms, platformOptions]);
  const leafCreateCount = useMemo(() => {
    if (module !== "games") return chosenItems.length;
    let n = 0;
    for (const item of chosenItems) {
      n += Math.max(1, (item.platforms || []).length);
    }
    return Math.max(1, n);
  }, [module, chosenItems]);
  const estimatedSeconds = Math.max(
    10,
    leafCreateCount * (module === "books" ? 5 : 12)
  );
  const queuedIdentities = useMemo(
    () => new Set(items.map(itemIdentity)),
    [items]
  );

  function commitNewPlatform(assignToItemKey?: string | null) {
    const name = titleCasePlatform(newPlatformName);
    if (!name) return;
    setPlatformOptions((current) => {
      if (current.some((p) => p.toLowerCase() === name.toLowerCase())) {
        return current;
      }
      const next = [...current, name].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
      const custom = loadCustomPlatforms();
      if (!custom.some((p) => p.toLowerCase() === name.toLowerCase())) {
        saveCustomPlatforms(
          [...custom, name].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
          )
        );
      }
      return next;
    });
    const targetKey = assignToItemKey ?? itemPlatformMenuKey;
    if (targetKey) {
      assignItemPlatform(targetKey, name);
    } else {
      addActivePlatform(name);
    }
    setNewPlatformName("");
    setNewPlatformOpen(false);
  }

  async function create() {
    if (
      !franchiseName.trim() ||
      !chosenItems.length ||
      saving ||
      creatingRef.current
    ) {
      return;
    }
    if (module === "games") {
      const missing = chosenItems.filter(
        (item) => !(item.platforms && item.platforms.length)
      );
      if (missing.length) {
        setError(
          `Pick at least one platform for: ${missing
            .map((item) => item.title)
            .join(", ")}`
        );
        return;
      }
    }
    const platforms =
      module === "games"
        ? [
            ...new Set(
              chosenItems
                .flatMap((item) => item.platforms || [])
                .map((p) => canonicalizePlatform(p, platformOptions) || p)
                .filter(Boolean)
            ),
          ]
        : [];
    if (module === "games" && !platforms.length) {
      setError("Choose at least one platform for Games (e.g. Nintendo Switch).");
      return;
    }
    // Lock the Create control immediately so double-clicks cannot re-fire.
    creatingRef.current = true;
    setSaving(true);
    setCloseWarning(false);
    setError(null);
    try {
      const result = await createCatalogImport(module, {
        franchise_name: franchiseName.trim(),
        franchise_home: franchiseHome,
        include_guide: includeGuide,
        nested_series: nestedSeries,
        ...(module === "games" ? { platforms } : {}),
        items: chosenItems.map(({ key: _key, ...item }) => ({
          ...item,
          ...(module === "games"
            ? {
                platforms: (item.platforms || []).map(
                  (p) => canonicalizePlatform(p, platformOptions) || p
                ),
              }
            : {}),
        })),
      });
      if (result.metadata_errors.length) {
        setError(
          `Folders created, but some metadata could not be saved: ${result.metadata_errors.join(
            "; "
          )}`
        );
      }
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      creatingRef.current = false;
      setSaving(false);
    }
  }

  async function searchRegistrations() {
    if (registrationBusy) return;
    setRegistrationBusy(true);
    setError(null);
    try {
      const data = await searchCatalogRegistrations(
        module,
        registrationQuery.trim()
      );
      setRegistrations(data.items);
      setSelectedRegistrations(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function removeRegistrations() {
    if (!selectedRegistrations.size || registrationBusy) return;
    setRegistrationBusy(true);
    setError(null);
    try {
      for (const id of selectedRegistrations) {
        await removeCatalogRegistration(module, id);
      }
      setRegistrations((current) =>
        current.filter((item) => !selectedRegistrations.has(item.id))
      );
      setSelectedRegistrations(new Set());
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistrationBusy(false);
    }
  }

  function requestClose() {
    if (saving) {
      setCloseWarning(true);
      return;
    }
    stopLookup();
    onClose();
  }

  const idLink = (
    <a
      href={labels.providerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="manage-artists-modal__inline-link"
      title={`Get ID from ${labels.provider}`}
    >
      ID
    </a>
  );

  const searchRow = (
    <>
      <p className="manage-artists-modal__search-instruction">
        {step === "details" ? (
          <>
            Add more {labels.plural.toLowerCase()} to this franchise by title or{" "}
            {idLink}
          </>
        ) : (
          <>
            Search {labels.singular} by title or by {idLink}
          </>
        )}
      </p>
      <div className="modal-search-row">
        <input
          aria-label={labels.titlePlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
            setExistingFranchise(null);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={labels.titlePlaceholder}
          autoFocus={step === "search"}
          disabled={saving}
        />
        <SearchIconButton
          searching={searching}
          disabled={searching || saving || query.trim().length < 1}
          onClick={() => void search()}
        />
      </div>
      {searching && slowLookup ? (
        <p className="manage-artists-modal__not-found-body">
          You can also{" "}
          <button
            type="button"
            className="manage-artists-modal__inline-link"
            onClick={continueWithoutRegistration}
          >
            continue with no registration
          </button>
        </p>
      ) : null}
      {notFound && !searching ? (
        <div className="manage-artists-modal__not-found">
          <p className="manage-artists-modal__not-found-title">
            {labels.singular[0].toUpperCase()}
            {labels.singular.slice(1)} not found
          </p>
          <p className="manage-artists-modal__not-found-body">
            <a
              href={labels.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="manage-artists-modal__inline-link"
            >
              Find it on {labels.provider}
            </a>{" "}
            or{" "}
            <button
              type="button"
              className="manage-artists-modal__inline-link"
              onClick={continueWithoutRegistration}
            >
              continue with no registration
            </button>{" "}
            to proceed
          </p>
        </div>
      ) : null}
    </>
  );

  const resultsList = (
    <>
      {localFranchises.length ? (
        <section>
          <small className="muted">Local franchise matches</small>
          <div className="manage-catalog-modal__suggest-scroll">
            <ul className="add-similar-results">
              {localFranchises.map((item) => (
                <li key={`${item.kind}-${item.title}`}>
                  <button
                    type="button"
                    className="btn btn--block"
                    onClick={() => void choose(item)}
                  >
                    <span className="add-similar-results__name">
                      {item.title}
                    </span>
                    <span className="muted add-similar-results__dis">
                      {item.subtitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {existingFranchise ? (
        <p className="modal-notice manage-catalog-modal__existing">
          This {labels.singular} already exists, click{" "}
          <button
            type="button"
            className="manage-artists-modal__inline-link"
            onClick={() => void updateExistingLocalFolders()}
            disabled={saving}
          >
            here
          </button>{" "}
          to update local folders
        </p>
      ) : null}

      {results.length ? (
        <div className="manage-catalog-modal__suggest-scroll">
          <ul className="add-similar-results">
            {results.map((item) => {
              const queued = queuedIdentities.has(
                item.provider_id || item.title.trim().toLowerCase()
              );
              return (
                <li key={`${item.kind}-${item.provider_id}`}>
                  <button
                    type="button"
                    className="btn btn--block"
                    disabled={searching || saving || queued}
                    onClick={() => void choose(item)}
                  >
                    <span className="add-similar-results__name">
                      {item.title}
                    </span>
                    <span className="muted add-similar-results__dis">
                      {queued ? "Already added" : item.subtitle}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );

  const modalTitle =
    module === "games"
      ? "My games"
      : module === "series"
        ? "My series"
        : module === "movies"
          ? "My movies"
          : module === "books"
            ? "My books"
            : `Manage ${labels.plural}`;

  return (
    <ModalPortal onClose={requestClose}>
      <div
        className="modal-panel artist-admin-modal manage-catalog-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{modalTitle}</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={requestClose}
          >
            ×
          </button>
        </div>

        <div className="series-cast-add__tabs" role="tablist">
          <button
            type="button"
            className={mode === "add" ? "active" : ""}
            disabled={saving || registrationBusy}
            onClick={() => {
              setMode("add");
              setError(null);
            }}
          >
            Add {labels.singular}
          </button>
          <button
            type="button"
            className={mode === "remove" ? "active" : ""}
            disabled={saving || registrationBusy}
            onClick={() => {
              setMode("remove");
              setError(null);
            }}
          >
            Remove {labels.singular}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="modal-notice">{notice}</p> : null}

        {mode === "remove" ? (
          <div className="artist-admin-form" key="remove">
            <p className="muted">
              Select the {labels.plural.toLowerCase()} to be removed. This
              action cannot be undone.
            </p>
            <div className="modal-search-row">
              <input
                aria-label={`Find ${labels.singular} registrations`}
                value={registrationQuery}
                onChange={(e) => setRegistrationQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchRegistrations();
                  }
                }}
                placeholder={labels.titlePlaceholder}
              />
              <SearchIconButton
                searching={registrationBusy}
                disabled={registrationBusy}
                onClick={() => void searchRegistrations()}
              />
            </div>
            {registrations.length ? (
              <div className="manage-catalog-modal__items">
                {registrations.map((item) => (
                  <Checkbox
                    key={item.id}
                    className="manage-catalog-modal__item"
                    checked={selectedRegistrations.has(item.id)}
                    disabled={item.has_local_folder || registrationBusy}
                    onChange={() =>
                      setSelectedRegistrations((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {item.name}
                    {item.has_local_folder ? (
                      <span className="muted"> · Local folder protected</span>
                    ) : null}
                  </Checkbox>
                ))}
              </div>
            ) : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn btn--danger"
                disabled={registrationBusy || selectedRegistrations.size === 0}
                onClick={() => void removeRegistrations()}
              >
                Remove selected
              </button>
            </div>
          </div>
        ) : step === "search" ? (
          <div className="artist-admin-form manage-catalog-modal__form--search" key="search">
            {searchRow}
            {resultsList}
          </div>
        ) : (
          <div className="artist-admin-form manage-catalog-modal__form--details" key="details">
            <label>
              Franchise name
              <input
                value={franchiseName}
                onChange={(e) => setFranchiseName(e.target.value)}
              />
            </label>

            {module === "series" ? (
              <Checkbox
                className="manage-artists-modal__guide-option"
                checked={nestedSeries}
                onChange={setNestedSeries}
              >
                Create as a show inside the franchise
              </Checkbox>
            ) : null}

            <div className="manage-catalog-modal__selection">
              <small className="muted">
                {scope === "collection"
                  ? "TMDb collection"
                  : scope === "series" && module === "books"
                    ? "Possible Google Books series"
                    : "Selected titles"}
              </small>
              <div className="manage-catalog-modal__items">
                {items.map((item) => {
                  const itemPlats = item.platforms || [];
                  return (
                    <div
                      key={item.key}
                      className="manage-catalog-modal__title-row"
                    >
                      <Checkbox
                        className="manage-catalog-modal__item"
                        checked={selectedKeys.has(item.key)}
                        disabled={saving}
                        onChange={() => toggleItem(item.key)}
                      >
                        {item.title}
                        {item.date ? (
                          <span className="muted"> {item.date}</span>
                        ) : null}
                        {module === "series" && item.seasons?.length ? (
                          <span className="muted">
                            {" · "}
                            {
                              item.seasons.filter((season) => season.number > 0)
                                .length
                            }{" "}
                            seasons
                            {item.seasons.some((season) => season.number === 0)
                              ? " + Specials"
                              : ""}
                          </span>
                        ) : null}
                        {!item.provider_id ? (
                          <span className="muted"> · No registration</span>
                        ) : null}
                      </Checkbox>
                      {module === "games" && selectedKeys.has(item.key) ? (
                        <div className="manage-catalog-modal__item-platforms">
                          {itemPlats.length ? (
                            itemPlats.map((p) => (
                              <span
                                key={p}
                                className="manage-catalog-modal__platform-pill manage-catalog-modal__platform-pill--sm"
                                title={p}
                              >
                                <span className="manage-catalog-modal__platform-pill-name">
                                  {p}
                                </span>
                                <button
                                  type="button"
                                  className="manage-catalog-modal__platform-pill-remove"
                                  aria-label={`Remove ${p} from ${item.title}`}
                                  disabled={saving}
                                  onClick={() =>
                                    removeItemPlatform(item.key, p)
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="manage-catalog-modal__item-platforms-warn">
                              No platform
                            </span>
                          )}
                          <div className="manage-catalog-modal__platform-picker manage-catalog-modal__platform-picker--item">
                            <button
                              type="button"
                              className="manage-catalog-modal__item-platform-add"
                              disabled={saving}
                              aria-haspopup="listbox"
                              aria-expanded={itemPlatformMenuKey === item.key}
                              ref={(el) => {
                                if (el) {
                                  itemPlatformTriggerRefs.current.set(
                                    item.key,
                                    el
                                  );
                                } else {
                                  itemPlatformTriggerRefs.current.delete(
                                    item.key
                                  );
                                }
                              }}
                              onClick={() => {
                                setPlatformMenuOpen(false);
                                setNewPlatformOpen(false);
                                setNewPlatformName("");
                                setItemPlatformMenuKey((cur) =>
                                  cur === item.key ? null : item.key
                                );
                              }}
                            >
                              + Platform
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {searchRow}
            {resultsList}

            <div className="manage-catalog-modal__estimate">
              <small className="muted">
                {chosenItems.length} folder
                {chosenItems.length === 1 ? "" : "s"} will be created
              </small>
              <small className="muted">
                Approximate time:{" "}
                {estimatedSeconds >= 60
                  ? `${Math.ceil(estimatedSeconds / 60)} minute(s)`
                  : `${estimatedSeconds} seconds`}
              </small>
            </div>
            <Checkbox
              className="manage-artists-modal__guide-option"
              checked={franchiseHome}
              onChange={setFranchiseHome}
            >
              Use {labels.plural} as franchise home
            </Checkbox>
            <Checkbox
              className="manage-artists-modal__guide-option"
              checked={includeGuide}
              onChange={setIncludeGuide}
            >
              Include user guide
            </Checkbox>

            {saving ? (
              <small className="muted manage-modal__wait">
                Creating folders, please wait...
              </small>
            ) : null}
            {closeWarning ? (
              <small className="muted">
                Closing now may interrupt the process and result in incomplete
                data.
              </small>
            ) : null}

            <div className="modal-actions-row manage-catalog-modal__actions">
              <button
                type="button"
                className="btn manage-catalog-modal__back"
                disabled={saving}
                onClick={() => {
                  stopLookup();
                  setStep("search");
                  setFirstPick(null);
                  setItems([]);
                  setSelectedKeys(new Set());
                }}
              >
                <svg
                  className="manage-catalog-modal__back-chevron"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M15 6l-6 6 6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                aria-busy={saving}
                disabled={
                  saving ||
                  !franchiseName.trim() ||
                  chosenItems.length === 0 ||
                  (module === "games" &&
                    chosenItems.some(
                      (item) => !(item.platforms && item.platforms.length)
                    ))
                }
                onClick={() => void create()}
              >
                {saving ? "Creating…" : "+ Create"}
              </button>
            </div>
          </div>
        )}
      </div>
      {itemPlatformMenuKey
        ? (() => {
            const openItem = items.find((i) => i.key === itemPlatformMenuKey);
            if (!openItem) return null;
            const itemPlats = openItem.platforms || [];
            const opts = (
              platformOptions.length
                ? platformOptions
                : GAMES_PLATFORM_OPTIONS
            ).filter(
              (p) =>
                !itemPlats.some((x) => x.toLowerCase() === p.toLowerCase())
            );
            return createPortal(
              <div
                ref={itemPlatformMenuRef}
                className="manage-catalog-modal__platform-menu manage-catalog-modal__platform-menu--portal ms-menu-pop is-open"
                role="listbox"
                style={itemPlatformMenuStyle}
              >
                {opts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="option"
                    className="manage-catalog-modal__platform-menu-item"
                    onClick={() => assignItemPlatform(openItem.key, p)}
                  >
                    {p}
                  </button>
                ))}
                {newPlatformOpen ? (
                  <div className="manage-catalog-modal__new-platform-inline manage-catalog-modal__new-platform-inline--portal">
                    <input
                      className="manage-catalog-modal__new-platform-input"
                      value={newPlatformName}
                      placeholder="Platform name"
                      disabled={saving}
                      autoFocus
                      onChange={(e) => setNewPlatformName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitNewPlatform(openItem.key);
                        } else if (e.key === "Escape") {
                          setNewPlatformOpen(false);
                          setNewPlatformName("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="manage-catalog-modal__platform-icon-btn"
                      aria-label="Confirm new platform"
                      disabled={saving || !newPlatformName.trim()}
                      onClick={() => commitNewPlatform(openItem.key)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          d="M3.5 8.5 6.5 11.5 12.5 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="manage-catalog-modal__platform-icon-btn"
                      aria-label="Cancel new platform"
                      disabled={saving}
                      onClick={() => {
                        setNewPlatformOpen(false);
                        setNewPlatformName("");
                      }}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          d="M4 4l8 8M12 4l-8 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="manage-catalog-modal__platform-menu-item manage-catalog-modal__platform-menu-item--new"
                    disabled={saving}
                    onClick={() => setNewPlatformOpen(true)}
                  >
                    + New platform…
                  </button>
                )}
              </div>,
              document.body
            );
          })()
        : null}
    </ModalPortal>
  );
}
