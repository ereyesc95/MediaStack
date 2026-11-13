import {
  MYSTACK_DEFAULT_ACCENT,
  MYSTACK_DEFAULT_FILL,
  mystackMarkSvg,
} from "./mystackMark";

export function updateFavicon() {
  const styles = getComputedStyle(document.documentElement);
  const body =
    styles.getPropertyValue("--text").trim() || MYSTACK_DEFAULT_FILL;
  const accent =
    styles.getPropertyValue("--accent").trim() || MYSTACK_DEFAULT_ACCENT;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(
    mystackMarkSvg(body, accent)
  )}`;
}
