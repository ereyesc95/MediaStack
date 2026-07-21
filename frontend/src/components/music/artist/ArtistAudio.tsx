import { useEffect, useMemo, useState } from "react";
import { resolveArtistName } from "../../../api";
import {
  getCachedArtistAudio,
  prefetchArtistAudio,
} from "../../../artistAudioCache";
import { prefetchReleaseOverview } from "../../../releaseOverviewCache";
import {
  clearPendingAudioCategory,
  pendingAudioCategoryFor,
  pendingCompilationBoxSetsOnlyFor,
  pushArtistRoute,
  saveReleaseReferrer,
} from "../../../musicRoute";
import { DEFAULT_DISC_URL, writerSearchUrl } from "../release/releaseTrackPanelMeta";
import { formatTrackDate } from "../../../formatDate";
import { usePhoneLayout } from "../../../usePhoneLayout";
import type {
  ArtistPlaylistCard,
  AudioIndexPayload,
  AudioReleaseCard,
  ReleaseCardLayout,
} from "../../../types";
import {
  ArtistPlaylistGrid,
} from "./ArtistPlaylists";

export const AUDIO_CATEGORY_META: {
  key: string;
  desktop: string;
  mobile: string;
}[] = [
  { key: "albums", desktop: "STUDIO ALBUMS", mobile: "STUDIO" },
  { key: "extended_plays", desktop: "EXTENDED PLAYS", mobile: "EPs" },
  { key: "compilations", desktop: "COMPILATIONS", mobile: "COMPs" },
  { key: "live_albums", desktop: "LIVE ALBUMS", mobile: "LIVE" },
  { key: "soundtracks", desktop: "SOUNDTRACKS", mobile: "OST" },
  { key: "singles", desktop: "SINGLES", mobile: "SINGLES" },
];

const PLAYLISTS_META = {
  key: "playlists",
  desktop: "PLAYLISTS",
  mobile: "LISTS",
};

function pickAudioCategory(
  bandId: number,
  index: AudioIndexPayload | null,
  current: string
): string {
  const pending = pendingAudioCategoryFor(bandId);
  if (pending === "playlists") return "playlists";
  if (pending && index?.categories.includes(pending)) return pending;
  if (current && (current === "playlists" || index?.categories.includes(current))) {
    return current;
  }
  return index?.categories[0] ?? "";
}

export type ArtistAudioState = {
  index: AudioIndexPayload | null;
  playlists: ArtistPlaylistCard[];
  loading: boolean;
  error: string | null;
  category: string;
  setCategory: (key: string) => void;
  officialOnly: boolean;
  setOfficialOnly: (value: boolean) => void;
  compilationBoxSetsOnly: boolean;
  setCompilationBoxSetsOnly: (value: boolean) => void;
  visibleCategories: typeof AUDIO_CATEGORY_META;
  showUnofficialBar: boolean;
  showCompilationEditionBar: boolean;
  releases: AudioReleaseCard[];
  selectedPlaylist: string | null;
  setSelectedPlaylist: (slug: string | null) => void;
};

function compilationBoxSetsFromPending(bandId: number, categoryKey: string): boolean {
  return categoryKey === "compilations" && pendingCompilationBoxSetsOnlyFor(bandId);
}

export function useArtistAudio(
  bandId: number,
  refreshKey: number,
  enabled: boolean,
  options?: { hidePlaylists?: boolean }
): ArtistAudioState {
  const [index, setIndex] = useState<AudioIndexPayload | null>(
    () => getCachedArtistAudio(bandId)?.audio ?? null
  );
  const [playlists, setPlaylists] = useState<ArtistPlaylistCard[]>(
    () => getCachedArtistAudio(bandId)?.playlists ?? []
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedArtistAudio(bandId)
  );
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(() =>
    pickAudioCategory(
      bandId,
      getCachedArtistAudio(bandId)?.audio ?? null,
      ""
    )
  );
  const [officialOnly, setOfficialOnly] = useState(true);
  const [compilationBoxSetsOnly, setCompilationBoxSetsOnly] = useState(() =>
    compilationBoxSetsFromPending(
      bandId,
      pickAudioCategory(bandId, getCachedArtistAudio(bandId)?.audio ?? null, "")
    )
  );
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIndex(null);
      setPlaylists([]);
      setLoading(false);
      setError(null);
      setSelectedPlaylist(null);
      return;
    }
    let cancelled = false;
    const cached = refreshKey > 0 ? null : getCachedArtistAudio(bandId);
    if (cached) {
      setIndex(cached.audio);
      setPlaylists(cached.playlists);
      setCategory((prev) => {
        const cat = pickAudioCategory(bandId, cached.audio, prev);
        if (compilationBoxSetsFromPending(bandId, cat)) {
          setCompilationBoxSetsOnly(true);
        }
        return cat;
      });
      clearPendingAudioCategory(bandId);
      setOfficialOnly(true);
      setSelectedPlaylist(null);
      setLoading(false);
      setError(null);
      prefetchArtistAudio(bandId, { force: true })
        .then((entry) => {
          if (cancelled) return;
          setIndex(entry.audio);
          setPlaylists(entry.playlists);
          if (entry.audio.stale) {
            window.setTimeout(() => {
              prefetchArtistAudio(bandId, { force: true })
                .then((fresh) => {
                  if (!cancelled && !fresh.audio.stale) setIndex(fresh.audio);
                })
                .catch(() => {});
            }, 2500);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    prefetchArtistAudio(bandId, { force: true })
      .then((entry) => {
        if (cancelled) return;
        setIndex(entry.audio);
        setPlaylists(entry.playlists);
        setCategory((prev) => {
          const cat = pickAudioCategory(bandId, entry.audio, prev);
          if (compilationBoxSetsFromPending(bandId, cat)) {
            setCompilationBoxSetsOnly(true);
          }
          return cat;
        });
        clearPendingAudioCategory(bandId);
        setOfficialOnly(true);
        setSelectedPlaylist(null);
        if (entry.audio.stale) {
          window.setTimeout(() => {
            prefetchArtistAudio(bandId, { force: true })
              .then((fresh) => {
                if (!cancelled && !fresh.audio.stale) setIndex(fresh.audio);
              })
              .catch(() => {});
          }, 2500);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, refreshKey, enabled]);

  const visibleCategories = useMemo(() => {
    const releaseCats = AUDIO_CATEGORY_META.filter((c) =>
      index?.categories.includes(c.key)
    );
    if (!options?.hidePlaylists && playlists.length > 0) {
      return [...releaseCats, PLAYLISTS_META];
    }
    return releaseCats;
  }, [index?.categories, playlists.length, options?.hidePlaylists]);

  const showUnofficialBar = Boolean(
    category &&
      category !== "playlists" &&
      index?.unofficial_by_category?.[category]
  );

  const showCompilationEditionBar = Boolean(
    category === "compilations" &&
      index?.box_sets_by_category?.compilations &&
      index?.standard_compilations_by_category?.compilations
  );

  const releases = useMemo(() => {
    if (!index || !category || category === "playlists") return [];
    return index.releases.filter(
      (r) =>
        r.category === category &&
        (officialOnly ? r.official : !r.official) &&
        (!showCompilationEditionBar ||
          category !== "compilations" ||
          (compilationBoxSetsOnly ? r.is_box_set : !r.is_box_set))
    );
  }, [
    index,
    category,
    officialOnly,
    compilationBoxSetsOnly,
    showCompilationEditionBar,
  ]);

  useEffect(() => {
    if (!index || !visibleCategories.length) return;
    if (category && visibleCategories.some((c) => c.key === category)) return;
    setCategory((prev) => pickAudioCategory(bandId, index, prev));
  }, [visibleCategories, category, index, bandId]);

  return {
    index,
    playlists,
    loading,
    error,
    category,
    setCategory: (key: string) => {
      clearPendingAudioCategory(bandId);
      setCategory(key);
      setOfficialOnly(true);
      setCompilationBoxSetsOnly(false);
      setSelectedPlaylist(null);
    },
    officialOnly,
    setOfficialOnly,
    compilationBoxSetsOnly,
    setCompilationBoxSetsOnly,
    visibleCategories,
    showUnofficialBar,
    showCompilationEditionBar,
    releases,
    selectedPlaylist,
    setSelectedPlaylist,
  };
}

type BarsProps = {
  state: ArtistAudioState;
  mobilePortrait: boolean;
};

export function ArtistAudioBars({ state, mobilePortrait }: BarsProps) {
  const {
    index,
    playlists,
    category,
    setCategory,
    officialOnly,
    setOfficialOnly,
    compilationBoxSetsOnly,
    setCompilationBoxSetsOnly,
    visibleCategories,
    showUnofficialBar,
    showCompilationEditionBar,
    selectedPlaylist,
  } = state;

  if (!index?.releases.length && !playlists.length) return null;
  if (selectedPlaylist) return null;

  return (
    <>
      {visibleCategories.length > 0 && (
        <nav className="artist-page__subtabs artist-audio__type-bar">
          {visibleCategories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={category === c.key ? "active" : ""}
              onClick={() => setCategory(c.key)}
            >
              <span>{mobilePortrait ? c.mobile : c.desktop}</span>
            </button>
          ))}
        </nav>
      )}
      {showUnofficialBar && (
        <nav className="artist-page__subtabs artist-audio__official-bar">
          <button
            type="button"
            className={officialOnly ? "active" : ""}
            onClick={() => setOfficialOnly(true)}
          >
            <span>OFFICIAL</span>
          </button>
          <button
            type="button"
            className={!officialOnly ? "active" : ""}
            onClick={() => setOfficialOnly(false)}
          >
            <span>UNOFFICIAL</span>
          </button>
        </nav>
      )}
      {showCompilationEditionBar && (
        <nav className="artist-page__subtabs artist-audio__compilation-bar">
          <button
            type="button"
            className={!compilationBoxSetsOnly ? "active" : ""}
            onClick={() => setCompilationBoxSetsOnly(false)}
          >
            <span>RELEASES</span>
          </button>
          <button
            type="button"
            className={compilationBoxSetsOnly ? "active" : ""}
            onClick={() => setCompilationBoxSetsOnly(true)}
          >
            <span>BOX SETS</span>
          </button>
        </nav>
      )}
    </>
  );
}

function ReleaseCard({
  release,
  bandId,
  category,
  referrerArtistName,
  artistName,
  cardLayout,
  tapReveal = false,
  revealed = false,
  onReveal,
  onOpenReleaseNavigate,
  onOpenArtist,
}: {
  release: AudioReleaseCard;
  bandId: number;
  category: string;
  referrerArtistName?: string;
  artistName?: string;
  cardLayout: ReleaseCardLayout;
  tapReveal?: boolean;
  revealed?: boolean;
  onReveal?: () => void;
  onOpenReleaseNavigate?: (targetBandId: number, releaseId: string) => void;
  onOpenArtist?: (targetBandId: number) => void;
}) {
  const handleOpen = () => {
    const targetBand = release.navigate_band_id;
    const targetRelease = release.navigate_release_id;
    if (targetBand !== bandId) {
      saveReleaseReferrer({
        bandId,
        section: "audio",
        category,
        artistName: referrerArtistName,
      });
    }
    void prefetchReleaseOverview(targetBand, targetRelease);
    if (onOpenReleaseNavigate) {
      onOpenReleaseNavigate(targetBand, targetRelease);
    }
    pushArtistRoute({
      bandId: targetBand,
      section: "audio",
      overviewTab: "about",
      releaseId: targetRelease,
    });
  };

  const handleActivate = () => {
    if (tapReveal && cardLayout === "banner" && !revealed) {
      onReveal?.();
      return;
    }
    handleOpen();
  };

  const openSourceArtist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = release.source_artist_name?.trim();
    if (!name) return;
    if (release.source_band_id && release.source_band_id !== bandId) {
      onOpenArtist?.(release.source_band_id);
      pushArtistRoute({
        bandId: release.source_band_id,
        section: "audio",
        overviewTab: "about",
      });
      return;
    }
    try {
      const res = await resolveArtistName(name);
      if (res.band_id) {
        onOpenArtist?.(res.band_id);
        return;
      }
      if (res.urls?.wikipedia) {
        window.open(res.urls.wikipedia, "_blank", "noopener,noreferrer");
        return;
      }
      if (res.urls?.musicbrainz) {
        window.open(res.urls.musicbrainz, "_blank", "noopener,noreferrer");
        return;
      }
      window.open(writerSearchUrl(name), "_blank", "noopener,noreferrer");
    } catch {
      window.open(writerSearchUrl(name), "_blank", "noopener,noreferrer");
    }
  };

  const fullDate =
    formatTrackDate(release.date_iso) || release.display_date || null;
  const coverUrl = release.cover_url || DEFAULT_DISC_URL;
  const showSourceArtist =
    Boolean(release.source_artist_name) &&
    (release.navigate_band_id !== bandId ||
      (release.source_band_id != null && release.source_band_id !== bandId));

  if (cardLayout === "banner") {
    const bannerBg = release.banner_url
      ? `url("${release.banner_url}")`
      : "linear-gradient(135deg, #1a1f2e, #2d3548)";
    return (
      <article
        className={[
          "media-release-card",
          "media-release-card--banner",
          "media-release-card--clickable",
          "media-beat-frame",
          "media-beat-frame--cover",
          revealed ? "media-release-card--revealed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate();
          }
        }}
      >
        <span
          className="media-release-card__banner-bg"
          style={{ backgroundImage: bannerBg }}
        />
        <span className="media-release-card__banner-overlay">
          <span className="media-release-card__banner-glass" aria-hidden />
          <span
            className="media-release-card__banner-cover"
            style={{ backgroundImage: `url("${coverUrl}")` }}
          />
          <span className="media-release-card__banner-meta">
            {release.logo_collapsed_url || release.logo_url ? (
              <img
                src={release.logo_collapsed_url || release.logo_url!}
                alt=""
                className={
                  release.logo_collapsed_url
                    ? "media-release-card__banner-release-logo media-release-card__banner-release-logo--collapsed"
                    : "media-release-card__banner-release-logo"
                }
                draggable={false}
              />
            ) : (
              <span className="media-release-card__banner-title">
                {release.title}
              </span>
            )}
            {(release.era_icon_url || release.era_logo_url) ? (
              <span className="media-release-card__banner-artist-brand">
                {release.era_icon_url ? (
                  <img
                    src={release.era_icon_url}
                    alt=""
                    className="media-release-card__banner-era-icon"
                    draggable={false}
                  />
                ) : null}
                {release.era_logo_url ? (
                  <img
                    src={release.era_logo_url}
                    alt=""
                    className="media-release-card__banner-era-logo"
                    draggable={false}
                  />
                ) : null}
              </span>
            ) : artistName ? (
              <span className="media-release-card__banner-artist">{artistName}</span>
            ) : null}
            {fullDate ? (
              <span className="media-release-card__banner-date">{fullDate}</span>
            ) : null}
            {showSourceArtist ? (
              <button
                type="button"
                className="media-release-card__source-artist-link"
                onClick={(e) => void openSourceArtist(e)}
              >
                By {release.source_artist_name}
              </button>
            ) : null}
          </span>
        </span>
      </article>
    );
  }

  const hoverLabel = release.logo_url ? (
    <img
      src={release.logo_url}
      alt=""
      className="media-release-card__logo"
      draggable={false}
    />
  ) : (
    <span className="media-release-card__title-hover">{release.title}</span>
  );

  return (
    <article
      className="media-release-card media-release-card--clickable media-beat-frame media-beat-frame--cover"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
    >
      <span
        className="media-release-card__cover"
        style={
          release.cover_url
            ? { backgroundImage: `url("${release.cover_url}")` }
            : undefined
        }
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">{hoverLabel}</span>
      {release.display_date || showSourceArtist ? (
        <span className="media-release-card__date">
          {showSourceArtist ? (
            <span className="media-release-card__source-artist">
              By{" "}
              <button
                type="button"
                className="media-release-card__source-artist-link"
                onClick={(e) => void openSourceArtist(e)}
              >
                {release.source_artist_name}
              </button>
            </span>
          ) : null}
          {release.display_date ? (
            <span className="media-release-card__date-label">
              {release.display_date}
            </span>
          ) : null}
        </span>
      ) : null}
    </article>
  );
}

type Props = {
  state: ArtistAudioState;
  onPlayTrack?: (path: string, title: string) => void;
  bandId: number;
  referrerArtistName?: string;
  artistName?: string;
  cardLayout?: ReleaseCardLayout;
  onOpenReleaseNavigate?: (targetBandId: number, releaseId: string) => void;
  onOpenPlaylist?: (slug: string) => void;
  onOpenArtist?: (targetBandId: number) => void;
};

export default function ArtistAudio({
  state,
  onPlayTrack: _onPlayTrack,
  bandId,
  referrerArtistName,
  artistName,
  cardLayout = "cover",
  onOpenReleaseNavigate,
  onOpenPlaylist,
  onOpenArtist,
}: Props) {
  const {
    index,
    playlists,
    loading,
    error,
    category,
    officialOnly,
    releases,
    selectedPlaylist,
    setSelectedPlaylist,
  } = state;
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [category, cardLayout, bandId]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".media-release-card--banner")) return;
      setRevealedId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isPhone, revealedId]);

  if (loading && !index) {
    return <p className="muted artist-section-empty">Loading audio…</p>;
  }

  if (error) {
    return <p className="muted artist-section-empty">{error}</p>;
  }

  if (!index?.releases.length && !playlists.length) {
    return (
      <p className="muted artist-section-empty">No audio releases found.</p>
    );
  }

  if (selectedPlaylist && !onOpenPlaylist) {
    return (
      <div className="artist-audio">
        <p className="muted artist-section-empty">Open playlists from the artist audio tab.</p>
      </div>
    );
  }

  if (category === "playlists") {
    return (
      <div className="artist-audio">
        <ArtistPlaylistGrid
          playlists={playlists}
          onSelect={(slug) =>
            onOpenPlaylist ? onOpenPlaylist(slug) : setSelectedPlaylist(slug)
          }
        />
      </div>
    );
  }

  return (
    <div className="artist-audio">
      {releases.length === 0 ? (
        <p className="muted artist-audio__empty">
          No {officialOnly ? "official" : "unofficial"} releases in this
          category.
        </p>
      ) : (
        <div
          className={`media-release-grid${
            cardLayout === "banner" ? " media-release-grid--banner" : ""
          }`}
        >
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              bandId={bandId}
              category={category}
              referrerArtistName={referrerArtistName}
              artistName={artistName}
              cardLayout={cardLayout}
              tapReveal={isPhone && cardLayout === "banner"}
              revealed={isPhone && revealedId === release.id}
              onReveal={() => setRevealedId(release.id)}
              onOpenReleaseNavigate={onOpenReleaseNavigate}
              onOpenArtist={onOpenArtist}
            />
          ))}
        </div>
      )}
    </div>
  );
}
