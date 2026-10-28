export const HOBBIES_ROOT_PATH = "/hobbies";
export const HOBBIES_THEMES_PATH = "/hobbies/themes";

export type HobbiesHubTab = "home" | "themes";

export function parseHobbiesRootPath(pathname: string): boolean {
  return pathname === HOBBIES_ROOT_PATH || pathname === `${HOBBIES_ROOT_PATH}/`;
}

export function parseHobbiesThemesPath(pathname: string): boolean {
  return (
    pathname === HOBBIES_THEMES_PATH || pathname === `${HOBBIES_THEMES_PATH}/`
  );
}

export function parseHobbiesHubTab(pathname: string): HobbiesHubTab | null {
  if (parseHobbiesThemesPath(pathname)) return "themes";
  if (parseHobbiesRootPath(pathname)) return "home";
  return null;
}

export function pushHobbiesRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", HOBBIES_ROOT_PATH);
  else window.history.pushState({}, "", HOBBIES_ROOT_PATH);
}

export function pushHobbiesThemesRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", HOBBIES_THEMES_PATH);
  else window.history.pushState({}, "", HOBBIES_THEMES_PATH);
}

export function hobbiesCollectionPath(collectionId: number): string {
  return `${HOBBIES_ROOT_PATH}/${collectionId}`;
}

export function parseHobbiesCollectionPath(pathname: string): number | null {
  const m = pathname.match(/^\/hobbies\/(\d+)\/?$/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

export function pushHobbiesCollectionRoute(
  collectionId: number,
  replace = false
): void {
  const path = hobbiesCollectionPath(collectionId);
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
}
