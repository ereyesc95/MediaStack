import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTrackDate } from "../../../formatDate";
import type { BandOverview } from "../../../types";

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
};

function normalizeBio(bio: string): string {
  return bio.replace(/\\n/g, "\n").replace(/\\"/g, '"');
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
}: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
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
      const padBottom = parseFloat(colStyle.paddingBottom) || 0;
      const h = photoStage.offsetHeight + padTop + padBottom;
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
    }, 240);
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
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            stepEra(x < rect.width / 2 ? 1 : -1);
          }}
          role="presentation"
        >
          {photoLayers.current ? (
            <div ref={photoStageRef} className="artist-about__photo-stage">
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
                  const padBottom = parseFloat(colStyle.paddingBottom) || 0;
                  const h = photoStage.offsetHeight + padTop + padBottom;
                  content.style.height = `${h}px`;
                  content.style.minHeight = `${h}px`;
                }}
              />
              <div className="artist-about__photo-stack">
                {photoLayers.outgoing && (
                  <img
                    src={photoLayers.outgoing}
                    alt=""
                    className="artist-about__photo artist-about__photo--layer artist-about__photo--layer-out"
                  />
                )}
                <img
                  src={photoLayers.current}
                  alt=""
                  className={`artist-about__photo artist-about__photo--layer${
                    photoLayers.outgoing
                      ? " artist-about__photo--layer-in"
                      : ""
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
                <p className="artist-about__bio">{normalizeBio(data.bio!)}</p>
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
                      <span
                        className="artist-about__track-cover"
                        style={
                          t.cover_url
                            ? { backgroundImage: `url("${t.cover_url}")` }
                            : undefined
                        }
                      />
                      <span className="artist-about__track-title">{t.title}</span>
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

export function LineupSection({
  lineup,
  title,
}: {
  lineup: BandOverview["lineup"]["current"];
  title: string;
}) {
  if (!lineup.length) return null;
  return (
    <section className="artist-lineup-group">
      <h3>{title}</h3>
      <ul className="artist-lineup-list">
        {lineup.map((m) => (
          <li key={m.id} className="artist-lineup-member">
            {m.photo_url ? (
              <img src={m.photo_url} alt="" />
            ) : (
              <span className="artist-lineup-member__ph">
                {m.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <span className="artist-lineup-member__name">{m.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
