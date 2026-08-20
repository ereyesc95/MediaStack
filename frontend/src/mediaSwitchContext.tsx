import { createContext, useContext, type ReactNode } from "react";

export type MediaSwitchKind = "music" | "series" | "movies" | "books" | "games";

type MediaSwitchValue = {
  currentKind: MediaSwitchKind | "hub" | "universe" | string;
  selectMedia: (kind: MediaSwitchKind) => void;
  /** Hub home hides Switch media; every module page shows it. */
  showSwitchMedia: boolean;
};

const MediaSwitchContext = createContext<MediaSwitchValue | null>(null);

export function MediaSwitchProvider({
  value,
  children,
}: {
  value: MediaSwitchValue;
  children: ReactNode;
}) {
  return (
    <MediaSwitchContext.Provider value={value}>
      {children}
    </MediaSwitchContext.Provider>
  );
}

export function useMediaSwitch(): MediaSwitchValue | null {
  return useContext(MediaSwitchContext);
}
