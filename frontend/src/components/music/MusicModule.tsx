import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchArtistCards,
  fetchFilterOptions,
  fetchMusicDashboard,
  fetchPlaylistTracks,
  fetchUserPlaylists,
  playTrack,
} from "../../api";
import type {
  ArtistCard,
  ArtistFilterMode,
  CardOrientation,
  FilterOptions,
  MusicDashboard,
  MusicTab,
  PlaylistTrack,
  UserPlaylist,
} from "../../types";
import { EMPTY_DASHBOARD } from "../../types";
import { clearMediaTheme } from "../../mediaTheme";
import { prefetchBandOverview } from "../../overviewCache";
import { prefetchReleaseOverview } from "../../releaseOverviewCache";
import AppMenu from "../AppMenu";
import { IconCardLandscape, IconCardPortrait } from "../MenuIcons";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import type { ArtistOverviewTab, ArtistSection } from "../../types";
import AddArtistModal from "./AddArtistModal";
import ArtistPage from "./artist/ArtistPage";
import MediaItemPage from "./media/MediaItemPage";
import ReleasePage from "./release/ReleasePage";
import type { ReleaseTab } from "../../musicRoute";
import ArtistBrowse from "./ArtistBrowse";
import MusicHome from "./MusicHome";
import PlaylistsView from "./PlaylistsView";

type Props = {
  tab: MusicTab;
  bandId?: number;
  artistSection?: ArtistSection;
  artistOverviewTab?: ArtistOverviewTab;
  releaseId?: string;
  releaseTab?: ReleaseTab;
  mediaItemId?: string;
  playlistId?: number;
  genreFilterId?: number;
  countryFilterId?: number;
  countryFilterName?: string;
  cardOrientation: CardOrientation;
  mediaOptions: MediaOption[];
  busy?: string;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  isAdmin?: boolean;
  userId?: number;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onToggleOrientation: () => void;
  onSelectMedia: (opt: MediaOption) => void;
  onTab: (tab: MusicTab) => void;
  onBand: (id?: number) => void;
  onArtistNavigate: (
    section: ArtistSection,
    overviewTab?: ArtistOverviewTab
  ) => void;
  onReleaseNavigate?: (
    releaseId?: string,
    releaseTab?: ReleaseTab,
    bandId?: number
  ) => void;
  onMediaItemNavigate?: (
    itemId?: string,
    section?: ArtistSection
  ) => void;
  onPlaylist: (id?: number) => void;
  onGenreFilter: (id?: number) => void;
  onCountryFilter: (id?: number, name?: string) => void;
};

export default function MusicModule({
  tab,
  bandId,
  artistSection = "overview",
  artistOverviewTab = "about",
  releaseId,
  releaseTab = "overview",
  mediaItemId,
  playlistId,
  genreFilterId,
  countryFilterId,
  countryFilterName,
  cardOrientation,
  mediaOptions,
  busy,
  onImport,
  onSync,
  onChooseSource,
  isAdmin = false,
  userId,
  onSwitchProfile,
  onEditProfile,
  onToggleOrientation,
  onSelectMedia,
  onTab,
  onBand,
  onArtistNavigate,
  onReleaseNavigate,
  onMediaItemNavigate,
  onPlaylist,
  onGenreFilter,
  onCountryFilter,
}: Props) {
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [dashboard, setDashboard] = useState<MusicDashboard>(EMPTY_DASHBOARD);
  const [dashLoading, setDashLoading] = useState(false);
  const [artists, setArtists] = useState<ArtistCard[]>([]);
  const [artistTotal, setArtistTotal] = useState(0);
  const [artistPage, setArtistPage] = useState(1);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filterMode, setFilterMode] = useState<ArtistFilterMode>("name");
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState("A");
  const [memberCount, setMemberCount] = useState<number | "">(1);
  const [memberArtistId, setMemberArtistId] = useState<number | "">("");
  const [continentId, setContinentId] = useState<number | "">("");
  const [countryId, setCountryId] = useState<number | "">("");
  const [startDecade, setStartDecade] = useState<number | "">("");
  const [endDecade, setEndDecade] = useState<number | "">("");
  const [subgenreId, setSubgenreId] = useState<number | "">("");
  const [gender, setGender] = useState("");
  const [label, setLabel] = useState("");
  const [producer, setProducer] = useState("");
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [artistShell, setArtistShell] = useState<ArtistCard | null>(null);
  const loadArtistsGeneration = useRef(0);

  const resolveArtistShell = useCallback(
    (id: number): ArtistCard | null => {
      return (
        artists.find((a) => a.id === id) ??
        dashboard.top_artists?.find((a) => a.id === id) ??
        null
      );
    },
    [artists, dashboard.top_artists]
  );

  const openArtist = useCallback(
    (id: number, shellHint?: ArtistCard | null) => {
      const card = shellHint ?? resolveArtistShell(id);
      if (card) setArtistShell(card);
      void prefetchBandOverview(id, cardOrientation);
      onArtistNavigate("overview", "about");
      onBand(id);
    },
    [cardOrientation, onArtistNavigate, onBand, resolveArtistShell]
  );

  useEffect(() => {
    if (!bandId) {
      setArtistShell(null);
      return;
    }
    const card = resolveArtistShell(bandId);
    if (card) setArtistShell(card);
  }, [bandId, resolveArtistShell]);

  useEffect(() => {
    if (bandId && releaseId) {
      void prefetchReleaseOverview(bandId, releaseId);
    }
  }, [bandId, releaseId]);

  useEffect(() => {
    if (tab === "home") {
      setDashLoading(true);
      fetchMusicDashboard()
        .then(setDashboard)
        .catch(() => setDashboard(EMPTY_DASHBOARD))
        .finally(() => setDashLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "artists") {
      fetchFilterOptions().then(setFilterOptions).catch(() => {});
    }
  }, [tab]);

  useEffect(() => {
    const hasCountryNav = countryFilterId != null || !!countryFilterName;
    if (hasCountryNav) {
      let resolvedCountryId = countryFilterId ?? null;
      if (resolvedCountryId == null && countryFilterName && filterOptions) {
        const country = filterOptions.country_groups
          .flatMap((gr) => gr.items)
          .find(
            (x) => x.name?.toLowerCase() === countryFilterName.toLowerCase()
          );
        resolvedCountryId = country?.id ?? null;
      }
      if (resolvedCountryId == null) return;

      loadArtistsGeneration.current += 1;
      setArtists([]);
      setArtistTotal(0);
      setArtistPage(1);
      setFilterMode("country");
      setCountryId(resolvedCountryId);
      setContinentId("");
      setSubgenreId("");
      setSearch("");
      onCountryFilter();
      return;
    }
    if (genreFilterId != null) {
      loadArtistsGeneration.current += 1;
      setArtists([]);
      setArtistTotal(0);
      setArtistPage(1);
      setFilterMode("genre");
      setSubgenreId(genreFilterId);
      setCountryId("");
      setContinentId("");
      setSearch("");
      onGenreFilter();
    }
  }, [
    countryFilterId,
    countryFilterName,
    genreFilterId,
    filterOptions,
    onCountryFilter,
    onGenreFilter,
  ]);

  const homeFilterPending = useMemo(() => {
    if (countryFilterId != null || countryFilterName) {
      if (countryFilterId != null) return false;
      if (!filterOptions) return true;
      return !filterOptions.country_groups
        .flatMap((gr) => gr.items)
        .some(
          (x) => x.name?.toLowerCase() === countryFilterName?.toLowerCase()
        );
    }
    return genreFilterId != null;
  }, [countryFilterId, countryFilterName, genreFilterId, filterOptions]);

  const backgroundIso = useMemo(() => {
    if (filterMode !== "country" || countryId === "") return null;
    const c = filterOptions?.country_groups
      .flatMap((gr) => gr.items)
      .find((x) => x.id === countryId);
    return (c?.iso ?? "").toLowerCase() || null;
  }, [filterMode, countryId, filterOptions]);

  const backgroundUrl = useMemo(() => {
    if (filterMode === "continent" && continentId !== "") {
      const c = filterOptions?.continents.find((x) => x.id === continentId);
      const slug = (c?.name ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return slug ? `/api/assets/system/continent-${slug}` : null;
    }
    if (filterMode === "genre" && subgenreId !== "") {
      const item = filterOptions?.subgenre_groups
        .flatMap((gr) => gr.items)
        .find((x) => x.id === subgenreId);
      const parent = filterOptions?.subgenre_groups.find((gr) =>
        gr.items.some((x) => x.id === subgenreId)
      )?.genre;
      const slug = (parent ?? item?.name ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return slug ? `/api/assets/system/genre-${slug}` : null;
    }
    if (filterMode === "start" && startDecade !== "") {
      return `/api/assets/system/decade-${startDecade}s`;
    }
    if (filterMode === "end" && endDecade !== "") {
      return `/api/assets/system/decade-${endDecade}s`;
    }
    return null;
  }, [
    filterMode,
    continentId,
    countryId,
    subgenreId,
    startDecade,
    endDecade,
    filterOptions,
  ]);

  const filterReady = useMemo(() => {
    switch (filterMode) {
      case "name":
      case "most_played":
        return true;
      case "group":
        return memberCount !== "";
      case "members":
        return memberArtistId !== "";
      case "continent":
        return continentId !== "";
      case "country":
        return countryId !== "";
      case "start":
        return startDecade !== "";
      case "end":
        return endDecade !== "";
      case "genre":
        return subgenreId !== "";
      case "gender":
        return gender !== "";
      case "label":
        return label !== "";
      case "producer":
        return producer !== "";
      default:
        return true;
    }
  }, [
    filterMode,
    memberCount,
    memberArtistId,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    gender,
    label,
    producer,
  ]);

  const loadArtists = useCallback(async () => {
    const generation = ++loadArtistsGeneration.current;
    setError(null);
    setArtistsLoading(true);
    const params = new URLSearchParams({
      page: String(artistPage),
      page_size: "48",
      orientation: cardOrientation,
      filter_mode: filterMode,
    });
    if (search.trim()) params.set("search", search.trim());
    if (letter) params.set("letter", letter);
    if (memberCount !== "") params.set("member_count", String(memberCount));
    if (memberArtistId !== "") params.set("member_artist_id", String(memberArtistId));
    if (continentId !== "") params.set("continent_id", String(continentId));
    if (countryId !== "") params.set("country_id", String(countryId));
    if (startDecade !== "") params.set("start_decade", String(startDecade));
    if (endDecade !== "") params.set("end_decade", String(endDecade));
    if (subgenreId !== "") params.set("subgenre_id", String(subgenreId));
    if (gender) params.set("gender", gender);
    if (label.trim()) params.set("label", label.trim());
    if (producer.trim()) params.set("producer", producer.trim());

    try {
      const data = await fetchArtistCards(params);
      if (generation !== loadArtistsGeneration.current) return;
      setArtists(data.items);
      setArtistTotal(data.total);
    } catch (e) {
      if (generation !== loadArtistsGeneration.current) return;
      setArtists([]);
      setArtistTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === loadArtistsGeneration.current) {
        setArtistsLoading(false);
      }
    }
  }, [
    artistPage,
    search,
    letter,
    cardOrientation,
    filterMode,
    memberCount,
    memberArtistId,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    gender,
    label,
    producer,
  ]);

  useEffect(() => {
    if (tab !== "artists" || bandId) return;
    if (!filterReady || homeFilterPending) {
      setArtists([]);
      setArtistTotal(0);
      setError(null);
      return;
    }
    loadArtists();
  }, [tab, bandId, loadArtists, filterReady, homeFilterPending]);

  useEffect(() => {
    setArtistPage(1);
  }, [
    search,
    letter,
    filterMode,
    memberCount,
    memberArtistId,
    continentId,
    countryId,
    startDecade,
    endDecade,
    subgenreId,
    gender,
    label,
    producer,
    cardOrientation,
  ]);

  useEffect(() => {
    if (tab === "playlists") {
      fetchUserPlaylists().then((d) => setPlaylists(d.items)).catch(() => {});
    }
  }, [tab]);

  useEffect(() => {
    if (playlistId != null) {
      fetchPlaylistTracks(playlistId).then((d) => setPlaylistTracks(d.items));
    }
  }, [playlistId]);


  async function handlePlay(
    path: string,
    artistId: number | null,
    title: string | null
  ) {
    try {
      const res = await playTrack({
        path,
        artist_id: artistId ?? undefined,
        title: title ?? undefined,
      });
      if (res.stream_url) window.open(res.stream_url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const showArtistTools = tab === "artists" && !bandId;

  const moduleBackdrop =
    tab === "artists" && !bandId && Boolean(backgroundUrl || backgroundIso);

  return (
    <div
      className={`music-module${
        moduleBackdrop ? " music-module--backdrop" : ""
      }`}
    >
      {moduleBackdrop && (
        <div className="music-module__backdrop" aria-hidden>
          {backgroundIso ? (
            <span
              className={`music-module__backdrop-flag fi fi-${backgroundIso}`}
            />
          ) : backgroundUrl ? (
            <div
              className="music-module__backdrop-image"
              style={{ backgroundImage: `url(${backgroundUrl})` }}
            />
          ) : null}
          <div className="music-module__backdrop-overlay" />
        </div>
      )}
      {!bandId && (
        <ModuleTopBar
          media={mediaOptions.find((m) => m.kind === "music") ?? mediaOptions[0]}
          mediaOptions={mediaOptions}
          onSelectMedia={onSelectMedia}
          tabs={[
            {
              id: "home",
              label: "HOME",
              active: tab === "home",
              onClick: () => onTab("home"),
            },
            {
              id: "artists",
              label: "CATALOG",
              active: tab === "artists",
              onClick: () => onTab("artists"),
            },
            {
              id: "playlists",
              label: "PLAYLISTS",
              active: tab === "playlists",
              onClick: () => onTab("playlists"),
            },
          ]}
          menu={
            <>
              {busy && (
                <span className="status-bar module-top-bar__status">{busy}</span>
              )}
              {showArtistTools && (
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
              <AppMenu
                onImport={onImport}
                onSync={onSync}
                onChooseSource={onChooseSource}
                isAdmin={isAdmin}
                userId={userId}
                onSwitchProfile={onSwitchProfile}
                onEditProfile={onEditProfile}
                showAddArtist={showArtistTools && isAdmin}
                onAddArtist={() => setShowAddArtist(true)}
              />
            </>
          }
        />
      )}

      {error && !bandId && <div className="error">{error}</div>}

      {bandId &&
      mediaItemId &&
      (artistSection === "video" || artistSection === "library") ? (
        <MediaItemPage
          bandId={bandId}
          kind={artistSection}
          itemId={mediaItemId}
          isAdmin={isAdmin}
          userId={userId}
          onBack={() => onMediaItemNavigate?.(undefined, artistSection)}
          onOpenArtist={(id) => {
            onMediaItemNavigate?.(undefined);
            openArtist(id);
          }}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
        />
      ) : bandId && releaseId ? (
        <ReleasePage
          bandId={bandId}
          releaseId={releaseId}
          tab={releaseTab}
          isAdmin={isAdmin}
          userId={userId}
          onBack={() => {
            onReleaseNavigate?.(undefined, undefined);
            onArtistNavigate("audio", artistOverviewTab);
          }}
          onOpenArtist={(id) => {
            onReleaseNavigate?.(undefined, undefined);
            openArtist(id);
          }}
          onOpenRelease={(bid, rid) => {
            void prefetchReleaseOverview(bid, rid);
            onReleaseNavigate?.(
              rid,
              "overview",
              bid !== bandId ? bid : undefined
            );
          }}
          onOpenCatalogProducer={(producerName) => {
            clearMediaTheme(userId);
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onTab("artists");
            setFilterMode("producer");
            void (async () => {
              const opts = filterOptions ?? (await fetchFilterOptions());
              if (!filterOptions) setFilterOptions(opts);
              const match = opts.producers.find(
                (p) => p.name.toLowerCase() === producerName.toLowerCase()
              );
              setProducer(match?.id ?? producerName);
            })();
          }}
          onOpenCatalogLabel={(labelName) => {
            clearMediaTheme(userId);
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onTab("artists");
            setFilterMode("label");
            setLabel(labelName);
          }}
          onOpenCatalogSubgenre={(id, subgenreName) => {
            clearMediaTheme(userId);
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onTab("artists");
            setFilterMode("genre");
            void (async () => {
              const opts = filterOptions ?? (await fetchFilterOptions());
              if (!filterOptions) setFilterOptions(opts);
              const items = opts.subgenre_groups.flatMap((g) => g.items);
              const match = items.find(
                (s) =>
                  s.id === id ||
                  (subgenreName &&
                    s.name?.toLowerCase() === subgenreName.toLowerCase())
              );
              const resolvedId = match?.id ?? id;
              setSubgenreId(resolvedId);
              onGenreFilter(resolvedId);
            })();
          }}
          onTab={(t) => onReleaseNavigate?.(releaseId, t)}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
        />
      ) : bandId ? (
        <ArtistPage
          bandId={bandId}
          shell={artistShell}
          section={artistSection}
          overviewTab={artistOverviewTab}
          cardOrientation={cardOrientation}
          isAdmin={isAdmin}
          userId={userId}
          onOpenReleaseNavigate={(bid, rid) => {
            void prefetchReleaseOverview(bid, rid);
            onReleaseNavigate?.(
              rid,
              "overview",
              bid !== bandId ? bid : undefined
            );
          }}
          onOpenMediaItem={(kind, itemId) =>
            onMediaItemNavigate?.(itemId, kind)
          }
          onBack={() => {
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onBand(undefined);
            onTab("artists");
          }}
          onNavigate={(section, overviewTab) =>
            onArtistNavigate(section, overviewTab ?? artistOverviewTab)
          }
          onOpenArtist={openArtist}
          onCountry={(id) => {
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onBand(undefined);
            onTab("artists");
            onCountryFilter(id);
          }}
          onSubgenre={(id) => {
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onBand(undefined);
            onTab("artists");
            onGenreFilter(id);
          }}
          onLabel={(name) => {
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onBand(undefined);
            onTab("artists");
            setFilterMode("label");
            setLabel(name);
          }}
          onSwitchProfile={onSwitchProfile}
          onEditProfile={onEditProfile}
          onImport={onImport}
          onSync={onSync}
          onChooseSource={onChooseSource}
          onToggleOrientation={onToggleOrientation}
        />
      ) : tab === "home" ? (
        <div className="music-module__body">
          <MusicHome
            data={dashboard}
            loading={dashLoading}
            onPlayTrack={handlePlay}
            onArtist={(id) => {
              const card = dashboard.top_artists?.find((a) => a.id === id) ?? null;
              openArtist(id, card);
            }}
            onGenre={(id) => onGenreFilter(id)}
            onCountry={(country) =>
              onCountryFilter(country.id, country.name)
            }
          />
        </div>
      ) : tab === "artists" ? (
        <ArtistBrowse
          artists={artists}
          total={artistTotal}
          page={artistPage}
          orientation={cardOrientation}
          search={search}
          letter={letter}
          filterMode={filterMode}
          filterOptions={filterOptions}
          memberCount={memberCount}
          memberArtistId={memberArtistId}
          continentId={continentId}
          countryId={countryId}
          startDecade={startDecade}
          endDecade={endDecade}
          subgenreId={subgenreId}
          gender={gender}
          label={label}
          producer={producer}
          backgroundUrl={backgroundUrl}
          backgroundIso={backgroundIso}
          onSearchChange={setSearch}
          onLetterChange={setLetter}
          onFilterModeChange={setFilterMode}
          onMemberCountChange={setMemberCount}
          onMemberArtistIdChange={setMemberArtistId}
          onContinentIdChange={setContinentId}
          onCountryIdChange={setCountryId}
          onStartDecadeChange={setStartDecade}
          onEndDecadeChange={setEndDecade}
          onSubgenreIdChange={setSubgenreId}
          onGenderChange={setGender}
          onLabelChange={setLabel}
          onProducerChange={setProducer}
          onPageChange={setArtistPage}
          onArtist={openArtist}
          onClearFilter={() => {
            onGenreFilter();
            onCountryFilter();
            setFilterMode("name");
            setCountryId("");
            setSubgenreId("");
          }}
          loading={artistsLoading}
        />
      ) : (
        <PlaylistsView
          playlists={playlists}
          selectedId={playlistId ?? null}
          tracks={playlistTracks}
          onOpen={(id) => onPlaylist(id)}
          onBack={() => onPlaylist(undefined)}
          onPlay={(path, title) => handlePlay(path, null, title)}
        />
      )}

      {showAddArtist && (
        <AddArtistModal
          onClose={() => setShowAddArtist(false)}
          onAdded={() => {
            setShowAddArtist(false);
            loadArtists();
            fetchFilterOptions().then(setFilterOptions).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
