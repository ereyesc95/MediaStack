import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  fetchBandTourDetail,
  fetchBandTourShowDetail,
  fetchTourShowSetlist,
  fetchTrackSourceArt,
  playTrack,
  refreshTourShowSetlist,
  syncTourShow,
  syncTourShowArtists,
} from "../../../api";
import { formatShowTabDate, formatTrackDate } from "../../../formatDate";
import { useBeatPulse } from "../../../useBeatPulse";
import type {
  ReleaseEdition,
  SetlistTrackItem,
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
import MediaBeatFx from "../MediaBeatFx";
import PlaylistBoot from "../../PlaylistBoot";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./GalleryViewerModal";
import { MiniAudioPlayerControls, useMiniAudio } from "./MiniAudioPlayer";
import SetlistTracklist, {
  flattenPlayableSetlistTracks,
} from "./SetlistTracklist";
import ArtistMemberModal from "./ArtistMemberModal";
import ReleasePhotocard from "../release/ReleasePhotocard";
import {
  DEFAULT_DISC_URL,
  parseTrackPanelMeta,
} from "../release/releaseTrackPanelMeta";
import {
  TrackActionLyricsIcon,
  TrackActionPlaylistIcon,
  TrackActionVersionsIcon,
} from "../release/releaseTrackActionIcons";
import MediaBeatFrame from "../MediaBeatFrame";
import { IconVideo } from "../../MenuIcons";

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
  onOpenRelease?: (releaseId: string, bandId?: number | null) => void;
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
    cover_url: (t as { cover_url?: string | null }).cover_url ?? null,
    navigate_release_id:
      (t as { navigate_release_id?: string | null }).navigate_release_id ?? null,
    navigate_band_id:
      (t as { navigate_band_id?: number | null }).navigate_band_id ?? null,
    youtube_query: t.youtube_query ?? null,
    release_date: (t as { release_date?: string | null }).release_date ?? null,
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
  onActivate,
  label,
  signatureUrl,
}: {
  entry: TourShowBill;
  onOpenArtist?: (bandId: number) => void;
  onActivate?: () => void;
  label?: string;
  signatureUrl?: string | null;
}) {
  const initial = (entry.artist_name || "?").trim().slice(0, 1).toUpperCase();
  const openArtistOrSearch = () => {
    if (entry.band_id && onOpenArtist) {
      onOpenArtist(entry.band_id);
      return;
    }
    const q = (entry.artist_name || "").trim();
    if (q) {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  };
  return (
    <div className="tour-show-page__bill-item">
      {label ? <span className="tour-show-page__bill-label">{label}</span> : null}
      <button
        type="button"
        className="release-lineup-card tour-show-page__bill-circle"
        onClick={() => {
          if (onActivate) {
            onActivate();
            return;
          }
          openArtistOrSearch();
        }}
        title={entry.artist_name}
      >
        <span className="release-lineup-card__photo">
          <span className="release-lineup-card__initials">{initial}</span>
          {signatureUrl ? (
            <img
              src={signatureUrl}
              alt=""
              className="tour-show-page__bill-signature"
              draggable={false}
            />
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className="tour-show-page__bill-name"
        onClick={openArtistOrSearch}
      >
        {entry.artist_name}
      </button>
    </div>
  );
}

type PosterScope = "show" | "tour";

function promoTicketerWebsite(items: TourShowMediaItem[]): string | null {
  for (const p of items) {
    const label = p.label || "";
    const url = (p.url || "").trim();
    if (!url) continue;
    if (/website/i.test(label) || /\.html(?:\?|$)/i.test(url)) return url;
  }
  return null;
}

function isPosterMediaLabel(label: string): boolean {
  const t = (label || "").trim();
  if (!t) return false;
  if (/banner/i.test(t)) return false;
  return /^poster(?:\s|$|[-–—])/i.test(t) || /\bposter\s*[-–—]/i.test(t);
}

function uniqueUrls(urls: (string | null | undefined)[]): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

function CompanyGlyph({
  kind,
}: {
  kind: "venue" | "promoter" | "ticketer";
}) {
  if (kind === "venue") {
    return (
      <svg className="tour-show-page__hub-company-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9.8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (kind === "promoter") {
    return (
      <svg className="tour-show-page__hub-company-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 10v4h3l5 3V7L7 10H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M16 9.2a3.4 3.4 0 0 1 0 5.6M18.4 7.2a6.2 6.2 0 0 1 0 9.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="tour-show-page__hub-company-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 8.5 19 5.2v13.6L4.5 15.5V8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 8.2v7.6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeDasharray="1.4 1.6" />
    </svg>
  );
}

function RecordingVideoButton({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      aria-label="Full recording"
      title="Full recording"
    >
      <IconVideo className="release-page__track-action-icon" />
    </button>
  );
}

function TourShowHeroPoster({
  showPosterUrls,
  tourPosterUrls,
  posterScope,
  posterIndex,
  onScopeChange,
  onIndexChange,
}: {
  showPosterUrls: string[];
  tourPosterUrls: string[];
  posterScope: PosterScope;
  posterIndex: number;
  onScopeChange: (scope: PosterScope) => void;
  onIndexChange: (index: number) => void;
}) {
  const activeList = posterScope === "show" ? showPosterUrls : tourPosterUrls;
  const heroUrl =
    activeList[Math.min(posterIndex, Math.max(0, activeList.length - 1))] ?? undefined;
  const [photoLayers, setPhotoLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: heroUrl, outgoing: undefined }));
  const prevHeroRef = useRef<string | undefined>(heroUrl);
  const photoColRef = useRef<HTMLDivElement>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const [photoHoverSide, setPhotoHoverSide] = useState<
    "left" | "right" | "top" | "bottom" | null
  >(null);

  useEffect(() => {
    if (!heroUrl) {
      setPhotoLayers({ current: undefined, outgoing: undefined });
      prevHeroRef.current = undefined;
      return;
    }
    if (heroUrl === prevHeroRef.current) return;
    const outgoing = prevHeroRef.current;
    prevHeroRef.current = heroUrl;
    setPhotoLayers({ current: heroUrl, outgoing });
    const t = window.setTimeout(() => {
      setPhotoLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [heroUrl]);

  const toggleScope = () => {
    const next: PosterScope = posterScope === "show" ? "tour" : "show";
    onScopeChange(next);
    onIndexChange(0);
  };

  const stepIndex = (delta: number) => {
    if (activeList.length <= 1) return;
    onIndexChange(
      ((posterIndex + delta) % activeList.length + activeList.length) % activeList.length
    );
  };

  const handleHeroPointer = (clientX: number, clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const topZone = rect.height * 0.28;
    const bottomZone = rect.height * 0.72;
    if (y <= topZone) {
      toggleScope();
      return;
    }
    if (y >= bottomZone) {
      toggleScope();
      return;
    }
    if (x < rect.width / 2) stepIndex(-1);
    else stepIndex(1);
  };

  if (!photoLayers.current) {
    return <div className="artist-about__photo artist-about__photo--empty tour-show-page__poster--empty" />;
  }

  return (
    <div
      ref={photoColRef}
      className="artist-about__photo-col tour-show-page__photo-col"
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (y <= rect.height * 0.28) setPhotoHoverSide("top");
        else if (y >= rect.height * 0.72) setPhotoHoverSide("bottom");
        else setPhotoHoverSide(x < rect.width / 2 ? "left" : "right");
      }}
      onMouseLeave={() => setPhotoHoverSide(null)}
      onClick={(e) =>
        handleHeroPointer(e.clientX, e.clientY, e.currentTarget as HTMLElement)
      }
      role="presentation"
    >
      <div ref={photoStageRef} className="artist-about__photo-stage">
        {photoHoverSide ? (
          <span
            className={`artist-about__photo-shade artist-about__photo-shade--${photoHoverSide}`}
            aria-hidden
          />
        ) : null}
        <img
          src={photoLayers.current}
          alt=""
          className="artist-about__photo artist-about__photo--sizer"
          aria-hidden="true"
        />
        <div className="artist-about__photo-stack">
          {photoLayers.outgoing ? (
            <img
              key={photoLayers.outgoing}
              src={photoLayers.outgoing}
              alt=""
              className="artist-about__photo artist-about__photo--layer artist-about__photo--layer-out"
              draggable={false}
            />
          ) : null}
          <img
            key={photoLayers.current}
            src={photoLayers.current}
            alt=""
            className={`artist-about__photo artist-about__photo--layer${
              photoLayers.outgoing ? " artist-about__photo--layer-in" : " media-beat-glow"
            }`}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function youtubeThumbUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname.includes("youtu.be")) {
      id = u.pathname.replace("/", "");
    } else if (u.hostname.includes("youtube.com")) {
      id = u.searchParams.get("v") || "";
      if (!id && u.pathname.startsWith("/embed/")) {
        id = u.pathname.split("/")[2] || "";
      }
    }
    if (!id) return null;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } catch {
    return null;
  }
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
          const isFlipped = Boolean(flipped[item.id]);
          const canFlip = Boolean(item.has_back && item.back_url);
          const galleryIdx = galleryItems.findIndex((g) => g.id === item.id);
          const ytThumb =
            item.kind === "video" || item.kind === "file"
              ? youtubeThumbUrl(item.url)
              : null;
          const isLocalVideo =
            !ytThumb &&
            (item.kind === "video" ||
              (item.kind === "file" && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(item.url)));
          return (
            <button
              key={item.id}
              type="button"
              className={[
                "tour-show-media-card",
                canFlip ? "tour-show-media-card--flippable" : "",
                canFlip && isFlipped ? "tour-show-media-card--flipped" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (canFlip) {
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
              {item.kind === "image" && canFlip ? (
                <span className="tour-show-media-card__flip-scene">
                  <span className="tour-show-media-card__flip-face tour-show-media-card__flip-face--front">
                    <img src={item.url} alt={item.label} loading="lazy" draggable={false} />
                  </span>
                  <span className="tour-show-media-card__flip-face tour-show-media-card__flip-face--back">
                    <img
                      src={item.back_url || item.url}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                  </span>
                </span>
              ) : item.kind === "image" ? (
                <img src={item.url} alt={item.label} loading="lazy" draggable={false} />
              ) : ytThumb ? (
                <span className="tour-show-media-card__video-thumb">
                  <img src={ytThumb} alt="" loading="lazy" draggable={false} />
                  <span className="tour-show-media-card__video-badge" aria-hidden>
                    ▶
                  </span>
                </span>
              ) : isLocalVideo ? (
                <span className="tour-show-media-card__video-thumb">
                  <video src={item.url} muted playsInline preload="metadata" />
                  <span className="tour-show-media-card__video-badge" aria-hidden>
                    ▶
                  </span>
                </span>
              ) : (
                <span className="tour-show-media-card__label tour-show-media-card__label--file">
                  <span className="tour-show-media-card__file-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="1.35em" height="1.35em">
                      <path
                        d="M7 3.75h7.1L19 8.7V20.25H7V3.75z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 3.75V9h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{item.label}</span>
                </span>
              )}
              {canFlip ? (
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
  landscape = false,
}: {
  item: TourShowMediaItem;
  landscape?: boolean;
}) {
  const front = item.url;
  const back = item.back_url;
  if (!front) return null;
  if (item.kind !== "image") {
    return (
      <button
        type="button"
        className="tour-show-page__file-link"
        onClick={() => window.open(front, "_blank", "noopener,noreferrer")}
      >
        Open file
      </button>
    );
  }
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
        variant={landscape ? "landscape" : "portrait"}
        className="tour-show-page__photocard"
        coverOnly
      />
    </div>
  );
}

function PagedChevron({
  direction,
  className,
}: {
  direction: "prev" | "next";
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={direction === "next" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OverviewPagedImages({
  items,
  onOpenGallery,
}: {
  items: TourShowMediaItem[];
  onOpenGallery?: (index: number) => void;
}) {
  const images = items.filter((i) => i.kind === "image" && i.url);
  const galleryItems = useMemo(() => mediaToGalleryItems(images), [images]);
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const current = images[Math.min(index, Math.max(0, images.length - 1))];
  const heroUrl = current?.url;
  const [photoLayers, setPhotoLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: heroUrl, outgoing: undefined }));
  const prevHeroRef = useRef<string | undefined>(heroUrl);

  useEffect(() => {
    if (!heroUrl) {
      setPhotoLayers({ current: undefined, outgoing: undefined });
      prevHeroRef.current = undefined;
      return;
    }
    if (heroUrl === prevHeroRef.current) return;
    const outgoing = prevHeroRef.current;
    prevHeroRef.current = heroUrl;
    setPhotoLayers({ current: heroUrl, outgoing });
    const t = window.setTimeout(() => {
      setPhotoLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [heroUrl]);

  if (!images.length) {
    return items[0] ? <OverviewFlipCard item={items[0]} /> : null;
  }
  const multi = images.length > 1;
  const openGalleryAt = (imageIndex: number) => {
    if (onOpenGallery) {
      onOpenGallery(imageIndex);
      return;
    }
    setViewerIndex(imageIndex);
  };
  const step = (delta: number) => {
    setIndex((i) => ((i + delta) % images.length + images.length) % images.length);
  };
  return (
    <>
      <div className="tour-show-page__paged-media tour-show-page__paged-media--overlay">
        <button
          type="button"
          className="tour-show-page__paged-media-open"
          onClick={() => {
            const galleryIdx = galleryItems.findIndex((g) => g.id === current?.id);
            openGalleryAt(galleryIdx >= 0 ? galleryIdx : index);
          }}
        >
          {photoLayers.current ? (
            <span className="tour-show-page__paged-stage">
              <img
                src={photoLayers.current}
                alt=""
                className="tour-show-page__paged-sizer"
                aria-hidden
              />
              <span className="tour-show-page__paged-stack">
                {photoLayers.outgoing ? (
                  <img
                    key={photoLayers.outgoing}
                    src={photoLayers.outgoing}
                    alt=""
                    className="tour-show-page__paged-layer tour-show-page__paged-layer--out"
                    draggable={false}
                  />
                ) : null}
                <img
                  key={photoLayers.current}
                  src={photoLayers.current}
                  alt=""
                  className={`tour-show-page__paged-layer${
                    photoLayers.outgoing ? " tour-show-page__paged-layer--in" : ""
                  }`}
                  draggable={false}
                />
              </span>
            </span>
          ) : null}
        </button>
        {multi ? (
          <>
            <button
              type="button"
              className="tour-show-page__paged-chevron tour-show-page__paged-chevron--prev"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous page"
            >
              <PagedChevron direction="prev" className="tour-show-page__paged-chevron-icon" />
            </button>
            <button
              type="button"
              className="tour-show-page__paged-chevron tour-show-page__paged-chevron--next"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next page"
            >
              <PagedChevron direction="next" className="tour-show-page__paged-chevron-icon" />
            </button>
          </>
        ) : null}
      </div>
      {viewerIndex !== null && galleryItems.length > 0 && !onOpenGallery ? (
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

function SetlistTabPanel({
  bandId,
  payload,
  recordings,
  recordingUrl,
  loading,
  coverUrl,
  heroPoster,
  artistName,
  visible = true,
  onOpenRelease,
  onPlaybackBackdrop,
  onPlayingChange,
}: {
  bandId: number;
  payload: TourShowSetlistPayload | null;
  recordings?: { label: string; url: string; kind?: string }[];
  recordingUrl: string | null;
  loading: boolean;
  coverUrl?: string | null;
  heroPoster: ReactNode;
  artistName?: string | null;
  visible?: boolean;
  onOpenRelease?: (releaseId: string, bandId?: number | null) => void;
  onPlaybackBackdrop?: (url: string | null) => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const editions = useMemo(() => setlistPayloadToEditions(payload), [payload]);
  const playable = useMemo(() => flattenPlayableSetlistTracks(editions), [editions]);
  const miniAudio = useMiniAudio();
  const canvasRef = useRef<HTMLVideoElement>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<SetlistTrackItem | null>(null);
  const [panelArt, setPanelArt] = useState<{
    cover_url?: string | null;
    disc_url?: string | null;
    logo_url?: string | null;
    icon_url?: string | null;
    canvas_url?: string | null;
    background_layers?: string[];
    album_title?: string | null;
    release_id?: string | null;
    release_date?: string | null;
  } | null>(null);
  const [repeatOne, setRepeatOne] = useState(false);
  const links =
    recordings && recordings.length
      ? recordings
      : recordingUrl
        ? [{ label: "Full recording", url: recordingUrl, kind: "full" }]
        : [];
  const fullRecordingUrl = links[0]?.url ?? null;

  const hasActiveTrack = Boolean(playingPath);
  const isPlaying = Boolean(playingPath && miniAudio.playing);
  const showPlayingPanel = isPlaying;
  useBeatPulse(miniAudio.audioRef, showPlayingPanel, isPlaying);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !panelArt?.canvas_url) return;
    if (isPlaying) void el.play().catch(() => {});
    else el.pause();
  }, [isPlaying, panelArt?.canvas_url]);

  const handlePlay = useCallback(
    async (path: string, title: string, _playbackKey: string) => {
      if (playingPath === path && miniAudio.src) {
        miniAudio.toggle();
        return;
      }
      setPlayingPath(path);
      const track =
        (playable.find((t) => t.play_path === path) as SetlistTrackItem | undefined) ??
        null;
      setNowPlaying(track ? { ...track, title } : ({ title, play_path: path } as SetlistTrackItem));
      setPanelArt({
        cover_url: track?.cover_url || coverUrl || null,
        disc_url: null,
        album_title: track?.album_title || null,
        release_id: track?.navigate_release_id || null,
        release_date:
          (track as { release_date?: string | null })?.release_date ?? null,
      });
      try {
        const res = await playTrack({ path, artist_id: bandId, title });
        miniAudio.loadSrc(res.stream_url, true);
        const releaseId = track?.navigate_release_id;
        const artBandId = track?.navigate_band_id ?? bandId;
        let next = {
          cover_url: res.cover_url || track?.cover_url || coverUrl || null,
          disc_url: null as string | null,
          logo_url: null as string | null,
          icon_url: null as string | null,
          canvas_url: null as string | null,
          background_layers: [] as string[],
          album_title: track?.album_title || null,
          release_id: releaseId || null,
          release_date:
            (track as { release_date?: string | null })?.release_date ?? null,
        };
        if (releaseId) {
          try {
            const art = await fetchTrackSourceArt(artBandId, releaseId, path);
            next = {
              ...next,
              cover_url: art.playback?.cover_url || next.cover_url,
              disc_url: art.playback?.disc_url ?? null,
              logo_url: art.playback?.logo_url ?? null,
              icon_url: (art.playback as { icon_url?: string | null })?.icon_url ?? null,
              canvas_url: art.playback?.canvas_url ?? null,
              background_layers: art.playback?.background_layers ?? [],
            };
          } catch {
            /* optional */
          }
        }
        setPanelArt(next);
        if (res.cover_url && track) {
          setNowPlaying({ ...track, title, cover_url: res.cover_url });
        }
      } catch {
        /* stream failed */
      }
    },
    [bandId, coverUrl, miniAudio, playable, playingPath]
  );

  const playAdjacentTrack = useCallback(
    (direction: "prev" | "next") => {
      if (!playingPath || !playable.length) return;
      const idx = playable.findIndex((t) => t.play_path === playingPath);
      if (idx < 0) return;
      const target =
        direction === "next"
          ? playable[(idx + 1) % playable.length]
          : playable[(idx - 1 + playable.length) % playable.length];
      if (!target.play_path) return;
      void handlePlay(target.play_path, target.title, target.play_path);
    },
    [handlePlay, playable, playingPath]
  );

  useEffect(() => {
    const el = miniAudio.audioRef.current;
    if (!el) return;
    const onEnded = () => {
      if (!playingPath) return;
      if (repeatOne) {
        el.currentTime = 0;
        void el.play().catch(() => {});
        return;
      }
      playAdjacentTrack("next");
    };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [miniAudio.audioRef, playAdjacentTrack, playingPath, repeatOne]);

  useEffect(() => {
    if (!isPlaying || !playingPath) {
      onPlaybackBackdrop?.(null);
      return;
    }
    const cover =
      panelArt?.cover_url || nowPlaying?.cover_url || coverUrl || null;
    const layer = panelArt?.background_layers?.[0] || cover || null;
    onPlaybackBackdrop?.(layer);
  }, [
    coverUrl,
    isPlaying,
    nowPlaying?.cover_url,
    onPlaybackBackdrop,
    panelArt,
    playingPath,
  ]);

  if (loading && !payload) {
    return (
      <div
        className={[
          "tour-show-page__setlist-tab",
          "release-page__tracklist-layout",
          visible ? "" : "tour-show-page__setlist-tab--hidden",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {visible ? <PlaylistBoot className="playlist-boot--compact" label="Loading setlist…" /> : null}
        <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
      </div>
    );
  }

  const panelCover = hasActiveTrack
    ? panelArt?.cover_url || nowPlaying?.cover_url || coverUrl || null
    : null;
  const panelDisc = panelArt?.disc_url || DEFAULT_DISC_URL;
  const trackMeta =
    hasActiveTrack && nowPlaying?.title
      ? parseTrackPanelMeta(nowPlaying.title)
      : null;
  const panelTitle = trackMeta?.mainTitle || (hasActiveTrack ? nowPlaying?.title : null);
  const panelAlbum = hasActiveTrack
    ? panelArt?.album_title || nowPlaying?.album_title || null
    : null;
  const releaseId = panelArt?.release_id;
  const canvasUrl = hasActiveTrack ? panelArt?.canvas_url || null : null;
  const bgLayer = hasActiveTrack
    ? panelArt?.background_layers?.[0] || panelCover || null
    : null;
  const releaseDateRaw =
    panelArt?.release_date ||
    (nowPlaying as { release_date?: string | null })?.release_date ||
    null;
  const releaseDateLabel = releaseDateRaw ? formatTrackDate(releaseDateRaw) : null;

  const featuringLine = trackMeta?.lines.find((l) => l.kind === "featuring");
  const coverLine = trackMeta?.lines.find((l) => l.kind === "cover");
  const otherLines =
    trackMeta?.lines.filter(
      (l) => l.kind !== "featuring" && l.kind !== "cover" && l.kind !== "performer"
    ) ?? [];

  return (
    <div
      className={[
        "tour-show-page__setlist-tab",
        "release-page__tracklist-layout",
        showPlayingPanel
          ? "tour-show-page__setlist-tab--playing"
          : "tour-show-page__setlist-tab--idle",
        visible ? "" : "tour-show-page__setlist-tab--hidden",
        showPlayingPanel ? "release-page--beat-ready" : "",
        canvasUrl && showPlayingPanel ? "release-page--canvas" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!showPlayingPanel ? (
        <aside className="tour-show-page__setlist-hero-col">
          <div className="tour-show-page__setlist-idle-hero">{heroPoster}</div>
        </aside>
      ) : (
        <aside className="release-page__aside tour-show-page__setlist-aside">
          <div
            className={[
              "release-page__panel",
              "release-page__panel--track",
              "tour-show-page__setlist-panel",
              canvasUrl ? "release-page__panel--canvas" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              bgLayer
                ? ({ ["--panel-fade" as string]: `url("${bgLayer}")` } as CSSProperties)
                : undefined
            }
          >
            {canvasUrl ? (
              <div className="release-page__panel-canvas-layer" aria-hidden>
                <video
                  ref={canvasRef}
                  className="release-page__panel-canvas"
                  src={canvasUrl}
                  muted
                  loop
                  playsInline
                />
                <div className="release-page__panel-canvas-shade" />
              </div>
            ) : null}
            <div className="release-page__panel-content">
              <div className="release-page__art">
                <div className="release-page__art-stage">
                  {panelCover ? (
                    <span className="release-page__cover-wrap">
                      <img
                        src={panelCover}
                        alt=""
                        className="release-page__cover"
                        draggable={false}
                      />
                    </span>
                  ) : null}
                  <img
                    src={panelDisc}
                    alt=""
                    className={[
                      "release-page__disc",
                      isPlaying
                        ? "release-page__disc--spin"
                        : "release-page__disc--spin-paused",
                    ].join(" ")}
                    draggable={false}
                  />
                </div>
              </div>
              <div className="release-page__panel-meta">
                <div className="release-page__panel-fit">
                  <div className="release-page__panel-fit-inner">
                    <div className="release-page__panel-body">
                      <div className="release-page__brand-row">
                        {panelArt?.logo_url || panelArt?.icon_url ? (
                          <span className="release-page__artist-brand">
                            {panelArt.icon_url ? (
                              <MediaBeatFrame variant="logo">
                                <img
                                  src={panelArt.icon_url}
                                  alt=""
                                  className="release-page__meta-icon"
                                  draggable={false}
                                />
                              </MediaBeatFrame>
                            ) : null}
                            {panelArt.logo_url ? (
                              <MediaBeatFrame variant="logo">
                                <img
                                  src={panelArt.logo_url}
                                  alt=""
                                  className="release-page__meta-logo"
                                  draggable={false}
                                />
                              </MediaBeatFrame>
                            ) : null}
                          </span>
                        ) : artistName ? (
                          <p className="release-page__artist-link release-page__artist-link--text">
                            {artistName}
                          </p>
                        ) : null}
                      </div>
                      {panelTitle ? (
                        <div className="release-page__track-panel">
                          <h2 className="release-page__track-panel-title">{panelTitle}</h2>
                          {coverLine && coverLine.kind === "cover" ? (
                            <p className="release-page__track-panel-cover">
                              {coverLine.artist} cover
                            </p>
                          ) : null}
                          {trackMeta?.versionLabel ? (
                            <p className="release-page__track-panel-version">
                              {trackMeta.versionLabel}
                            </p>
                          ) : null}
                          {panelAlbum ? (
                            releaseId && onOpenRelease ? (
                              <p className="release-page__track-panel-source">
                                Taken from{" "}
                                <button
                                  type="button"
                                  className="release-page__release-link"
                                  onClick={() =>
                                    onOpenRelease(
                                      releaseId,
                                      nowPlaying?.navigate_band_id ?? null
                                    )
                                  }
                                >
                                  {panelAlbum}
                                </button>
                              </p>
                            ) : (
                              <p className="release-page__track-panel-source">
                                Taken from {panelAlbum}
                              </p>
                            )
                          ) : null}
                          {featuringLine && featuringLine.kind === "featuring" ? (
                            <p className="release-page__track-panel-line">
                              Featuring{" "}
                              {featuringLine.artists.map((name, j) => (
                                <span key={name}>
                                  {j > 0 &&
                                    (j === featuringLine.artists.length - 1
                                      ? " and "
                                      : ", ")}
                                  {name}
                                </span>
                              ))}
                            </p>
                          ) : null}
                          {otherLines.map((line, i) =>
                            line.kind === "other" ? (
                              <p key={i} className="release-page__track-panel-line">
                                {line.text}
                              </p>
                            ) : null
                          )}
                          {releaseDateLabel ? (
                            <p className="muted tour-show-page__setlist-panel-meta">
                              {releaseDateLabel}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="release-page__panel-bottom">
                  <div className="release-page__track-actions release-page__track-actions--above-player">
                    <span className="release-page__track-action" title="Lyrics" aria-hidden>
                      <TrackActionLyricsIcon className="release-page__track-action-icon" />
                    </span>
                    <span className="release-page__track-action" title="Versions" aria-hidden>
                      <TrackActionVersionsIcon className="release-page__track-action-icon" />
                    </span>
                    <span className="release-page__track-action" title="Add to playlist" aria-hidden>
                      <TrackActionPlaylistIcon className="release-page__track-action-icon" />
                    </span>
                    {fullRecordingUrl ? (
                      <RecordingVideoButton
                        url={fullRecordingUrl}
                        className="release-page__track-action"
                      />
                    ) : null}
                  </div>
                  <div className="release-page__panel-footer">
                    <div className="release-page__panel-player">
                      <MiniAudioPlayerControls
                        playing={miniAudio.playing}
                        progress={miniAudio.progress}
                        duration={miniAudio.duration}
                        toggle={miniAudio.toggle}
                        seek={miniAudio.seek}
                        onPrev={() => playAdjacentTrack("prev")}
                        onNext={() => playAdjacentTrack("next")}
                        repeatOne={repeatOne}
                        onRepeatToggle={() => setRepeatOne((r) => !r)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
      <div className="release-page__main tour-show-page__setlist-main">
        {editions.length ? (
          <SetlistTracklist
            editions={editions}
            playingPath={playingPath}
            setlistId="tour-show"
            showReleaseTitles
            onOpenRelease={onOpenRelease}
            onPlay={(path, title, key) => {
              void handlePlay(path, title, key);
            }}
          />
        ) : (
          <p className="muted artist-section-empty">
            No setlist.fm match yet. Use Manage event → Refresh setlist.
          </p>
        )}
      </div>
      <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
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
  const [posterScope, setPosterScope] = useState<PosterScope>("show");
  const [posterIndex, setPosterIndex] = useState(0);
  const [memberModalId, setMemberModalId] = useState<number | null>(null);
  const [bgLayers, setBgLayers] = useState<{ current?: string; outgoing?: string }>(
    {}
  );
  const [setlistIsPlaying, setSetlistIsPlaying] = useState(false);
  const [playbackBackdrop, setPlaybackBackdrop] = useState<string | null>(null);
  const [setlistGalleryIndex, setSetlistGalleryIndex] = useState<number | null>(null);
  const setlistSlugRef = useRef<string | null>(null);

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
    setPosterIndex(0);
    setPosterScope("show");
  }, [detail?.show.id, tour?.id]);

  useEffect(() => {
    if (!detail) return;
    const slug = detail.show.slug;
    let cancelled = false;
    if (setlistSlugRef.current !== slug) setSetlistLoading(true);
    void fetchTourShowSetlist(bandId, tourSlug, slug)
      .then((payload) => {
        if (!cancelled) {
          setlistSlugRef.current = slug;
          setSetlist(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setlistSlugRef.current = slug;
          setSetlist({ empty: true, tracks: [] });
        }
      })
      .finally(() => {
        if (!cancelled) setSetlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId, tourSlug, detail?.show.slug]);

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

  const activeBackdropUrl =
    activeTab === "setlist" && playbackBackdrop ? playbackBackdrop : backdropUrl;

  useEffect(() => {
    if (!activeBackdropUrl) return;
    setBgLayers((prev) => {
      if (prev.current === activeBackdropUrl) return prev;
      return { outgoing: prev.current, current: activeBackdropUrl };
    });
    const t = window.setTimeout(() => setBgLayers((p) => ({ current: p.current })), 420);
    return () => window.clearTimeout(t);
  }, [activeBackdropUrl]);

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
  const placeLocality = [show.city].filter(Boolean).join(", ");
  const placeCountry = (show.country || "").trim();
  const place = placeLocality || placeCountry;
  const placeIso = (() => {
    const iso = (show.country_iso || "").trim().toLowerCase();
    if (iso) return iso;
    const country = placeCountry.toLowerCase();
    if (country === "united states" || country === "usa" || country === "u.s.a." || country === "u.s.") {
      return "us";
    }
    if (country === "united kingdom" || country === "uk") return "gb";
    if (country.length === 2) return country;
    return "";
  })();
  const dateLabel = formatTrackDate(show.date_iso);
  const overview = detail.overview;
  const ticket = overview?.tickets?.[0];
  const setlistFiles = overview?.setlist_files || [];
  const playlistCode = overview?.playlist_code ?? null;
  const qrCode = overview?.qr_code ?? null;
  const album = overview?.album;
  const bill = show.bill || [];
  const mains = bill.filter((b) => b.role === "main");
  const openers = bill.filter((b) => b.role !== "main");

  const showPosterUrls = (() => {
    const fromPromo = (detail.promo || [])
      .filter(
        (p) =>
          p.kind === "image" &&
          p.url &&
          isPosterMediaLabel(p.label || p.id || "")
      )
      .map((p) => p.url);
    return uniqueUrls([show.poster_url, ...fromPromo]);
  })();
  const tourPosterUrls = uniqueUrls([tour.poster_url]);
  const heroBanner = show.banner_url || tour.banner_url || null;
  const ticketerWebsiteUrl = promoTicketerWebsite(detail.promo || []);
  const setlistGalleryItems = mediaToGalleryItems(setlistFiles);
  const heroPosterNode = (
    <TourShowHeroPoster
      showPosterUrls={showPosterUrls}
      tourPosterUrls={tourPosterUrls}
      posterScope={posterScope}
      posterIndex={posterIndex}
      onScopeChange={setPosterScope}
      onIndexChange={setPosterIndex}
    />
  );
  const openVenueSearch = () => {
    if (!show.venue) return;
    const q = [show.venue, placeLocality || placeCountry].filter(Boolean).join(" ");
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };
  const openPromoterSearch = () => {
    if (!show.promoter) return;
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(show.promoter)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };
  const openTicketerSite = () => {
    if (ticketerWebsiteUrl) {
      window.open(ticketerWebsiteUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!show.ticketer) return;
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(show.ticketer)}`,
      "_blank",
      "noopener,noreferrer"
    );
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
        setlistIsPlaying ? "release-page--beat-ready release-page--playing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="tour-show-page__backdrop" aria-hidden>
        {bgLayers.current &&
        activeTab !== "promo" &&
        activeTab !== "gallery" &&
        activeTab !== "souvenirs" ? (
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

        <div
          className={[
            "tour-show-page__body",
            activeTab === "promo" || activeTab === "gallery" || activeTab === "souvenirs"
              ? "tour-show-page__body--media"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {activeTab === "overview" ? (
            <div className="artist-about tour-show-page__overview">
              <div className="artist-about__layout tour-show-page__hero">
                <div className="tour-show-page__hero-col">
                  {bannerHero && heroBanner ? (
                    <img
                      src={heroBanner}
                      alt=""
                      className="tour-show-page__banner"
                      draggable={false}
                    />
                  ) : showPosterUrls.length || tourPosterUrls.length ? (
                    heroPosterNode
                  ) : (
                    <div className="tour-show-page__poster tour-show-page__poster--empty" />
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
                  {(mains.length > 0 ||
                    openers.length > 0 ||
                    (overview?.lineup?.length || 0) > 0 ||
                    show.venue ||
                    show.promoter ||
                    show.ticketer) && (
                    <section className="release-page__section-glass tour-show-page__hub">
                      <div className="tour-show-page__hub-performer-col">
                        {mains[0] ? (
                          <BillCircle
                            entry={mains[0]}
                            label="Performer"
                            onOpenArtist={onOpenArtist}
                          />
                        ) : null}
                      </div>
                      <div className="tour-show-page__hub-details">
                        {(overview?.lineup?.length || 0) > 0 ? (
                          <div className="tour-show-page__hub-line tour-show-page__hub-line--lineup">
                            {(overview?.lineup || []).map((m) => (
                              <button
                                key={m.participation_id ?? m.id}
                                type="button"
                                className="tour-show-page__hub-member"
                                title={m.name}
                                onClick={() => setMemberModalId(m.id)}
                              >
                                <span className="tour-show-page__hub-member-photo">
                                  {m.photo_url ? (
                                    <img src={m.photo_url} alt="" draggable={false} />
                                  ) : (
                                    <span className="tour-show-page__hub-member-initials">
                                      {m.name.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </span>
                                <span className="tour-show-page__hub-member-text">
                                  <span className="tour-show-page__hub-member-name">{m.name}</span>
                                  {m.roles?.length ? (
                                    <span className="tour-show-page__hub-member-role">
                                      {m.roles.join(", ")}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {(() => {
                          const eventLine = (
                            <p className="tour-show-page__hub-line tour-show-page__hub-line--event">
                              <span>{tour.title}</span>
                              {dateLabel ? (
                                <>
                                  <span className="tour-show-page__hub-sep"> · </span>
                                  <span>{dateLabel}</span>
                                </>
                              ) : null}
                              {place ? (
                                <>
                                  <span className="tour-show-page__hub-sep"> · </span>
                                  <span className="tour-show-page__place">
                                    {placeIso ? (
                                      <span
                                        className={`fi fi-${placeIso} tour-show-page__place-flag`}
                                        title={placeCountry || undefined}
                                        aria-label={placeCountry || undefined}
                                      />
                                    ) : null}
                                    <span>{placeLocality || (!placeIso ? placeCountry : "")}</span>
                                  </span>
                                </>
                              ) : null}
                            </p>
                          );
                          const companiesLine =
                            show.venue || show.promoter || show.ticketer ? (
                              <div className="tour-show-page__hub-line tour-show-page__hub-line--companies">
                                {show.venue ? (
                                  <button
                                    type="button"
                                    className="tour-show-page__hub-company"
                                    onClick={openVenueSearch}
                                    title={show.venue}
                                  >
                                    <CompanyGlyph kind="venue" />
                                    {show.venue_logo_url ? (
                                      <img
                                        src={show.venue_logo_url}
                                        alt=""
                                        className="tour-show-page__company-logo"
                                      />
                                    ) : (
                                      <span>{show.venue}</span>
                                    )}
                                  </button>
                                ) : null}
                                {show.promoter ? (
                                  <button
                                    type="button"
                                    className="tour-show-page__hub-company"
                                    onClick={openPromoterSearch}
                                    title={show.promoter}
                                  >
                                    <CompanyGlyph kind="promoter" />
                                    {show.promoter_logo_url ? (
                                      <img
                                        src={show.promoter_logo_url}
                                        alt=""
                                        className="tour-show-page__company-logo"
                                      />
                                    ) : (
                                      <span>{show.promoter}</span>
                                    )}
                                  </button>
                                ) : null}
                                {show.ticketer ? (
                                  <button
                                    type="button"
                                    className="tour-show-page__hub-company"
                                    onClick={openTicketerSite}
                                    title={show.ticketer}
                                  >
                                    <CompanyGlyph kind="ticketer" />
                                    {show.ticketer_logo_url ? (
                                      <img
                                        src={show.ticketer_logo_url}
                                        alt=""
                                        className="tour-show-page__company-logo"
                                      />
                                    ) : (
                                      <span>{show.ticketer}</span>
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            ) : null;
                          const openersRow = openers.length ? (
                            <div className="tour-show-page__hub-openers-block">
                              <span className="tour-show-page__bill-label">
                                {openers.length > 1 ? "Support Acts" : "Support Act"}
                              </span>
                              <div className="tour-show-page__hub-line tour-show-page__hub-line--openers">
                                {openers.map((b) => (
                                  <BillCircle
                                    key={`op-${b.artist_name}-${b.opener_order || ""}`}
                                    entry={b}
                                    onOpenArtist={onOpenArtist}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null;
                          if (openers.length >= 7) {
                            return (
                              <>
                                {openersRow}
                                {eventLine}
                                {companiesLine}
                              </>
                            );
                          }
                          if (openers.length) {
                            return (
                              <div className="tour-show-page__hub-openers-split">
                                {openersRow}
                                <div className="tour-show-page__hub-openers-meta">
                                  {eventLine}
                                  {companiesLine}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <>
                              {eventLine}
                              {companiesLine}
                            </>
                          );
                        })()}
                      </div>
                    </section>
                  )}

                  <div className="tour-show-page__overview-cols">
                    {setlistFiles.length ? (
                      <section className="tour-show-page__overview-col tour-show-page__overview-col--setlist">
                        <OverviewPagedImages
                          items={setlistFiles}
                          onOpenGallery={(idx) => setSetlistGalleryIndex(idx)}
                        />
                      </section>
                    ) : null}
                    {ticket ? (
                      <section className="tour-show-page__overview-col tour-show-page__ticket-col">
                        <OverviewFlipCard item={ticket} />
                      </section>
                    ) : null}
                    {(playlistCode || qrCode || album || tour.album_title) ? (
                      <section className="tour-show-page__overview-col tour-show-page__codes-col">
                        {playlistCode ? (
                          <div
                            className="tour-show-page__code-thumb tour-show-page__code-thumb--natural"
                            title="Playlist code"
                          >
                            {playlistCode.kind === "image" ? (
                              <img src={playlistCode.url} alt="" draggable={false} />
                            ) : (
                              <span>{playlistCode.label || "Playlist"}</span>
                            )}
                          </div>
                        ) : null}
                        {qrCode || album || tour.album_title ? (
                          <div className="tour-show-page__codes-row">
                            {qrCode ? (
                              <div className="tour-show-page__code-thumb" title="QR">
                                {qrCode.kind === "image" ? (
                                  <img src={qrCode.url} alt="" draggable={false} />
                                ) : (
                                  <span>{qrCode.label || "QR"}</span>
                                )}
                              </div>
                            ) : null}
                            {album || tour.album_title ? (
                              <button
                                type="button"
                                className="tour-show-page__album tour-show-page__album--square tour-show-page__album--compact"
                            onClick={() => {
                              const rid = album?.release_id;
                              if (rid) onOpenRelease?.(rid, bandId);
                            }}
                            disabled={!album?.release_id}
                              >
                                <span className="tour-show-page__album-frame">
                                  {(album?.cover_url || tour.album_cover_url) ? (
                                    <img
                                      src={album?.cover_url || tour.album_cover_url || ""}
                                      alt=""
                                      className="tour-show-page__album-cover"
                                      draggable={false}
                                    />
                                  ) : (
                                    <span className="tour-show-page__album-cover tour-show-page__album-cover--empty" />
                                  )}
                                  <span className="tour-show-page__album-hover" aria-hidden>
                                    {album?.logo_url ? (
                                      <img
                                        src={album.logo_url}
                                        alt=""
                                        className="tour-show-page__album-logo"
                                        draggable={false}
                                      />
                                    ) : (
                                      <span className="tour-show-page__album-hover-title">
                                        {album?.title || tour.album_title}
                                      </span>
                                    )}
                                    {(album?.release_date || album?.label) && (
                                      <span className="tour-show-page__album-hover-meta">
                                        {album?.release_date
                                          ? formatTrackDate(album.release_date) || album.release_date
                                          : null}
                                        {album?.release_date && album?.label ? " · " : null}
                                        {album?.label ? album.label : null}
                                      </span>
                                    )}
                                    {album?.release_id ? (
                                      <span className="tour-show-page__album-hover-cta">
                                        Go to release page
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </section>
                    ) : null}
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
          <SetlistTabPanel
            bandId={bandId}
            payload={setlist}
            recordings={overview?.recordings || []}
            recordingUrl={overview?.recording_url || null}
            loading={setlistLoading}
            visible={activeTab === "setlist"}
            coverUrl={
              showPosterUrls[0] ||
              tourPosterUrls[0] ||
              show.poster_url ||
              tour.poster_url ||
              null
            }
            heroPoster={heroPosterNode}
            artistName={artistName}
            onOpenRelease={onOpenRelease}
            onPlaybackBackdrop={setPlaybackBackdrop}
            onPlayingChange={setSetlistIsPlaying}
          />
        </div>
      </div>
      {setlistGalleryIndex !== null && setlistGalleryItems.length > 0 ? (
        <GalleryViewerModal
          items={setlistGalleryItems}
          index={setlistGalleryIndex}
          onIndexChange={setSetlistGalleryIndex}
          onClose={() => setSetlistGalleryIndex(null)}
        />
      ) : null}
      {memberModalId != null ? (
        <ArtistMemberModal
          artistId={memberModalId}
          bandId={bandId}
          bandName={artistName || ""}
          isAdmin={isAdmin}
          onClose={() => setMemberModalId(null)}
          onOpenArtist={(id) => {
            setMemberModalId(null);
            onOpenArtist?.(id);
          }}
          onDataChanged={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
