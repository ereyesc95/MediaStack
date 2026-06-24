export const WORD_CLOUD_INVALIDATE_EVENT = "mediastack:word-cloud-invalidate";

export function invalidateWordCloud(bandId: number): void {
  window.dispatchEvent(
    new CustomEvent(WORD_CLOUD_INVALIDATE_EVENT, { detail: { bandId } })
  );
}
