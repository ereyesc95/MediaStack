import { useEffect, useState } from "react";
import {
  getCachedArtistPlaylistDetail,
  prefetchArtistPlaylistDetail,
} from "../../../artistPlaylistDetailCache";
import { usePhoneLayout } from "../../../usePhoneLayout";
import type {
  ArtistPlaylistCard,
  ArtistPlaylistDetail,
  ArtistPlaylistTrack,
  ReleaseCardLayout,
} from "../../../types";

function PlaylistCard({
  playlist,
  layout,
  tapReveal,
  revealed,
  onReveal,
  onClick,
}: {
  playlist: ArtistPlaylistCard;
  layout: ReleaseCardLayout;
  tapReveal: boolean;
  revealed: boolean;
  onReveal: () => void;
  onClick: () => void;
}) {
  const cover =
    playlist.cover_url || `/api/assets/playlists/${playlist.slug}`;
  const trackLabel =
    playlist.slug === "setlists"
      ? "Live shows"
      : `${playlist.track_count ?? 0} tracks`;

  const handleActivate = () => {
    if (tapReveal && !revealed) {
      onReveal();
      return;
    }
    onClick();
  };

  if (layout === "banner") {
    return (
      <button
        type="button"
        className={[
          "media-release-card",
          "media-release-card--button",
          "media-release-card--banner",
          "artist-playlist-card--banner",
          tapReveal ? "media-release-card--tap-reveal" : "",
          revealed ? "media-release-card--revealed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={handleActivate}
      >
        <span
          className="media-release-card__banner-bg artist-playlist-card__banner-bg"
          style={{ backgroundImage: `url("${cover}")` }}
          aria-hidden
        />
        <span className="artist-playlist-card__banner-shade" aria-hidden />
        <span className="artist-playlist-card__banner-copy">
          <span className="artist-playlist-card__banner-title">{playlist.name}</span>
          <span className="artist-playlist-card__banner-tracks">{trackLabel}</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={[
        "media-release-card",
        "media-release-card--button",
        tapReveal ? "media-release-card--tap-reveal" : "",
        revealed ? "media-release-card--revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleActivate}
    >
      <span
        className="media-release-card__cover"
        style={{ backgroundImage: `url("${cover}")` }}
      />
      <span className="media-release-card__dim" aria-hidden />
      <span className="media-release-card__hover">
        <span className="media-release-card__title-hover">{playlist.name}</span>
      </span>
      <span className="media-release-card__date">{trackLabel}</span>
    </button>
  );
}

function TrackRow({
  track,
  index,
  onPlay,
}: {
  track: ArtistPlaylistTrack;
  index: number;
  onPlay?: (path: string, title: string) => void;
}) {
  const cover = track.cover_url;
  return (
    <button
      type="button"
      className="artist-playlist-track"
      onClick={() => {
        if (track.play_path && onPlay) onPlay(track.play_path, track.title);
      }}
      disabled={!track.play_path}
    >
      <span className="artist-playlist-track__index">{index + 1}</span>
      {cover ? (
        <img
          src={cover}
          alt=""
          className="artist-playlist-track__cover"
          draggable={false}
        />
      ) : (
        <span className="artist-playlist-track__cover artist-playlist-track__cover--empty" />
      )}
      <span className="artist-playlist-track__meta">
        <span className="artist-playlist-track__title">{track.title}</span>
        {track.release_date && (
          <span className="artist-playlist-track__date">{track.release_date}</span>
        )}
      </span>
    </button>
  );
}

type GridProps = {
  playlists: ArtistPlaylistCard[];
  onSelect: (slug: string) => void;
  cardLayout?: ReleaseCardLayout;
};

export function ArtistPlaylistGrid({
  playlists,
  onSelect,
  cardLayout = "cover",
}: GridProps) {
  const isPhone = usePhoneLayout();
  const [revealedId, setRevealedId] = useState<string | null>(null);

  useEffect(() => {
    setRevealedId(null);
  }, [cardLayout]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".media-release-card--tap-reveal")) return;
      setRevealedId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isPhone, revealedId]);

  if (!playlists.length) {
    return (
      <p className="muted artist-section-empty">No playlists available yet.</p>
    );
  }
  const sorted = [...playlists].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const banner = cardLayout === "banner";
  return (
    <div
      className={`media-release-grid artist-playlist-grid${
        banner ? " media-release-grid--banner artist-playlist-grid--banner" : ""
      }`}
    >
      {sorted.map((p) => (
        <PlaylistCard
          key={p.slug}
          playlist={p}
          layout={cardLayout}
          tapReveal={isPhone}
          revealed={isPhone && revealedId === p.slug}
          onReveal={() => setRevealedId(p.slug)}
          onClick={() => onSelect(p.slug)}
        />
      ))}
    </div>
  );
}

type DetailProps = {
  bandId: number;
  slug: string;
  onBack: () => void;
  onPlay?: (path: string, title: string) => void;
};

export function ArtistPlaylistDetailView({
  bandId,
  slug,
  onBack,
  onPlay,
}: DetailProps) {
  const [detail, setDetail] = useState<ArtistPlaylistDetail | null>(
    () => getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [loading, setLoading] = useState(
    () => !getCachedArtistPlaylistDetail(bandId, slug)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedArtistPlaylistDetail(bandId, slug);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(null);
      prefetchArtistPlaylistDetail(bandId, slug, { force: true })
        .then((d) => {
          if (!cancelled) setDetail(d);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    prefetchArtistPlaylistDetail(bandId, slug, { force: true })
      .then((d) => {
        if (!cancelled) setDetail(d);
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
  }, [bandId, slug]);

  if (loading && !detail) {
    return <p className="muted artist-section-empty">Loading playlist…</p>;
  }
  if (error || !detail) {
    return <p className="muted artist-section-empty">{error ?? "Not found"}</p>;
  }

  if (slug === "setlists" && !detail.tracks.length) {
    return (
      <div className="artist-playlist-detail">
        <button type="button" className="artist-playlist-detail__back" onClick={onBack}>
          ← Playlists
        </button>
        <h2 className="artist-playlist-detail__title">{detail.name}</h2>
        <p className="muted artist-playlist-detail__hint">
          Choose a year and show to build a setlist playlist.
          {detail.years?.length ? (
            <>
              {" "}
              Years available: {detail.years.join(", ")}.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="artist-playlist-detail">
      <button type="button" className="artist-playlist-detail__back" onClick={onBack}>
        ← Playlists
      </button>
      <h2 className="artist-playlist-detail__title">{detail.name}</h2>
      <div className="artist-playlist-tracks">
        {detail.tracks.map((t, i) => (
          <TrackRow key={`${t.title}-${i}`} track={t} index={i} onPlay={onPlay} />
        ))}
      </div>
    </div>
  );
}
