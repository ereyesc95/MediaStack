import type { ReactNode } from "react";
import type { MoviesFilmCard, SeriesDashboard, SeriesFranchiseCard, Universe } from "../../types";

type Props = {
  data: (SeriesDashboard & {
    platforms?: SeriesFranchiseCard[];
    recent_games?: MoviesFilmCard[];
    top_games?: MoviesFilmCard[];
  }) | null;
  loading?: boolean;
  universes?: Universe[];
  platforms?: SeriesFranchiseCard[];
  recentGames?: MoviesFilmCard[];
  onPlatform?: (platformId: string) => void;
  onFranchise: (workId: string) => void;
  onGame: (gameId: string, workId?: string) => void;
  onOpenUniverse?: (id: number) => void;
};

function DashCover({ url }: { url?: string | null }) {
  if (!url) return <span className="dash-icon-item-cover dash-icon-item-cover--empty" />;
  return (
    <span className="dash-icon-item-cover">
      <span
        className="card-bg-layer"
        style={{ backgroundImage: `url("${url}")`, backgroundPosition: "center top" }}
      />
    </span>
  );
}

function Row({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="dash-row dash-row--icons">
      <div className="dash-row-label">
        <div className="dash-row-label-text">
          <strong>{title}</strong>
        </div>
      </div>
      <div className="dash-scroll dash-scroll--icons">{children}</div>
    </section>
  );
}

export default function GamesHome({
  data,
  loading,
  universes = [],
  platforms = [],
  recentGames = [],
  onPlatform,
  onFranchise,
  onGame,
  onOpenUniverse,
}: Props) {
  const platformRow =
    platforms.length > 0 ? platforms : data?.platforms || [];
  const recent =
    recentGames.length > 0 ? recentGames : data?.recent_games || [];
  const franchises = data?.top_franchises || [];
  const topGames = data?.top_games || [];

  return (
    <div className={`music-dashboard${loading ? " music-dashboard--loading" : ""}`}>
      {platformRow.length > 0 ? (
        <Row title="Platforms">
          {platformRow.slice(0, 12).map((p) => (
            <button
              key={p.id}
              type="button"
              className="dash-icon-item"
              onClick={() => onPlatform?.(p.id)}
              title={p.name}
            >
              <DashCover url={p.cover_url || p.icon_url || p.logo_url} />
              <span className="dash-hover-title">
                <span className="dash-hover-title__main">{p.name}</span>
              </span>
            </button>
          ))}
        </Row>
      ) : null}

      {recent.length > 0 ? (
        <Row title="Continue">
          {recent.slice(0, 12).map((g) => (
            <button
              key={g.id}
              type="button"
              className="dash-icon-item"
              onClick={() => onGame(g.id, g.work_id)}
              title={g.title}
            >
              <DashCover url={g.cover_url || g.portrait_url} />
              <span className="dash-hover-title">
                <span className="dash-hover-title__main">{g.title}</span>
              </span>
            </button>
          ))}
        </Row>
      ) : null}

      {franchises.length > 0 ? (
        <Row title="Franchises">
          {franchises.slice(0, 12).map((f) => (
            <button
              key={f.id}
              type="button"
              className="dash-icon-item"
              onClick={() => onFranchise(f.id)}
              title={f.name}
            >
              <DashCover url={f.cover_url || f.portrait_url} />
              <span className="dash-hover-title">
                <span className="dash-hover-title__main">{f.name}</span>
              </span>
            </button>
          ))}
        </Row>
      ) : null}

      {topGames.length > 0 ? (
        <Row title="Games">
          {topGames.slice(0, 12).map((g) => (
            <button
              key={g.id}
              type="button"
              className="dash-icon-item"
              onClick={() => onGame(g.id, g.work_id)}
              title={g.title}
            >
              <DashCover url={g.cover_url || g.portrait_url} />
              <span className="dash-hover-title">
                <span className="dash-hover-title__main">{g.title}</span>
              </span>
            </button>
          ))}
        </Row>
      ) : null}

      {universes.length > 0 && onOpenUniverse ? (
        <Row title="Universes">
          {universes.slice(0, 12).map((u) => (
            <button
              key={u.id}
              type="button"
              className="dash-icon-item"
              onClick={() => onOpenUniverse(u.id)}
              title={u.name}
            >
              <DashCover url={u.cover_url || u.portrait_url} />
              <span className="dash-hover-title">
                <span className="dash-hover-title__main">{u.name}</span>
              </span>
            </button>
          ))}
        </Row>
      ) : null}

      {!loading &&
      !platformRow.length &&
      !recent.length &&
      !franchises.length &&
      !topGames.length ? (
        <p className="muted module-placeholder">
          No games found under Games/ — add platform folders to get started.
        </p>
      ) : null}
    </div>
  );
}
