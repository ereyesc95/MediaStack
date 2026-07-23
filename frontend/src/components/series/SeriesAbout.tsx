import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTrackDate } from "../../formatDate";
import type { SeriesOverview, SeriesSubseriesCard } from "../../types";

type Era = SeriesOverview["eras"][number];

type Props = {
  data: SeriesOverview;
  eraIndex: number;
  stacked: boolean;
  onEraChange: (index: number) => void;
  onOpenSubseries: (sub: SeriesSubseriesCard) => void;
  onGenre?: (id: number | string) => void;
  onPublisher?: (name: string) => void;
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
  if (stacked) {
    const landscapes = eras.filter(
      (e) => e.landscape_url || (e.orientation === "landscape" && e.slide_url)
    );
    return landscapes.length ? landscapes : eras.filter((e) => e.landscape_url);
  }
  // Left image: exclusively portrait-named slides
  const portraits = eras.filter(
    (e) => e.portrait_url || (e.orientation === "portrait" && e.slide_url)
  );
  return portraits;
}

function eraHeroUrl(era: Era, stacked: boolean): string | undefined {
  if (stacked) return era.landscape_url ?? undefined;
  return era.portrait_url ?? undefined;
}

function originLabel(country: string | null | undefined) {
  return country?.trim() || "";
}

function MetaValue({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  if (!onClick) {
    return <span className="artist-about__pill artist-about__pill--static">{children}</span>;
  }
  return (
    <button type="button" className="artist-about__pill" onClick={onClick}>
      {children}
    </button>
  );
}

export default function SeriesAbout({
  data,
  eraIndex,
  stacked,
  onEraChange,
  onOpenSubseries,
  onGenre,
  onPublisher,
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

  const heroUrl = era ? eraHeroUrl(era, stacked) : undefined;
  // Never fall back to folder cover (booklets/logos without portrait/landscape)
  const [photoLayers, setPhotoLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: heroUrl ?? undefined, outgoing: undefined }));
  const prevHeroRef = useRef(heroUrl);
  const photoColRef = useRef<HTMLDivElement>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
  }, [stacked, heroUrl, photoLayers.current]);

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

  const originText = originLabel(data.country?.name);
  const hasBio = Boolean(data.bio);
  const writers =
    data.writers.length > 0 ? data.writers : data.aliases.length > 0
      ? data.aliases
      : [];

  return (
    <div
      className={`artist-about series-about${
        stacked ? " artist-about--stacked" : ""
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
                    : " artist-about__bio-scroll--truncated"
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
                <p className="muted">
                  No description yet. Use Refresh data → Metadata (TMDb) in the
                  menu.
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
          <div className="artist-about__foot">
            <dl className="artist-about__meta">
              {writers.length > 0 && (
                <div className="artist-about__meta-row">
                  <dt>Writers</dt>
                  <dd>{writers.join(" • ")}</dd>
                </div>
              )}
              {data.country && (
                <div className="artist-about__meta-row">
                  <dt>Origin</dt>
                  <dd className="artist-about__origin">
                    {data.country?.iso && (
                      <span className="artist-about__flag" aria-hidden>
                        <span className={`fi fi-${data.country.iso}`} />
                      </span>
                    )}
                    {originText && <span>{originText}</span>}
                  </dd>
                </div>
              )}
              {(data.languages?.length ||
                data.origin_language ||
                (data.language_options || []).some((o) => o.selected)) && (
                <div className="artist-about__meta-row">
                  <dt>Languages</dt>
                  <dd>
                    {(
                      (data.language_options || []).filter((o) => o.selected)
                        .length
                        ? (data.language_options || []).filter((o) => o.selected)
                        : (data.languages || []).map((code) => ({
                            code,
                            label: code,
                            is_origin: code === data.origin_language,
                          }))
                    ).map((o) => (
                      <MetaValue key={o.code}>
                        {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                      </MetaValue>
                    ))}
                  </dd>
                </div>
              )}
              {data.activity_periods.length > 0 && (
                <div className="artist-about__meta-row">
                  <dt>Activity</dt>
                  <dd>
                    {data.activity_periods.map((p) => p.label).join(" • ")}
                  </dd>
                </div>
              )}
              {data.genres.length > 0 && (
                <div className="artist-about__meta-row">
                  <dt>Genres</dt>
                  <dd>
                    {data.genres.map((g) => (
                      <MetaValue
                        key={String(g.id)}
                        onClick={onGenre ? () => onGenre(g.id) : undefined}
                      >
                        {g.name}
                      </MetaValue>
                    ))}
                  </dd>
                </div>
              )}
              {data.publishers.length > 0 && (
                <div className="artist-about__meta-row">
                  <dt>Publisher</dt>
                  <dd>
                    {data.publishers.map((p) => (
                      <MetaValue
                        key={p}
                        onClick={onPublisher ? () => onPublisher(p) : undefined}
                      >
                        {p}
                      </MetaValue>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {data.subseries.length > 0 && (
            <section className="artist-about__tracks series-about__subseries">
              <div className="artist-about__tracks-row series-about__subseries-row">
                {data.subseries.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="artist-about__track series-about__subseries-card"
                    onClick={() => onOpenSubseries(s)}
                    title={s.title}
                  >
                    <span className="artist-about__track-cover series-about__subseries-cover">
                      <span
                        className="artist-about__track-cover-bg"
                        style={
                          s.cover_url
                            ? { backgroundImage: `url("${s.cover_url}")` }
                            : undefined
                        }
                      />
                    </span>
                    <span className="artist-about__track-title">{s.title}</span>
                    {(s.display_date || s.date_iso) && (
                      <span className="artist-about__track-date">
                        {s.display_date ||
                          formatTrackDate(s.date_iso ?? null)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
