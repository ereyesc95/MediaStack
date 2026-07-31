import { useCallback, useState, type ReactNode } from "react";
import {
  fetchMoviesUniverses,
  linkMoviesUniverseMember,
  refreshMoviesUniverse,
  unlinkMoviesUniverseMember,
} from "../../api";
import type { CardOrientation, MoviesUniverse } from "../../types";
import type {
  MoviesOverviewTab,
  MoviesSection,
} from "../../moviesRoute";
import SeriesFranchisePage from "../series/SeriesFranchisePage";
import type { SeriesSection } from "../../types";

type Props = {
  workId: string;
  section?: MoviesSection;
  overviewTab?: MoviesOverviewTab;
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
  }) => void;
  onOpenSeriesFranchise?: (franchiseId: string, subseriesId?: string) => void;
  onOpenMusicRelease?: (bandId: number, releaseId: string) => void;
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
  isAdmin,
  userId,
  cardOrientation = "portrait",
  onSetOrientation,
  onBack,
  backLabel,
  onNavigate,
  onOpenSeriesFranchise,
  onOpenMusicRelease,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [universes, setUniverses] = useState<MoviesUniverse[]>([]);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [linkSlug, setLinkSlug] = useState("");
  const [universe, setUniverse] = useState<MoviesUniverse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const openUniverseAdmin = useCallback(() => {
    setUniverseOpen(true);
    void fetchMoviesUniverses()
      .then((res) => setUniverses(res.universes || []))
      .catch(() => setUniverses([]));
  }, []);

  const menuExtra: ReactNode = isAdmin ? (
    <>
      <button
        type="button"
        onClick={() => {
          setBusy("Seeding universe…");
          void refreshMoviesUniverse(workId)
            .then((u) => {
              setUniverse(u as MoviesUniverse);
              setReloadKey((k) => k + 1);
            })
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
  ) : null;

  return (
    <>
      {error ? (
        <p className="error" style={{ margin: "0.5rem 1rem" }}>
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="muted" style={{ margin: "0.5rem 1rem" }}>
          {busy}
        </p>
      ) : null}
      <SeriesFranchisePage
        key={`${workId}-${reloadKey}`}
        module="movies"
        franchiseId={workId}
        section={section as SeriesSection}
        overviewTab={overviewTab}
        isAdmin={isAdmin}
        userId={userId}
        cardOrientation={cardOrientation}
        onSetOrientation={onSetOrientation}
        busy={busy ?? undefined}
        onImport={onImport}
        onSync={onSync}
        onChooseSource={onChooseSource}
        onSwitchProfile={onSwitchProfile}
        onEditProfile={onEditProfile}
        onBack={onBack}
        backLabel={backLabel}
        onOpenSeriesFranchise={onOpenSeriesFranchise}
        onOpenMusicRelease={onOpenMusicRelease}
        menuExtra={menuExtra}
        onNavigate={(patch) => {
          // About film strip / MOVIES tab use subseriesId as film id
          if (patch.subseriesId) {
            onNavigate({
              franchiseId: workId,
              filmId: patch.subseriesId,
              section: "overview",
              overviewTab: "about",
            });
            return;
          }
          onNavigate({
            franchiseId: workId,
            filmId: undefined,
            section: (patch.section as MoviesSection) || section,
            overviewTab: patch.overviewTab || overviewTab,
          });
        }}
        onShellUpdate={(shell) => {
          const u = (shell as { universe?: MoviesUniverse }).universe;
          if (u) setUniverse(u);
        }}
      />

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
                No universe linked yet. Seed via Refresh universe, or link below.
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
                    .then(() => setReloadKey((k) => k + 1))
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
                            setReloadKey((k) => k + 1);
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
                            .then(() => setReloadKey((k) => k + 1))
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err)
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
    </>
  );
}
