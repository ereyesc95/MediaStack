/** Coordinates AppMenu open state with neighboring top-bar hover pickers. */

type Listener = (open: boolean) => void;

let appMenuOpen = false;
const listeners = new Set<Listener>();

const CLOSE_EVENT = "mystack:close-app-menu";

export function getAppMenuOpen(): boolean {
  return appMenuOpen;
}

export function setAppMenuOpen(open: boolean): void {
  if (appMenuOpen === open) return;
  appMenuOpen = open;
  listeners.forEach((l) => l(open));
}

export function subscribeAppMenuOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestCloseAppMenu(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

export function subscribeCloseAppMenu(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(CLOSE_EVENT, handler);
  return () => window.removeEventListener(CLOSE_EVENT, handler);
}
