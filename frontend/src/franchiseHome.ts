/** Cross-module franchise routing when [Artwork] lives in another media root. */

export type FranchiseHomeModule = "series" | "movies" | "books";

export type FranchiseHomeReferrer = {
  /** Module the user clicked from. */
  source: FranchiseHomeModule;
  /** Module that owns the franchise [Artwork] folder. */
  home: FranchiseHomeModule;
  fromTab?: "home" | "catalog";
  catalogLetter?: string;
  franchiseId?: string;
  franchiseName?: string;
  /** Tab to show beside Overview on the home franchise page. */
  preferredSection?: string;
  backLabel?: string;
};

const KEY = "mystack_franchise_home_referrer";

let memory: FranchiseHomeReferrer | null = null;

export function saveFranchiseHomeReferrer(
  ref: FranchiseHomeReferrer | null
): void {
  memory = ref;
  try {
    if (!ref) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getFranchiseHomeReferrer(): FranchiseHomeReferrer | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FranchiseHomeReferrer;
    if (!parsed || typeof parsed !== "object") return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFranchiseHomeReferrer(): void {
  saveFranchiseHomeReferrer(null);
}

/** Preferred section on the artwork-home franchise for the source module. */
export function preferredSectionForSource(
  source: FranchiseHomeModule
): string {
  switch (source) {
    case "movies":
      return "movies";
    case "books":
      return "library";
    case "series":
    default:
      return "series";
  }
}

export function artworkHomeModule(
  card: { artwork_home_module?: string | null } | null | undefined
): FranchiseHomeModule | null {
  const home = String(card?.artwork_home_module || "").toLowerCase();
  if (home === "series" || home === "movies" || home === "books") return home;
  return null;
}

/** True when the card should open in another module's franchise page. */
export function isArtworkHomeElsewhere(
  card: {
    artwork_home_module?: string | null;
    is_music_franchise?: boolean;
  } | null | undefined,
  current: FranchiseHomeModule
): boolean {
  if (!card || card.is_music_franchise) return false;
  const home = artworkHomeModule(card);
  return Boolean(home && home !== current);
}
