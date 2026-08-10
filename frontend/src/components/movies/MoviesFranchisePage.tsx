import { useCallback, useState, type ReactNode } from "react";
import type { CardOrientation } from "../../types";
import type {
  MoviesOverviewTab,
  MoviesSection,
} from "../../moviesRoute";
import SeriesFranchisePage from "../series/SeriesFranchisePage";
import type { SeriesSection } from "../../types";
import AddToUniverseModal from "../AddToUniverseModal";
import { IconUniverse } from "../MenuIcons";

type Props = {
  workId: string;
  section?: MoviesSection;
  overviewTab?: MoviesOverviewTab;
  universeId?: number;
  isAdmin?: boolean;
  userId?: number;
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  onBack: () => void;
  backLabel?: string;
  onNavigate: (patch: {
    franchiseId?: string;
    filmId?: string;
    section?: MoviesSection;
    overviewTab?: MoviesOverviewTab;
    universeId?: number;
  }) => void;
  onOpenSeriesFranchise?: (
    franchiseId: string,
    subseriesId?: string,
    universeId?: number
  ) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
  onBrowseCatalog?: (target: {
    mode: "name" | "genre" | "country" | "publisher" | "writer";
    countryId?: number;
    subgenreId?: number;
    publisher?: string;
    writer?: string;
  }) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

export default function MoviesFranchisePage({
  workId,
  section = "overview",
  overviewTab = "about",
  universeId,
  isAdmin,
  userId,
  cardOrientation = "portrait",
  onSetOrientation,
  onBack,
  backLabel,
  onNavigate,
  onOpenSeriesFranchise,
  onOpenMusicRelease,
  onBrowseCatalog,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const [universeOpen, setUniverseOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const openUniverseAdmin = useCallback(() => {
    setUniverseOpen(true);
  }, []);

  const menuExtra: ReactNode = isAdmin ? (
    <button type="button" onClick={openUniverseAdmin}>
      <IconUniverse />
      Add to universe
    </button>
  ) : null;

  return (
    <>
      <SeriesFranchisePage
        key={`${workId}-${reloadKey}`}
        module="movies"
        franchiseId={workId}
        section={section as SeriesSection}
        overviewTab={overviewTab}
        universeId={universeId}
        isAdmin={isAdmin}
        userId={userId}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        onBack={onBack}
        backLabel={backLabel}
        onNavigate={(patch) => {
          // Only forward keys present on the inbound patch. Tab clicks send
          // { section, overviewTab } only — writing franchiseId: undefined here
          // made App treat it as "leave franchise" and bounce back to home/catalog.
          const next: {
            franchiseId?: string;
            filmId?: string;
            section?: MoviesSection;
            overviewTab?: MoviesOverviewTab;
            universeId?: number;
          } = {
            section: patch.section as MoviesSection | undefined,
            overviewTab: patch.overviewTab as MoviesOverviewTab | undefined,
          };
          if ("franchiseId" in patch) next.franchiseId = patch.franchiseId;
          if ("subseriesId" in patch) next.filmId = patch.subseriesId;
          if ("universeId" in patch) next.universeId = patch.universeId;
          onNavigate(next);
        }}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onOpenMusicRelease={onOpenMusicRelease}
        onBrowseCatalog={onBrowseCatalog}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        menuExtra={menuExtra}
      />

      {universeOpen && isAdmin ? (
        <AddToUniverseModal
          module="movies"
          franchiseId={workId}
          onClose={() => setUniverseOpen(false)}
          onSaved={() => {
            setReloadKey((k) => k + 1);
            setUniverseOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
