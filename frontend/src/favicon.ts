import { mediastackMarkSvg } from "./mediastackMark";

export function updateFavicon() {
  const fill =
    getComputedStyle(document.documentElement).getPropertyValue("--text").trim() ||
    "#ffffff";
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(mediastackMarkSvg(fill))}`;
}
