/** True when URL path looks like video, including ``.mp4&v=…`` cache-busted media URLs. */
export function isVideoMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(?:$|[?#&])/i.test(url);
}
