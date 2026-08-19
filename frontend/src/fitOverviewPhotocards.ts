/** Scale overview photocards so the landscape card meets the lineup/staff row. */

export function fitOverviewPhotocards(
  top: HTMLElement | null,
  cards: HTMLElement | null
): void {
  if (!top) return;
  top.style.setProperty("--overview-photocard-scale", "1");
  if (!cards) return;

  const imgs = cards.querySelectorAll("img");
  for (const img of imgs) {
    if (!img.complete || img.naturalHeight <= 0) return;
  }

  const rowH = top.clientHeight;
  const portrait = cards.querySelector(
    ".release-photocard--portrait"
  ) as HTMLElement | null;
  const landscape = cards.querySelector(
    ".release-photocard--landscape"
  ) as HTMLElement | null;
  const styles = getComputedStyle(cards);
  const gap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
  const kids = [portrait, landscape].filter(Boolean) as HTMLElement[];
  const contentH =
    kids.reduce((sum, el) => sum + el.offsetHeight, 0) +
    Math.max(0, kids.length - 1) * gap;
  if (contentH <= 0 || rowH <= 0) return;

  let scale = rowH / contentH;
  scale = Math.min(2.35, Math.max(0.5, scale * 0.99));
  top.style.setProperty("--overview-photocard-scale", scale.toFixed(3));
}
