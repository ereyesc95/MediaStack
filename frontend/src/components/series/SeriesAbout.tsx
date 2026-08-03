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
  onCountry?: (country: { id?: number; name: string; iso?: string | null }) => void;
  onWriter?: (name: string) => void;
  /** Active language for logo / cast reordering. */
  activeLanguage?: string | null;
  logosSwitchable?: boolean;
  onLanguageSelect?: (code: string) => void;
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
  active,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  if (!onClick) {
    return (
      <span className="artist-about__pill artist-about__pill--static">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`artist-about__pill${active ? " artist-about__pill--active" : ""}`}
      onClick={onClick}
    >
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
  onCountry,
  onWriter,
  activeLanguage,
  logosSwitchable,
  onLanguageSelect,
}: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [photoHoverSide, setPhotoHoverSide] = useState<"left" | "right" | null>(
    null
  );
  const [revealedSubId, setRevealedSubId] = useState<string | null>(null);
  /** Portrait phone/tablet: hide under-card labels; tap to reveal then open. */
  const tapRevealSubs = stacked;
  useEffect(() => {
    setBioExpanded(false);
  }, [data.folder_path, data.name]);
  const slides = useMemo(
    () => carouselEras(data.eras, stacked),
    [data.eras, stacked]
  );
  useEffect(() => {
    if (!tapRevealSubs || revealedSubId == null) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".series-about__subseries-card")) return;
      setRevealedSubId(null);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [tapRevealSubs, revealedSubId]);

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
  const subseriesRowRef = useRef<HTMLDivElement>(null);

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
  const hasSubseriesCarousel = data.subseries.length > 6;

  const advanceSubseriesCarousel = () => {
    const row = subseriesRowRef.current;
    if (!row) return;
    const remaining = row.scrollWidth - row.clientWidth - row.scrollLeft;
    if (remaining <= 12) {
      row.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    row.scrollBy({ left: Math.max(row.clientWidth * 0.75, 180), behavior: "smooth" });
  };

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
                  <dd>
                    {writers.map((w) => (
                      <MetaValue
                        key={w}
                        onClick={onWriter ? () => onWriter(w) : undefined}
                      >
                        {w}
                      </MetaValue>
                    ))}
                  </dd>
                </div>
              )}
              {data.country && (
                <div className="artist-about__meta-row">
                  <dt>Origin</dt>
                  <dd className="artist-about__origin">
                    <MetaValue
                      onClick={
                        onCountry
                          ? () =>
                              onCountry({
                                id: data.country?.id,
                                name: data.country?.name || originText,
                                iso: data.country?.iso,
                              })
                          : undefined
                      }
                    >
                      {data.country?.iso && (
                        <span className="artist-about__flag" aria-hidden>
                          <span className={`fi fi-${data.country.iso}`} />
                        </span>
                      )}
                      {originText && <span>{originText}</span>}
                    </MetaValue>
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
                      <MetaValue
                        key={o.code}
                        active={
                          Boolean(
                            activeLanguage &&
                              activeLanguage.toLowerCase() ===
                                o.code.toLowerCase()
                          )
                        }
                        onClick={
                          logosSwitchable && onLanguageSelect
                            ? () => onLanguageSelect(o.code)
                            : undefined
                        }
                      >
                        {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                      </MetaValue>
                    ))}
                  </dd>
                </div>
              )}
              {data.activity_periods.length > 0 && (
                <div className="artist-about__meta-row">
                  <dt>Air Dates</dt>
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
            <section
              className={`artist-about__tracks series-about__subseries${
                hasSubseriesCarousel ? " series-about__subseries--carousel" : ""
              }`}
            >
              <div
                ref={subseriesRowRef}
                className={`artist-about__tracks-row series-about__subseries-row${
                  hasSubseriesCarousel
                    ? " series-about__subseries-row--scroll"
                    : " series-about__subseries-row--spread"
                }`}
              >
                {data.subseries.map((s) => {
                  const revealed = tapRevealSubs && revealedSubId === s.id;
                  const dateLabel =
                    s.display_date || formatTrackDate(s.date_iso ?? null);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`artist-about__track series-about__subseries-card${
                        revealed ? " is-revealed" : ""
                      }`}
                      onClick={() => {
                        if (tapRevealSubs) {
                          if (revealedSubId === s.id) {
                            onOpenSubseries(s);
                            return;
                          }
                          setRevealedSubId(s.id);
                          return;
                        }
                        onOpenSubseries(s);
                      }}
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
                        {revealed ? (
                          <span className="series-about__subseries-reveal">
                            <span className="series-about__subseries-reveal-main">
                              {s.logo_url ? (
                                <img
                                  className="series-about__subseries-reveal-logo"
                                  src={s.logo_url}
                                  alt=""
                                />
                              ) : (
                                <span className="series-about__subseries-reveal-title">
                                  {s.title}
                                </span>
                              )}
                            </span>
                            {dateLabel ? (
                              <span className="series-about__subseries-reveal-date">
                                {dateLabel}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      {!tapRevealSubs ? (
                        <>
                          <span className="artist-about__track-title">
                            {s.title}
                          </span>
                          {dateLabel ? (
                            <span className="artist-about__track-date">
                              {dateLabel}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {hasSubseriesCarousel ? (
                <button
                  type="button"
                  className="series-about__subseries-chevron"
                  onClick={advanceSubseriesCarousel}
                  aria-label="Show more series"
                >
                  <svg
                    className="artist-page__catalog-chevron"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 6l6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
