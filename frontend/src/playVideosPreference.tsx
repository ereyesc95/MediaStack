import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { savePlayVideosLocally } from "./api";
import { isPhoneLayout, useDeviceLayout } from "./usePhoneLayout";

type PlayVideosContextValue = {
  /** Saved preference (true = system player). */
  playLocallyPreferred: boolean;
  /** Effective for opening: false on phone, else preference. */
  playLocally: boolean;
  /** Admin desktop Movies/Series: show hamburger toggle. */
  showMenuToggle: boolean;
  setPlayLocally: (enabled: boolean) => Promise<void>;
  busy: boolean;
};

const PlayVideosContext = createContext<PlayVideosContextValue>({
  playLocallyPreferred: true,
  playLocally: true,
  showMenuToggle: false,
  setPlayLocally: async () => {},
  busy: false,
});

export function PlayVideosProvider({
  initialPlayLocally = true,
  isAdmin = false,
  menuModuleActive = false,
  children,
}: {
  initialPlayLocally?: boolean;
  isAdmin?: boolean;
  /** True when current view is Movies or Series. */
  menuModuleActive?: boolean;
  children: ReactNode;
}) {
  const layout = useDeviceLayout();
  const isPhone = isPhoneLayout(layout);
  const [playLocallyPreferred, setPreferred] = useState(initialPlayLocally);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreferred(initialPlayLocally);
  }, [initialPlayLocally]);

  const setPlayLocally = useCallback(async (enabled: boolean) => {
    setBusy(true);
    try {
      const res = await savePlayVideosLocally(enabled);
      setPreferred(Boolean(res.play_videos_locally));
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<PlayVideosContextValue>(
    () => ({
      playLocallyPreferred,
      playLocally: isPhone ? false : playLocallyPreferred,
      showMenuToggle: Boolean(isAdmin && !isPhone && menuModuleActive),
      setPlayLocally,
      busy,
    }),
    [
      playLocallyPreferred,
      isPhone,
      isAdmin,
      menuModuleActive,
      setPlayLocally,
      busy,
    ]
  );

  return (
    <PlayVideosContext.Provider value={value}>
      {children}
    </PlayVideosContext.Provider>
  );
}

export function usePlayVideosPreference(): PlayVideosContextValue {
  return useContext(PlayVideosContext);
}
