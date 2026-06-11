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
  fetchBandRelated,
  playTrack,
  refreshBandLineup,
  refreshBandLinks,
  refreshBandMetadata,
  refreshBandPhotos,
  refreshBandRelatedParticipations,
  refreshBandRelatedSimilar,
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
import type {
  BandOverview,
  CardOrientation,
  LinkCategory,
  RelatedTab,
} from "../../../types";
import AppMenu from "../../AppMenu";
import { IconCardLandscape, IconCardPortrait } from "../../MenuIcons";
import ArtistAbout from "./ArtistAbout";
import ArtistAudio from "./ArtistAudio";
import ArtistAboutEditModal from "./ArtistAboutEditModal";
import ArtistLineup, { type LineupTab } from "./ArtistLineup";
import ArtistLinks from "./ArtistLinks";
import ArtistRelated from "./ArtistRelated";
import AddSimilarModal from "./AddSimilarModal";
import ArtistMemberModal from "./ArtistMemberModal";
import MemberFormModal from "./MemberFormModal";
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

const LINEUP_TABS: { id: LineupTab; label: string }[] = [
  { id: "official", label: "OFFICIAL" },
  { id: "original", label: "ORIGINAL" },
  { id: "former", label: "FORMER" },
];

const LINK_TAB_SHORT: Record<LinkCategory, string> = {
  social: "SOCIAL",
  streaming: "STREAM",
  shopping: "SHOP",
  downloads: "DL",
  databases: "DATA",
  lyrics: "LYRICS",
};

const RELATED_TABS: { id: RelatedTab; label: string; short: string }[] = [
  { id: "similar", label: "SIMILAR", short: "SIMILAR" },
  { id: "participations", label: "PROJECTS", short: "PROJECTS" },
];

type Props = {
  bandId: number;
  section: ArtistSection;
  overviewTab: ArtistOverviewTab;
  cardOrientation: CardOrientation;
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
  onToggleOrientation?: () => void;
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
  cardOrientation,
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
  onToggleOrientation,
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
  const [memberModalId, setMemberModalId] = useState<number | null>(null);
  const [lineupTab, setLineupTab] = useState<LineupTab>("official");
  const [linkTab, setLinkTab] = useState<LinkCategory>("social");
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [relatedTab, setRelatedTab] = useState<RelatedTab>("similar");
  const [addSimilarOpen, setAddSimilarOpen] = useState(false);
  const relatedFetchStarted = useRef(false);
  const loadSeq = useRef(0);
  const [relatedFetchInProgress, setRelatedFetchInProgress] = useState(false);
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [eraIndex, setEraIndex] = useState(0);
  const deviceLayout = useDeviceLayout();
  const stacked = isStackedArtistLayout(deviceLayout);
  const mobilePortrait = isMobilePortraitLayout(deviceLayout);

  const load = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const seq = ++loadSeq.current;
      const requestedBand = bandId;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      fetchBandOverview(requestedBand, cardOrientation)
        .then((result) => {
          if (seq !== loadSeq.current) return;
          setData(result);
        })
        .catch((e) => {
          if (seq !== loadSeq.current) return;
          if (!silent) {
            setError(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => {
          if (seq !== loadSeq.current) return;
          if (!silent) setLoading(false);
        });
    },
    [bandId, cardOrientation]
  );

  useEffect(() => {
    setData(null);
    load();
  }, [bandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    load({ silent: true });
  }, [cardOrientation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cats = data?.links?.categories ?? [];
    if (!cats.some((c) => c.id === linkTab) && cats[0]) {
      setLinkTab(cats[0].id);
    }
  }, [data?.links?.categories, linkTab]);

  useEffect(() => {
    relatedFetchStarted.current = false;
  }, [bandId]);

  useEffect(() => {
    if (overviewTab !== "related" || !data?.related) return;
    const needs =
      data.related.needs_similar_fetch ||
      data.related.needs_participations_fetch;
    if (!needs || relatedFetchStarted.current) return;
    relatedFetchStarted.current = true;
    setRelatedFetchInProgress(true);
    fetchBandRelated(bandId)
      .then(() => load({ silent: true }))
      .catch(() => load({ silent: true }))
      .finally(() => setRelatedFetchInProgress(false));
  }, [
    overviewTab,
    bandId,
    data?.related?.needs_similar_fetch,
    data?.related?.needs_participations_fetch,
    load,
  ]);

  useEffect(() => {
    if (!data?.lineup?.all) return;
    for (const member of data.lineup.all) {
      if (!member.photo_url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = member.photo_url;
    }
  }, [data?.lineup]);

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

  const handleRefreshLineup = async () => {
    setBusy("Refreshing lineup (may take a minute)…");
    try {
      await refreshBandLineup(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshPhotos = async () => {
    setBusy("Refreshing photos (may take a minute)…");
    try {
      await refreshBandPhotos(bandId, true);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshLinks = async () => {
    setBusy("Refreshing links from MusicBrainz…");
    try {
      await refreshBandLinks(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshRelatedSimilar = async () => {
    setBusy("Refreshing similar artists…");
    try {
      await refreshBandRelatedSimilar(bandId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshRelatedParticipations = async () => {
    setBusy("Refreshing participations…");
    try {
      await refreshBandRelatedParticipations(bandId);
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
            {section === "overview" &&
              overviewTab === "related" &&
              onToggleOrientation && (
                <button
                  type="button"
                  className="card-orientation-toggle"
                  aria-label={`Cards: ${cardOrientation}. Tap to switch layout.`}
                  onClick={onToggleOrientation}
                >
                  {cardOrientation === "landscape" ? (
                    <IconCardLandscape />
                  ) : (
                    <IconCardPortrait />
                  )}
                </button>
              )}
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
                isAdmin && overviewTab === "about"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onRescanLibrary={
                isAdmin && overviewTab === "about"
                  ? () => void handleRescanLibrary()
                  : undefined
              }
              onRefreshLineup={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => void handleRefreshLineup()
                  : undefined
              }
              onRefreshPhotos={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => void handleRefreshPhotos()
                  : undefined
              }
              onRefreshLinks={
                isAdmin && overviewTab === "links"
                  ? () => void handleRefreshLinks()
                  : undefined
              }
              refreshIncludeBio={refreshBio}
              onRefreshIncludeBioChange={
                isAdmin && overviewTab === "about"
                  ? setRefreshBio
                  : undefined
              }
              onEditAbout={
                isAdmin && overviewTab === "about"
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onAddMember={
                isAdmin &&
                overviewTab === "lineup" &&
                data?.show_lineup
                  ? () => setAddMemberOpen(true)
                  : undefined
              }
              onAddLink={
                isAdmin && overviewTab === "links"
                  ? () => setAddLinkOpen(true)
                  : undefined
              }
              onAddSimilar={
                isAdmin &&
                overviewTab === "related" &&
                relatedTab === "similar"
                  ? () => setAddSimilarOpen(true)
                  : undefined
              }
              onRefreshRelatedSimilar={
                isAdmin && overviewTab === "related"
                  ? () => void handleRefreshRelatedSimilar()
                  : undefined
              }
              onRefreshRelatedParticipations={
                isAdmin && overviewTab === "related"
                  ? () => void handleRefreshRelatedParticipations()
                  : undefined
              }
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

        {section === "overview" && overviewTab === "lineup" && data?.show_lineup && (
          <nav className="artist-page__subtabs artist-page__lineup-subtabs">
            {LINEUP_TABS.map((t) => {
              const count =
                t.id === "official"
                  ? data.lineup.current.length
                  : t.id === "original"
                    ? data.lineup.founding.length
                    : data.lineup.former.length;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={lineupTab === t.id ? "active" : ""}
                  onClick={() => setLineupTab(t.id)}
                >
                  <span>
                    {t.label}
                    <span className="artist-page__lineup-count">{count}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {section === "overview" &&
          overviewTab === "links" &&
          data?.links &&
          data.links.categories.length > 0 && (
            <nav className="artist-page__subtabs artist-page__links-subtabs">
              {data.links.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={linkTab === c.id ? "active" : ""}
                  onClick={() => setLinkTab(c.id)}
                >
                  <span>
                    {mobilePortrait
                      ? LINK_TAB_SHORT[c.id]
                      : c.label.toUpperCase()}
                    <span className="artist-page__lineup-count">{c.count}</span>
                  </span>
                </button>
              ))}
            </nav>
          )}

        {section === "overview" && overviewTab === "related" && data?.related && (
          <nav className="artist-page__subtabs artist-page__related-subtabs">
            {RELATED_TABS.map((t) => {
              const count =
                t.id === "similar"
                  ? data.related.similar_count
                  : data.related.participations_count;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={relatedTab === t.id ? "active" : ""}
                  onClick={() => setRelatedTab(t.id)}
                >
                  <span>
                    {mobilePortrait ? t.short : t.label}
                    <span className="artist-page__lineup-count">{count}</span>
                  </span>
                </button>
              );
            })}
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
            onOpenPerformer={setMemberModalId}
          />
        )}

        {data && !loading && section === "overview" && data.show_lineup && (
          <ArtistLineup
            bandId={bandId}
            bandName={data.name}
            lineup={data.lineup}
            tab={lineupTab}
            hidden={!(section === "overview" && overviewTab === "lineup")}
            isAdmin={isAdmin}
            loading={loading}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {memberModalId !== null && data && (
          <ArtistMemberModal
            artistId={memberModalId}
            bandId={bandId}
            bandName={data.name}
            isAdmin={isAdmin}
            onClose={() => setMemberModalId(null)}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {aboutEditOpen && data && (
          <ArtistAboutEditModal
            bandId={bandId}
            data={data}
            onClose={() => setAboutEditOpen(false)}
            onSaved={load}
          />
        )}

        {addMemberOpen && data && (
          <MemberFormModal
            mode="add"
            bandId={bandId}
            bandName={data.name}
            stackLayer={1}
            onClose={() => setAddMemberOpen(false)}
            onSaved={load}
          />
        )}

        {data && !loading && (
          <ArtistLinks
            links={data.links}
            tab={linkTab}
            hidden={!(section === "overview" && overviewTab === "links")}
            isAdmin={isAdmin}
            addOpen={addLinkOpen}
            onAddClose={() => setAddLinkOpen(false)}
            onDataChanged={load}
          />
        )}

        {data?.related && (
          <ArtistRelated
            related={data.related}
            tab={relatedTab}
            hidden={!(section === "overview" && overviewTab === "related")}
            orientation={cardOrientation}
            bandId={bandId}
            isAdmin={isAdmin}
            fetchInProgress={relatedFetchInProgress}
            onOpenArtist={onOpenArtist}
            onDataChanged={load}
          />
        )}

        {addSimilarOpen && (
          <AddSimilarModal
            bandId={bandId}
            onClose={() => setAddSimilarOpen(false)}
            onSaved={() => {
              setAddSimilarOpen(false);
              load();
            }}
          />
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
