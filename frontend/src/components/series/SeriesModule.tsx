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
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import { IconCardBanner, IconMediaSeries, IconSeriesScope } from "../MenuIcons";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import CatalogScopeToggle from "./CatalogScopeToggle";
import SeriesBrowse from "./SeriesBrowse";
import SeriesFranchisePage, {
  type SeriesFranchiseShell,
} from "./SeriesFranchisePage";
import SeriesHome from "./SeriesHome";
import SeriesSubseriesPage, {
  type SeriesCatalogBrowseTarget,
} from "./SeriesSubseriesPage";

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
  onOpenMusicRelease?: (
    bandId: number,
    releaseId: string,
    seriesCtx?: {
      franchiseId: string;
      subseriesId?: string;
      franchiseName?: string;
      franchiseIconUrl?: string | null;
    }
  ) => void;
  onOpenArtist?: (bandId: number) => void;
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
  onOpenMusicRelease,
  onOpenArtist,
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
  const [letter, setLetter] = useState("A");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [publisher, setPublisher] = useState("");
  const [writer, setWriter] = useState("");

  const showModuleChrome = !franchiseId;
  const deviceLayout = useDeviceLayout();
  const portraitMenuChrome =
    isMobilePortraitLayout(deviceLayout) ||
    deviceLayout === "tablet-portrait";

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
        setFranchiseShell((prev) => ({
          name: card.name,
          cover_url: show.cover_url || card.cover_url,
          logo_url: prev?.logo_url || card.logo_url || null,
          icon_url: prev?.icon_url || card.icon_url || null,
        }));
        return;
      }
    }
    setFranchiseShell((prev) => ({
      name: card.name,
      cover_url: card.cover_url,
      logo_url: prev?.logo_url || card.logo_url || null,
      icon_url: prev?.icon_url || card.icon_url || null,
    }));
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

  const browseCatalog = (target: SeriesCatalogBrowseTarget) => {
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
    setFilterMode(target.mode);
    setSearch("");
    setLetter(target.mode === "name" ? "A" : "");
    setContinentId("");
    setCountryId(target.countryId ?? "");
    setStartDecade("");
    setEndDecade("");
    setSubgenreId(target.subgenreId ?? "");
    setPublisher(target.publisher ?? "");
    setWriter(target.writer ?? "");
  };

  const openMusicRelease = (bandId: number, releaseId: string) => {
    if (!onOpenMusicRelease) return;
    if (franchiseId) {
      onOpenMusicRelease(bandId, releaseId, {
        franchiseId,
        subseriesId,
        franchiseName: franchiseShell?.name,
        franchiseIconUrl: franchiseShell?.icon_url,
      });
      return;
    }
    onOpenMusicRelease(bandId, releaseId);
  };

  if (!showModuleChrome && franchiseId && subseriesId) {
    return (
      <div className="series-module">
        <SeriesSubseriesPage
          franchiseId={franchiseId}
          franchiseName={franchiseShell?.name}
          franchiseLogoUrl={franchiseShell?.logo_url}
          franchiseIconUrl={franchiseShell?.icon_url}
          subseriesId={subseriesId}
          seasonId={seasonId}
          section={section}
          busy={busy}
          isAdmin={isAdmin}
          userId={userId}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          onBack={() =>
            onNavigate({
              franchiseId,
              subseriesId: undefined,
              seasonId: undefined,
              section: "overview",
              overviewTab: "about",
            })
          }
          onBrowseCatalog={browseCatalog}
          onOpenMusicRelease={openMusicRelease}
          onOpenArtist={onOpenArtist}
          onNavigate={(patch) =>
            onNavigate({
              franchiseId,
              subseriesId:
                "subseriesId" in patch ? patch.subseriesId : subseriesId,
              seasonId: "seasonId" in patch ? patch.seasonId : seasonId,
              section: patch.section ?? section,
              overviewTab: overviewTab,
            })
          }
        />
      </div>
    );
  }

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
          franchises={franchises}
          busy={busy}
          isAdmin={isAdmin}
          userId={userId}
          cardOrientation={cardOrientation}
          onSetOrientation={onSetOrientation}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          onBack={backToCatalog}
          onOpenFranchise={(id) => {
            const card = franchises.find((f) => f.id === id);
            openFranchise(
              id,
              undefined,
              card
                ? {
                    name: card.name,
                    cover_url: card.cover_url,
                    logo_url: card.logo_url,
                    icon_url: card.icon_url,
                  }
                : undefined
            );
          }}
          onBrowseCatalog={browseCatalog}
          onOpenMusicRelease={openMusicRelease}
          onOpenArtist={onOpenArtist}
          onShellUpdate={(next) => {
            setFranchiseShell((prev) => {
              if (
                prev?.name === next.name &&
                prev?.cover_url === next.cover_url &&
                prev?.logo_url === next.logo_url &&
                prev?.icon_url === next.icon_url
              ) {
                return prev;
              }
              return next;
            });
          }}
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
            {tab === "catalog" && !portraitMenuChrome ? (
              <CatalogScopeToggle
                value={catalogScope}
                onChange={setCatalogScope}
              />
            ) : null}
            {tab === "catalog" && onSetOrientation && !portraitMenuChrome ? (
              <CardOrientationPicker
                value={cardOrientation}
                onChange={onSetOrientation}
                includeBadge
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
              menuChrome={
                portraitMenuChrome && tab === "catalog" ? (
                  <>
                    <button
                      type="button"
                      className={
                        catalogScope === "franchises" ? "is-active" : undefined
                      }
                      onClick={() => setCatalogScope("franchises")}
                    >
                      <IconSeriesScope className="menu-item-icon" />
                      Groups
                    </button>
                    <button
                      type="button"
                      className={
                        catalogScope === "shows" ? "is-active" : undefined
                      }
                      onClick={() => setCatalogScope("shows")}
                    >
                      <IconMediaSeries className="menu-item-icon" />
                      Shows
                    </button>
                    {onSetOrientation ? (
                      <button
                        type="button"
                        onClick={() => {
                          const order: CardOrientation[] = [
                            "banner",
                            "landscape",
                            "portrait",
                            "icons",
                            "badge",
                          ];
                          const i = order.indexOf(cardOrientation);
                          onSetOrientation(order[(i + 1) % order.length]!);
                        }}
                      >
                        <IconCardBanner className="menu-item-icon" />
                        Card layout: {cardOrientation}
                      </button>
                    ) : null}
                  </>
                ) : null
              }
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
                  ? {
                      name: card.name,
                      cover_url: card.cover_url,
                      logo_url: card.logo_url,
                      icon_url: card.icon_url,
                    }
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
            setSearch("");
            // Reset other filters; SeriesBrowse auto-selects the first subbar option.
            setLetter(m === "name" ? "A" : "");
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
