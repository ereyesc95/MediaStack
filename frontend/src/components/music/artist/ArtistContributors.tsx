import { useEffect, useMemo, useRef, useState } from "react";
import { resolveVaContributorPhotos } from "../../../api";
import type { CardOrientation, VariousArtistsHub } from "../../../types";
import ArtistCard from "../../ArtistCard";
import { isMobilePortraitLayout, useDeviceLayout } from "../../../usePhoneLayout";
import { openArtistByName } from "./openArtistByName";

type Props = {
  hub: VariousArtistsHub;
  bandId: number;
  orientation: CardOrientation;
  sort: "tracks" | "compilations" | "name";
  hidden?: boolean;
  onOpenArtist: (bandId: number) => void;
  onDataChanged: (options?: { silent?: boolean }) => void;
};

const MAX_PHOTO_BATCHES = 3;

export default function ArtistContributors({
  hub,
  bandId,
  orientation,
  sort,
  hidden,
  onOpenArtist,
  onDataChanged,
}: Props) {
  const deviceLayout = useDeviceLayout();
  const isPhone = isMobilePortraitLayout(deviceLayout);
  const [revealedId, setRevealedId] = useState<number | string | null>(null);
  const photoResolveAttempts = useRef(0);
  const photoResolveBandId = useRef(bandId);

  const artists = useMemo(() => {
    const list = [...hub.contributing_artists];
    if (sort === "tracks") {
      list.sort(
        (a, b) =>
          b.track_count - a.track_count ||
          b.compilation_count - a.compilation_count ||
          a.name.localeCompare(b.name)
      );
    } else if (sort === "compilations") {
      list.sort(
        (a, b) =>
          b.compilation_count - a.compilation_count ||
          b.track_count - a.track_count ||
          a.name.localeCompare(b.name)
      );
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [hub.contributing_artists, sort]);

  const needsPhotos = useMemo(
    () =>
      artists.some(
        (artist) =>
          !artist.photo_url && !artist.logo_url && !artist.icon_url
      ),
    [artists]
  );

  useEffect(() => {
    setRevealedId(null);
  }, [artists, sort, orientation, isPhone]);

  useEffect(() => {
    photoResolveAttempts.current = 0;
  }, [bandId, sort]);

  useEffect(() => {
    if (
      hidden ||
      !needsPhotos ||
      photoResolveAttempts.current >= MAX_PHOTO_BATCHES
    ) {
      return;
    }
    const requestedBand = bandId;
    photoResolveBandId.current = requestedBand;
    photoResolveAttempts.current += 1;
    let cancelled = false;
    resolveVaContributorPhotos(requestedBand, orientation)
      .then(() => {
        if (!cancelled && photoResolveBandId.current === requestedBand) {
          onDataChanged({ silent: true });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hidden, needsPhotos, bandId, orientation, onDataChanged]);

  useEffect(() => {
    if (!isPhone || revealedId == null) return;
    function dismiss(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".artist-card")) {
        setRevealedId(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [isPhone, revealedId]);

  const openExternal = (artist: (typeof artists)[number]) => {
    const urls = artist.external_urls ?? {};
    const url =
      urls.wikipedia ??
      urls.musicbrainz ??
      (artist.code
        ? `https://musicbrainz.org/artist/${artist.code}`
        : undefined);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCardClick = (artist: (typeof artists)[number]) => {
    const cardId = artist.band_id ?? artist.name;
    const openInApp = Boolean(artist.band_id && artist.in_library);

    if (openInApp) {
      if (!isPhone) {
        onOpenArtist(artist.band_id!);
        return;
      }
      if (revealedId === cardId) {
        setRevealedId(null);
        onOpenArtist(artist.band_id!);
      } else {
        setRevealedId(cardId);
      }
      return;
    }

    if (isPhone) {
      if (revealedId === cardId) {
        setRevealedId(null);
        if (artist.band_id) {
          void openArtistByName(artist.name, onOpenArtist);
        } else {
          openExternal(artist);
        }
      } else {
        setRevealedId(cardId);
      }
      return;
    }

    if (artist.band_id && artist.in_library) {
      onOpenArtist(artist.band_id);
      return;
    }
    void openArtistByName(artist.name, onOpenArtist);
  };

  if (hidden) return null;

  if (!artists.length) {
    return (
      <p className="muted artist-section-empty">
        No featured artists found in your local library yet.
      </p>
    );
  }

  return (
    <div className="artist-contributors artist-related">
      <div className={`artist-grid artist-grid--${orientation} artist-related__grid`}>
        {artists.map((artist) => {
          const cardId = artist.band_id ?? artist.name;
          const subtitle =
            artist.compilation_titles.length > 0
              ? `Also on: ${artist.compilation_titles.slice(0, 2).join(", ")}${
                  artist.compilation_titles.length > 2
                    ? ` +${artist.compilation_titles.length - 2}`
                    : ""
                }`
              : null;
          return (
            <div key={String(cardId)} className="artist-contributors__card-wrap">
              <ArtistCard
                artist={{
                  id: artist.band_id ?? 0,
                  name: artist.name,
                  photo_url: artist.photo_url,
                  icon_url: artist.icon_url,
                  logo_url: artist.logo_url,
                  era_year: artist.era_year ?? null,
                  show_name_on_hover: artist.show_name_on_hover,
                }}
                orientation={orientation}
                tapReveal={isPhone}
                revealed={revealedId === cardId}
                onClick={() => handleCardClick(artist)}
              />
              <p className="artist-contributors__meta">
                {artist.track_count} track{artist.track_count === 1 ? "" : "s"}
                {" · "}
                {artist.compilation_count} release
                {artist.compilation_count === 1 ? "" : "s"}
              </p>
              {subtitle ? (
                <p className="artist-contributors__also-on">{subtitle}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
