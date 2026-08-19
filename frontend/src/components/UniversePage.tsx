import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { fetchUniverseHub, pullUniverseTmdbPortrait } from "../api";
import {
  applyMediaTheme,
  beginArtistPageSession,
  colorsFromImageUrl,
  isPlaybackThemeActive,
} from "../mediaTheme";
import {
  getUniverseReturnTarget,
  setUniverseReturnTarget,
} from "../mediaEntry";
import type {
  ReleaseCardLayout,
  SeriesOverview,
  SeriesSubseriesCard,
  Universe,
  UniverseCard,
  UniverseHub,
} from "../types";
import {
  pushUniverseRoute,
  type UniverseOverviewTab,
  type UniverseSection,
} from "../universeRoute";
import {
  isMobileLandscapeLayout,
  isMobilePortraitLayout,
  isTabletLayout,
  useDeviceLayout,
} from "../usePhoneLayout";
import { getStoredReleaseCardLayout, saveReleaseCardLayout } from "../themes";
import AppMenu from "./AppMenu";
import { IconCardBanner, IconCardCover } from "./MenuIcons";
import MyStackIcon from "./MyStackIcon";
import PlaylistBoot from "./PlaylistBoot";
import ReleaseCardLayoutPicker from "./ReleaseCardLayoutPicker";
import UniverseAboutEditModal from "./UniverseAboutEditModal";
import UniverseAddMemberModal from "./UniverseAddMemberModal";
import MediaBeatFx from "./music/MediaBeatFx";
import SeriesAbout from "./series/SeriesAbout";
import SeriesGalleryPanel from "./series/SeriesGalleryPanel";
import SeriesMediaGrid, { type SeriesMediaCard } from "./series/SeriesMediaGrid";

type Props = {
  universeId: number;
  section?: UniverseSection;
  overviewTab?: UniverseOverviewTab;
  busy?: string;
  isAdmin?: boolean;
  userId?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onBack: () => void;
  backLabel: string;
  onNavigate: (patch: {
    section?: UniverseSection;
    overviewTab?: UniverseOverviewTab;
  }) => void;
  onOpenSeriesLeaf: (franchiseId: string, subseriesId: string) => void;
  onOpenMoviesLeaf: (franchiseId: string, filmId: string) => void;
  onOpenBooksLeaf: (franchiseId: string, bookId: string) => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
  onOpenMoviesFranchise?: (franchiseId: string) => void;
  onOpenBooksFranchise?: (franchiseId: string) => void;
  onBrowseCatalog?: (target: {
    mode: "name" | "genre" | "country" | "publisher" | "writer";
    countryId?: number;
    subgenreId?: number;
    publisher?: string;
    writer?: string;
  }) => void;
};

function toMediaCard(c: UniverseCard): SeriesMediaCard {
  const openUrl = c.open_url || c.file_url || null;
  return {
    id: String(c.leaf_id || c.id || c.franchise_id),
    title: c.title || c.name || c.leaf_id || c.franchise_id,
    cover_url: c.cover_url,
    portrait_url: c.portrait_url || c.cover_url,
    landscape_url: c.landscape_url,
    banner_url: c.banner_url,
    logo_url: c.logo_url,
    date_iso: c.date_iso,
    display_date: c.display_date,
    date_label: c.display_date || c.date_iso || null,
    open_url: openUrl,
    open_mode: openUrl ? (c.open_mode || "local") : null,
    open_label:
      c.open_label || (openUrl ? "Play video" : null),
    universe_module: c.module,
    universe_franchise_id: c.franchise_id,
    universe_leaf_id: c.leaf_id || c.id,
  };
}

function emptyOverview(name: string): SeriesOverview {
  return {
    id: "universe",
    name,
    letter: (name || "?").slice(0, 1).toUpperCase(),
    folder_path: "",
    cover_url: null,
    bio: null,
    writers: [],
    aliases: [],
    languages: [],
    activity_periods: [],
    genres: [],
    publishers: [],
    eras: [],
    cast: { characters: [], staff: [] },
    media: {
      has_audio: false,
      has_series: false,
      has_movies: false,
      has_books: false,
      has_library: false,
      has_games: false,
      has_gallery: false,
    },
    links: { categories: [], groups: {}, total: 0 },
    subseries: [],
    seasons: [],
    related: {
      movies: [],
      books: [],
      series: [],
      games: [],
      music: [],
    },
  };
}

export default function UniversePage({
  universeId,
  section = "overview",
  overviewTab = "about",
  busy,
  isAdmin = false,
  userId,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onBack,
  backLabel,
  onNavigate,
  onOpenSeriesLeaf,
  onOpenMoviesLeaf,
  onOpenBooksLeaf,
  onOpenSeriesFranchise,
  onOpenMoviesFranchise,
  onOpenBooksFranchise,
  onBrowseCatalog,
}: Props) {
  const layout = useDeviceLayout();
  const mobilePortrait = isMobilePortraitLayout(layout);
  const mobileLandscape = isMobileLandscapeLayout(layout);
  const tabletLayout = isTabletLayout(layout);
  const stacked = mobilePortrait || layout === "tablet-portrait";

  const [hub, setHub] = useState<UniverseHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [metadataFetching, setMetadataFetching] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [eraIndex, setEraIndex] = useState(0);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [gallerySectionKey, setGallerySectionKey] = useState("all");
  const [cardLayout, setCardLayout] = useState<ReleaseCardLayout>(() =>
    userId ? getStoredReleaseCardLayout(userId) : "cover"
  );
  const setCardLayoutPersisted = useCallback(
    (next: ReleaseCardLayout) => {
      setCardLayout(next);
      if (userId) saveReleaseCardLayout(userId, next);
    },
    [userId]
  );
  useEffect(() => {
    if (userId) setCardLayout(getStoredReleaseCardLayout(userId));
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUniverseHub(universeId);
      setHub(data);
      const name = data.universe?.name;
      if (name) {
        const prev = getUniverseReturnTarget();
        setUniverseReturnTarget({
          ...prev,
          universeId,
          universeName: name,
        });
      }
      const langs = data.overview?.languages || [];
      setActiveLanguage(langs[0] || null);
      setEraIndex(0);
    } catch (e) {
      setHub(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [universeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const universe = hub?.universe;
  const overview = hub?.overview;
  const title = universe?.name || overview?.name || "Universe";

  const displayLogoUrl = useMemo(() => {
    if (!overview) return universe?.logo_url || null;
    const byLang = overview.logo_by_language;
    if (activeLanguage && byLang) {
      const want = activeLanguage.toLowerCase();
      if (byLang[activeLanguage]) return byLang[activeLanguage];
      const key = Object.keys(byLang).find((k) => k.toLowerCase() === want);
      if (key) return byLang[key];
    }
    return overview.logo_url || byLang?.default || universe?.logo_url || null;
  }, [overview, activeLanguage, universe?.logo_url]);

  useEffect(() => {
    setLogoFailed(false);
  }, [universeId, displayLogoUrl]);

  const bgUrl =
    universe?.banner_url ||
    universe?.landscape_url ||
    universe?.cover_url ||
    universe?.portrait_url ||
    null;

  useEffect(() => {
    if (!userId || !bgUrl) return;
    beginArtistPageSession(userId);
    if (isPlaybackThemeActive()) return;
    let cancelled = false;
    void colorsFromImageUrl(bgUrl).then((colors) => {
      if (cancelled || !colors) return;
      applyMediaTheme(colors, userId);
    });
    return () => {
      cancelled = true;
    };
  }, [bgUrl, userId]);

  useEffect(() => {
    pushUniverseRoute(
      {
        universeId,
        section,
        overviewTab: section === "overview" ? overviewTab : undefined,
      },
      true
    );
  }, [universeId, section, overviewTab]);

  const seriesCards = useMemo(
    () => (hub?.series || []).map(toMediaCard),
    [hub?.series]
  );
  const movieCards = useMemo(
    () => (hub?.movies || []).map(toMediaCard),
    [hub?.movies]
  );
  const bookCards = useMemo(
    () => (hub?.books || []).map(toMediaCard),
    [hub?.books]
  );
  const audioCards = useMemo(
    () =>
      (hub?.carousel || [
        ...(hub?.series || []),
        ...(hub?.movies || []),
        ...(hub?.books || []),
      ]).map(toMediaCard),
    [hub?.carousel, hub?.series, hub?.movies, hub?.books]
  );

  const galleryFolders = useMemo(() => {
    const fromOverview = (
      overview as (SeriesOverview & { gallery_folder_paths?: string[] }) | undefined
    )?.gallery_folder_paths;
    if (fromOverview?.length) return fromOverview;
    return (hub?.carousel || [])
      .map((c) => (c as UniverseCard & { folder_path?: string }).folder_path)
      .filter((p): p is string => Boolean(p));
  }, [overview, hub?.carousel]);

  const media = hub?.media;
  const navSections = useMemo(() => {
    const items: { id: UniverseSection; label: string; mobileLabel?: string }[] =
      [{ id: "overview", label: "OVERVIEW", mobileLabel: "INFO" }];
    if (media?.has_movies || movieCards.length > 0) {
      items.push({ id: "movies", label: "MOVIES" });
    }
    if (media?.has_books || bookCards.length > 0) {
      items.push({ id: "books", label: "BOOKS" });
    }
    if (media?.has_series || seriesCards.length > 0) {
      items.push({ id: "series", label: "SERIES" });
    }
    if (media?.has_audio) {
      items.push({ id: "audio", label: "AUDIO" });
    }
    if (media?.has_gallery) {
      items.push({ id: "gallery", label: "GALLERY", mobileLabel: "ART" });
    }
    return items;
  }, [media, seriesCards.length, movieCards.length, bookCards.length]);

  useEffect(() => {
    if (!hub || loading) return;
    const allowed = new Set(navSections.map((s) => s.id));
    if (!allowed.has(section)) {
      onNavigate({ section: "overview", overviewTab: "about" });
    }
  }, [hub, loading, section, navSections, onNavigate]);

  const pageClass = [
    "artist-page",
    "universe-page",
    stacked ? "artist-page--stacked artist-page--mobile-portrait" : "",
    mobileLandscape ? "artist-page--mobile-landscape" : "",
    tabletLayout && !stacked ? "artist-page--tablet-landscape" : "",
    !stacked && !mobileLandscape && !tabletLayout ? "artist-page--desktop" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const aboutData = overview || emptyOverview(title);
  const logosSwitchable = Boolean(
    aboutData.logos_switchable ||
      (aboutData.logo_by_language &&
        Object.keys(aboutData.logo_by_language).length > 1)
  );

  function openCard(card: SeriesMediaCard) {
    const franchiseId = card.universe_franchise_id;
    const leafId = card.universe_leaf_id || card.id;
    if (!franchiseId) return;
    if (card.universe_module === "series") {
      onOpenSeriesLeaf(franchiseId, leafId);
      return;
    }
    if (card.universe_module === "books") {
      onOpenBooksLeaf(franchiseId, leafId);
      return;
    }
    onOpenMoviesLeaf(franchiseId, leafId);
  }

  function openSubseries(sub: SeriesSubseriesCard) {
    const franchiseId = sub.franchise_id || sub.id;
    if (!franchiseId) return;
    if (sub.module === "series") {
      if (onOpenSeriesFranchise) onOpenSeriesFranchise(franchiseId);
      else onOpenSeriesLeaf(franchiseId, franchiseId);
      return;
    }
    if (sub.module === "books") {
      if (onOpenBooksFranchise) onOpenBooksFranchise(franchiseId);
      else onOpenBooksLeaf(franchiseId, franchiseId);
      return;
    }
    if (onOpenMoviesFranchise) onOpenMoviesFranchise(franchiseId);
    else onOpenMoviesLeaf(franchiseId, franchiseId);
  }

  function onUniverseSaved(next: Universe) {
    setHub((prev) =>
      prev
        ? {
            ...prev,
            universe: { ...prev.universe, ...next },
            overview: prev.overview
              ? {
                  ...prev.overview,
                  name: next.name || prev.overview.name,
                  bio: next.overview ?? prev.overview.bio,
                  logo_url: next.logo_url ?? prev.overview.logo_url,
                  cover_url: next.cover_url ?? prev.overview.cover_url,
                }
              : prev.overview,
          }
        : prev
    );
  }

  return (
    <div className={pageClass}>
      <div className="artist-page__bg-stack" aria-hidden="true">
        {bgUrl ? (
          <div
            className="artist-page__bg artist-page__bg--visible"
            style={
              { backgroundImage: `url("${bgUrl}")` } as CSSProperties
            }
          />
        ) : null}
        <MediaBeatFx />
      </div>

      <div className="artist-page__chrome">
        <header className="artist-page__top">
          <div className="artist-page__top-left">
            <button
              type="button"
              className="artist-page__catalog-back"
              onClick={onBack}
              aria-label={`Back to ${backLabel.toLowerCase()}`}
            >
              <svg
                className="artist-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M15 18l-6-6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="artist-page__catalog-label">{backLabel}</span>
            </button>
          </div>
          <div className="artist-page__top-center">
            {displayLogoUrl && !logoFailed ? (
              <img
                className="artist-page__brand-logo"
                src={displayLogoUrl}
                alt={title}
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="artist-page__brand-name">{title}</span>
            )}
          </div>
          <div className="artist-page__top-right">
            {!mobilePortrait &&
            (section === "movies" ||
              section === "books" ||
              section === "series" ||
              section === "audio") ? (
              <ReleaseCardLayoutPicker
                value={cardLayout}
                onChange={setCardLayoutPersisted}
              />
            ) : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              adaptiveThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="release"
              editDataLabel="Update universe"
              editDataFlat
              menuChrome={
                mobilePortrait &&
                (section === "movies" ||
                  section === "books" ||
                  section === "series" ||
                  section === "audio") ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCardLayoutPersisted(
                        cardLayout === "cover" ? "banner" : "cover"
                      )
                    }
                  >
                    {cardLayout === "cover" ? (
                      <IconCardCover className="menu-item-icon" />
                    ) : (
                      <IconCardBanner className="menu-item-icon" />
                    )}
                    {cardLayout === "cover" ? "Cover view" : "Banner view"}
                  </button>
                ) : null
              }
              onAddToUniverse={
                isAdmin ? () => setAddMemberOpen(true) : undefined
              }
              addToUniverseLabel="Add member"
              onEditAbout={isAdmin ? () => setEditOpen(true) : undefined}
              onRefreshMetadata={
                isAdmin
                  ? () => {
                      setMetadataFetching(true);
                      void pullUniverseTmdbPortrait(universeId)
                        .then((next) => {
                          onUniverseSaved(next);
                          return load();
                        })
                        .catch((e) =>
                          setError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                        .finally(() => setMetadataFetching(false));
                    }
                  : undefined
              }
            />
          </div>
        </header>

        {metadataFetching ? (
          <div
            className="release-page__fetch-overlay"
            role="status"
            aria-live="polite"
          >
            <MyStackIcon
              className="release-page__fetch-overlay-logo"
              size={52}
            />
            <p className="release-page__fetch-overlay-msg">
              Fetching data, please wait...
            </p>
          </div>
        ) : null}

        <nav className="artist-page__sections" aria-label="Universe sections">
          {navSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "active" : ""}
              onClick={() =>
                onNavigate({
                  section: s.id,
                  overviewTab: s.id === "overview" ? "about" : overviewTab,
                })
              }
            >
              <span>
                {mobilePortrait && s.mobileLabel ? s.mobileLabel : s.label}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className="artist-page__body">
        {busy ? <p className="muted artist-section-empty">{busy}</p> : null}
        {loading && !hub ? (
          <PlaylistBoot className="playlist-boot--compact" label="Loading universe…" />
        ) : null}
        {error ? <p className="error artist-section-empty">{error}</p> : null}

        {hub && section === "overview" ? (
          <SeriesAbout
            data={aboutData}
            eraIndex={eraIndex}
            stacked={stacked}
            tapRevealSubs={false}
            onEraChange={setEraIndex}
            onOpenSubseries={openSubseries}
            photoNav={false}
            activeLanguage={activeLanguage}
            logosSwitchable={logosSwitchable}
            onLanguageSelect={setActiveLanguage}
            onGenre={(id) =>
              onBrowseCatalog?.({
                mode: "genre",
                subgenreId: typeof id === "number" ? id : undefined,
              })
            }
            onPublisher={(name) =>
              onBrowseCatalog?.({ mode: "publisher", publisher: name })
            }
            onWriter={(name) =>
              onBrowseCatalog?.({ mode: "writer", writer: name })
            }
          />
        ) : null}

        {hub && section === "series" ? (
          <SeriesMediaGrid
            items={seriesCards}
            loading={loading && seriesCards.length === 0}
            emptyMessage="No series in this universe yet."
            cardLayout={cardLayout}
            coverAspect="portrait"
            onOpen={openCard}
          />
        ) : null}

        {hub && section === "movies" ? (
          <SeriesMediaGrid
            items={movieCards}
            loading={loading && movieCards.length === 0}
            emptyMessage="No movies in this universe yet."
            cardLayout={cardLayout}
            coverAspect="portrait"
            onOpen={openCard}
          />
        ) : null}

        {hub && section === "books" ? (
          <SeriesMediaGrid
            items={bookCards}
            loading={loading && bookCards.length === 0}
            emptyMessage="No books in this universe yet."
            cardLayout={cardLayout}
            coverAspect="portrait"
            onOpen={openCard}
          />
        ) : null}

        {hub && section === "audio" ? (
          <SeriesMediaGrid
            items={audioCards}
            loading={loading && audioCards.length === 0}
            emptyMessage="No audio in this universe yet."
            cardLayout={cardLayout}
            squareCovers={cardLayout === "cover"}
            coverAspect="square"
            onOpen={openCard}
          />
        ) : null}

        {hub && section === "gallery" ? (
          (hub.gallery_items && hub.gallery_items.length) ||
          galleryFolders.length ? (
            <SeriesGalleryPanel
              presetItems={
                hub.gallery_items?.length ? hub.gallery_items : undefined
              }
              folderPaths={
                hub.gallery_items?.length ? undefined : galleryFolders
              }
              hideSubbar
              sectionKey={gallerySectionKey}
              onSectionKeyChange={setGallerySectionKey}
            />
          ) : (
            <p className="muted artist-section-empty">
              No gallery images found for this universe.
            </p>
          )
        ) : null}
      </div>

      {editOpen && universe ? (
        <UniverseAboutEditModal
          universe={universe}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            onUniverseSaved(next);
            void load();
          }}
        />
      ) : null}

      {addMemberOpen ? (
        <UniverseAddMemberModal
          universeId={universeId}
          existing={[
            ...(hub?.series || []),
            ...(hub?.movies || []),
            ...(hub?.books || []),
          ]}
          onClose={() => setAddMemberOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
