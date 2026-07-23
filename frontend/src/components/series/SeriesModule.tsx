import { useCallback, useEffect, useState } from "react";
import {
  fetchSeriesCatalog,
  fetchSeriesDashboard,
  fetchSeriesFilterOptions,
} from "../../api";
import { clearMediaTheme } from "../../mediaTheme";
import {
  pushSeriesCatalogRoute,
  pushSeriesRootRoute,
  parseSeriesCatalogPath,
  parseSeriesRootPath,
} from "../../seriesRoute";
import type {
  CardOrientation,
  SeriesDashboard,
  SeriesFilterMode,
  SeriesFilterOptions,
  SeriesFranchiseCard,
  SeriesOverviewTab,
  SeriesSection,
} from "../../types";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "./CatalogScopeToggle";
import SeriesBrowse from "./SeriesBrowse";
import SeriesFranchisePage, {
  type SeriesFranchiseShell,
} from "./SeriesFranchisePage";
import SeriesHome from "./SeriesHome";

type SeriesTab = "home" | "catalog";

type Props = {
  mediaOptions: MediaOption[];
  busy?: string;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onSelectMedia: (opt: MediaOption) => void;
  cardOrientation?: CardOrientation;
  onSetOrientation?: (next: CardOrientation) => void;
  franchiseId?: string;
  subseriesId?: string;
  seasonId?: string;
  section?: SeriesSection;
  overviewTab?: SeriesOverviewTab;
  onNavigate: (patch: {
    franchiseId?: string;
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
    overviewTab?: SeriesOverviewTab;
  }) => void;
};

export default function SeriesModule({
  mediaOptions,
  busy,
  onImport,
  onSync,
  onChooseSource,
  isAdmin = false,
  userId,
  onSwitchProfile,
  onEditProfile,
  onSelectMedia,
  cardOrientation = "portrait",
  onSetOrientation,
  franchiseId,
  subseriesId,
  seasonId,
  section = "overview",
  overviewTab = "about",
  onNavigate,
}: Props) {
  const [tab, setTab] = useState<SeriesTab>(() => {
    if (franchiseId) return "catalog";
    if (typeof window !== "undefined" && parseSeriesCatalogPath(window.location.pathname)) {
      return "catalog";
    }
    return "home";
  });
  const [franchises, setFranchises] = useState<SeriesFranchiseCard[]>([]);
  const [dashboard, setDashboard] = useState<SeriesDashboard | null>(null);
  const [filterOptions, setFilterOptions] = useState<SeriesFilterOptions | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [dashLoading, setDashLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<SeriesFilterMode>("name");
  const [catalogScope, setCatalogScope] = useState<"franchises" | "shows">(
    "franchises"
  );
  const [franchiseShell, setFranchiseShell] =
    useState<SeriesFranchiseShell | null>(null);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [publisher, setPublisher] = useState("");
  const [writer, setWriter] = useState("");

  const showModuleChrome = !franchiseId;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSeriesCatalog();
      setFranchises(data.franchises);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      setDashboard(await fetchSeriesDashboard());
    } catch {
      setDashboard(null);
    } finally {
      setDashLoading(false);
    }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      setFilterOptions(await fetchSeriesFilterOptions());
    } catch {
      setFilterOptions(null);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadDashboard();
    void loadFilters();
  }, [loadCatalog, loadDashboard, loadFilters]);

  useEffect(() => {
    if (franchiseId) {
      setTab("catalog");
      return;
    }
    const syncTabFromPath = () => {
      if (parseSeriesCatalogPath(window.location.pathname)) setTab("catalog");
      else if (parseSeriesRootPath(window.location.pathname)) setTab("home");
    };
    syncTabFromPath();
    window.addEventListener("popstate", syncTabFromPath);
    return () => window.removeEventListener("popstate", syncTabFromPath);
  }, [franchiseId]);

  useEffect(() => {
    if (!franchiseId) {
      setFranchiseShell(null);
      return;
    }
    const card = franchises.find((f) => f.id === franchiseId);
    if (!card) return;
    if (subseriesId) {
      const show = card.subseries.find((s) => s.id === subseriesId);
      if (show) {
        setFranchiseShell({
          name: show.title,
          cover_url: show.cover_url || card.cover_url,
        });
        return;
      }
    }
    setFranchiseShell({ name: card.name, cover_url: card.cover_url });
  }, [franchiseId, subseriesId, franchises]);

  const media =
    mediaOptions.find((m) => m.kind === "series") ?? mediaOptions[0];

  const openEpisode = (
    openUrl: string | null | undefined,
    path?: string | null
  ) => {
    const url =
      openUrl ||
      (path ? `/api/media/file?path=${encodeURIComponent(path)}` : null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const openFranchise = (
    id: string,
    nextSubseriesId?: string,
    shellHint?: SeriesFranchiseShell | null
  ) => {
    if (shellHint) setFranchiseShell(shellHint);
    setTab("catalog");
    onNavigate({
      franchiseId: id,
      subseriesId: nextSubseriesId,
      seasonId: undefined,
      section: "overview",
    });
  };

  const backToCatalog = () => {
    clearMediaTheme(userId);
    setFranchiseShell(null);
    setTab("catalog");
    pushSeriesCatalogRoute(true);
    onNavigate({
      franchiseId: undefined,
      subseriesId: undefined,
      seasonId: undefined,
      section: "overview",
    });
  };

  if (!showModuleChrome && franchiseId) {
    return (
      <div className="series-module">
        <SeriesFranchisePage
          franchiseId={franchiseId}
          subseriesId={subseriesId}
          seasonId={seasonId}
          section={section}
          overviewTab={overviewTab}
          shell={franchiseShell}
          busy={busy}
          isAdmin={isAdmin}
          userId={userId}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          onBack={backToCatalog}
          onNavigate={(patch) =>
            onNavigate({
              franchiseId,
              subseriesId:
                "subseriesId" in patch ? patch.subseriesId : subseriesId,
              seasonId: "seasonId" in patch ? patch.seasonId : seasonId,
              section: patch.section ?? section,
              overviewTab: patch.overviewTab ?? overviewTab,
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="series-module">
      <ModuleTopBar
        media={media}
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={[
          {
            id: "home",
            label: "HOME",
            active: tab === "home",
            onClick: () => {
              setTab("home");
              pushSeriesRootRoute();
              onNavigate({
                franchiseId: undefined,
                subseriesId: undefined,
                seasonId: undefined,
                section: "overview",
              });
            },
          },
          {
            id: "catalog",
            label: "CATALOG",
            active: tab === "catalog",
            onClick: () => {
              setTab("catalog");
              pushSeriesCatalogRoute();
              onNavigate({
                franchiseId: undefined,
                subseriesId: undefined,
                seasonId: undefined,
                section: "overview",
              });
            },
          },
        ]}
        menu={
          <>
            {busy ? (
              <span className="status-bar module-top-bar__status">{busy}</span>
            ) : null}
            {tab === "catalog" ? (
              <CatalogScopeToggle
                value={catalogScope}
                onChange={setCatalogScope}
              />
            ) : null}
            {tab === "catalog" && onSetOrientation ? (
              <CardOrientationPicker
                value={cardOrientation}
                onChange={onSetOrientation}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
            />
          </>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      {tab === "home" ? (
        <div className="music-module__body music-module__body--home">
          <SeriesHome
            data={dashboard}
            loading={dashLoading}
            onOpenEpisode={openEpisode}
            onFranchise={(id) => {
              const card = franchises.find((f) => f.id === id);
              openFranchise(
                id,
                undefined,
                card
                  ? { name: card.name, cover_url: card.cover_url }
                  : undefined
              );
            }}
            onGenre={() => {
              setTab("catalog");
              pushSeriesCatalogRoute();
              setFilterMode("genre");
            }}
            onCountry={() => {
              setTab("catalog");
              pushSeriesCatalogRoute();
              setFilterMode("country");
            }}
          />
        </div>
      ) : (
        <SeriesBrowse
          franchises={franchises}
          orientation={cardOrientation}
          filterMode={filterMode}
          filterOptions={filterOptions}
          catalogScope={catalogScope}
          search={search}
          letter={letter}
          continentId={continentId}
          countryId={countryId}
          startDecade={startDecade}
          endDecade={endDecade}
          subgenreId={subgenreId}
          publisher={publisher}
          writer={writer}
          loading={loading}
          onSearchChange={setSearch}
          onLetterChange={setLetter}
          onFilterModeChange={(m) => {
            setFilterMode(m);
            setLetter("");
            setContinentId("");
            setCountryId("");
            setStartDecade("");
            setEndDecade("");
            setSubgenreId("");
            setPublisher("");
            setWriter("");
          }}
          onContinentIdChange={setContinentId}
          onCountryIdChange={setCountryId}
          onStartDecadeChange={setStartDecade}
          onEndDecadeChange={setEndDecade}
          onSubgenreIdChange={setSubgenreId}
          onPublisherChange={setPublisher}
          onWriterChange={setWriter}
          onOpen={(id, nextSubseriesId, shell) =>
            openFranchise(id, nextSubseriesId, shell)
          }
        />
      )}
    </div>
  );
}
