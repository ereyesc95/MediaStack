import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchBandOverview,
  playTrack,
  refreshBandMetadata,
  rescanBandLibrary,
} from "../../../api";
import {
  pushArtistRoute,
  type ArtistOverviewTab,
  type ArtistSection,
} from "../../../musicRoute";
import {
  applyMediaTheme,
  beginArtistPageSession,
  clearMediaTheme,
  colorsFromImageUrl,
} from "../../../mediaTheme";
import {
  isMobilePortraitLayout,
  isStackedArtistLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type { BandOverview } from "../../../types";
import AppMenu from "../../AppMenu";
import ArtistAbout, { LineupSection } from "./ArtistAbout";
import ArtistAudio from "./ArtistAudio";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "./MiniAudioPlayer";

const SECTIONS: { id: ArtistSection; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "audio", label: "AUDIO" },
  { id: "video", label: "VIDEO" },
  { id: "library", label: "LIBRARY" },
  { id: "gallery", label: "GALLERY" },
];

const OVERVIEW_TABS: { id: ArtistOverviewTab; label: string }[] = [
  { id: "about", label: "ABOUT" },
  { id: "lineup", label: "LINEUP" },
  { id: "links", label: "LINKS" },
  { id: "related", label: "RELATED" },
];

const LINK_GROUP_LABELS: Record<string, string> = {
  databases: "Databases",
  social: "Social media",
  stores: "Stores",
  lyrics: "Lyrics",
  downloads: "Downloads",
  other: "Other",
};

type Props = {
  bandId: number;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  isAdmin: boolean;
  userId?: number;
  onBack: () => void;
  onNavigate: (
    section: ArtistSection,
    overviewTab?: ArtistOverviewTab
  ) => void;
  onOpenArtist: (id: number) => void;
  onCountry: (id: number) => void;
  onSubgenre: (id: number) => void;
  onLabel: (label: string) => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
};

function pageBgUrl(
  era: BandOverview["eras"][number] | null,
  stacked: boolean
): string | undefined {
  if (!era) return undefined;
  if (stacked) return era.portrait_url ?? era.slide_url ?? undefined;
  return era.landscape_url ?? era.slide_url ?? undefined;
}

export default function ArtistPage({
  bandId,
  section,
  overviewTab,
  isAdmin,
  userId,
  onBack,
  onNavigate,
  onOpenArtist,
  onCountry,
  onSubgenre,
  onLabel,
  onSwitchProfile,
  onEditProfile,
  onImport,
  onSync,
  onChooseSource,
}: Props) {
  const [data, setData] = useState<BandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [playerHost, setPlayerHost] = useState<HTMLDivElement | null>(null);
  const [playerBarHidden, setPlayerBarHidden] = useState(false);
  const playerFallbackRef = useRef<HTMLDivElement>(null);
  const {
    audioRef,
    src: audioSrc,
    playing,
    progress,
    duration,
    toggle,
    seek,
    loadSrc,
    clear,
  } = useMiniAudio();
  const [refreshBio, setRefreshBio] = useState(false);
  const [busy, setBusy] = useState("");
  const [eraIndex, setEraIndex] = useState(0);
  const deviceLayout = useDeviceLayout();
  const stacked = isStackedArtistLayout(deviceLayout);
  const mobilePortrait = isMobilePortraitLayout(deviceLayout);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBandOverview(bandId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bandId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setEraIndex(0);
    setPlayingPath(null);
    setPlayerBarHidden(false);
    clear();
  }, [bandId, clear]);

  useEffect(() => () => clear(), [clear]);

  const carouselEras = useMemo(() => {
    if (!data?.eras.length) return [];
    const want = stacked ? "landscape" : "portrait";
    const filtered = data.eras.filter((e) => e.orientation === want);
    if (filtered.length) return filtered;
    return stacked
      ? data.eras.filter((e) => e.landscape_url)
      : data.eras.filter((e) => e.portrait_url);
  }, [data, stacked]);

  const era = useMemo(() => {
    if (!carouselEras.length) return null;
    return carouselEras[eraIndex % carouselEras.length];
  }, [carouselEras, eraIndex]);

  const bgUrl = pageBgUrl(era, stacked);
  const [bgLayers, setBgLayers] = useState<{
    current: string | undefined;
    outgoing: string | undefined;
  }>(() => ({ current: bgUrl, outgoing: undefined }));
  const prevBgRef = useRef(bgUrl);

  useEffect(() => {
    if (!bgUrl) {
      setBgLayers({ current: undefined, outgoing: undefined });
      prevBgRef.current = undefined;
      return;
    }
    if (bgUrl === prevBgRef.current) return;
    const outgoing = prevBgRef.current;
    prevBgRef.current = bgUrl;
    setBgLayers({ current: bgUrl, outgoing });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgUrl]);

  useEffect(() => {
    beginArtistPageSession(userId);
    return () => clearMediaTheme(userId);
  }, [userId]);

  useEffect(() => {
    const sampleUrl = stacked
      ? (era?.landscape_url ?? era?.slide_url)
      : (era?.portrait_url ?? era?.slide_url);
    if (!sampleUrl) return;
    colorsFromImageUrl(sampleUrl).then((c) => {
      if (c) applyMediaTheme(c, userId);
    });
  }, [era, stacked, userId]);

  useEffect(() => {
    pushArtistRoute({ bandId, section, overviewTab }, true);
  }, [bandId, section, overviewTab]);

  const visibleOverviewTabs = OVERVIEW_TABS.filter(
    (t) => t.id !== "lineup" || data?.show_lineup
  );

  const playableTracks = useMemo(
    () => (data?.top_tracks ?? []).filter((t) => t.play_path),
    [data?.top_tracks]
  );

  const handlePlay = useCallback(
    async (path: string, title: string) => {
      setPlayingPath(path);
      try {
        const res = await playTrack({ path, artist_id: bandId, title });
        loadSrc(res.stream_url, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, loadSrc]
  );

  const stepTrack = useCallback(
    (dir: -1 | 1) => {
      if (!playableTracks.length) return;
      const idx = playableTracks.findIndex((t) => t.play_path === playingPath);
      const base =
        idx >= 0 ? idx : dir === 1 ? -1 : playableTracks.length;
      const next =
        (base + dir + playableTracks.length) % playableTracks.length;
      const t = playableTracks[next];
      void handlePlay(t.play_path!, t.title);
    },
    [playableTracks, playingPath, handlePlay]
  );

  const onAboutTab = section === "overview" && overviewTab === "about";
  const playerPortalTarget = onAboutTab
    ? playerHost ?? playerFallbackRef.current
    : playerFallbackRef.current;
  const showFloatingPlayer =
    Boolean(audioSrc) &&
    section === "overview" &&
    !onAboutTab &&
    !playerBarHidden;
  const showPlayerRestore =
    Boolean(audioSrc) &&
    section === "overview" &&
    !onAboutTab &&
    playerBarHidden;

  const handleRefreshMetadata = async () => {
    setBusy("Refreshing metadata…");
    try {
      await refreshBandMetadata(bandId, refreshBio);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
      setRefreshBio(false);
    }
  };

  const handleRescanLibrary = async () => {
    setBusy("Scanning library…");
    try {
      await rescanBandLibrary(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const topBrand = era?.icon_url ? (
    <img src={era.icon_url} alt="" className="artist-page__brand-icon" />
  ) : null;
  const topLogo = era?.logo_url ? (
    <img src={era.logo_url} alt="" className="artist-page__brand-logo" />
  ) : null;

  const pageClass = [
    "artist-page",
    `artist-page--${deviceLayout}`,
    stacked ? "artist-page--stacked" : "",
    mobilePortrait ? "artist-page--mobile-portrait" : "",
    bgLayers.current ? "artist-page--has-bg" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClass}>
      <div className="artist-page__bg-stack" aria-hidden="true">
        {bgLayers.outgoing && (
          <div
            className="artist-page__bg artist-page__bg--visible artist-page__bg--out"
            style={
              {
                backgroundImage: `url("${bgLayers.outgoing}")`,
              } as CSSProperties
            }
          />
        )}
        {bgLayers.current && (
          <div
            className={`artist-page__bg artist-page__bg--visible${
              bgLayers.outgoing ? " artist-page__bg--in" : ""
            }`}
            style={
              {
                backgroundImage: `url("${bgLayers.current}")`,
              } as CSSProperties
            }
          />
        )}
      </div>
      <div className="artist-page__chrome">
        <header className="artist-page__top">
          <div className="artist-page__top-left">
            <button
              type="button"
              className="artist-page__catalog-back"
              onClick={onBack}
              aria-label="Back to catalog"
            >
              <svg
                className="artist-page__catalog-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
              <span className="artist-page__catalog-label">CATALOG</span>
            </button>
          </div>
          <div className="artist-page__top-center">
            {topBrand}
            {topLogo}
            {!topBrand && !topLogo && data && (
              <span className="artist-page__brand-name">{data.name}</span>
            )}
          </div>
          <div className="artist-page__top-right">
            {busy && <span className="muted">{busy}</span>}
            {showPlayerRestore && (
              <button
                type="button"
                className={`artist-page__player-restore${
                  playing ? " artist-page__player-restore--live" : ""
                }`}
                onClick={() => setPlayerBarHidden(false)}
                aria-label="Show player"
                title="Show player"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"
                  />
                </svg>
              </button>
            )}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              artistThemeActive
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onRefreshMetadata={
                isAdmin ? () => void handleRefreshMetadata() : undefined
              }
              onRescanLibrary={
                isAdmin ? () => void handleRescanLibrary() : undefined
              }
              refreshIncludeBio={refreshBio}
              onRefreshIncludeBioChange={setRefreshBio}
            />
          </div>
        </header>

        <nav className="artist-page__sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "active" : ""}
              onClick={() => onNavigate(s.id, overviewTab)}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        {section === "overview" && (
          <nav className="artist-page__subtabs">
            {visibleOverviewTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={overviewTab === t.id ? "active" : ""}
                onClick={() => onNavigate("overview", t.id)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}

        <div
          ref={playerFallbackRef}
          className={`artist-page__player-bar${
            showFloatingPlayer ? " artist-page__player-bar--visible" : ""
          }`}
        />
      </div>

      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto" />
      )}
      {audioSrc &&
        playerPortalTarget &&
        createPortal(
          showFloatingPlayer ? (
            <div className="artist-page__player-bar-inner">
              <MiniAudioPlayerControls
                playing={playing}
                progress={progress}
                duration={duration}
                toggle={toggle}
                seek={seek}
                onPrev={() => stepTrack(-1)}
                onNext={() => stepTrack(1)}
              />
              <button
                type="button"
                className="artist-page__player-bar-dismiss"
                onClick={() => setPlayerBarHidden(true)}
                aria-label="Hide player"
                title="Hide player"
              >
                ×
              </button>
            </div>
          ) : (
            <MiniAudioPlayerControls
              playing={playing}
              progress={progress}
              duration={duration}
              toggle={toggle}
              seek={seek}
              onPrev={() => stepTrack(-1)}
              onNext={() => stepTrack(1)}
            />
          ),
          playerPortalTarget
        )}

      <div className="artist-page__body">
        {error && <div className="error">{error}</div>}
        {loading && <p className="muted artist-page__loading">Loading…</p>}

        {data && !loading && section === "overview" && overviewTab === "about" && (
          <ArtistAbout
            data={data}
            eraIndex={eraIndex}
            stacked={stacked}
            flatMeta={deviceLayout === "mobile-landscape"}
            onEraChange={setEraIndex}
            onCountry={onCountry}
            onSubgenre={onSubgenre}
            onLabel={onLabel}
            onPlayTrack={handlePlay}
            playingPath={playingPath}
            onPlayerHost={setPlayerHost}
          />
        )}

        {data && !loading && section === "overview" && overviewTab === "lineup" && (
          <div className="artist-lineup">
            <LineupSection lineup={data.lineup.current} title="Current lineup" />
            <LineupSection lineup={data.lineup.founding} title="Founding members" />
            <LineupSection lineup={data.lineup.former} title="Former members" />
          </div>
        )}

        {data && !loading && section === "overview" && overviewTab === "links" && (
          <div className="artist-links">
            {Object.entries(data.links).map(([group, items]) => (
              <section key={group}>
                <h3>{LINK_GROUP_LABELS[group] ?? group}</h3>
                <ul>
                  {items.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.type}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {data && !loading && section === "overview" && overviewTab === "related" && (
          <div className="artist-related">
            <section>
              <h3>Similar artists</h3>
              <ul className="artist-chip-list">
                {data.similar_artists.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpenArtist(a.id)}>
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Other projects</h3>
              <ul className="artist-chip-list">
                {data.related_projects.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpenArtist(a.id)}>
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {data && !loading && section === "audio" && (
          <ArtistAudio audio={data.audio} />
        )}

        {section === "video" && (
          <p className="muted artist-section-empty">
            Video content will list movies, series, and documentaries for this artist.
          </p>
        )}
        {section === "library" && (
          <p className="muted artist-section-empty">
            Books, scans, magazines, and articles will appear here.
          </p>
        )}
        {section === "gallery" && (
          <p className="muted artist-section-empty">
            Photos, logos, and images gallery — full layout coming with mockup.
          </p>
        )}
      </div>
    </div>
  );
}
