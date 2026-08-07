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
import type { Universe, UniverseCard, UniverseHub } from "../types";
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
import { getStoredReleaseCardLayout } from "../themes";
import AppMenu from "./AppMenu";
import MyStackIcon from "./MyStackIcon";
import PlaylistBoot from "./PlaylistBoot";
import UniverseAboutEditModal from "./UniverseAboutEditModal";
import UniverseAddMemberModal from "./UniverseAddMemberModal";
import MediaBeatFx from "./music/MediaBeatFx";
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
};

function bioParagraphs(bio: string): string[] {
  const text = bio.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const parts = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

function toMediaCard(c: UniverseCard): SeriesMediaCard {
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
    universe_module: c.module,
    universe_franchise_id: c.franchise_id,
    universe_leaf_id: c.leaf_id || c.id,
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
  const [cardLayout] = useState(() =>
    userId ? getStoredReleaseCardLayout(userId) : "cover"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUniverseHub(universeId);
      setHub(data);
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

  useEffect(() => {
    setLogoFailed(false);
  }, [universeId, hub?.universe?.logo_url]);

  const universe = hub?.universe;
  const title = universe?.name || "Universe";

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

  const navSections = useMemo(() => {
    const items: { id: UniverseSection; label: string; mobileLabel?: string }[] =
      [{ id: "overview", label: "OVERVIEW", mobileLabel: "INFO" }];
    if (hub?.media.has_series || seriesCards.length > 0) {
      items.push({ id: "series", label: "SERIES" });
    }
    if (hub?.media.has_movies || movieCards.length > 0) {
      items.push({ id: "movies", label: "MOVIES" });
    }
    return items;
  }, [hub?.media, seriesCards.length, movieCards.length]);

  useEffect(() => {
    if (section === "series" && seriesCards.length === 0 && hub && !loading) {
      onNavigate({ section: "overview", overviewTab: "about" });
    } else if (
      section === "movies" &&
      movieCards.length === 0 &&
      hub &&
      !loading
    ) {
      onNavigate({ section: "overview", overviewTab: "about" });
    }
  }, [
    section,
    seriesCards.length,
    movieCards.length,
    hub,
    loading,
    onNavigate,
  ]);

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

  const paragraphs = bioParagraphs(universe?.overview || "");
  const heroUrl = stacked
    ? universe?.landscape_url || universe?.banner_url || universe?.cover_url
    : universe?.portrait_url || universe?.cover_url || universe?.banner_url;

  function openCard(card: SeriesMediaCard) {
    const franchiseId = card.universe_franchise_id;
    const leafId = card.universe_leaf_id || card.id;
    if (!franchiseId) return;
    if (card.universe_module === "series") {
      onOpenSeriesLeaf(franchiseId, leafId);
      return;
    }
    onOpenMoviesLeaf(franchiseId, leafId);
  }

  function onUniverseSaved(next: Universe) {
    setHub((prev) =>
      prev
        ? {
            ...prev,
            universe: { ...prev.universe, ...next },
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
            {universe?.logo_url && !logoFailed ? (
              <img
                className="artist-page__brand-logo"
                src={universe.logo_url}
                alt={title}
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="artist-page__brand-name">{title}</span>
            )}
          </div>
          <div className="artist-page__top-right">
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="release"
              editDataLabel="Update universe"
              editDataFlat
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
              <span className="artist-page__section-label-full">{s.label}</span>
              {s.mobileLabel ? (
                <span className="artist-page__section-label-mobile">
                  {s.mobileLabel}
                </span>
              ) : (
                <span className="artist-page__section-label-mobile">
                  {s.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        {section === "overview" ? (
          <nav className="artist-page__subtabs" aria-label="Overview">
            <button type="button" className="active">
              ABOUT
            </button>
          </nav>
        ) : null}
      </div>

      <div className="artist-page__body">
        {busy ? <p className="muted artist-section-empty">{busy}</p> : null}
        {loading && !hub ? (
          <PlaylistBoot className="playlist-boot--compact" label="Loading universe…" />
        ) : null}
        {error ? <p className="error artist-section-empty">{error}</p> : null}

        {hub && section === "overview" && overviewTab === "about" ? (
          <div
            className={`artist-about${stacked ? " artist-about--stacked" : ""}`}
          >
            {heroUrl ? (
              <div className="artist-about__carousel">
                <div
                  className="artist-about__slide"
                  style={
                    { backgroundImage: `url("${heroUrl}")` } as CSSProperties
                  }
                />
              </div>
            ) : null}
            <div className="artist-about__bio-block">
              <div className="artist-about__bio-scroll">
                {paragraphs.length ? (
                  paragraphs.map((p, i) => (
                    <p key={i} className="artist-about__bio">
                      {p}
                    </p>
                  ))
                ) : (
                  <p className="artist-about__bio muted">
                    No overview yet. Use Edit data → Update universe to add one.
                  </p>
                )}
              </div>
            </div>
          </div>
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
          existing={[...(hub?.series || []), ...(hub?.movies || [])]}
          onClose={() => setAddMemberOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
