import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBandTourDetail,
  fetchBandTourShowDetail,
  fetchTourShowSetlist,
  refreshTourShowSetlist,
  syncTourShow,
  syncTourShowArtists,
} from "../../../api";
import { formatTrackDate } from "../../../formatDate";
import type {
  LineupMember,
  TourDetail,
  TourShowDetail,
  TourShowMediaItem,
  TourShowSetlistPayload,
  TourShowTab,
} from "../../../types";
import PlaylistBoot from "../../PlaylistBoot";

type Props = {
  bandId: number;
  tourSlug: string;
  showSlug?: string;
  showTab?: TourShowTab;
  artistName?: string;
  isAdmin?: boolean;
  onBack: () => void;
  onNavigate: (next: {
    tourSlug: string;
    showSlug?: string;
    showTab?: TourShowTab;
  }) => void;
  onOpenArtist?: (bandId: number) => void;
  onOpenRelease?: (releaseId: string) => void;
};

const TAB_LABELS: { id: TourShowTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "promo", label: "PROMO" },
  { id: "setlist", label: "SETLIST" },
  { id: "gallery", label: "GALLERY" },
  { id: "souvenirs", label: "SOUVENIRS" },
];

function MediaGrid({
  items,
  empty,
}: {
  items: TourShowMediaItem[];
  empty: string;
}) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  if (!items.length) {
    return <p className="muted artist-section-empty">{empty}</p>;
  }
  return (
    <div className="tour-show-media-grid">
      {items.map((item) => {
        const showBack = Boolean(flipped[item.id] && item.back_url);
        const src = showBack && item.back_url ? item.back_url : item.url;
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
              <span className="tour-show-media-card__flip">
                {showBack ? "Front" : "Back"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function LineupCircles({ members }: { members: LineupMember[] }) {
  if (!members.length) return null;
  return (
    <div className="tour-show-page__lineup">
      {members.map((m) => (
        <div key={m.participation_id ?? m.id} className="tour-show-page__circle" title={m.name}>
          {m.photo_url ? (
            <img src={m.photo_url} alt="" draggable={false} />
          ) : (
            <span>{m.name.slice(0, 1)}</span>
          )}
          <span className="tour-show-page__circle-name">{m.name}</span>
        </div>
      ))}
    </div>
  );
}

function FlippableCard({
  item,
  label,
  landscape = false,
}: {
  item: TourShowMediaItem;
  label: string;
  landscape?: boolean;
}) {
  const [back, setBack] = useState(false);
  const src = back && item.back_url ? item.back_url : item.url;
  return (
    <button
      type="button"
      className={
        landscape
          ? "tour-show-page__flip-card tour-show-page__flip-card--landscape"
          : "tour-show-page__flip-card"
      }
      onClick={() => item.has_back && setBack((v) => !v)}
      title={label}
    >
      {item.kind === "image" ? (
        <img src={src} alt={label} draggable={false} />
      ) : (
        <span>{item.label}</span>
      )}
      {item.has_back ? (
        <span className="tour-show-media-card__flip">{back ? "Front" : "Back"}</span>
      ) : null}
    </button>
  );
}

function CodeThumb({ item, label }: { item: TourShowMediaItem; label: string }) {
  return (
    <button
      type="button"
      className="tour-show-page__code-thumb"
      title={label}
      onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
    >
      {item.kind === "image" ? (
        <img src={item.url} alt={label} draggable={false} />
      ) : (
        <span>{item.label || label}</span>
      )}
      <span className="tour-show-page__code-thumb-label">{label}</span>
    </button>
  );
}

function SetlistPanel({
  payload,
  recordings,
  recordingUrl,
  loading,
  onRefresh,
  canRefresh,
}: {
  payload: TourShowSetlistPayload | null;
  recordings?: { label: string; url: string; kind?: string }[];
  recordingUrl: string | null;
  loading: boolean;
  onRefresh?: () => void;
  canRefresh?: boolean;
}) {
  const tracks = (payload?.tracks || []) as {
    title?: string;
    unavailable?: boolean;
    play_path?: string | null;
    number?: number | null;
  }[];
  const groups = (payload?.groups || []) as {
    label?: string;
    tracks?: typeof tracks;
  }[];
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
    <div className="tour-show-page__setlist">
      <div className="tour-show-page__setlist-actions">
        {canRefresh && onRefresh ? (
          <button type="button" className="text-btn" onClick={onRefresh}>
            Refresh setlist
          </button>
        ) : null}
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
      {groups.length ? (
        groups.map((g, i) => (
          <section key={g.label || i}>
            {g.label ? <h3>{g.label}</h3> : null}
            <ol className="tour-show-page__setlist-tracks">
              {(g.tracks || []).map((t, ti) => (
                <li key={`${t.title}-${ti}`} className={t.unavailable ? "is-missing" : ""}>
                  <span className="tour-show-page__setlist-num">{t.number ?? ti + 1}</span>
                  <span>{t.title}</span>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : tracks.length ? (
        <ol className="tour-show-page__setlist-tracks">
          {tracks.map((t, i) => (
            <li key={`${t.title}-${i}`} className={t.unavailable ? "is-missing" : ""}>
              <span className="tour-show-page__setlist-num">{t.number ?? i + 1}</span>
              <span>{t.title}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted artist-section-empty">
          No setlist.fm match yet. {canRefresh ? "Try Refresh setlist." : ""}
        </p>
      )}
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
  onBack,
  onNavigate,
  onOpenArtist,
  onOpenRelease,
}: Props) {
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [detail, setDetail] = useState<TourShowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setlist, setSetlist] = useState<TourShowSetlistPayload | null>(null);
  const [setlistLoading, setSetlistLoading] = useState(false);
  const [busy, setBusy] = useState("");

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

  const runSyncShow = async () => {
    if (!detail) return;
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
      <div className="tour-show-page">
        <button type="button" className="text-btn" onClick={onBack}>
          ← Tours
        </button>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!tour || !detail) {
    return (
      <div className="tour-show-page">
        <button type="button" className="text-btn" onClick={onBack}>
          ← Tours
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
  const showTicketCol = Boolean(ticket || playlistCode || qrCode);

  return (
    <div className="tour-show-page">
      <header className="tour-show-page__header">
        <div className="tour-show-page__nav">
          <button type="button" className="text-btn" onClick={onBack}>
            ← Tours
          </button>
          <div className="tour-show-page__tour-nav">
            {tour.prev_tour ? (
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  onNavigate({ tourSlug: tour.prev_tour!.slug, showTab: activeTab })
                }
              >
                ← {tour.prev_tour.title}
              </button>
            ) : (
              <span />
            )}
            {tour.next_tour ? (
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  onNavigate({ tourSlug: tour.next_tour!.slug, showTab: activeTab })
                }
              >
                {tour.next_tour.title} →
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {isAdmin ? (
          <div className="tour-show-page__admin">
            <button type="button" className="text-btn" onClick={() => void runSyncShow()} disabled={Boolean(busy)}>
              Sync show
            </button>
            <button type="button" className="text-btn" onClick={() => void runSyncArtists()} disabled={Boolean(busy)}>
              Sync artists
            </button>
            {busy ? <span className="muted">{busy}</span> : null}
          </div>
        ) : null}

        <div className="tour-show-page__hero">
          {(show.banner_url || tour.banner_url) && (
            <img
              src={show.banner_url || tour.banner_url || ""}
              alt=""
              className="tour-show-page__banner"
              draggable={false}
            />
          )}
          <div className="tour-show-page__hero-copy">
            <p className="tour-show-page__tour-title">{tour.title}</p>
            <h1 className="tour-show-page__show-title">{show.venue || "Show"}</h1>
            <p className="tour-show-page__meta">
              {[dateLabel, place].filter(Boolean).join(" · ")}
            </p>
            {artistName ? (
              <p className="muted tour-show-page__artist">{artistName}</p>
            ) : null}
          </div>
        </div>

        {detail.shows.length > 1 ? (
          <div className="tour-show-page__show-picker" role="tablist">
            {detail.shows.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                className={
                  s.slug === activeShowSlug
                    ? "tour-show-page__show-chip is-active"
                    : "tour-show-page__show-chip"
                }
                onClick={() =>
                  onNavigate({
                    tourSlug: tour.slug,
                    showSlug: s.slug,
                    showTab: activeTab,
                  })
                }
              >
                {formatTrackDate(s.date_iso) || s.city || s.venue || s.slug}
              </button>
            ))}
          </div>
        ) : null}

        <nav className="tour-show-page__tabs" aria-label="Show sections">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                t.id === activeTab ? "tour-show-page__tab is-active" : "tour-show-page__tab"
              }
              onClick={() =>
                onNavigate({
                  tourSlug: tour.slug,
                  showSlug: show.slug,
                  showTab: t.id,
                })
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="tour-show-page__body">
        {activeTab === "overview" ? (
          <div className="tour-show-page__overview">
            <section>
              <h2>Bill</h2>
              <ul className="tour-show-page__bill">
                {(show.bill || []).map((b) => (
                  <li key={`${b.role}-${b.artist_name}-${b.opener_order || ""}`}>
                    {b.band_id && onOpenArtist ? (
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => onOpenArtist(b.band_id!)}
                      >
                        {b.artist_name}
                      </button>
                    ) : (
                      <span>{b.artist_name}</span>
                    )}
                    <span className="muted">
                      {b.role === "main"
                        ? "Main"
                        : `Support${b.opener_order ? ` ${b.opener_order}` : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {overview?.lineup?.length ? (
              <section>
                <h2>Lineup</h2>
                <LineupCircles members={overview.lineup} />
              </section>
            ) : null}

            <div className="tour-show-page__overview-cols">
              {setlistFile ? (
                <section>
                  <h2>Setlist</h2>
                  <FlippableCard item={setlistFile} label="Setlist" />
                </section>
              ) : null}
              {showTicketCol ? (
                <section className="tour-show-page__ticket-col">
                  <h2>Ticket</h2>
                  {ticket ? (
                    <FlippableCard item={ticket} label="Ticket" landscape />
                  ) : null}
                  {playlistCode || qrCode ? (
                    <div className="tour-show-page__codes">
                      {playlistCode ? (
                        <CodeThumb item={playlistCode} label="Playlist" />
                      ) : null}
                      {qrCode ? <CodeThumb item={qrCode} label="QR" /> : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {album ? (
                <section>
                  <h2>Supported album</h2>
                  <button
                    type="button"
                    className="tour-show-page__album"
                    onClick={() =>
                      album.release_id && onOpenRelease?.(album.release_id)
                    }
                    disabled={!album.release_id}
                  >
                    {album.cover_url ? (
                      <img src={album.cover_url} alt="" draggable={false} />
                    ) : null}
                    <span>{album.title}</span>
                  </button>
                </section>
              ) : tour.album_title ? (
                <section>
                  <h2>Supported album</h2>
                  <div className="tour-show-page__album">
                    {tour.album_cover_url ? (
                      <img src={tour.album_cover_url} alt="" draggable={false} />
                    ) : null}
                    <span>{tour.album_title}</span>
                  </div>
                </section>
              ) : null}
            </div>

            <section>
              <h2>Venue</h2>
              <p>
                {show.venue_logo_url ? (
                  <img
                    src={show.venue_logo_url}
                    alt=""
                    className="tour-show-page__company-logo"
                  />
                ) : null}
                {show.venue || "—"}
              </p>
              <p className="muted">{place || null}</p>
            </section>

            <section>
              <h2>Companies</h2>
              <div className="tour-show-page__companies">
                {show.promoter ? (
                  <div>
                    {show.promoter_logo_url ? (
                      <img
                        src={show.promoter_logo_url}
                        alt=""
                        className="tour-show-page__company-logo"
                      />
                    ) : null}
                    <span>Promoter: {show.promoter}</span>
                  </div>
                ) : null}
                {show.ticketer ? (
                  <div>
                    {show.ticketer_logo_url ? (
                      <img
                        src={show.ticketer_logo_url}
                        alt=""
                        className="tour-show-page__company-logo"
                      />
                    ) : null}
                    <span>Tickets: {show.ticketer}</span>
                  </div>
                ) : null}
                {!show.promoter && !show.ticketer ? (
                  <p className="muted">No promoter / ticketer detected.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "promo" ? (
          <MediaGrid items={detail.promo} empty="No promo media." />
        ) : null}
        {activeTab === "gallery" ? (
          <MediaGrid items={detail.gallery} empty="No gallery media." />
        ) : null}
        {activeTab === "souvenirs" ? (
          <MediaGrid items={detail.souvenirs} empty="No souvenirs." />
        ) : null}
        {activeTab === "setlist" ? (
          <SetlistPanel
            payload={setlist}
            recordings={overview?.recordings || []}
            recordingUrl={overview?.recording_url || null}
            loading={setlistLoading}
            canRefresh={isAdmin}
            onRefresh={() => void runRefreshSetlist()}
          />
        ) : null}
      </div>
    </div>
  );
}
