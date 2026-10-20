/** Restore Photos → Exclusive filter after navigating out via a caption/link. */

export type PhotosExclusiveReturn = {
  exclusiveModule: string;
  exclusiveSourceId: string;
};

const KEY = "mystack_photos_exclusive_return";

let memory: PhotosExclusiveReturn | null = null;

export function savePhotosExclusiveReturn(
  ref: PhotosExclusiveReturn | null
): void {
  memory = ref;
  try {
    if (!ref) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function getPhotosExclusiveReturn(): PhotosExclusiveReturn | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PhotosExclusiveReturn;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.exclusiveModule) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPhotosExclusiveReturn(): void {
  savePhotosExclusiveReturn(null);
}

/** Read and clear in one step (back button). */
export function consumePhotosExclusiveReturn(): PhotosExclusiveReturn | null {
  const hit = getPhotosExclusiveReturn();
  if (hit) clearPhotosExclusiveReturn();
  return hit;
}

/** True when leaf/artist back should return to Photos Exclusive. */
export function shouldReturnToPhotosExclusive(): boolean {
  return getPhotosExclusiveReturn() != null;
}
