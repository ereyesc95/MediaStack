import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchReleaseLyrics,
  fetchReleaseOverview,
  playTrack,
  refreshReleaseMetadata,
} from "../../../api";
import {
  clearReleaseReferrer,
  getReleaseReferrer,
  pushArtistRoute,
  type ReleaseTab,
} from "../../../musicRoute";
import {
  applyAlbumTheme,
  beginAlbumPageSession,
  beginArtistPageSession,
  clearAlbumTheme,
  colorsFromImageUrl,
} from "../../../mediaTheme";
import {
  isMobilePortraitLayout,
  useDeviceLayout,
} from "../../../usePhoneLayout";
import type { CardOrientation, LineupMember, ReleaseOverview } from "../../../types";
import AppMenu from "../../AppMenu";
import MediaInlineSearch from "../MediaInlineSearch";
import ReleaseAboutEditModal from "./ReleaseAboutEditModal";
import { IconCardLandscape, IconCardPortrait } from "../../MenuIcons";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "../artist/MiniAudioPlayer";
import MediaBeatFx from "../MediaBeatFx";
import MediaBeatFrame from "../MediaBeatFrame";
import { useBeatPulse } from "../../../useBeatPulse";
import ReleaseGallery from "./ReleaseGallery";
import ReleaseTracklist, {
  type ReleaseMobileTrackView,
  type ReleasePlaybackArt,
} from "./ReleaseTracklist";

const TABS: { id: ReleaseTab; label: string }[] = [
  { id: "overview", label: "OVERVIEW" },
  { id: "tracklist", label: "TRACKLIST" },
  { id: "gallery", label: "GALLERY" },
];

type Props = {
  bandId: number;
  releaseId: string;
  tab: ReleaseTab;
  cardOrientation: CardOrientation;
  userId?: number;
  onBack: () => void;
  onOpenArtist: (id: number) => void;
  onOpenRelease: (bandId: number, releaseId: string) => void;
  onTab: (tab: ReleaseTab) => void;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onToggleOrientation?: () => void;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
};

function LineupMiniCard({
  member,
  onSelect,
}: {
  member: LineupMember;
  onSelect: (id: number) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = member.photo_url && !photoFailed;
  return (
    <button
      type="button"
      className="release-lineup-card"
      onClick={() => onSelect(member.id)}
    >
      <span className="release-lineup-card__photo">
        {showPhoto ? (
          <img
            src={member.photo_url!}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="release-lineup-card__initials">
            {member.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="release-lineup-card__name">{member.name}</span>
      {member.roles?.length ? (
        <span className="release-lineup-card__roles">
          {member.roles.join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

export default function ReleasePage({
  bandId,
  releaseId,
  tab,
  cardOrientation,
  userId,
  onBack,
  onOpenArtist,
  onOpenRelease,
  onTab,
  onImport,
  onSync,
  onChooseSource,
  onToggleOrientation,
  isAdmin,
  onSwitchProfile,
  onEditProfile,
}: Props) {
  const layout = useDeviceLayout();
  const stacked = isMobilePortraitLayout(layout);
  const [data, setData] = useState<ReleaseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photocardFace, setPhotocardFace] = useState<"front" | "back">("front");
  const [selectedSingle, setSelectedSingle] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [mobileTrackView, setMobileTrackView] =
    useState<ReleaseMobileTrackView>("tracks");
  const [aboutEditOpen, setAboutEditOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [refreshWiki, setRefreshWiki] = useState(true);
  const [playbackArt, setPlaybackArt] = useState<ReleasePlaybackArt | null>(null);
  const [tracklistKey, setTracklistKey] = useState(0);
  const miniAudio = useMiniAudio();
  const beatActive = Boolean(playingPath && miniAudio.src);
  useBeatPulse(miniAudio.audioRef, beatActive, miniAudio.playing);
  const [bgLayers, setBgLayers] = useState<{
    current?: string;
    outgoing?: string;
  }>({});
  const prevBgRef = useRef<string | undefined>(undefined);

  const orientation = cardOrientation === "portrait" ? "portrait" : "landscape";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchReleaseOverview(bandId, releaseId, orientation);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bandId, releaseId, orientation]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    beginArtistPageSession(userId);
    beginAlbumPageSession();
  }, [userId]);

  useEffect(() => {
    return () => clearAlbumTheme(userId);
  }, [userId]);

  useEffect(() => {
    pushArtistRoute(
      {
        bandId,
        section: "audio",
        overviewTab: "about",
        releaseId,
        releaseTab: tab,
      },
      true
    );
  }, [bandId, releaseId, tab]);

  useEffect(() => {
    setPlaybackArt(null);
  }, [releaseId, data?.cover_url]);

  const displayCover = playbackArt?.cover_url ?? data?.cover_url ?? null;
  const displayAnim =
    playbackArt?.cover_animation_url ?? data?.cover_animation_url ?? null;
  const displayDisc = playbackArt?.disc_url ?? data?.disc_url ?? null;
  const bgUrl =
    playbackArt?.background_layers?.[0] ??
    data?.background_layers[0] ??
    displayCover ??
    undefined;

  const themeSampleUrl = displayCover ?? data?.cover_url ?? undefined;

  useEffect(() => {
    if (!themeSampleUrl) return;
    colorsFromImageUrl(themeSampleUrl).then((c) => {
      if (c) applyAlbumTheme(c);
    });
  }, [themeSampleUrl]);

  useEffect(() => {
    if (!bgUrl) return;
    if (bgUrl === prevBgRef.current) return;
    const outgoing = prevBgRef.current;
    prevBgRef.current = bgUrl;
    setBgLayers({ current: bgUrl, outgoing });
    const t = window.setTimeout(() => {
      setBgLayers((s) => ({ current: s.current, outgoing: undefined }));
    }, 360);
    return () => window.clearTimeout(t);
  }, [bgUrl]);

  const photocardUrl = useMemo(() => {
    if (!data) return null;
    const pc = data.photocards;
    const portrait = stacked || orientation === "portrait";
    if (photocardFace === "front") {
      return portrait ? pc.portrait_front ?? pc.landscape_front : pc.landscape_front ?? pc.portrait_front;
    }
    return portrait ? pc.portrait_back ?? pc.landscape_back : pc.landscape_back ?? pc.portrait_back;
  }, [data, photocardFace, stacked, orientation]);

  const backLabel = data?.artist_name ?? "Artist";

  const handleBack = () => {
    const ref = getReleaseReferrer();
    clearReleaseReferrer();
    if (ref && ref.bandId !== bandId) {
      onOpenArtist(ref.bandId);
      return;
    }
    onBack();
  };

  const topBrand = data?.era_icon_url ? (
    <MediaBeatFrame variant="logo">
      <img
        src={data.era_icon_url}
        alt=""
        className="release-page__brand-icon"
        draggable={false}
      />
    </MediaBeatFrame>
  ) : null;
  const topLogo = data?.era_logo_url ? (
    <MediaBeatFrame variant="logo">
      <img
        src={data.era_logo_url}
        alt=""
        className="release-page__brand-logo"
        draggable={false}
      />
    </MediaBeatFrame>
  ) : null;

  const scrollBody = tab !== "overview";

  const handleFetchLyrics = async () => {
    setBusy("Fetching synced lyrics…");
    setError(null);
    try {
      const res = await fetchReleaseLyrics(bandId, releaseId);
      if (!res.ok) {
        setError(res.error ?? "Lyrics fetch failed");
        return;
      }
      setBusy(
        `Lyrics: ${res.fetched ?? 0} saved · ${res.skipped ?? 0} skipped · ${res.not_found ?? 0} not found`
      );
      setTracklistKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.setTimeout(() => setBusy(""), 6000);
    }
  };

  const handleRefreshMetadata = async () => {
    setBusy("Refreshing metadata…");
    try {
      const res = await refreshReleaseMetadata(bandId, releaseId, refreshWiki);
      if (!res.ok) {
        setError(res.error ?? "Metadata refresh failed");
        return;
      }
      if (res.overview) {
        setData(res.overview);
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const handlePlayTrack = useCallback(
    async (path: string, title: string, art?: ReleasePlaybackArt) => {
      if (playingPath === path && miniAudio.src) {
        if (!miniAudio.playing) {
          miniAudio.toggle();
          return;
        }
        return;
      }
      if (art) {
        setPlaybackArt((prev) => ({ ...prev, ...art }));
      }
      setPlayingPath(path);
      setNowPlayingTitle(title);
      try {
        const res = await playTrack({
          path,
          artist_id: bandId,
          title,
          release: data?.title,
        });
        miniAudio.loadSrc(res.stream_url, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, data?.title, miniAudio, playingPath]
  );

  useEffect(() => {
    if (tab !== "tracklist") {
      setMobileTrackView("tracks");
    }
  }, [tab]);

  const pageClass = [
    "release-page",
    stacked ? "release-page--stacked" : "",
    scrollBody ? "release-page--scroll" : "",
    tab === "tracklist" && stacked && mobileTrackView === "album"
      ? "release-page--track-album"
      : "",
    tab === "tracklist" && stacked && mobileTrackView === "tracks"
      ? "release-page--track-tracks"
      : "",
    beatActive ? "release-page--beat-ready" : "",
    playingPath && miniAudio.playing ? "release-page--playing" : "",
    playingPath && data?.playback_kind === "tape" ? "release-page--tape" : "",
    playingPath && data?.playback_kind === "vinyl" ? "release-page--vinyl" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClass}>
      <div className="release-page__bg-stack" aria-hidden>
        {bgLayers.outgoing && (
          <div
            className="release-page__bg release-page__bg--visible release-page__bg--out"
            style={{ backgroundImage: `url("${bgLayers.outgoing}")` }}
          />
        )}
        {bgLayers.current && (
          <div
            className={`release-page__bg release-page__bg--visible${bgLayers.outgoing ? " release-page__bg--in" : ""}`}
            style={{ backgroundImage: `url("${bgLayers.current}")` }}
          />
        )}
        <MediaBeatFx />
      </div>

      <div className="release-page__chrome">
        <header className="release-page__top">
          <div className="release-page__top-left">
            <button
              type="button"
              className="release-page__back"
              onClick={handleBack}
              aria-label={`Back to ${backLabel}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{backLabel}</span>
            </button>
          </div>
          <div className="release-page__top-center">
            {topBrand}
            {topLogo}
            {!topBrand && !topLogo && data && (
              <span className="release-page__title-center">{data.title}</span>
            )}
          </div>
          <div className="release-page__top-right">
            <MediaInlineSearch
              mode="artist-releases"
              bandId={bandId}
              onSelectRelease={(rid) => onOpenRelease(bandId, rid)}
              onSelectTrack={(path, title) => {
                onTab("tracklist");
                void handlePlayTrack(path, title);
              }}
            />
            {onToggleOrientation && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Toggle card orientation"
                onClick={onToggleOrientation}
              >
                {cardOrientation === "landscape" ? (
                  <IconCardLandscape />
                ) : (
                  <IconCardPortrait />
                )}
              </button>
            )}
            <AppMenu
              onImport={onImport}
              onSync={onSync}
              onChooseSource={onChooseSource}
              isAdmin={isAdmin}
              userId={userId}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onEditAbout={
                isAdmin && tab === "overview"
                  ? () => setAboutEditOpen(true)
                  : undefined
              }
              onRefreshMetadata={
                isAdmin && tab === "overview"
                  ? () => void handleRefreshMetadata()
                  : undefined
              }
              onFetchLyrics={isAdmin ? () => void handleFetchLyrics() : undefined}
              refreshIncludeBio={refreshWiki}
              onRefreshIncludeBioChange={setRefreshWiki}
              refreshIncludeLabel="Include Wikipedia"
            />
          </div>
        </header>

        <nav className="release-page__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => onTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {loading && !data && (
        <p className="muted release-page__loading">Loading release…</p>
      )}
      {busy && <p className="muted release-page__busy">{busy}</p>}
      {error && <p className="error release-page__error">{error}</p>}

      {data && (
        <div className="release-page__body">
          <aside className="release-page__panel">
            <div className="release-page__art">
              {(playingPath && displayAnim ? displayAnim : displayCover) && (
                <img
                  src={(playingPath && displayAnim ? displayAnim : displayCover)!}
                  alt=""
                  className="release-page__cover"
                  draggable={false}
                />
              )}
              {displayDisc && data.playback_kind !== "tape" && (
                <img
                  src={displayDisc}
                  alt=""
                  className={
                    playingPath
                      ? "release-page__disc release-page__disc--spin"
                      : "release-page__disc"
                  }
                  draggable={false}
                />
              )}
              {data.playback_kind === "tape" && playingPath && (
                <span className="release-page__tape-badge">TAPE</span>
              )}
            </div>

            <div className="release-page__panel-meta">
              <button
                type="button"
                className="release-page__artist-link"
                onClick={() => onOpenArtist(bandId)}
              >
                {data.era_icon_url && (
                  <MediaBeatFrame variant="logo">
                    <img src={data.era_icon_url} alt="" className="release-page__meta-icon" />
                  </MediaBeatFrame>
                )}
                {data.era_logo_url && (
                  <MediaBeatFrame variant="logo">
                    <img src={data.era_logo_url} alt="" className="release-page__meta-logo" />
                  </MediaBeatFrame>
                )}
                {!data.era_icon_url && !data.era_logo_url && (
                  <span>{data.artist_name}</span>
                )}
              </button>
              <h1 className="release-page__album-title">{data.title}</h1>
              {data.display_date && (
                <p className="release-page__date">{data.display_date}</p>
              )}
              <p className="release-page__type-line">{data.release_type_line}</p>
              {data.source_artist && (
                <p className="release-page__source">
                  Source: {data.source_artist}
                </p>
              )}
              {data.subgenres.length > 0 && (
                <p className="release-page__subgenres">
                  {data.subgenres.map((s) => s.name).join(" · ")}
                </p>
              )}
              {data.producer && (
                <p className="release-page__producer">Producer: {data.producer}</p>
              )}
              {data.label && (
                <p className="release-page__label">
                  Label:{" "}
                  {data.label_logo_url ? (
                    <img
                      src={data.label_logo_url}
                      alt={data.label}
                      className="release-page__label-logo"
                    />
                  ) : (
                    data.label
                  )}
                </p>
              )}
              <div className="release-page__extras">
                {data.spotify_url && (
                  <img src={data.spotify_url} alt="Spotify" className="release-page__spotify" />
                )}
                {data.qr_url && (
                  <img src={data.qr_url} alt="QR" className="release-page__qr" />
                )}
              </div>
              <div className="release-page__nav-neighbors">
                {data.prev && (
                  <button
                    type="button"
                    className="release-page__neighbor"
                    onClick={() => onOpenRelease(bandId, data.prev!.id)}
                  >
                    ‹ {data.prev.title}
                  </button>
                )}
                {data.next && (
                  <button
                    type="button"
                    className="release-page__neighbor"
                    onClick={() => onOpenRelease(bandId, data.next!.id)}
                  >
                    {data.next.title} ›
                  </button>
                )}
              </div>
            </div>
          </aside>

          <main className="release-page__main">
            {tab === "overview" && (
              <div className="release-page__overview">
                {photocardUrl && (
                  <button
                    type="button"
                    className="release-page__photocard"
                    onClick={() =>
                      setPhotocardFace((f) => (f === "front" ? "back" : "front"))
                    }
                    aria-label="Flip photocard"
                  >
                    <img src={photocardUrl} alt="" draggable={false} />
                  </button>
                )}

                {data.description && (
                  <div className="release-page__description">
                    {data.description.split(/\n+/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {data.description_source && (
                      <p className="release-page__desc-source muted">
                        Source: {data.description_source}
                      </p>
                    )}
                  </div>
                )}

                {data.reviews.length > 0 && (
                  <section className="release-page__reviews">
                    <h2>Reviews &amp; links</h2>
                    <ul>
                      {data.reviews.map((r) => (
                        <li key={r.url}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            {r.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {data.singles.length > 0 && (
                  <section className="release-page__singles">
                    <h2>Singles</h2>
                    <div className="release-page__singles-grid">
                      {data.singles.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={
                            selectedSingle === s.id
                              ? "release-page__single active"
                              : "release-page__single"
                          }
                          onClick={() =>
                            setSelectedSingle((id) => (id === s.id ? null : s.id))
                          }
                        >
                          {s.cover_url && (
                            <img src={s.cover_url} alt="" draggable={false} />
                          )}
                          <span>{s.title}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {data.show_lineup && data.lineup.length > 0 && (
                  <section className="release-page__lineup">
                    <h2>Lineup</h2>
                    <div className="release-page__lineup-grid">
                      {data.lineup.map((m) => (
                        <LineupMiniCard
                          key={m.participation_id ?? m.id}
                          member={m}
                          onSelect={() => onOpenArtist(bandId)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {data.is_solo && data.lineup.length === 1 && (
                  <section className="release-page__lineup">
                    <h2>Performer</h2>
                    <div className="release-page__lineup-grid">
                      <LineupMiniCard
                        member={data.lineup[0]}
                        onSelect={() => onOpenArtist(bandId)}
                      />
                    </div>
                  </section>
                )}

                {data.gallery_photo_url && (
                  <section className="release-page__gallery-photo">
                    <h2>Gallery</h2>
                    <img
                      src={data.gallery_photo_url}
                      alt=""
                      className="release-page__gallery-img"
                      draggable={false}
                    />
                  </section>
                )}
              </div>
            )}

            {tab === "tracklist" && (
              <ReleaseTracklist
                bandId={bandId}
                releaseId={releaseId}
                artistName={data.artist_name}
                releaseTitle={data.title}
                stacked={stacked}
                playingPath={playingPath}
                mobileView={mobileTrackView}
                onMobileViewChange={setMobileTrackView}
                mobileBackdropUrl={displayCover}
                onEditionArt={(edition) =>
                  setPlaybackArt({
                    cover_url: edition.cover_url,
                    cover_animation_url: edition.cover_animation_url,
                    disc_url: edition.disc_url,
                    background_layers: edition.background_layers,
                  })
                }
                onPlay={(path, title, art) => void handlePlayTrack(path, title, art)}
                reloadKey={tracklistKey}
              />
            )}

            {tab === "gallery" && (
              <ReleaseGallery bandId={bandId} releaseId={releaseId} />
            )}
          </main>
        </div>
      )}

      {aboutEditOpen && data && (
        <ReleaseAboutEditModal
          bandId={bandId}
          releaseId={releaseId}
          data={data}
          onClose={() => setAboutEditOpen(false)}
          onSaved={() => void load()}
        />
      )}

      <audio ref={miniAudio.audioRef} src={miniAudio.src ?? undefined} preload="auto" />
      {playingPath && nowPlayingTitle && (
        <div className="release-page__player">
          <span className="release-page__player-title">{nowPlayingTitle}</span>
          <MiniAudioPlayerControls {...miniAudio} />
        </div>
      )}
    </div>
  );
}
