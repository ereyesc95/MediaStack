import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMoviesFranchiseAudio,
  fetchMoviesFranchiseGames,
  fetchMoviesFranchiseLibrary,
  fetchMoviesFranchiseOverview,
  fetchMoviesFranchiseSeries,
  fetchMoviesUniverses,
  linkMoviesUniverseMember,
  refreshMoviesUniverse,
  refreshMoviesWorkMetadata,
  unlinkMoviesUniverseMember,
} from "../../api";
import type {
  MoviesUniverse,
  SeriesCastTab,
  SeriesOverview,
  SeriesSubseriesCard,
} from "../../types";
import {
  pushMoviesRoute,
  type MoviesOverviewTab,
  type MoviesSection,
} from "../../moviesRoute";
import { usePhoneLayout } from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import ArtistCard from "../ArtistCard";
import PlaylistBoot from "../PlaylistBoot";
import SeriesAbout from "../series/SeriesAbout";
import SeriesCast from "../series/SeriesCast";
import SeriesGalleryPanel from "../series/SeriesGalleryPanel";
import SeriesLinks from "../series/SeriesLinks";
import SeriesMediaGrid, {
  type SeriesMediaCard,
} from "../series/SeriesMediaGrid";
import SeriesRelatedPanel, {
  type SeriesRelatedTab,
} from "../series/SeriesRelatedPanel";

type Props = {
  workId: string;
  section?: MoviesSection;
  overviewTab?: MoviesOverviewTab;
  isAdmin?: boolean;
  onBack: () => void;
  onNavigate: (patch: {
    franchiseId?: string;
    filmId?: string;
    section?: MoviesSection;
    overviewTab?: MoviesOverviewTab;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  userId?: number;
};

const OVERVIEW_TABS: { id: MoviesOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "cast", label: "CAST" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

type MediaCard = SeriesMediaCard & {
  navigate_franchise_id?: string;
  folder_path?: string;
};

export default function MoviesFranchisePage({
  workId,
  section = "overview",
  overviewTab = "about",
  isAdmin,
  onBack,
  onNavigate,
  onOpenSeriesFranchise,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  userId,
}: Props) {
  const stacked = usePhoneLayout();
  const [data, setData] = useState<SeriesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [eraIndex, setEraIndex] = useState(0);
  const [castTab, setCastTab] = useState<SeriesCastTab>("characters");
  const [relatedTab, setRelatedTab] = useState<SeriesRelatedTab>("creator");
  const [linkTab, setLinkTab] = useState("databases");
  const [seriesItems, setSeriesItems] = useState<MediaCard[]>([]);
  const [audioCards, setAudioCards] = useState<MediaCard[]>([]);
  const [libCards, setLibCards] = useState<MediaCard[]>([]);
  const [gameCards, setGameCards] = useState<MediaCard[]>([]);
  const [universes, setUniverses] = useState<MoviesUniverse[]>([]);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [linkSlug, setLinkSlug] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchMoviesFranchiseOverview(workId, stacked ? "landscape" : "portrait")
      .then((res) => {
        setData(res);
        const cats = res.links?.categories || [];
        if (cats.length && !cats.some((c) => c.id === linkTab)) {
          setLinkTab(cats[0].id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [workId, stacked, linkTab]);

  useEffect(() => {
    load();
  }, [workId, stacked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pushMoviesRoute(
      {
        franchiseId: workId,
        section,
        overviewTab: section === "overview" ? overviewTab : undefined,
      },
      true
    );
  }, [workId, section, overviewTab]);

  useEffect(() => {
    if (section !== "series" && section !== "overview") return;
    void fetchMoviesFranchiseSeries(workId)
      .then((res) =>
        setSeriesItems(
          (res.items || []).map((it) => ({
            id: it.id,
            title: it.title,
            cover_url: it.cover_url ?? null,
            date_iso: it.date_iso ?? null,
            navigate_franchise_id: it.navigate_franchise_id,
            open_mode: null,
          }))
        )
      )
      .catch(() => setSeriesItems([]));
  }, [section, workId]);

  useEffect(() => {
    if (section !== "audio") return;
    void fetchMoviesFranchiseAudio(workId)
      .then((res) =>
        setAudioCards(
          (res.releases || []).map((r) => ({
            id: r.id,
            title: r.title,
            cover_url: r.cover_url ?? null,
            category: r.category,
            folder_path: r.folder_path ?? undefined,
          }))
        )
      )
      .catch(() => setAudioCards([]));
  }, [section, workId]);

  useEffect(() => {
    if (section !== "library") return;
    void fetchMoviesFranchiseLibrary(workId)
      .then((res) => setLibCards((res.items || []) as MediaCard[]))
      .catch(() => setLibCards([]));
  }, [section, workId]);

  useEffect(() => {
    if (section !== "games") return;
    void fetchMoviesFranchiseGames(workId)
      .then((res) => setGameCards((res.items || []) as MediaCard[]))
      .catch(() => setGameCards([]));
  }, [section, workId]);

  const media = data?.media;
  const sections = useMemo(() => {
    const all: { id: MoviesSection; label: string }[] = [
      { id: "overview", label: "OVERVIEW" },
      { id: "movies", label: "MOVIES" },
    ];
    if (media?.has_series || seriesItems.length) {
      all.push({ id: "series", label: "SERIES" });
    }
    if (media?.has_audio) all.push({ id: "audio", label: "AUDIO" });
    if (media?.has_library) all.push({ id: "library", label: "LIBRARY" });
    if (media?.has_games) all.push({ id: "games", label: "GAMES" });
    if (media?.has_gallery) all.push({ id: "gallery", label: "GALLERY" });
    return all;
  }, [media, seriesItems.length]);

  useEffect(() => {
    if (!data) return;
    if (!sections.some((s) => s.id === section)) {
      onNavigate({
        franchiseId: workId,
        section: "overview",
        overviewTab: "about",
      });
    }
  }, [data, section, sections, onNavigate, workId]);

  const films = (data as SeriesOverview & { films?: SeriesSubseriesCard[] })
    ?.films || data?.subseries || [];

  const castCounts = {
    characters: data?.cast?.characters?.length ?? 0,
    staff: data?.cast?.staff?.length ?? 0,
  };

  const openFilm = (film: SeriesSubseriesCard) => {
    onNavigate({
      franchiseId: workId,
      filmId: film.id,
      section: "overview",
      overviewTab: "about",
    });
  };

  const runRefresh = () => {
    setBusy("Refreshing metadata…");
    void refreshMoviesWorkMetadata(workId)
      .then(() => load())
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  };

  const openUniverseAdmin = () => {
    setUniverseOpen(true);
    void fetchMoviesUniverses()
      .then((res) => setUniverses(res.universes || []))
      .catch(() => setUniverses([]));
  };

  if (loading && !data) {
    return <PlaylistBoot label="Loading franchise…" />;
  }
  if (error || !data) {
    return (
      <PlaylistBoot
        error={error ?? "Not found"}
        onBack={onBack}
        backLabel="← Catalog"
      />
    );
  }

  const universe = (data as SeriesOverview & { universe?: MoviesUniverse | null })
    .universe;

  return (
    <div className="artist-page artist-page--stacked movies-franchise-page">
      <div className="artist-page__top">
        <div className="artist-page__top-left">
          <button
            type="button"
            className="artist-page__catalog-back"
            onClick={onBack}
            aria-label="Back to catalog"
          >
            ←
          </button>
        </div>
        <div className="artist-page__top-center">
          {data.logo_url || data.icon_url ? (
            <img
              src={(data.logo_url || data.icon_url)!}
              alt=""
              className="artist-page__brand-logo"
            />
          ) : (
            <span className="artist-page__brand-name">{data.name}</span>
          )}
        </div>
        <div className="artist-page__top-right">
          {busy ? <span className="muted">{busy}</span> : null}
          <AppMenu
            onImport={onImport}
            onSync={onSync}
            onChooseSource={onChooseSource}
            isAdmin={isAdmin}
            userId={userId}
            onSwitchProfile={onSwitchProfile}
            onEditProfile={onEditProfile}
            menuChrome={
              isAdmin ? (
                <>
                  <button type="button" onClick={runRefresh}>
                    Refresh metadata (TMDb)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBusy("Seeding universe…");
                      void refreshMoviesUniverse(workId)
                        .then(() => load())
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e))
                        )
                        .finally(() => setBusy(null));
                    }}
                  >
                    Refresh universe (TMDb)
                  </button>
                  <button type="button" onClick={openUniverseAdmin}>
                    Manage universe links…
                  </button>
                </>
              ) : null
            }
          />
        </div>
      </div>

      <nav className="artist-page__sections">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "active" : ""}
            onClick={() =>
              onNavigate({
                franchiseId: workId,
                section: s.id,
                overviewTab: s.id === "overview" ? "about" : undefined,
                filmId: undefined,
              })
            }
          >
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {section === "overview" ? (
        <nav className="artist-page__subtabs" aria-label="Overview">
          {OVERVIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={overviewTab === t.id ? "active" : ""}
              onClick={() =>
                onNavigate({ section: "overview", overviewTab: t.id })
              }
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {section === "overview" && overviewTab === "cast" ? (
        <nav className="artist-page__subtabs artist-page__lineup-subtabs">
          {(
            [
              ["characters", "CHARACTERS", castCounts.characters],
              ["staff", "STAFF", castCounts.staff],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={castTab === id ? "active" : ""}
              onClick={() => setCastTab(id)}
            >
              <span>
                {label}
                <span className="artist-page__lineup-count">{count}</span>
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      {section === "overview" && overviewTab === "related" ? (
        <nav className="artist-page__subtabs artist-page__related-subtabs">
          {(
            [
              [
                "creator",
                "SAME CREW",
                data.related?.creator_count ??
                  data.related?.creator?.length ??
                  0,
              ],
              [
                "similar",
                "SIMILAR",
                data.related?.similar_count ??
                  data.related?.similar?.length ??
                  0,
              ],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={relatedTab === id ? "active" : ""}
              onClick={() => setRelatedTab(id)}
            >
              <span>
                {label}
                <span className="artist-page__lineup-count">{count}</span>
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      {section === "overview" &&
      overviewTab === "links" &&
      (data.links?.categories?.length ?? 0) > 0 ? (
        <nav className="artist-page__subtabs artist-page__links-subtabs">
          {data.links.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={linkTab === c.id ? "active" : ""}
              onClick={() => setLinkTab(c.id)}
            >
              <span>
                {c.label}
                <span className="artist-page__lineup-count">{c.count}</span>
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      <div className="artist-page__body">
        {section === "overview" && overviewTab === "about" ? (
          <>
            {universe ? (
              <p className="muted" style={{ margin: "0 1.25rem 0.75rem" }}>
                Universe: <strong>{universe.name}</strong>
              </p>
            ) : null}
            <SeriesAbout
              data={data}
              eraIndex={eraIndex}
              stacked={stacked}
              onEraChange={setEraIndex}
              onOpenSubseries={openFilm}
            />
          </>
        ) : null}

        {section === "overview" && overviewTab === "cast" ? (
          <SeriesCast
            franchiseId={workId}
            franchiseName={data.name}
            cast={data.cast}
            languages={data.languages}
            languageOptions={data.language_options}
            originLanguage={data.origin_language}
            tab={castTab}
            isAdmin={false}
            onDataChanged={load}
          />
        ) : null}

        {section === "overview" && overviewTab === "links" ? (
          <SeriesLinks
            franchiseId={workId}
            links={data.links}
            tab={linkTab}
            isAdmin={false}
            onDataChanged={load}
          />
        ) : null}

        {section === "overview" && overviewTab === "related" ? (
          <SeriesRelatedPanel
            franchiseId={workId}
            creator={data.related?.creator || []}
            similar={data.related?.similar || []}
            tab={relatedTab}
            isAdmin={false}
            onDataChanged={load}
          />
        ) : null}

        {section === "movies" ? (
          <div style={{ padding: "0 1.25rem 2rem" }}>
            <div className="artist-grid artist-grid--portrait">
              {films.map((film) => (
                <ArtistCard
                  key={film.id}
                  orientation="portrait"
                  artist={{
                    id: 0,
                    name: film.title,
                    photo_url: film.cover_url,
                    logo_url: film.logo_url ?? null,
                    icon_url: film.icon_url ?? null,
                    logo_collapsed_url: null,
                    era_year: film.date_iso
                      ? Number(String(film.date_iso).slice(0, 4)) || null
                      : null,
                    show_name_on_hover: !film.logo_url && !film.icon_url,
                  }}
                  onClick={() => openFilm(film)}
                />
              ))}
            </div>
            {!films.length ? (
              <p className="muted">No film folders under this work yet.</p>
            ) : null}
          </div>
        ) : null}

        {section === "series" ? (
          <div style={{ padding: "0 1.25rem 2rem" }}>
            <SeriesMediaGrid
              items={seriesItems}
              emptyMessage="No matching Series franchise for this work name."
              onOpen={(item) =>
                onOpenSeriesFranchise?.(
                  (item as MediaCard).navigate_franchise_id || workId
                )
              }
            />
          </div>
        ) : null}

        {section === "audio" ? (
          <div style={{ padding: "0 1.25rem 2rem" }}>
            <SeriesMediaGrid
              items={audioCards}
              emptyMessage="No audio folders yet."
            />
          </div>
        ) : null}

        {section === "library" ? (
          <div style={{ padding: "0 1.25rem 2rem" }}>
            <SeriesMediaGrid
              items={libCards}
              emptyMessage="No related books in the franchise index."
            />
          </div>
        ) : null}

        {section === "games" ? (
          <div style={{ padding: "0 1.25rem 2rem" }}>
            <SeriesMediaGrid
              items={gameCards}
              emptyMessage="No related games in the franchise index."
            />
          </div>
        ) : null}

        {section === "gallery" ? (
          <SeriesGalleryPanel folderPath={data.folder_path} />
        ) : null}
      </div>

      {universeOpen && isAdmin ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setUniverseOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-label="Universe links"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, padding: "1.25rem" }}
          >
            <h2 style={{ marginTop: 0 }}>Universe links</h2>
            {universe ? (
              <p className="muted">
                Current: <strong>{universe.name}</strong> (id {universe.id})
              </p>
            ) : (
              <p className="muted">
                No universe linked. Seed via Refresh universe, or link below.
              </p>
            )}
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Universe
              <select
                value={universe?.id ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (!id) return;
                  setBusy("Linking…");
                  void linkMoviesUniverseMember(id, workId)
                    .then(() => load())
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : String(err))
                    )
                    .finally(() => setBusy(null));
                }}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              >
                <option value="">Select universe…</option>
                {universes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.member_count ?? u.work_slugs?.length ?? 0})
                  </option>
                ))}
              </select>
            </label>
            {universe ? (
              <>
                <label style={{ display: "block", marginBottom: "0.5rem" }}>
                  Add work slug
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <input
                      value={linkSlug}
                      onChange={(e) => setLinkSlug(e.target.value)}
                      placeholder="e.g. fantastic beasts"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      disabled={!linkSlug.trim()}
                      onClick={() => {
                        setBusy("Linking…");
                        void linkMoviesUniverseMember(
                          universe.id,
                          linkSlug.trim()
                        )
                          .then(() => {
                            setLinkSlug("");
                            return load();
                          })
                          .catch((err) =>
                            setError(
                              err instanceof Error ? err.message : String(err)
                            )
                          )
                          .finally(() => setBusy(null));
                      }}
                    >
                      Add
                    </button>
                  </div>
                </label>
                <ul style={{ paddingLeft: "1.1rem" }}>
                  {(universe.work_slugs || []).map((slug) => (
                    <li key={slug} style={{ marginBottom: 4 }}>
                      {slug}{" "}
                      <button
                        type="button"
                        className="release-page__person-link"
                        onClick={() => {
                          setBusy("Unlinking…");
                          void unlinkMoviesUniverseMember(universe.id, slug)
                            .then(() => load())
                            .catch((err) =>
                              setError(
                                err instanceof Error ? err.message : String(err)
                              )
                            )
                            .finally(() => setBusy(null));
                        }}
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <button type="button" onClick={() => setUniverseOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
