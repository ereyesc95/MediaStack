import { useEffect, useRef, useState, type MouseEvent } from "react";
import { formatTrackDate } from "../../../formatDate";
import type { BandOverview, VariousArtistsHub } from "../../../types";
import { DEFAULT_ARTIST_PHOTO_URL } from "../release/releaseTrackPanelMeta";
import { openArtistByName } from "./openArtistByName";

type Props = {
  data: BandOverview;
  hub: VariousArtistsHub;
  stacked: boolean;
  onOpenRelease: (bandId: number, releaseId: string) => void;
  onOpenArtist: (bandId: number) => void;
  onPlayTrack: (path: string, title: string) => void;
  playingPath: string | null;
  onPlayerHost?: (el: HTMLDivElement | null) => void;
};

const MAX_RELEASES = 6;
const MAX_TRACKS = 5;

function normalizeBio(bio: string): string {
  return bio.replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

function bioParagraphs(bio: string): string[] {
  const text = normalizeBio(bio).replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const parts = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

export default function ArtistVariousAbout({
  data,
  hub,
  stacked,
  onOpenRelease,
  onOpenArtist,
  onPlayTrack,
  playingPath,
  onPlayerHost,
}: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const photoColRef = useRef<HTMLDivElement>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const bioScrollRef = useRef<HTMLDivElement>(null);
  const photoUrl = DEFAULT_ARTIST_PHOTO_URL;

  const featuredReleases = hub.featured_compilations.slice(0, MAX_RELEASES);
  const featuredTracks = hub.featured_tracks.slice(0, MAX_TRACKS);
  const hasBio = Boolean(data.bio);

  useEffect(() => {
    if (stacked) return;
    const photoCol = photoColRef.current;
    const photoStage = photoStageRef.current;
    const content = contentRef.current;
    if (!photoCol || !photoStage || !content) return;

    const sync = () => {
      const colStyle = getComputedStyle(photoCol);
      const padTop = parseFloat(colStyle.paddingTop) || 0;
      const h = photoStage.offsetHeight + padTop;
      content.style.height = `${h}px`;
      content.style.minHeight = `${h}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(photoStage);
    ro.observe(photoCol);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      content.style.height = "";
      content.style.minHeight = "";
    };
  }, [stacked, photoUrl]);

  useEffect(() => () => onPlayerHost?.(null), [onPlayerHost]);

  useEffect(() => {
    if (stacked) return;
    const el = bioScrollRef.current;
    if (!el) return;
    const check = () => {
      setBioOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stacked, data.bio, bioExpanded]);

  const openTrackArtist = (
    e: MouseEvent,
    track: (typeof featuredTracks)[number]
  ) => {
    e.stopPropagation();
    if (track.source_band_id && track.source_in_library) {
      onOpenArtist(track.source_band_id);
      return;
    }
    void openArtistByName(track.artist_name, onOpenArtist);
  };

  return (
    <div
      className={`artist-about artist-about--various${
        stacked ? " artist-about--stacked" : ""
      }`}
    >
      <div className="artist-about__layout">
        <div
          ref={photoColRef}
          className="artist-about__photo-col artist-about__photo-col--static"
        >
          <div ref={photoStageRef} className="artist-about__photo-stage">
            <img
              src={photoUrl}
              alt=""
              className="artist-about__photo artist-about__photo--sizer"
              aria-hidden="true"
              onLoad={() => {
                if (stacked) return;
                const photoStage = photoStageRef.current;
                const content = contentRef.current;
                const photoCol = photoColRef.current;
                if (!photoStage || !content || !photoCol) return;
                const colStyle = getComputedStyle(photoCol);
                const padTop = parseFloat(colStyle.paddingTop) || 0;
                const h = photoStage.offsetHeight + padTop;
                content.style.height = `${h}px`;
                content.style.minHeight = `${h}px`;
              }}
            />
            <div className="artist-about__photo-stack">
              <img
                src={photoUrl}
                alt=""
                className="artist-about__photo artist-about__photo--layer media-beat-glow"
              />
            </div>
          </div>
        </div>

        <div
          ref={contentRef}
          className="artist-about__content artist-about__content--various"
        >
          <div className="artist-about__bio-block">
            <div
              ref={bioScrollRef}
              className={`artist-about__bio-scroll${
                stacked
                  ? bioExpanded
                    ? " artist-about__bio-scroll--expanded"
                    : " artist-about__bio-scroll--collapsed"
                  : bioOverflows
                    ? " artist-about__bio-scroll--overflows"
                    : ""
              }`}
            >
              {hasBio ? (
                bioParagraphs(data.bio!).map((paragraph, i) => (
                  <p key={i} className="artist-about__bio">
                    {paragraph}
                  </p>
                ))
              ) : (
                <p className="artist-about__bio muted">
                  Compilations and one-off tracks from across your library.
                </p>
              )}
            </div>
            {stacked && hasBio && (
              <button
                type="button"
                className="artist-about__bio-toggle"
                onClick={() => setBioExpanded((o) => !o)}
              >
                {bioExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>

          <p className="va-hub__stats">
            {hub.stats.compilation_count} release
            {hub.stats.compilation_count === 1 ? "" : "s"}
            {" · "}
            {hub.stats.track_count} track
            {hub.stats.track_count === 1 ? "" : "s"}
            {" · "}
            {hub.stats.artist_count} artist
            {hub.stats.artist_count === 1 ? "" : "s"}
          </p>

          <div className="va-hub__foot">
            {featuredReleases.length > 0 && (
              <section className="artist-about__tracks va-hub__releases">
                <h3 className="artist-about__tracks-title">Featured releases</h3>
                <div className="artist-about__tracks-row va-hub__releases-row">
                  {featuredReleases.map((release) => {
                    const dateLabel = formatTrackDate(
                      release.date_iso ?? release.display_date
                    );
                    return (
                      <button
                        key={release.id}
                        type="button"
                        className="artist-about__track va-hub__release"
                        onClick={() =>
                          onOpenRelease(
                            release.navigate_band_id ?? data.id,
                            release.navigate_release_id ?? release.id
                          )
                        }
                      >
                        <span className="artist-about__track-cover">
                          <span
                            className="artist-about__track-cover-bg"
                            style={
                              release.cover_url
                                ? {
                                    backgroundImage: `url("${release.cover_url}")`,
                                  }
                                : undefined
                            }
                          />
                        </span>
                        <span className="artist-about__track-title">
                          {release.title}
                        </span>
                        {dateLabel && (
                          <span className="artist-about__track-date">
                            {dateLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {featuredTracks.length > 0 && (
              <section className="artist-about__tracks va-hub__tracks">
                <h3 className="artist-about__tracks-title">Featured tracks</h3>
                <div className="artist-about__tracks-stack">
                  <div className="artist-about__tracks-row">
                    {featuredTracks.map((track) => (
                      <button
                        key={track.play_path}
                        type="button"
                        className={`artist-about__track${
                          playingPath === track.play_path ? " active" : ""
                        }`}
                        onClick={() => onPlayTrack(track.play_path, track.title)}
                      >
                        <span className="artist-about__track-cover">
                          <span
                            className="artist-about__track-cover-bg"
                            style={
                              track.cover_url
                                ? {
                                    backgroundImage: `url("${track.cover_url}")`,
                                  }
                                : undefined
                            }
                          />
                        </span>
                        <span className="artist-about__track-title">
                          {track.title}
                        </span>
                      {track.artist_name && (
                        <button
                          type="button"
                          className="artist-about__track-date artist-about__track-artist-link"
                          onClick={(e) => openTrackArtist(e, track)}
                        >
                          {track.artist_name}
                        </button>
                      )}
                        {track.release_date && (
                          <span className="artist-about__track-date">
                            {formatTrackDate(track.release_date)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    ref={onPlayerHost}
                    className="artist-about__tracks-player"
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
