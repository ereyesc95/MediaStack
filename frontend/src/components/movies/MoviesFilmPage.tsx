import { useCallback, useEffect, useState } from "react";
import {
  fetchMoviesFilmOverview,
  refreshMoviesFilmMetadata,
} from "../../api";
import type {
  MoviesFilmDetail,
  SeriesCastTab,
  SeriesOverview,
} from "../../types";
import type { MoviesOverviewTab } from "../../moviesRoute";
import { usePhoneLayout } from "../../usePhoneLayout";
import AppMenu from "../AppMenu";
import PlaylistBoot from "../PlaylistBoot";
import SeriesAbout from "../series/SeriesAbout";
import SeriesCast from "../series/SeriesCast";
import SeriesGalleryPanel from "../series/SeriesGalleryPanel";
import SeriesLinks from "../series/SeriesLinks";
import SeriesRelatedPanel, {
  type SeriesRelatedTab,
} from "../series/SeriesRelatedPanel";

type Props = {
  filmId: string;
  workId: string;
  overviewTab?: MoviesOverviewTab;
  section?: string;
  isAdmin?: boolean;
  onBack: () => void;
  onOpenWork: () => void;
  onNavigate?: (patch: {
    overviewTab?: MoviesOverviewTab;
    section?: string;
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string) => void;
  onImport?: () => void;
  onSync?: () => void;
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

type FilmOverview = SeriesOverview & {
  versions?: MoviesFilmDetail["versions"];
  work?: MoviesFilmDetail["work"];
  directors?: string[];
  display_date?: string | null;
  date_iso?: string | null;
  has_video?: boolean;
};

export default function MoviesFilmPage({
  filmId,
  workId,
  overviewTab = "about",
  section = "overview",
  isAdmin,
  onBack,
  onOpenWork,
  onNavigate,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  userId,
}: Props) {
  const stacked = usePhoneLayout();
  const [data, setData] = useState<FilmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [eraIndex, setEraIndex] = useState(0);
  const [castTab, setCastTab] = useState<SeriesCastTab>("characters");
  const [relatedTab, setRelatedTab] = useState<SeriesRelatedTab>("creator");
  const [linkTab, setLinkTab] = useState("databases");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchMoviesFilmOverview(filmId, stacked ? "landscape" : "portrait")
      .then((res) => {
        setData(res);
        const cats = res.links?.categories || [];
        if (cats.length) setLinkTab(cats[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [filmId, stacked]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = [
    { id: "overview", label: "OVERVIEW" },
    ...(data?.media?.has_gallery
      ? [{ id: "gallery", label: "GALLERY" }]
      : []),
  ];

  if (loading && !data) {
    return <PlaylistBoot label="Loading film…" />;
  }
  if (error || !data) {
    return (
      <PlaylistBoot
        error={error ?? "Film not found"}
        onBack={onBack}
        backLabel="← Catalog"
      />
    );
  }

  const versions = data.versions || [];
  const castCounts = {
    characters: data.cast?.characters?.length ?? 0,
    staff: data.cast?.staff?.length ?? 0,
  };

  return (
    <div className="artist-page artist-page--stacked movies-film-page">
      <div className="artist-page__top">
        <div className="artist-page__top-left">
          <button
            type="button"
            className="artist-page__catalog-back"
            onClick={onBack}
            aria-label="Back"
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
          {onImport && onSync ? (
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
                  <button
                    type="button"
                    onClick={() => {
                      setBusy("Refreshing…");
                      void refreshMoviesFilmMetadata(filmId)
                        .then(() => load())
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e))
                        )
                        .finally(() => setBusy(null));
                    }}
                  >
                    Refresh metadata (TMDb)
                  </button>
                ) : null
              }
            />
          ) : null}
        </div>
      </div>

      <nav className="artist-page__sections">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "active" : ""}
            onClick={() => onNavigate?.({ section: s.id, overviewTab })}
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
                onNavigate?.({ section: "overview", overviewTab: t.id })
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
            <p className="muted" style={{ margin: "0 1.25rem 0.5rem" }}>
              <button
                type="button"
                className="release-page__person-link"
                onClick={onOpenWork}
              >
                {data.work?.name || workId}
              </button>
              {data.display_date ? ` · ${data.display_date}` : null}
              {data.directors?.length
                ? ` · ${data.directors.slice(0, 2).join(", ")}`
                : null}
            </p>
            <SeriesAbout
              data={data}
              eraIndex={eraIndex}
              stacked={stacked}
              onEraChange={setEraIndex}
              onOpenSubseries={() => undefined}
            />
            <div style={{ padding: "0 1.25rem 2rem" }}>
              {versions.length > 0 ? (
                <>
                  <h2 style={{ fontSize: "0.85rem", letterSpacing: "0.06em" }}>
                    VERSIONS
                  </h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {versions.map((v) => (
                      <li key={v.id} style={{ marginBottom: "0.4rem" }}>
                        <a
                          href={v.file_url || `#${v.play_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {v.label}
                        </a>
                        <span className="muted"> · {v.file_name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted">
                  No video file in this folder yet. Add the feature under{" "}
                  <code>{data.folder_path}</code>.
                </p>
              )}
            </div>
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
            layout="row"
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

        {section === "gallery" ? (
          <SeriesGalleryPanel folderPath={data.folder_path} />
        ) : null}
      </div>
    </div>
  );
}
