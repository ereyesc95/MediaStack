import type { LineupMember } from "./types";

function yearFromIso(dateIso: string | null | undefined): number | null {
  if (!dateIso || dateIso.length < 4) return null;
  const y = Number(dateIso.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function memberActiveAtYear(
  member: LineupMember,
  year: number | null | undefined
): boolean {
  if (year == null) return true;
  const start = member.start;
  const end = member.end;
  const sy =
    start && start.length >= 4 && /^\d/.test(start)
      ? Number(start.slice(0, 4))
      : null;
  const ey =
    end && end.length >= 4 && /^\d/.test(end)
      ? Number(end.slice(0, 4))
      : null;
  if (sy != null && sy > year) return false;
  if (ey != null && ey < year) return false;
  return true;
}

export function filterLineupByYear(
  members: LineupMember[] | undefined,
  dateIso: string | null | undefined
): LineupMember[] {
  if (!members?.length) return [];
  const year = yearFromIso(dateIso);
  if (year == null) return members;
  return members.filter((m) => memberActiveAtYear(m, year));
}

export function lineupForReleaseDate(
  lineup:
    | {
        all?: LineupMember[];
        current?: LineupMember[];
      }
    | null
    | undefined,
  dateIso: string | null | undefined
): LineupMember[] {
  if (!lineup) return [];
  const fromAll = filterLineupByYear(lineup.all, dateIso);
  if (fromAll.length) return fromAll;
  return filterLineupByYear(lineup.current, dateIso);
}
