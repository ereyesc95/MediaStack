import { createElement, type ReactNode } from "react";
import {
  IconMediaBooks,
  IconMediaGames,
  IconMediaMovies,
  IconMediaMusic,
  IconMediaSeries,
} from "./components/MenuIcons";

/** Display name with Stack suffix (Series → SerieStack, Movies → MovieStack). */
export function toStackName(label: string): string {
  const trimmed = label.trim();
  const base = trimmed.endsWith("s") || trimmed.endsWith("S")
    ? trimmed.slice(0, -1)
    : trimmed;
  return `${base}Stack`;
}

const MEDIA_ICONS: Record<string, typeof IconMediaMusic> = {
  music: IconMediaMusic,
  series: IconMediaSeries,
  movies: IconMediaMovies,
  books: IconMediaBooks,
  games: IconMediaGames,
};

export function mediaTypeIcon(kind: string): ReactNode {
  const Icon = MEDIA_ICONS[kind] ?? IconMediaMusic;
  return createElement(Icon);
}
