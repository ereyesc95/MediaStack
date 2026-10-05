export const PHOTOS_ROOT_PATH = "/photos";

export function parsePhotosRootPath(pathname: string): boolean {
  return pathname === PHOTOS_ROOT_PATH || pathname === `${PHOTOS_ROOT_PATH}/`;
}

export function pushPhotosRootRoute(replace = false): void {
  if (replace) window.history.replaceState({}, "", PHOTOS_ROOT_PATH);
  else window.history.pushState({}, "", PHOTOS_ROOT_PATH);
}
