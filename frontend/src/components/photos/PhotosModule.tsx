import { useEffect, useMemo, useState } from "react";
import type { MediaOption } from "../ModuleTopBar";
import ModuleTopBar from "../ModuleTopBar";
import AppMenu from "../AppMenu";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../music/artist/GalleryViewerModal";

type Props = {
  mediaOptions: MediaOption[];
  busy?: string;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onSelectMedia: (opt: MediaOption) => void;
};

type PhotoItem = {
  id: string;
  url: string;
  thumb_url?: string | null;
  title?: string;
  kind?: string;
  subfolder?: string;
};

type YearBucket = {
  year: string;
  items: PhotoItem[];
  subfolders?: string[];
  has_images?: boolean;
  has_videos?: boolean;
};

type MediaTypeFilter = "all" | "photos" | "videos";

/** Photos: square year grid → year view with type + subfolder filters → carousel. */
export default function PhotosModule({
  mediaOptions,
  busy: _busy,
  onImport,
  onSync,
  onChooseSource,
  isAdmin,
  onSwitchProfile,
  onEditProfile,
  onSelectMedia,
}: Props) {
  const [years, setYears] = useState<YearBucket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all");
  const [subfolder, setSubfolder] = useState<string>("General");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/photos/years", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 404) return { years: [] as YearBucket[] };
          throw new Error(await r.text());
        }
        return r.json();
      })
      .then((data: { years?: YearBucket[] }) => {
        if (!cancelled) setYears(data.years || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setYears([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearBucket = useMemo(
    () => years.find((y) => y.year === activeYear) || null,
    [years, activeYear]
  );

  const subfolders = yearBucket?.subfolders || [];
  const showTypeSwitch = Boolean(
    yearBucket?.has_images && yearBucket?.has_videos
  );

  useEffect(() => {
    if (!yearBucket) return;
    setMediaType("all");
    const first = yearBucket.subfolders?.[0] || "General";
    setSubfolder(first);
  }, [yearBucket?.year]);

  const filteredItems = useMemo((): PhotoItem[] => {
    if (!yearBucket) return [];
    let list = yearBucket.items || [];
    if (subfolders.length) {
      list = list.filter((it) => (it.subfolder || "General") === subfolder);
    }
    if (mediaType === "photos") {
      list = list.filter((it) => it.kind !== "video");
    } else if (mediaType === "videos") {
      list = list.filter((it) => it.kind === "video");
    }
    return list;
  }, [yearBucket, subfolders.length, subfolder, mediaType]);

  const viewerItems = useMemo((): GalleryViewerItem[] => {
    return filteredItems.map((it) => ({
      id: it.id,
      url: it.url,
      caption: it.title || it.id,
      mediaType: it.kind === "video" ? "video" : "image",
    }));
  }, [filteredItems]);

  return (
    <div className="music-module photos-module">
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "photos") ?? {
            id: 700,
            kind: "photos",
            label: "Photos",
          }
        }
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={
          activeYear
            ? [
                {
                  id: "back",
                  label: "YEARS",
                  active: false,
                  onClick: () => {
                    setActiveYear(null);
                    setViewerOpen(false);
                  },
                },
                ...(subfolders.length
                  ? subfolders.map((sf) => ({
                      id: `sf-${sf}`,
                      label: sf.toUpperCase(),
                      active: subfolder === sf,
                      onClick: () => {
                        setSubfolder(sf);
                        setViewerOpen(false);
                      },
                    }))
                  : [
                      {
                        id: "year",
                        label: activeYear,
                        active: true,
                        onClick: () => undefined,
                      },
                    ]),
              ]
            : [
                {
                  id: "home",
                  label: "PHOTOS",
                  active: true,
                  onClick: () => undefined,
                },
              ]
        }
        menu={
          <AppMenu
            onImport={onImport}
            onSync={onSync}
            onChooseSource={onChooseSource}
            isAdmin={isAdmin}
            onSwitchProfile={onSwitchProfile}
            onEditProfile={onEditProfile}
          />
        }
      />

      {error && !years.length ? (
        <p className="muted module-placeholder">
          Photos library stub ready — add files under Photos/YYYY/.
        </p>
      ) : null}

      {!activeYear ? (
        <>
          <div className="photos-year-grid">
            {years.map((y) => {
              const cover = y.items[0]?.url || y.items[0]?.thumb_url;
              return (
                <button
                  key={y.year}
                  type="button"
                  className="photos-year-card"
                  onClick={() => {
                    setActiveYear(y.year);
                    setViewerOpen(false);
                  }}
                >
                  <span
                    className="photos-year-card__cover"
                    style={
                      cover ? { backgroundImage: `url("${cover}")` } : undefined
                    }
                  />
                  <span className="photos-year-card__label">{y.year}</span>
                </button>
              );
            })}
          </div>

          {!years.length && !error ? (
            <p className="muted module-placeholder">
              No Photos/YYYY folders yet. Drop jpg/mp4 files under
              Media/Photos/YYYY/.
            </p>
          ) : null}
        </>
      ) : (
        <div className="photos-year-view">
          {showTypeSwitch ? (
            <div className="photos-type-switch" role="tablist" aria-label="Media type">
              {(
                [
                  ["all", "All"],
                  ["photos", "Photos"],
                  ["videos", "Videos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    mediaType === id
                      ? "photos-type-switch__btn photos-type-switch__btn--active"
                      : "photos-type-switch__btn"
                  }
                  onClick={() => {
                    setMediaType(id);
                    setViewerOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="photos-year-grid">
            {filteredItems.map((it, idx) => {
              const cover = it.thumb_url || (it.kind !== "video" ? it.url : null);
              return (
                <button
                  key={it.id}
                  type="button"
                  className="photos-year-card"
                  onClick={() => {
                    setViewerIndex(idx);
                    setViewerOpen(true);
                  }}
                >
                  <span
                    className="photos-year-card__cover"
                    style={
                      cover ? { backgroundImage: `url("${cover}")` } : undefined
                    }
                  />
                  <span className="photos-year-card__label">
                    {it.title || (it.kind === "video" ? "Video" : "Photo")}
                  </span>
                </button>
              );
            })}
          </div>

          {!filteredItems.length ? (
            <p className="muted module-placeholder">Nothing in this filter.</p>
          ) : null}
        </div>
      )}

      {viewerOpen && viewerItems.length > 0 ? (
        <GalleryViewerModal
          items={viewerItems}
          index={viewerIndex}
          onClose={() => setViewerOpen(false)}
          onIndexChange={setViewerIndex}
        />
      ) : null}
    </div>
  );
}
