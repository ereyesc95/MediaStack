/** Official / Unofficial filter helpers for leaf cards with [Unofficial] folders. */

export type Officialish = {
  official?: boolean;
  title?: string | null;
  id?: string | null;
  folder_path?: string | null;
  path?: string | null;
};

const UNOFFICIAL_TAG_RE = /\[Unofficial\]/i;

/** Infer unofficial from folder id/path/title when `official` was dropped by a stale API. */
function looksUnofficial(item: Officialish): boolean {
  if (item.official === false) return true;
  if (item.official === true) return false;
  const hay = [
    item.title,
    item.id,
    item.folder_path,
    item.path,
  ]
    .filter(Boolean)
    .join(" ");
  return UNOFFICIAL_TAG_RE.test(hay);
}

/** Default true when the field is missing (legacy cards). */
export function itemIsOfficial(item: Officialish): boolean {
  return !looksUnofficial(item);
}

export function hasUnofficialItems(items: Officialish[]): boolean {
  return items.some((item) => looksUnofficial(item));
}

export function filterByOfficial<T extends Officialish>(
  items: T[],
  officialOnly: boolean
): T[] {
  return items.filter((item) =>
    officialOnly ? itemIsOfficial(item) : !itemIsOfficial(item)
  );
}

/** Strip trailing [Unofficial] / [Box Set] for display (backend should already do this). */
export function stripUnofficialDisplaySuffix(title: string): string {
  return (title || "")
    .replace(/\s*\[(?:Unofficial|Box Set)(?:\s*;\s*(?:Unofficial|Box Set))*\]\s*$/i, "")
    .trim();
}
