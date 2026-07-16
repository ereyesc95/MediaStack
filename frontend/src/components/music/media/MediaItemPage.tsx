import { useCallback, useEffect, useMemo, useState } from "react";
import { pushArtistRoute } from "../../../musicRoute";
import {
  getCachedMediaItemOverview,
  prefetchMediaItemOverview,
} from "../../../mediaItemOverviewCache";
import type { MediaItemFile, MediaItemOverview } from "../../../types";
import AppMenu from "../../AppMenu";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  onBack: () => void;
  onOpenArtist: (id: number) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

function openFile(file: MediaItemFile) {
  const url = file.url || (file.path ? `/api/media/file?path=${encodeURIComponent(file.path)}` : null);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function MediaItemPage({
  bandId,
  kind,
  itemId,
  onBack,
  onOpenArtist,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  userId,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const [data, setData] = useState<MediaItemOverview | null>(() =>
    getCachedMediaItemOverview(bandId, kind, itemId)
  );
  const [loading, setLoading] = useState(
    () => !getCachedMediaItemOverview(bandId, kind, itemId)
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      const cached = !force
        ? getCachedMediaItemOverview(bandId, kind, itemId)
        : null;
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        prefetchMediaItemOverview(bandId, kind, itemId, { force: true })
          .then(setData)
          .catch(() => {});
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setData(await prefetchMediaItemOverview(bandId, kind, itemId, { force: true }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [bandId, kind, itemId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    pushArtistRoute(
      { bandId, section: kind, overviewTab: "about", mediaItemId: itemId },
      true
    );
  }, [bandId, kind, itemId]);

  const groups = useMemo(() => {
    if (!data) return [];
    if (data.groups?.length) return data.groups;
    if (data.files?.length) return [{ label: "Contents", files: data.files }];
    return [];
  }, [data]);

  const sectionLabel = kind === "video" ? "Video" : "Library";
  const listHeading = kind === "video" ? "Videos" : "Volumes";

  return (
    <div className="media-item-page">
      <header className="media-item-page__top">
        <button type="button" className="media-item-page__back" onClick={onBack}>
          ‹ {data?.artist_name ?? "Artist"}
        </button>
        <span className="media-item-page__title">{data?.title ?? sectionLabel}</span>
        <AppMenu
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          isAdmin={isAdmin}
          userId={userId}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
        />
      </header>

      {loading && !data && (
        <p className="muted media-item-page__loading">Loading…</p>
      )}
      {error && <p className="error">{error}</p>}

      {data && (
        <div className="media-item-page__body">
          <aside className="media-item-page__panel">
            {data.cover_url && (
              <img
                src={data.cover_url}
                alt=""
                className="media-item-page__cover"
                draggable={false}
              />
            )}
            <div className="media-item-page__meta">
              <button
                type="button"
                className="media-item-page__artist"
                onClick={() => onOpenArtist(bandId)}
              >
                {data.artist_name}
              </button>
              <h1>{data.title}</h1>
              {data.date_iso && <p className="muted">{data.date_iso}</p>}
              <p className="media-item-page__kind">{sectionLabel}</p>
            </div>
          </aside>
          <main className="media-item-page__main">
            {data.description ? (
              <section className="media-item-page__description">
                <h2>Overview</h2>
                <p>{data.description}</p>
              </section>
            ) : null}
            {groups.length > 0 ? (
              <section className="media-item-page__files">
                <h2>{listHeading}</h2>
                {groups.map((group) => (
                  <div key={group.label} className="media-item-page__group">
                    {(groups.length > 1 || group.label !== "Contents") && (
                      <h3 className="media-item-page__group-label">{group.label}</h3>
                    )}
                    <ul>
                      {group.files.map((f) => (
                        <li key={f.path}>
                          <button
                            type="button"
                            className="media-item-page__file-btn"
                            onClick={() => openFile(f)}
                          >
                            <span className="media-item-page__file-kind">{f.kind}</span>
                            <span className="media-item-page__file-name">{f.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : (
              <p className="muted">No playable or readable files found in this folder.</p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
