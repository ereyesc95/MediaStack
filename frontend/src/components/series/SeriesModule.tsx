import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSeriesCatalog,
  fetchSeriesDashboard,
  fetchSeriesFilterOptions,
  fetchUniverses,
  resolveMoviesPath,
} from "../../api";
import { getMediaEntrySource, setMediaEntrySource } from "../../mediaEntry";
import {
  catalogBackgroundIso,
  catalogBackgroundUrl,
} from "../../catalogBackdrop";
import { clearMediaTheme } from "../../mediaTheme";
import {
  clearSeriesEntryReferrer,
  getSeriesEntryReferrer,
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
  Universe,
} from "../../types";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../usePhoneLayout";
import AddToUniverseModal from "../AddToUniverseModal";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import { IconMediaSeries, IconSeriesScope, IconUniverse } from "../MenuIcons";
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
  universeId?: number;
  onNavigate: (patch: {
    franchiseId?: string;
    subseriesId?: string;
    seasonId?: string;
    section?: SeriesSection;
    overviewTab?: SeriesOverviewTab;
    universeId?: number;
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
  onOpenMoviesFranchise?: (
    franchiseId: string,
    filmId?: string,
    section?: string,
    universeId?: number
  ) => void;
  onOpenUniversePage?: (
    universeId: number,
    from: "home" | "catalog"
  ) => void;
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
  universeId,
  onNavigate,
  onOpenMusicRelease,
  onOpenArtist,
  onOpenMoviesFranchise,
  onOpenUniversePage,
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
  const [catalogScope, setCatalogScope] = useState<"franchises" | "shows" | "universes">(
    "franchises"
  );
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [addUniverseOpen, setAddUniverseOpen] = useState(false);
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
  /** Where the user entered the franchise/subseries from. */
  const [entrySource, setEntrySource] = useState<"home" | "catalog">("catalog");

  const backgroundIso = useMemo(
    () => catalogBackgroundIso(filterMode, countryId, filterOptions),
    [filterMode, countryId, filterOptions]
  );
  const backgroundUrl = useMemo(
    () =>
      catalogBackgroundUrl(filterMode, {
        continentId,
        subgenreId,
        startDecade,
        endDecade,
        filterOptions,
      }),
    [
      filterMode,
      continentId,
      subgenreId,
      startDecade,
      endDecade,
      filterOptions,
    ]
  );
  const moduleBackdrop =
    tab === "catalog" &&
    !franchiseId &&
    Boolean(backgroundUrl || backgroundIso);

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
      const [dash, uni] = await Promise.all([
        fetchSeriesDashboard(),
        fetchUniverses().catch(() => ({ universes: [] as Universe[] })),
      ]);
      setDashboard(dash);
      setUniverses(uni.universes || []);
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
    if (universeId != null) {
      setEntrySource(getMediaEntrySource());
    }
  }, [universeId]);

  useEffect(() => {
    void loadCatalog();
    void loadDashboard();
    void loadFilters();
  }, [loadCatalog, loadDashboard, loadFilters]);

  const openUniverseLanding = useCallback(
    (id: number, from: "home" | "catalog" = "catalog") => {
      setMediaEntrySource(from);
      setEntrySource(from);
      onOpenUniversePage?.(id, from);
    },
    [onOpenUniversePage]
  );

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

  const openFranchise = (
    id: string,
    nextSubseriesId?: string,
    shellHint?: SeriesFranchiseShell | null,
    from: "home" | "catalog" = "catalog"
  ) => {
    setMediaEntrySource(from);
    setEntrySource(from);
    if (shellHint) setFranchiseShell(shellHint);
    setTab("catalog");
    const card = franchises.find((f) => f.id === id);
    const standaloneId =
      nextSubseriesId == null &&
      card?.is_standalone &&
      card.primary_subseries_id
        ? card.primary_subseries_id
        : nextSubseriesId;
    onNavigate({
      franchiseId: id,
      subseriesId: standaloneId,
      seasonId: undefined,
      section: "overview",
    });
  };

  const backToHome = () => {
    clearMediaTheme(userId);
    setFranchiseShell(null);
    setTab("home");
    pushSeriesRootRoute(true);
    onNavigate({
      franchiseId: undefined,
      subseriesId: undefined,
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

  const backFromFranchise = () => {
    const from = getMediaEntrySource() || entrySource;
    if (universeId != null) {
      onOpenUniversePage?.(universeId, from);
      return;
    }
    if (from === "home") {
      backToHome();
      return;
    }
    backToCatalog();
  };

  const backFromDeepLink = () => {
    const ref = getSeriesEntryReferrer();
    if (ref?.kind === "movies" && ref.franchiseId && onOpenMoviesFranchise) {
      clearSeriesEntryReferrer();
      onOpenMoviesFranchise(ref.franchiseId, ref.filmId, ref.section || "series");
      return;
    }
    backFromFranchise();
  };

  const backFromSubseries = () => {
    const ref = getSeriesEntryReferrer();
    if (ref?.kind === "movies" && ref.franchiseId && onOpenMoviesFranchise) {
      clearSeriesEntryReferrer();
      onOpenMoviesFranchise(ref.franchiseId, ref.filmId, ref.section || "series");
      return;
    }
    const from = getMediaEntrySource() || entrySource;
    if (universeId != null) {
      onOpenUniversePage?.(universeId, from);
      return;
    }
    // Synthetics still have one subseries — use is_standalone, not empty subseries list.
    const card = franchises.find((f) => f.id === franchiseId);
    const isStandaloneLeaf = Boolean(card?.is_standalone);
    if (isStandaloneLeaf) {
      if (from === "home") backToHome();
      else backToCatalog();
      return;
    }
    onNavigate({
      franchiseId,
      subseriesId: undefined,
      seasonId: undefined,
      section: "overview",
      overviewTab: "about",
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
          overviewTab={overviewTab}
          universeId={universeId}
          busy={busy}
          isAdmin={isAdmin}
          userId={userId}
          cardOrientation={cardOrientation}
          onSetOrientation={onSetOrientation}
          onOpenRelatedLocal={(it) => {
            const title = (it.title || it.name || "").trim().toLowerCase();
            if (!title) return false;
            for (const f of franchises) {
              if ((f.name || "").trim().toLowerCase() === title) {
                onNavigate({
                  franchiseId: f.id,
                  subseriesId: undefined,
                  seasonId: undefined,
                  section: "overview",
                  overviewTab: "about",
                });
                return true;
              }
              const hit = (f.subseries || []).find(
                (s) => (s.title || "").trim().toLowerCase() === title
              );
              if (hit) {
                onNavigate({
                  franchiseId: f.id,
                  subseriesId: hit.id,
                  seasonId: undefined,
                  section: "overview",
                  overviewTab: "about",
                });
                return true;
              }
            }
            return false;
          }}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          onBack={() => {
            const from = getMediaEntrySource() || entrySource;
            if (universeId != null) {
              onOpenUniversePage?.(universeId, from);
              return;
            }
            backFromSubseries();
          }}
          backLabelOverride={
            universeId != null
              ? "UNIVERSE"
              : Boolean(
                    franchises.find((f) => f.id === franchiseId)?.is_standalone
                  )
                ? (getMediaEntrySource() || entrySource) === "home"
                  ? "HOME"
                  : "CATALOG"
                : undefined
          }
          onBrowseCatalog={browseCatalog}
          onOpenMusicRelease={openMusicRelease}
          onOpenArtist={onOpenArtist}
          onOpenMoviesPath={(path) => {
            void resolveMoviesPath(path)
              .then((hit) => {
                onOpenMoviesFranchise?.(hit.work_id, hit.film_id ?? undefined);
              })
              .catch(() => {
                /* fall through — keep series movies tab usable offline */
              });
          }}
          onOpenUniverseLeaf={(leaf) => {
            if (leaf.module === "movies") {
              onOpenMoviesFranchise?.(
                leaf.franchiseId,
                leaf.leafId,
                "overview",
                universeId
              );
              return;
            }
            onNavigate({
              franchiseId: leaf.franchiseId,
              subseriesId:
                leaf.leafId === leaf.franchiseId ? undefined : leaf.leafId,
              seasonId: undefined,
              section: "overview",
              overviewTab: "about",
              universeId,
            });
          }}
          onOpenUniverseParent={() => {
            if (universeId == null) return;
            onOpenUniversePage?.(
              universeId,
              getMediaEntrySource() || entrySource
            );
          }}
          onNavigate={(patch) => {
            const nextSub =
              "subseriesId" in patch ? patch.subseriesId : subseriesId;
            const nextUniverse =
              "universeId" in patch ? patch.universeId : universeId;
            onNavigate({
              franchiseId:
                "franchiseId" in patch && patch.franchiseId
                  ? patch.franchiseId
                  : franchiseId,
              subseriesId: nextSub,
              seasonId: "seasonId" in patch ? patch.seasonId : seasonId,
              section: patch.section ?? section,
              overviewTab:
                "overviewTab" in patch && patch.overviewTab != null
                  ? patch.overviewTab
                  : nextUniverse != null && !nextSub
                    ? "related"
                    : overviewTab,
              universeId: nextUniverse,
            });
          }}
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
          universeId={universeId}
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
          onBack={backFromDeepLink}
          backLabel={
            universeId != null
              ? "UNIVERSE"
              : entrySource === "home"
                ? "HOME"
                : "CATALOG"
          }
          menuExtra={
            isAdmin ? (
              <button type="button" onClick={() => setAddUniverseOpen(true)}>
                <IconUniverse className="menu-item-icon" />
                Add to universe
              </button>
            ) : null
          }
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
                : undefined,
              "catalog"
            );
          }}
          onBrowseCatalog={browseCatalog}
          onOpenMusicRelease={openMusicRelease}
          onOpenArtist={onOpenArtist}
          onOpenMoviesPath={(path) => {
            void resolveMoviesPath(path)
              .then((hit) => {
                onOpenMoviesFranchise?.(hit.work_id, hit.film_id ?? undefined);
              })
              .catch(() => {
                /* fall through — keep series movies tab usable offline */
              });
          }}
          onOpenMoviesFranchise={(fid, filmId, uid) => {
            onOpenMoviesFranchise?.(fid, filmId, "overview", uid);
          }}
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
              franchiseId:
                "franchiseId" in patch && patch.franchiseId
                  ? patch.franchiseId
                  : franchiseId,
              subseriesId:
                "subseriesId" in patch ? patch.subseriesId : subseriesId,
              seasonId: "seasonId" in patch ? patch.seasonId : seasonId,
              section: patch.section ?? section,
              overviewTab: patch.overviewTab ?? overviewTab,
              universeId:
                "universeId" in patch ? patch.universeId : universeId,
            })
          }
        />
        {addUniverseOpen && isAdmin ? (
          <AddToUniverseModal
            module="series"
            franchiseId={franchiseId}
            onClose={() => setAddUniverseOpen(false)}
            onSaved={() => {
              setAddUniverseOpen(false);
              /* overview reload via franchise remount key not needed — modal closes */
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`series-module${
        moduleBackdrop ? " music-module--backdrop" : ""
      }`}
    >
      {moduleBackdrop ? (
        <div className="music-module__backdrop" aria-hidden>
          {backgroundIso ? (
            <span
              className={`music-module__backdrop-flag fi fi-${backgroundIso}`}
            />
          ) : backgroundUrl ? (
            <div
              className="music-module__backdrop-image"
              style={{ backgroundImage: `url(${backgroundUrl})` }}
            />
          ) : null}
          <div className="music-module__backdrop-overlay" />
        </div>
      ) : null}
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
                hasUniverses={universes.length > 0}
              />
            ) : null}
            {tab === "catalog" && onSetOrientation ? (
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
                  <button
                    type="button"
                    onClick={() => {
                      const order: Array<"franchises" | "shows" | "universes"> =
                        universes.length > 0
                          ? ["franchises", "shows", "universes"]
                          : ["franchises", "shows"];
                      const current =
                        catalogScope === "universes" && universes.length === 0
                          ? "franchises"
                          : catalogScope;
                      const i = Math.max(0, order.indexOf(current));
                      setCatalogScope(order[(i + 1) % order.length]!);
                    }}
                  >
                    {catalogScope === "franchises" ? (
                      <IconSeriesScope className="menu-item-icon" />
                    ) : catalogScope === "universes" ? (
                      <IconUniverse className="menu-item-icon" />
                    ) : (
                      <IconMediaSeries className="menu-item-icon" />
                    )}
                    {catalogScope === "franchises"
                      ? "Groups"
                      : catalogScope === "universes"
                        ? "Universes"
                        : "Shows"}
                  </button>
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
            universes={universes}
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
                  : undefined,
                "home"
              );
            }}
            onOpenShow={(franchiseId, subseriesId) => {
              const card = franchises.find((f) => f.id === franchiseId);
              openFranchise(
                franchiseId,
                subseriesId || undefined,
                card
                  ? {
                      name: card.name,
                      cover_url: card.cover_url,
                      logo_url: card.logo_url,
                      icon_url: card.icon_url,
                    }
                  : undefined,
                "home"
              );
            }}
            onOpenUniverse={(id) => openUniverseLanding(id, "home")}
            onGenre={(id) => {
              setTab("catalog");
              pushSeriesCatalogRoute();
              setFilterMode("genre");
              setContinentId("");
              setCountryId("");
              setStartDecade("");
              setEndDecade("");
              const numeric =
                typeof id === "number"
                  ? id
                  : typeof id === "string" && /^\d+$/.test(id)
                    ? Number(id)
                    : "";
              setSubgenreId(numeric === "" || Number.isNaN(numeric) ? "" : numeric);
            }}
            onCountry={(c) => {
              setTab("catalog");
              pushSeriesCatalogRoute();
              setFilterMode("country");
              setContinentId("");
              setSubgenreId("");
              setStartDecade("");
              setEndDecade("");
              setCountryId(c.id ?? "");
            }}
          />
        </div>
      ) : (
        <SeriesBrowse
          franchises={franchises}
          universes={universes}
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
          onOpenUniverse={(id) => openUniverseLanding(id, "catalog")}
          onOpen={(id, nextSubseriesId, shell) =>
            openFranchise(id, nextSubseriesId, shell)
          }
        />
      )}
    </div>
  );
}
