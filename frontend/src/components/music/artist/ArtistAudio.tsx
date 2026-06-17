import { useEffect, useMemo, useState } from "react";
import { fetchBandAudioIndex, fetchBandPlaylistIndex } from "../../../api";
import { prefetchReleaseOverview } from "../../../releaseOverviewCache";
import { pushArtistRoute, saveReleaseReferrer } from "../../../musicRoute";
import type {
  ArtistPlaylistCard,
  AudioIndexPayload,
  AudioReleaseCard,
} from "../../../types";
import {
  ArtistPlaylistDetailView,
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

export type ArtistAudioState = {
  index: AudioIndexPayload | null;
  playlists: ArtistPlaylistCard[];
  loading: boolean;
  error: string | null;
  category: string;
  setCategory: (key: string) => void;
  officialOnly: boolean;
  setOfficialOnly: (value: boolean) => void;
  visibleCategories: typeof AUDIO_CATEGORY_META;
  showUnofficialBar: boolean;
  releases: AudioReleaseCard[];
  selectedPlaylist: string | null;
  setSelectedPlaylist: (slug: string | null) => void;
};

export function useArtistAudio(
  bandId: number,
  refreshKey: number,
  enabled: boolean
): ArtistAudioState {
  const [index, setIndex] = useState<AudioIndexPayload | null>(null);
  const [playlists, setPlaylists] = useState<ArtistPlaylistCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [officialOnly, setOfficialOnly] = useState(true);
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
    setLoading(true);
    setError(null);
    Promise.all([
      fetchBandAudioIndex(bandId),
      fetchBandPlaylistIndex(bandId),
    ])
      .then(([audioPayload, playlistPayload]) => {
        if (cancelled) return;
        setIndex(audioPayload);
        setPlaylists(playlistPayload.playlists);
        const first = audioPayload.categories[0] ?? "";
        setCategory(first);
        setOfficialOnly(true);
        setSelectedPlaylist(null);
        if (audioPayload.stale) {
          window.setTimeout(() => {
            fetchBandAudioIndex(bandId)
              .then((fresh) => {
                if (!cancelled && !fresh.stale) setIndex(fresh);
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
    if (playlists.length > 0) {
      return [...releaseCats, PLAYLISTS_META];
    }
    return releaseCats;
  }, [index?.categories, playlists.length]);

  const showUnofficialBar = Boolean(
    category &&
      category !== "playlists" &&
      index?.unofficial_by_category?.[category]
  );

  const releases = useMemo(() => {
    if (!index || !category || category === "playlists") return [];
    return index.releases.filter(
      (r) =>
        r.category === category &&
        (officialOnly ? r.official : !r.official)
    );
  }, [index, category, officialOnly]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    if (!visibleCategories.some((c) => c.key === category)) {
      setCategory(visibleCategories[0].key);
    }
  }, [visibleCategories, category]);

  return {
    index,
    playlists,
    loading,
    error,
    category,
    setCategory: (key: string) => {
      setCategory(key);
      setOfficialOnly(true);
      setSelectedPlaylist(null);
    },
    officialOnly,
    setOfficialOnly,
    visibleCategories,
    showUnofficialBar,
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
    visibleCategories,
    showUnofficialBar,
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
    </>
  );
}

function ReleaseCard({
  release,
  bandId,
  category,
  onOpenReleaseNavigate,
}: {
  release: AudioReleaseCard;
  bandId: number;
  category: string;
  onOpenReleaseNavigate?: (targetBandId: number, releaseId: string) => void;
}) {
  const handleOpen = () => {
    const targetBand = release.navigate_band_id;
    const targetRelease = release.navigate_release_id;
    if (targetBand !== bandId) {
      saveReleaseReferrer({ bandId, section: "audio", category });
    }
    if (onOpenReleaseNavigate) {
      onOpenReleaseNavigate(targetBand, targetRelease);
    }
    void prefetchReleaseOverview(targetBand, targetRelease);
    pushArtistRoute({
      bandId: targetBand,
      section: "audio",
      overviewTab: "about",
      releaseId: targetRelease,
    });
  };
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
      {release.display_date && (
        <span className="media-release-card__date">{release.display_date}</span>
      )}
    </article>
  );
}

type Props = {
  state: ArtistAudioState;
  onPlayTrack?: (path: string, title: string) => void;
  bandId: number;
  onOpenReleaseNavigate?: (targetBandId: number, releaseId: string) => void;
};

export default function ArtistAudio({
  state,
  onPlayTrack,
  bandId,
  onOpenReleaseNavigate,
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

  if (selectedPlaylist) {
    return (
      <div className="artist-audio">
        <ArtistPlaylistDetailView
          bandId={bandId}
          slug={selectedPlaylist}
          onBack={() => setSelectedPlaylist(null)}
          onPlay={onPlayTrack}
        />
      </div>
    );
  }

  if (category === "playlists") {
    return (
      <div className="artist-audio">
        <ArtistPlaylistGrid
          playlists={playlists}
          onSelect={(slug) => setSelectedPlaylist(slug)}
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
        <div className="media-release-grid">
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              bandId={bandId}
              category={category}
              onOpenReleaseNavigate={onOpenReleaseNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
