import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchBandTourDetail,
  fetchBandTourShowDetail,
  fetchTourShowSetlist,
  refreshTourShowSetlist,
  syncTourShow,
  syncTourShowArtists,
} from "../../../api";
import { formatShowTabDate, formatTrackDate } from "../../../formatDate";
import type {
  LineupMember,
  ReleaseEdition,
  TourDetail,
  TourShowBill,
  TourShowDetail,
  TourShowMediaItem,
  TourShowSetlistPayload,
  TourShowTab,
} from "../../../types";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import AppMenu from "../../AppMenu";
import TopBarTitle from "../../TopBarTitle";
import MediaBeatFrame from "../MediaBeatFrame";
import MediaBeatFx from "../MediaBeatFx";
import PlaylistBoot from "../../PlaylistBoot";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./GalleryViewerModal";
import SetlistTracklist from "./SetlistTracklist";
import ReleasePhotocard from "../release/ReleasePhotocard";

type Props = {
  bandId: number;
  tourSlug: string;
  showSlug?: string;
  showTab?: TourShowTab;
  artistName?: string;
  isAdmin?: boolean;
  userId?: number;
  /** Full-page chrome (not embedded in artist Tours tab). */
  standalone?: boolean;
  /** Top-left back control label (default TOURS). */
  backLabel?: string;
  onBack: () => void;
  onNavigate: (next: {
    tourSlug: string;
    showSlug?: string;
    showTab?: TourShowTab;
  }) => void;
  onOpenArtist?: (bandId: number) => void;
  onOpenRelease?: (releaseId: string) => void;
  onImport?: () => void;
  onSync?: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

const TAB_LABELS: { id: TourShowTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "setlist", label: "SETLIST" },
  { id: "promo", label: "PROMO" },
  { id: "gallery", label: "GALLERY" },
  { id: "souvenirs", label: "SOUVENIRS" },
];

function ShowTabDate({ dateIso }: { dateIso: string | null | undefined }) {
  const label = formatShowTabDate(dateIso);
  if (!label) return null;
  const m = label.match(/^([A-Z]+) (\d+(?:ST|ND|RD|TH))(, \d{4})$/);
  if (!m) return <span>{label}</span>;
  return (
    <span className="tour-show-page__show-date-tab">
      <span>{m[1]} </span>
      <span className="tour-show-page__show-date-ord">{m[2]}</span>
      <span>{m[3]}</span>
    </span>
  );
}

function FlipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h8a4 4 0 0 1 0 8H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 5L7 7l2 2M17 17H9a4 4 0 0 1 0-8h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function mediaToGalleryItems(items: TourShowMediaItem[]): GalleryViewerItem[] {
  return items
    .filter((i) => i.kind === "image")
    .map((i) => ({
      id: i.id,
      url: i.url,
      caption: i.label,
      mediaType: "image" as const,
    }));
}

function setlistPayloadToEditions(payload: TourShowSetlistPayload | null): ReleaseEdition[] {
  type RawTrack = {
    id?: string;
    title?: string;
    number?: number | null;
    unavailable?: boolean;
    play_path?: string | null;
    duration?: string | null;
    album_title?: string | null;
    youtube_query?: string | null;
  };
  if (!payload) return [];
  const rawGroups = payload.groups as { label?: string; tracks?: RawTrack[] }[] | undefined;
  const rawTracks = (payload.tracks || []) as RawTrack[];

  const mapTrack = (t: RawTrack, idx: number) => ({
    id: t.id || `t-${idx}-${t.title || ""}`,
    title: t.title || "—",
    number: t.number ?? idx + 1,
    unavailable: Boolean(t.unavailable || !t.play_path),
    play_path: t.play_path ?? null,
    duration: t.duration ?? null,
    duration_sec: null,
    album_title: t.album_title ?? null,
    youtube_query: t.youtube_query ?? null,
    has_lrc: false,
    is_link: false,
  });

  if (rawGroups?.length) {
    return [
      {
        id: "setlist",
        label: "",
        date_iso: null,
        groups: rawGroups.map((g, gi) => ({
          id: `g-${gi}`,
          kind: "flat" as const,
          label: g.label || null,
          tracks: (g.tracks || []).map(mapTrack),
        })),
      },
    ] as ReleaseEdition[];
  }
  if (!rawTracks.length) return [];
  return [
    {
      id: "setlist",
      label: "",
      date_iso: null,
      groups: [
        {
          id: "g0",
          kind: "flat" as const,
          label: null,
          tracks: rawTracks.map(mapTrack),
        },
      ],
    },
  ] as ReleaseEdition[];
}

function BillCircle({
  entry,
  onOpenArtist,
}: {
  entry: TourShowBill;
  onOpenArtist?: (bandId: number) => void;
}) {
  const initial = (entry.artist_name || "?").trim().slice(0, 1).toUpperCase();
  const clickable = Boolean(entry.band_id && onOpenArtist);
  return (
    <button
      type="button"
      className="release-lineup-card tour-show-page__bill-circle"
      disabled={!clickable}
      onClick={() => entry.band_id && onOpenArtist?.(entry.band_id)}
      title={entry.artist_name}
    >
      <span className="release-lineup-card__photo">
        <span className="release-lineup-card__initials">{initial}</span>
      </span>
      <span className="release-lineup-card__name">{entry.artist_name}</span>
    </button>
  );
}

function TourShowMediaSection({
  items,
  empty,
}: {
  items: TourShowMediaItem[];
  empty: string;
}) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const galleryItems = useMemo(() => mediaToGalleryItems(items), [items]);

  if (!items.length) {
    return <p className="muted artist-section-empty">{empty}</p>;
  }

  return (
    <>
      <div className="tour-show-media-grid">
        {items.map((item) => {
          const showBack = Boolean(flipped[item.id] && item.back_url);
          const src = showBack && item.back_url ? item.back_url : item.url;
          const galleryIdx = galleryItems.findIndex((g) => g.id === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="tour-show-media-card"
              onClick={() => {
                if (item.has_back) {
                  setFlipped((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                  return;
                }
                if (item.kind === "image" && galleryIdx >= 0) {
                  setViewerIndex(galleryIdx);
                  return;
                }
                if (item.kind === "file" || item.kind === "video") {
                  window.open(item.url, "_blank", "noopener,noreferrer");
                }
              }}
              title={item.label}
            >
              {item.kind === "image" ? (
                <img src={src} alt={item.label} loading="lazy" draggable={false} />
              ) : (
                <span className="tour-show-media-card__label">{item.label}</span>
              )}
              {item.has_back ? (
                <span className="tour-show-media-card__flip" aria-hidden>
                  <FlipIcon className="tour-show-media-card__flip-icon" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {viewerIndex !== null && galleryItems.length > 0 ? (
        <GalleryViewerModal
          items={galleryItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

function OverviewFlipCard({
  item,
  label,
  landscape = false,
}: {
  item: TourShowMediaItem;
  label: string;
  landscape?: boolean;
}) {
  const front = item.url;
  const back = item.back_url;
  if (landscape) {
    return (
      <div
        className={
          landscape
            ? "tour-show-page__flip-wrap tour-show-page__flip-wrap--landscape"
            : "tour-show-page__flip-wrap"
        }
      >
        <ReleasePhotocard
          frontUrl={front}
          backUrl={back ?? null}
          variant="landscape"
          className="tour-show-page__photocard"
          coverOnly
        />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  return (
    <div className="tour-show-page__flip-wrap">
      <ReleasePhotocard
        frontUrl={front}
        backUrl={back ?? null}
        variant="portrait"
        className="tour-show-page__photocard"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function LineupCircles({ members }: { members: LineupMember[] }) {
  if (!members.length) return null;
  return (
    <section className="tour-show-page__lineup-section">
      <h2 className="tour-show-page__section-label">Lineup</h2>
      <div className="release-page__section-glass release-page__lineup">
        <div className="release-page__lineup-grid tour-show-page__lineup-grid">
          {members.map((m) => (
            <div
              key={m.participation_id ?? m.id}
              className="release-lineup-card tour-show-page__lineup-card"
              title={m.name}
            >
              <span className="release-lineup-card__photo">
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" draggable={false} />
                ) : (
                  <span className="release-lineup-card__initials">
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="release-lineup-card__name">{m.name}</span>
              {(m.roles || []).length ? (
                <span className="release-lineup-card__roles">
                  {(m.roles || []).join(" · ")}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SetlistTabPanel({
  payload,
  recordings,
  recordingUrl,
  loading,
  coverUrl,
  tourTitle,
  showMeta,
}: {
  payload: TourShowSetlistPayload | null;
  recordings?: { label: string; url: string; kind?: string }[];
  recordingUrl: string | null;
  loading: boolean;
  coverUrl?: string | null;
  tourTitle?: string | null;
  showMeta?: string | null;
}) {
  const editions = useMemo(() => setlistPayloadToEditions(payload), [payload]);
  const links =
    recordings && recordings.length
      ? recordings
      : recordingUrl
        ? [{ label: "Full recording", url: recordingUrl, kind: "full" }]
        : [];

  if (loading) {
    return <PlaylistBoot className="playlist-boot--compact" label="Loading setlist…" />;
  }

  return (
    <div className="tour-show-page__setlist-tab release-page__tracklist-layout">
      <aside className="release-page__aside tour-show-page__setlist-aside">
        <div className="release-page__panel-card tour-show-page__setlist-panel">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="tour-show-page__setlist-cover"
              draggable={false}
            />
          ) : null}
          {tourTitle ? (
            <p className="tour-show-page__setlist-panel-title">{tourTitle}</p>
          ) : null}
          {showMeta ? (
            <p className="muted tour-show-page__setlist-panel-meta">{showMeta}</p>
          ) : null}
          <div className="tour-show-page__setlist-actions">
            {links.map((r) => (
              <a
                key={`${r.kind}-${r.url}`}
                className="text-btn"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                {r.label}
              </a>
            ))}
          </div>
        </div>
      </aside>
      <div className="release-page__main tour-show-page__setlist-main">
        {editions.length ? (
          <SetlistTracklist
            editions={editions}
            playingPath={null}
            setlistId="tour-show"
            showReleaseTitles
            onPlay={() => {}}
          />
        ) : (
          <p className="muted artist-section-empty">
            No setlist.fm match yet. Use Manage event → Refresh setlist.
          </p>
        )}
      </div>
    </div>
  );
}

export default function TourShowPage({
  bandId,
  tourSlug,
  showSlug,
  showTab = "overview",
  artistName,
  isAdmin = false,
  userId,
  standalone = false,
  backLabel = "TOURS",
  onBack,
  onNavigate,
  onOpenArtist,
  onOpenRelease,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const deviceLayout = useDeviceLayout();
  const bannerHero = isMobilePortraitLayout(deviceLayout);
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [detail, setDetail] = useState<TourShowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setlist, setSetlist] = useState<TourShowSetlistPayload | null>(null);
  const [setlistLoading, setSetlistLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [posterScope, setPosterScope] = useState<"show" | "tour">("show");
  const [photoHoverSide, setPhotoHoverSide] = useState<"left" | "right" | null>(
    null
  );
  const [bgLayers, setBgLayers] = useState<{ current?: string; outgoing?: string }>(
    {}
  );
  const photoColRef = useRef<HTMLDivElement>(null);

  const activeShowSlug = showSlug || detail?.show.slug || tour?.shows[0]?.slug;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tourData = await fetchBandTourDetail(bandId, tourSlug);
      setTour(tourData);
      const key = showSlug || tourData.shows[0]?.slug;
      if (!key) {
        setDetail(null);
        return;
      }
      const showData = await fetchBandTourShowDetail(bandId, tourData.slug, key);
      setDetail(showData);
      setSetlist(showData.setlist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load show");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [bandId, tourSlug, showSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showTab !== "setlist" || !detail) return;
    let cancelled = false;
    setSetlistLoading(true);
    void fetchTourShowSetlist(bandId, tourSlug, detail.show.slug)
      .then((payload) => {
        if (!cancelled) setSetlist(payload);
      })
      .catch(() => {
        if (!cancelled) setSetlist({ empty: true, tracks: [] });
      })
      .finally(() => {
        if (!cancelled) setSetlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showTab, bandId, tourSlug, detail?.show.slug]);

  const visibleTabs = useMemo(() => {
    if (!detail) return TAB_LABELS.filter((t) => t.id === "overview" || t.id === "setlist");
    return TAB_LABELS.filter((t) => {
      if (t.id === "overview" || t.id === "setlist") return true;
      if (t.id === "promo") return detail.show.has_promo || detail.promo.length > 0;
      if (t.id === "gallery") return detail.show.has_gallery;
      if (t.id === "souvenirs") return detail.show.has_souvenirs;
      return true;
    });
  }, [detail]);

  const activeTab = visibleTabs.some((t) => t.id === showTab) ? showTab : "overview";

  const backdropUrl = useMemo(() => {
    if (!detail) return undefined;
    const promoImg = detail.promo.find((p) => p.kind === "image")?.url;
    const show = detail.show;
    return (
      promoImg ||
      show.banner_url ||
      show.poster_url ||
      detail.tour.banner_url ||
      detail.tour.poster_url ||
      undefined
    );
  }, [detail]);

  useEffect(() => {
    if (!backdropUrl) return;
    setBgLayers((prev) => {
      if (prev.current === backdropUrl) return prev;
      return { outgoing: prev.current, current: backdropUrl };
    });
    const t = window.setTimeout(() => setBgLayers((p) => ({ current: p.current })), 420);
    return () => window.clearTimeout(t);
  }, [backdropUrl]);

  const runSyncShow = async () => {
    if (!detail || !tour) return;
    setBusy("Syncing show…");
    try {
      await syncTourShow(bandId, tour.slug, detail.show.slug);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy("");
    }
  };

  const runSyncArtists = async () => {
    if (!detail || !tour) return;
    setBusy("Syncing artists…");
    try {
      await syncTourShowArtists(bandId, tour.slug, detail.show.slug);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy("");
    }
  };

  const runRefreshSetlist = async () => {
    if (!detail || !tour) return;
    setSetlistLoading(true);
    try {
      const payload = await refreshTourShowSetlist(bandId, tour.slug, detail.show.slug);
      setSetlist(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setlist refresh failed");
    } finally {
      setSetlistLoading(false);
    }
  };

  if (loading && !detail && !tour) {
    return <PlaylistBoot label="Loading show…" />;
  }
  if (error && !detail) {
    return (
      <div className="tour-show-page tour-show-page--standalone">
        <button type="button" className="artist-page__catalog-back" onClick={onBack}>
          ← {backLabel}
        </button>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!tour || !detail) {
    return (
      <div className="tour-show-page tour-show-page--standalone">
        <button type="button" className="artist-page__catalog-back" onClick={onBack}>
          ← {backLabel}
        </button>
        <p className="muted">No shows on this tour.</p>
      </div>
    );
  }

  const show = detail.show;
  const place = [show.city, show.country].filter(Boolean).join(", ");
  const dateLabel = formatTrackDate(show.date_iso);
  const overview = detail.overview;
  const ticket = overview?.tickets?.[0];
  const setlistFile = overview?.setlist_files?.[0];
  const playlistCode = overview?.playlist_code ?? null;
  const qrCode = overview?.qr_code ?? null;
  const album = overview?.album;
  const bill = show.bill || [];
  const mains = bill.filter((b) => b.role === "main");
  const openers = bill.filter((b) => b.role !== "main");

  const showPoster = show.poster_url || show.banner_url;
  const tourPoster = tour.poster_url || tour.banner_url;
  const heroPoster =
    posterScope === "show"
      ? showPoster || tourPoster
      : tourPoster || showPoster;
  const heroBanner =
    posterScope === "show"
      ? show.banner_url || show.poster_url || tour.banner_url
      : tour.banner_url || tour.poster_url || show.banner_url;

  const stepPosterScope = (dir: -1 | 1) => {
    setPosterScope((s) => (dir === 1 ? (s === "show" ? "tour" : "show") : s === "tour" ? "show" : "tour"));
  };

  const topLogo = tour.logo_url ? (
    <img src={tour.logo_url} alt="" className="artist-page__brand-logo" draggable={false} />
  ) : null;

  return (
    <div
      className={[
        "tour-show-page",
        "artist-page",
        standalone ? "tour-show-page--standalone" : "",
        bannerHero ? "tour-show-page--banner-hero" : "tour-show-page--poster-hero",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="tour-show-page__backdrop" aria-hidden>
        {bgLayers.current ? (
          <div
            className={`tour-show-page__bg tour-show-page__bg--visible${
              bgLayers.outgoing ? " tour-show-page__bg--in" : ""
            }`}
            style={{ backgroundImage: `url("${bgLayers.current}")` } as CSSProperties}
          />
        ) : null}
        <MediaBeatFx />
      </div>

      <div className="tour-show-page__chrome artist-page__chrome">
        <header className="artist-page__top">
          <div className="artist-page__top-left">
            <button
              type="button"
              className="artist-page__catalog-back"
              onClick={onBack}
              aria-label={`Back to ${backLabel.toLowerCase()}`}
            >
              <svg className="artist-page__catalog-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="artist-page__catalog-label">{backLabel}</span>
            </button>
          </div>
          <div className="artist-page__top-center">
            {topLogo ? (
              <MediaBeatFrame variant="logo">{topLogo}</MediaBeatFrame>
            ) : (
              <TopBarTitle text={tour.title} className="artist-page__brand-name" />
            )}
          </div>
          <div className="artist-page__top-right">
            {busy ? <span className="muted">{busy}</span> : null}
            <AppMenu
              onImport={onImport}
              onSync={onSync ?? (() => {})}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              menuVariant="artist"
              showManageEvent={isAdmin}
              onSyncTourShow={() => void runSyncShow()}
              onSyncTourShowArtists={() => void runSyncArtists()}
              onRefreshTourSetlist={
                isAdmin ? () => void runRefreshSetlist() : undefined
              }
            />
          </div>
        </header>

        {detail.shows.length > 1 ? (
          <nav className="artist-page__subtabs tour-show-page__show-tabs" aria-label="Shows">
            {detail.shows.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.slug === activeShowSlug ? "active" : ""}
                onClick={() =>
                  onNavigate({
                    tourSlug: tour.slug,
                    showSlug: s.slug,
                    showTab: activeTab,
                  })
                }
              >
                {s.date_iso ? (
                  <ShowTabDate dateIso={s.date_iso} />
                ) : (
                  <span>{s.city || s.venue || s.slug}</span>
                )}
              </button>
            ))}
          </nav>
        ) : null}

        <nav className="artist-page__subtabs tour-show-page__section-tabs" aria-label="Show sections">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === activeTab ? "active" : ""}
              onClick={() =>
                onNavigate({
                  tourSlug: tour.slug,
                  showSlug: show.slug,
                  showTab: t.id,
                })
              }
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {error ? <p className="error tour-show-page__error">{error}</p> : null}

        <div className="tour-show-page__body">
          {activeTab === "overview" ? (
            <div className="artist-about tour-show-page__overview">
              <div className="artist-about__layout tour-show-page__hero">
                <div className="tour-show-page__hero-col">
                  <nav
                    className="tour-show-page__poster-tabs"
                    aria-label="Poster source"
                  >
                    <button
                      type="button"
                      className={posterScope === "show" ? "active" : ""}
                      onClick={() => setPosterScope("show")}
                    >
                      <span>SHOW</span>
                    </button>
                    <button
                      type="button"
                      className={posterScope === "tour" ? "active" : ""}
                      onClick={() => setPosterScope("tour")}
                    >
                      <span>TOUR</span>
                    </button>
                  </nav>

                  {bannerHero && heroBanner ? (
                    <img
                      src={heroBanner}
                      alt=""
                      className="tour-show-page__banner"
                      draggable={false}
                    />
                  ) : heroPoster ? (
                    <div
                      ref={photoColRef}
                      className="artist-about__photo-col tour-show-page__photo-col"
                      onMouseMove={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setPhotoHoverSide(
                          e.clientX - rect.left < rect.width / 2 ? "left" : "right"
                        );
                      }}
                      onMouseLeave={() => setPhotoHoverSide(null)}
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        stepPosterScope(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
                      }}
                      role="presentation"
                    >
                      {photoHoverSide ? (
                        <span
                          className={`artist-about__photo-shade artist-about__photo-shade--${photoHoverSide}`}
                          aria-hidden
                        />
                      ) : null}
                      <div className="artist-about__photo-stage">
                        <img
                          src={heroPoster}
                          alt=""
                          className="artist-about__photo artist-about__photo--layer media-beat-glow"
                          draggable={false}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="artist-about__photo artist-about__photo--empty" />
                  )}

                  <div className="tour-show-page__tour-nav">
                    {tour.prev_tour ? (
                      <button
                        type="button"
                        className="release-page__neighbor release-page__neighbor--prev"
                        onClick={() =>
                          onNavigate({ tourSlug: tour.prev_tour!.slug, showTab: activeTab })
                        }
                      >
                        <span className="release-page__neighbor-arrow" aria-hidden>
                          ‹
                        </span>
                        <span className="release-page__neighbor-text">
                          <span className="release-page__neighbor-title">
                            {tour.prev_tour.title}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                    {tour.next_tour ? (
                      <button
                        type="button"
                        className="release-page__neighbor release-page__neighbor--next"
                        onClick={() =>
                          onNavigate({ tourSlug: tour.next_tour!.slug, showTab: activeTab })
                        }
                      >
                        <span className="release-page__neighbor-text">
                          <span className="release-page__neighbor-title">
                            {tour.next_tour.title}
                          </span>
                        </span>
                        <span className="release-page__neighbor-arrow" aria-hidden>
                          ›
                        </span>
                      </button>
                    ) : (
                      <span className="release-page__neighbor-spacer" />
                    )}
                  </div>
                </div>

                <div className="artist-about__content tour-show-page__overview-main">
                  {(mains.length > 0 || openers.length > 0) && (
                    <section className="release-page__section-glass tour-show-page__bill-panel">
                      <div className="tour-show-page__bill-row">
                        <div className="tour-show-page__bill-side tour-show-page__bill-side--main">
                          {mains.map((b) => (
                            <BillCircle
                              key={`main-${b.artist_name}`}
                              entry={b}
                              onOpenArtist={onOpenArtist}
                            />
                          ))}
                        </div>
                        <div className="tour-show-page__bill-side tour-show-page__bill-side--openers">
                          {openers.map((b) => (
                            <BillCircle
                              key={`op-${b.artist_name}-${b.opener_order || ""}`}
                              entry={b}
                              onOpenArtist={onOpenArtist}
                            />
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  <dl className="tour-show-page__info-rows">
                    <div>
                      <dt>Tour</dt>
                      <dd>{tour.title}</dd>
                    </div>
                    {dateLabel ? (
                      <div>
                        <dt>Date</dt>
                        <dd>{dateLabel}</dd>
                      </div>
                    ) : null}
                    {place ? (
                      <div>
                        <dt>Place</dt>
                        <dd>{place}</dd>
                      </div>
                    ) : null}
                    {show.venue ? (
                      <div>
                        <dt>Venue</dt>
                        <dd className="tour-show-page__info-with-logo">
                          {show.venue_logo_url ? (
                            <img
                              src={show.venue_logo_url}
                              alt=""
                              className="tour-show-page__company-logo"
                            />
                          ) : null}
                          {!show.venue_logo_url ? show.venue : null}
                        </dd>
                      </div>
                    ) : null}
                    {show.ticketer ? (
                      <div>
                        <dt>Ticketer</dt>
                        <dd className="tour-show-page__info-with-logo">
                          {show.ticketer_logo_url ? (
                            <img
                              src={show.ticketer_logo_url}
                              alt=""
                              className="tour-show-page__company-logo"
                            />
                          ) : null}
                          {!show.ticketer_logo_url ? show.ticketer : null}
                        </dd>
                      </div>
                    ) : null}
                    {show.promoter ? (
                      <div>
                        <dt>Promoter</dt>
                        <dd className="tour-show-page__info-with-logo">
                          {show.promoter_logo_url ? (
                            <img
                              src={show.promoter_logo_url}
                              alt=""
                              className="tour-show-page__company-logo"
                            />
                          ) : null}
                          {!show.promoter_logo_url ? show.promoter : null}
                        </dd>
                      </div>
                    ) : null}
                    {artistName ? (
                      <div>
                        <dt>Artist</dt>
                        <dd>{artistName}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {overview?.lineup?.length ? (
                    <LineupCircles members={overview.lineup} />
                  ) : null}

                  <div className="tour-show-page__overview-cols">
                    {album || tour.album_title ? (
                      <section className="tour-show-page__overview-col tour-show-page__overview-col--stretch">
                        <button
                          type="button"
                          className="tour-show-page__album tour-show-page__album--stretch"
                          onClick={() => {
                            const rid = album?.release_id;
                            if (rid) onOpenRelease?.(rid);
                          }}
                          disabled={!album?.release_id}
                        >
                          {(album?.cover_url || tour.album_cover_url) ? (
                            <img
                              src={album?.cover_url || tour.album_cover_url || ""}
                              alt=""
                              draggable={false}
                            />
                          ) : null}
                        </button>
                      </section>
                    ) : null}
                    {setlistFile ? (
                      <section className="tour-show-page__overview-col tour-show-page__overview-col--stretch">
                        <OverviewFlipCard item={setlistFile} label="Setlist" />
                      </section>
                    ) : null}
                    {(ticket || playlistCode || qrCode) && (
                      <section className="tour-show-page__overview-col tour-show-page__ticket-col">
                        {ticket ? (
                          <OverviewFlipCard item={ticket} label="Ticket" landscape />
                        ) : null}
                        <div className="tour-show-page__codes">
                          {playlistCode ? (
                            <button
                              type="button"
                              className="tour-show-page__code-thumb"
                              title="Playlist code"
                              onClick={() =>
                                window.open(playlistCode.url, "_blank", "noopener,noreferrer")
                              }
                            >
                              {playlistCode.kind === "image" ? (
                                <img src={playlistCode.url} alt="" draggable={false} />
                              ) : (
                                <span>{playlistCode.label || "Playlist"}</span>
                              )}
                            </button>
                          ) : null}
                          {qrCode ? (
                            <button
                              type="button"
                              className="tour-show-page__code-thumb"
                              title="QR"
                              onClick={() =>
                                window.open(qrCode.url, "_blank", "noopener,noreferrer")
                              }
                            >
                              {qrCode.kind === "image" ? (
                                <img src={qrCode.url} alt="" draggable={false} />
                              ) : (
                                <span>{qrCode.label || "QR"}</span>
                              )}
                            </button>
                          ) : null}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "promo" ? (
            <TourShowMediaSection items={detail.promo} empty="No promo media." />
          ) : null}
          {activeTab === "gallery" ? (
            <TourShowMediaSection items={detail.gallery} empty="No gallery media." />
          ) : null}
          {activeTab === "souvenirs" ? (
            <TourShowMediaSection items={detail.souvenirs} empty="No souvenirs." />
          ) : null}
          {activeTab === "setlist" ? (
            <SetlistTabPanel
              payload={setlist}
              recordings={overview?.recordings || []}
              recordingUrl={overview?.recording_url || null}
              loading={setlistLoading}
              coverUrl={heroPoster || tourPoster}
              tourTitle={tour.title}
              showMeta={[dateLabel, place].filter(Boolean).join(" · ") || null}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
