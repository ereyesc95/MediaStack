/** Client helpers for per-profile leaf owned/signed markers. */
import {
  fetchLeafOwnership,
  type LeafOwnershipModule,
} from "./api";
import type { SeriesFranchiseCard, SeriesSubseriesCard } from "./types";

export type OwnershipIndex = {
  byFolder: Map<string, { owned: boolean; signed: boolean }>;
  counts: { owned: number; signed: number };
};

function normPath(path: string | null | undefined): string {
  return (path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export async function loadOwnershipIndex(
  module: LeafOwnershipModule
): Promise<OwnershipIndex> {
  const data = await fetchLeafOwnership(module);
  const byFolder = new Map<string, { owned: boolean; signed: boolean }>();
  for (const it of data.items || []) {
    const key = normPath(it.folder_path);
    if (!key) continue;
    byFolder.set(key, {
      owned: Boolean(it.owned),
      signed: Boolean(it.signed),
    });
  }
  return {
    byFolder,
    counts: {
      owned: data.counts?.owned ?? 0,
      signed: data.counts?.signed ?? 0,
    },
  };
}

export function markFranchiseOwnership(
  franchises: SeriesFranchiseCard[],
  index: OwnershipIndex | null
): SeriesFranchiseCard[] {
  if (!index) return franchises;
  return franchises.map((f) => {
    const self = index.byFolder.get(normPath(f.folder_path));
    const subseries = (f.subseries || []).map((s: SeriesSubseriesCard) => {
      const hit = index.byFolder.get(normPath(s.folder_path));
      if (!hit) return s;
      return { ...s, owned: hit.owned, signed: hit.signed };
    });
    const films = (f.films || []).map((film) => {
      const hit = index.byFolder.get(normPath(film.folder_path));
      if (!hit) return film;
      return {
        ...film,
        owned: hit.owned,
        signed: hit.signed,
      } as typeof film & { owned?: boolean; signed?: boolean };
    });
    return {
      ...f,
      owned: self?.owned,
      signed: self?.signed,
      subseries,
      ...(f.films ? { films } : {}),
    };
  });
}

export function markLeafCards<T extends { folder_path: string }>(
  leaves: T[],
  index: OwnershipIndex | null
): (T & { owned?: boolean; signed?: boolean })[] {
  if (!index) return leaves;
  return leaves.map((leaf) => {
    const hit = index.byFolder.get(normPath(leaf.folder_path));
    if (!hit) return leaf;
    return { ...leaf, owned: hit.owned, signed: hit.signed };
  });
}
