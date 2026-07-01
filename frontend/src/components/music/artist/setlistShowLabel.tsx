import type { ReactNode } from "react";
import type { SetlistShowSummary } from "../../../types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type SetlistShowDateParts = {
  month: string;
  day: number;
  suffix: string;
};

export function ordinalSuffixOnly(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  const mod = day % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

export function parseSetlistShowDate(
  dateIso: string | null | undefined
): SetlistShowDateParts | null {
  if (!dateIso) return null;
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isFinite(day) || monthIndex < 0 || monthIndex > 11) return null;
  return {
    month: MONTHS[monthIndex] ?? match[2]!,
    day,
    suffix: ordinalSuffixOnly(day),
  };
}

export function setlistShowLabelPlain(
  show: Pick<SetlistShowSummary, "date_iso" | "venue" | "city" | "country" | "display_date">
): string {
  const dateParts = parseSetlistShowDate(show.date_iso);
  const dateLabel = dateParts
    ? `${dateParts.month} ${dateParts.day}${dateParts.suffix}`
    : (show.display_date ?? "");
  const bits: string[] = [];
  if (dateLabel) bits.push(dateLabel);
  if (show.venue) bits.push(show.venue);
  if (show.city && show.country) bits.push(`${show.city}, ${show.country}`);
  else if (show.city) bits.push(show.city);
  else if (show.country) bits.push(show.country);
  return bits.join(" · ");
}

export function SetlistShowLabelRich({
  show,
}: {
  show: Pick<SetlistShowSummary, "date_iso" | "venue" | "city" | "country" | "display_date">;
}) {
  const dateParts = parseSetlistShowDate(show.date_iso);
  const segments: ReactNode[] = [];

  if (dateParts) {
    segments.push(
      <span key="date" className="setlist-show-label__date">
        {dateParts.month} {dateParts.day}
        <sup className="setlist-show-label__suffix">{dateParts.suffix}</sup>
      </span>
    );
  } else if (show.display_date) {
    segments.push(
      <span key="date" className="setlist-show-label__date">
        {show.display_date}
      </span>
    );
  }

  if (show.venue) {
    segments.push(<span key="sep-venue"> · </span>, <span key="venue">{show.venue}</span>);
  }

  if (show.city || show.country) {
    segments.push(<span key="sep-loc"> · </span>);
    if (show.city) segments.push(<span key="city">{show.city}</span>);
    if (show.city && show.country) segments.push(<span key="comma">, </span>);
    if (show.country) segments.push(<span key="country">{show.country}</span>);
  }

  return <span className="setlist-show-label">{segments}</span>;
}
