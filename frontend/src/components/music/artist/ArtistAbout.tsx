import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTrackDate } from "../../../formatDate";
import type { BandOverview } from "../../../types";
import { DEFAULT_ARTIST_PHOTO_URL, trackDisplayTitle } from "../release/releaseTrackPanelMeta";
import ArtistWordCloud from "./ArtistWordCloud";

type Era = BandOverview["eras"][number];

type Props = {
  data: BandOverview;
  eraIndex: number;
  stacked: boolean;
  flatMeta?: boolean;
  onEraChange: (index: number) => void;
  onCountry: (id: number) => void;
  onSubgenre: (id: number) => void;
  onLabel: (label: string) => void;
  onPlayTrack: (path: string, title: string) => void;
  playingPath: string | null;
  onPlayerHost?: (el: HTMLDivElement | null) => void;
  onOpenPerformer?: (artistId: number) => void;
};

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

function carouselEras(eras: Era[], stacked: boolean): Era[] {
  const want = stacked ? "landscape" : "portrait";
  const filtered = eras.filter((e) => e.orientation === want);
  if (filtered.length) return filtered;
  return stacked
    ? eras.filter((e) => e.landscape_url)
    : eras.filter((e) => e.portrait_url);
}

function eraHeroUrl(era: Era, stacked: boolean): string | undefined {
  if (stacked) return era.landscape_url ?? era.slide_url ?? undefined;
  return era.portrait_url ?? era.slide_url ?? undefined;
}

function originLabel(
  city: string | null | undefined,
  country: string | null | undefined
) {
  return [city, country].filter(Boolean).join(", ");
}

function isCatalogLabel(name: string): boolean {
  return !/self-released/i.test(name);
}

function MetaValue({
  flat,
  onClick,
  children,
}: {
  flat: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={flat ? "artist-about__meta-link" : "artist-about__pill"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ArtistAbout({
  data,
  eraIndex,
  stacked,
  flatMeta = false,
  onEraChange,
  onCountry,
  onSubgenre,
  onLabel,
  onPlayTrack,
  playingPath,
  onPlayerHost,
  onOpenPerformer,
}: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [photoHoverSide, setPhotoHoverSide] = useState<"left" | "right" | null>(
    null
  );
  const slides = useMemo(
    () => carouselEras(data.eras, stacked),
    [data.eras, stacked]
  );
  const era: Era | null = slides.length
    ? slides[Math.min(eraIndex, slides.length - 1)]
    : null;

  const stepEra = (dir: -1 | 1) => {
    if (!slides.length) return;
    const next = (eraIndex + dir + slides.length) % slides.length;
    onEraChange(next);
  };

  const heroUrl =
    (era ? eraHeroUrl(era, stacked) : undefined) ?? DEFAULT_ARTIST_PHOTO_URL;
  const [photoLayers, setPhotoLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: heroUrl, outgoing: undefined }));
  const prevHeroRef = useRef(heroUrl);
  const photoColRef = useRef<HTMLDivElement>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stacked || flatMeta) return;
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
  }, [stacked, flatMeta, heroUrl, photoLayers.current]);

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

  const originText = originLabel(data.city, data.country?.name);
  const visibleLabels = useMemo(
    () => data.labels.filter(isCatalogLabel),
    [data.labels]
  );
  const hasBio = Boolean(data.bio);

  useEffect(() => {
    return () => onPlayerHost?.(null);
  }, [onPlayerHost]);

  return (
    <div
      className={`artist-about${stacked ? " artist-about--stacked" : ""}${
        flatMeta ? " artist-about--flat-meta" : ""
      }`}
    >
      <div className="artist-about__layout">
        <div
          ref={photoColRef}
          className="artist-about__photo-col"
          onMouseMove={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setPhotoHoverSide(
              e.clientX - rect.left < rect.width / 2 ? "left" : "right"
            );
          }}
          onMouseLeave={() => setPhotoHoverSide(null)}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            stepEra(x < rect.width / 2 ? 1 : -1);
          }}
          role="presentation"
        >
          {photoLayers.current ? (
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
                onLoad={() => {
                  if (stacked || flatMeta) return;
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
                {photoLayers.outgoing && (
                  <img
                    key={photoLayers.outgoing}
                    src={photoLayers.outgoing}
                    alt=""
                    className="artist-about__photo artist-about__photo--layer artist-about__photo--layer-out"
                  />
                )}
                <img
                  key={photoLayers.current}
                  src={photoLayers.current}
                  alt=""
                  className={`artist-about__photo artist-about__photo--layer${
                    photoLayers.outgoing
                      ? " artist-about__photo--layer-in"
                      : " media-beat-glow"
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="artist-about__photo artist-about__photo--empty" />
          )}
        </div>
        <div ref={contentRef} className="artist-about__content">
          <div className="artist-about__bio-block">
            <div
              className={`artist-about__bio-scroll${
                stacked
                  ? bioExpanded
                    ? " artist-about__bio-scroll--expanded"
                    : " artist-about__bio-scroll--collapsed"
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
                <p className="muted">No biography stored yet.</p>
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
          <div className="artist-about__foot">
          <dl className="artist-about__meta">
            {data.aliases.length > 0 && (
              <div className="artist-about__meta-row">
                <dt>Other names</dt>
                <dd>{data.aliases.join(" • ")}</dd>
              </div>
            )}
            {(data.city || data.country) && (
              <div className="artist-about__meta-row">
                <dt>Origin</dt>
                <dd className="artist-about__origin">
                  {data.country?.iso && (
                    <button
                      type="button"
                      className="artist-about__flag"
                      onClick={() => onCountry(data.country!.id)}
                      aria-label={data.country.name ?? "Country"}
                    >
                      <span className={`fi fi-${data.country.iso}`} />
                    </button>
                  )}
                  {originText && (
                    <MetaValue
                      flat={flatMeta}
                      onClick={() =>
                        data.country && onCountry(data.country.id)
                      }
                    >
                      {originText}
                    </MetaValue>
                  )}
                </dd>
              </div>
            )}
            {data.activity_periods.length > 0 && (
              <div className="artist-about__meta-row">
                <dt>Activity</dt>
                <dd>{data.activity_periods.map((p) => p.label).join(" • ")}</dd>
              </div>
            )}
            {data.subgenres.length > 0 && (
              <div className="artist-about__meta-row">
                <dt>Genres</dt>
                <dd>
                  {data.subgenres.map((g, i) =>
                    flatMeta ? (
                      <span key={g.id} className="artist-about__meta-item">
                        {i > 0 && (
                          <span className="artist-about__meta-sep"> • </span>
                        )}
                        <MetaValue
                          flat
                          onClick={() => onSubgenre(g.id)}
                        >
                          {g.name}
                        </MetaValue>
                      </span>
                    ) : (
                      <MetaValue
                        key={g.id}
                        flat={false}
                        onClick={() => onSubgenre(g.id)}
                      >
                        {g.name}
                      </MetaValue>
                    )
                  )}
                </dd>
              </div>
            )}
            <div className="artist-about__meta-row">
              <dt>Topics</dt>
              <dd className="artist-about__topics-dd">
                <ArtistWordCloud bandId={data.id} embedded />
              </dd>
            </div>
            {visibleLabels.length > 0 && (
              <div className="artist-about__meta-row">
                <dt>Labels</dt>
                <dd>
                  {visibleLabels.map((l, i) =>
                    flatMeta ? (
                      <span key={l} className="artist-about__meta-item">
                        {i > 0 && (
                          <span className="artist-about__meta-sep"> • </span>
                        )}
                        <MetaValue flat onClick={() => onLabel(l)}>
                          {l}
                        </MetaValue>
                      </span>
                    ) : (
                      <MetaValue key={l} flat={false} onClick={() => onLabel(l)}>
                        {l}
                      </MetaValue>
                    )
                  )}
                </dd>
              </div>
            )}
          </dl>
          </div>
          {data.solo_performer && onOpenPerformer && (
            <section className="artist-about__performer">
              <h3 className="artist-about__tracks-title">Performer</h3>
              <div className="artist-about__performer-grid">
                <button
                  type="button"
                  className={`artist-about__performer-card${
                    data.solo_performer.is_deceased
                      ? " artist-about__performer-card--deceased"
                      : ""
                  }`}
                  onClick={() => onOpenPerformer(data.solo_performer!.id)}
                >
                  {data.solo_performer.photo_url ? (
                    <img
                      src={data.solo_performer.photo_url}
                      alt=""
                      className="media-beat-glow"
                    />
                  ) : (
                    <span className="artist-about__performer-ph">
                      {data.solo_performer.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="artist-about__performer-name">
                    {data.solo_performer.name}
                    {data.solo_performer.is_deceased && (
                      <span title="Deceased"> †</span>
                    )}
                  </span>
                  {data.solo_performer.years && (
                    <span className="artist-about__performer-years">
                      {data.solo_performer.years}
                    </span>
                  )}
                </button>
              </div>
            </section>
          )}
          {data.top_tracks.length > 0 && (
            <section className="artist-about__tracks">
              <h3 className="artist-about__tracks-title">Top tracks</h3>
              <div className="artist-about__tracks-stack">
                <div className="artist-about__tracks-row">
                  {data.top_tracks.map((t) => (
                    <button
                      key={t.play_path ?? t.title}
                      type="button"
                      className={`artist-about__track ${
                        playingPath === t.play_path ? "active" : ""
                      }`}
                      onClick={() =>
                        t.play_path && onPlayTrack(t.play_path, t.title)
                      }
                    >
                      <span className="artist-about__track-cover">
                        <span
                          className="artist-about__track-cover-bg"
                          style={
                            t.cover_url
                              ? { backgroundImage: `url("${t.cover_url}")` }
                              : undefined
                          }
                        />
                      </span>
                      <span className="artist-about__track-title">
                        {trackDisplayTitle(t.title)}
                      </span>
                      {t.release_date && (
                        <span className="artist-about__track-date">
                          {formatTrackDate(t.release_date)}
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
  );
}

