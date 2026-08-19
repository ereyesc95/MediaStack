import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAlbumCards,
  fetchArtistCards,
  fetchFilterOptions,
  fetchUserPlaylists,
  playTrack,
} from "../../api";
import type {
  AlbumCard,
  AlbumFilterMode,
  ArtistCard,
  ArtistFilterMode,
  CardOrientation,
  FilterOptions,
  MusicCatalogScope,
  MusicDashboard,
  MusicTab,
  ReleaseCardLayout,
  UserPlaylist,
} from "../../types";
import { EMPTY_DASHBOARD } from "../../types";
import { clearMediaTheme, beginArtistPageSession, colorsFromImageUrl, applyMediaTheme, applyPlaybackThemeFromCover, endPlaybackThemeSession, onPlaybackPaused, onPlaybackResumed, setPlaybackPlaying } from "../../mediaTheme";
import { prefetchBandOverview } from "../../overviewCache";
import { prefetchReleaseOverview } from "../../releaseOverviewCache";
import { prefetchReleaseTracklist } from "../../releaseTracklistCache";
import { prefetchArtistAudio } from "../../artistAudioCache";
import { prefetchArtistGallery } from "../../artistGalleryCache";
import { prefetchArtistMediaTab } from "../../artistMediaTabCache";
import {
  clearArtistEntryReferrer,
  getArtistEntryReferrer,
  saveArtistEntryReferrer,
  type ArtistBackRestore,
} from "../../artistEntry";
import { prefetchMediaItemOverview } from "../../mediaItemOverviewCache";
import { moviesLeafFromFolderPath } from "../../openMediaFromPath";
import { saveSeriesEntryReferrer } from "../../seriesRoute";
import {
  getCachedMusicDashboard,
  prefetchMusicDashboard,
} from "../../musicDashboardCache";
import AppMenu from "../AppMenu";
import CardOrientationPicker from "../CardOrientationPicker";
import ReleaseCardLayoutPicker from "../ReleaseCardLayoutPicker";
import ModuleTopBar, { type MediaOption } from "../ModuleTopBar";
import type { ArtistOverviewTab, ArtistSection } from "../../types";
import {
  getStoredReleaseCardLayout,
  saveReleaseCardLayout,
} from "../../themes";
import AddArtistModal from "./AddArtistModal";
import AddPlaylistModal, { markSpotifyCredentialsRepair } from "./AddPlaylistModal";
import ArtistPage from "./artist/ArtistPage";
import SystemPlaylistPage from "./artist/SystemPlaylistPage";
import MediaItemPage from "./media/MediaItemPage";
import ReleasePage from "./release/ReleasePage";
import type { ReleaseTab } from "../../musicRoute";
import { pushArtistRoute, parseArtistPath, pushUserPlaylistRoute, savePendingAudioCategory, clearPendingAudioCategory, saveReleaseReferrer } from "../../musicRoute";
import {
  clearSpotifyOAuthErrorHash,
  consumeSpotifyOAuthAwaiting,
  readSpotifyOAuthError,
} from "../../spotifyOAuth";
import ArtistBrowse from "./ArtistBrowse";
import MusicCatalogScopeToggle from "./MusicCatalogScopeToggle";
import MusicHome from "./MusicHome";
import PlaylistsView from "./PlaylistsView";
import MediaBeatFx from "./MediaBeatFx";
import {
  MiniAudioPlayerControls,
  useMiniAudio,
} from "./artist/MiniAudioPlayer";
import { useBeatPulse } from "../../useBeatPulse";
import { IconAddArtist, IconDisc } from "../MenuIcons";
import { usePhoneLayout } from "../../usePhoneLayout";

type Props = {
  tab: MusicTab;
  bandId?: number;
  artistSection?: ArtistSection;
  artistOverviewTab?: ArtistOverviewTab;
  releaseId?: string;
  releaseTab?: ReleaseTab;
  mediaItemId?: string;
  playlistSlug?: string;
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
  onSetOrientation: (next: CardOrientation) => void;
  onSelectMedia: (opt: MediaOption) => void;
  onTab: (tab: MusicTab) => void;
  onBand: (id?: number, artistSection?: ArtistSection) => void;
  onArtistNavigate: (
    section: ArtistSection,
    overviewTab?: ArtistOverviewTab
  ) => void;
  onReleaseNavigate?: (
    releaseId?: string,
    releaseTab?: ReleaseTab,
    bandId?: number
  ) => void;
  onPlaylistNavigate?: (slug?: string) => void;
  onMediaItemNavigate?: (
    itemId?: string,
    section?: ArtistSection
  ) => void;
  onPlaylist: (id?: number) => void;
  onGenreFilter: (id?: number) => void;
  onCountryFilter: (id?: number, name?: string) => void;
  onBackToSeries?: (
    franchiseId: string,
    subseriesId?: string,
    restore?: ArtistBackRestore
  ) => void;
  onBackToMovies?: (
    franchiseId: string,
    restore?: ArtistBackRestore,
    filmId?: string,
    filmTitle?: string
  ) => void;
  onBackToBooks?: (
    franchiseId: string,
    restore?: ArtistBackRestore,
    bookId?: string
  ) => void;
  /** Open Series module from an artist SERIES folder path. */
  onOpenSeriesFolder?: (folderPath: string) => void;
  onOpenMoviesLeaf?: (
    franchiseId: string,
    filmId: string,
    opts?: { franchiseName?: string; filmTitle?: string }
  ) => void;
};

export default function MusicModule({
  tab,
  bandId,
  artistSection = "overview",
  artistOverviewTab = "about",
  releaseId,
  releaseTab = "overview",
  mediaItemId,
  playlistSlug,
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
  onSetOrientation,
  onSelectMedia,
  onTab,
  onBand,
  onArtistNavigate,
  onReleaseNavigate,
  onPlaylistNavigate,
  onMediaItemNavigate,
  onPlaylist,
  onGenreFilter,
  onCountryFilter,
  onBackToSeries,
  onBackToMovies,
  onBackToBooks,
  onOpenSeriesFolder,
  onOpenMoviesLeaf,
}: Props) {
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [spotifyOAuthReturn, setSpotifyOAuthReturn] = useState(false);
  const [addPlaylistInitialMode, setAddPlaylistInitialMode] = useState<"local" | "spotify">("local");
  const [playlistToast, setPlaylistToast] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MusicDashboard>(
    () => getCachedMusicDashboard() ?? EMPTY_DASHBOARD
  );
  const [dashLoading, setDashLoading] = useState(false);
  const [artists, setArtists] = useState<ArtistCard[]>([]);
  const [artistTotal, setArtistTotal] = useState(0);
  const [artistPage, setArtistPage] = useState(1);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [catalogScope, setCatalogScope] =
    useState<MusicCatalogScope>("artists");
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [albumTotal, setAlbumTotal] = useState(0);
  const [albumPage, setAlbumPage] = useState(1);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumLetters, setAlbumLetters] = useState<string[]>([]);
  const [albumCategories, setAlbumCategories] = useState<string[]>([]);
  const [albumCategory, setAlbumCategory] = useState("");
  const [albumArtistId, setAlbumArtistId] = useState<number | "">("");
  const [albumCardLayout, setAlbumCardLayout] = useState<ReleaseCardLayout>(
    () => (userId ? getStoredReleaseCardLayout(userId) : "cover")
  );
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filterMode, setFilterMode] = useState<
    ArtistFilterMode | AlbumFilterMode
  >("name");
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
  const [error, setError] = useState<string | null>(null);
  const [homePlayingPath, setHomePlayingPath] = useState<string | null>(null);
  const [homeRepeatOne, setHomeRepeatOne] = useState(false);
  const [homePlayerBarHidden, setHomePlayerBarHidden] = useState(false);
  const [entrySource, setEntrySource] = useState<"home" | "catalog">("catalog");
  const homeAudio = useMiniAudio();
  const [artistShell, setArtistShell] = useState<ArtistCard | null>(null);
  const loadArtistsGeneration = useRef(0);
  const loadAlbumsGeneration = useRef(0);
  const isPhone = usePhoneLayout();
  const portraitMenuChrome = isPhone;

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

  const primeArtistShell = useCallback(
    (id: number, shellHint?: ArtistCard | null) => {
      const card = shellHint ?? resolveArtistShell(id);
      if (card) setArtistShell(card);
      beginArtistPageSession(userId);
      const sampleUrl = card?.photo_url;
      if (sampleUrl) {
        void colorsFromImageUrl(sampleUrl).then((c) => {
          if (c) applyMediaTheme(c, userId);
        });
      }
      return card;
    },
    [resolveArtistShell, userId]
  );

  const openArtist = useCallback(
    (
      id: number,
      shellHint?: ArtistCard | null,
      from: "home" | "catalog" = "catalog"
    ) => {
      setEntrySource(from);
      clearPendingAudioCategory(id);
      saveArtistEntryReferrer({
        source: "music",
        section: "audio",
        backLabel: from === "home" ? "HOME" : "CATALOG",
      });
      primeArtistShell(id, shellHint);
      onArtistNavigate("overview", "about");
      onBand(id);
      void prefetchBandOverview(id, cardOrientation);
    },
    [cardOrientation, onArtistNavigate, onBand, primeArtistShell]
  );

  const openAlbum = useCallback(
    (album: AlbumCard) => {
      const bandId = album.navigate_band_id;
      const releaseId = album.navigate_release_id;
      setEntrySource("catalog");
      saveArtistEntryReferrer({
        source: "music",
        section: "audio",
        backLabel: "CATALOG",
      });
      saveReleaseReferrer({
        bandId,
        section: "audio",
        category: album.category,
        artistName: album.artist_name ?? undefined,
        source: "catalog",
      });
      primeArtistShell(bandId, {
        id: bandId,
        name: album.artist_name,
        photo_url: album.cover_url,
        logo_url: album.logo_url ?? null,
        logo_collapsed_url: album.logo_collapsed_url ?? null,
        icon_url: null,
        era_year: null,
        show_name_on_hover: true,
      });
      void prefetchReleaseOverview(bandId, releaseId);
      onBand(bandId, "audio");
      onReleaseNavigate?.(releaseId, "overview", bandId);
      pushArtistRoute({
        bandId,
        artistName: album.artist_name || undefined,
        section: "audio",
        overviewTab: "about",
        releaseId,
        releaseTitle: album.title || undefined,
        releaseTab: "overview",
      });
    },
    [onBand, onReleaseNavigate, primeArtistShell]
  );

  const setAlbumCardLayoutPersisted = useCallback(
    (next: ReleaseCardLayout) => {
      setAlbumCardLayout(next);
      if (userId) saveReleaseCardLayout(userId, next);
    },
    [userId]
  );

  useEffect(() => {
    if (userId) setAlbumCardLayout(getStoredReleaseCardLayout(userId));
  }, [userId]);

  useEffect(() => {
    if (catalogScope === "albums") {
      if (
        filterMode === "group" ||
        filterMode === "members" ||
        filterMode === "end" ||
        filterMode === "gender"
      ) {
        setFilterMode("name");
        setLetter("A");
        setEndDecade("");
        setGender("");
        setMemberArtistId("");
      }
    } else if (filterMode === "artists") {
      setFilterMode("name");
      setLetter("A");
      setAlbumArtistId("");
      setAlbumCategory("");
    }
  }, [catalogScope, filterMode]);

  const handleCatalogScopeChange = useCallback(
    (next: MusicCatalogScope) => {
      setCatalogScope(next);
      setSearch("");
      setFilterMode("name");
      setLetter("A");
      setContinentId("");
      setCountryId("");
      setStartDecade("");
      setEndDecade("");
      setSubgenreId("");
      setGender("");
      setLabel("");
      setProducer("");
      setMemberArtistId("");
      setAlbumArtistId("");
      setAlbumCategory("");
      setArtistPage(1);
      setAlbumPage(1);
    },
    []
  );

  const openArtistAudio = useCallback(
    (
      id: number,
      category: string,
      options?: { compilationBoxSetsOnly?: boolean }
    ) => {
      savePendingAudioCategory(id, category, options);
      primeArtistShell(id);
      void prefetchArtistAudio(id);
      onReleaseNavigate?.(undefined, undefined);
      onBand(id, "audio");
      pushArtistRoute({
        bandId: id,
        section: "audio",
        overviewTab: "about",
      });
    },
    [onBand, onReleaseNavigate, primeArtistShell]
  );

  const homeBeatActive = Boolean(!bandId && homeAudio.src);
  const homeBeatPlaying = homeBeatActive && homeAudio.playing;
  useBeatPulse(homeAudio.audioRef, homeBeatActive, homeAudio.playing);

  const pendingDeepMusicRoute = useMemo(() => {
    if (bandId != null) return false;
    if (typeof window === "undefined") return false;
    const parsed = parseArtistPath(window.location.pathname);
    if (!parsed) return false;
    return Boolean(
      parsed.artistSlug ||
        parsed.playlistSlug ||
        parsed.releaseId ||
        parsed.mediaItemId ||
        (parsed.section && parsed.section !== "overview")
    );
  }, [bandId]);

  const showHomePlayer =
    !bandId &&
    homeAudio.src &&
    !homePlayerBarHidden &&
    (tab === "home" || tab === "artists" || tab === "playlists");
  const showHomePlayerRestore =
    !bandId && homeAudio.src && homePlayerBarHidden;

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
      void prefetchReleaseTracklist(bandId, releaseId);
    }
  }, [bandId, releaseId]);

  useEffect(() => {
    if (!bandId) return;
    switch (artistSection) {
      case "audio":
        void prefetchArtistAudio(bandId);
        break;
      case "gallery":
        void prefetchArtistGallery(bandId);
        break;
      case "video":
        void prefetchArtistMediaTab(bandId, "video");
        break;
      case "series":
        void prefetchArtistMediaTab(bandId, "series");
        break;
      case "library":
        void prefetchArtistMediaTab(bandId, "library");
        break;
    }
    if (
      mediaItemId &&
      (artistSection === "video" ||
        artistSection === "series" ||
        artistSection === "library")
    ) {
      void prefetchMediaItemOverview(
        bandId,
        artistSection === "series" ? "video" : artistSection,
        mediaItemId
      );
    }
  }, [bandId, artistSection, mediaItemId]);

  useEffect(() => {
    if (tab !== "home") return;
    const cached = getCachedMusicDashboard();
    if (cached) {
      setDashboard(cached);
      setDashLoading(false);
      return;
    }
    setDashLoading(true);
    void prefetchMusicDashboard()
      .then(setDashboard)
      .finally(() => setDashLoading(false));
  }, [tab]);

  useEffect(() => {
    fetchFilterOptions().then(setFilterOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "artists") {
      fetchFilterOptions().then(setFilterOptions).catch(() => {});
    }
  }, [tab]);

  useEffect(() => {
    if (
      !onOpenMoviesLeaf ||
      !bandId ||
      artistSection !== "video" ||
      !mediaItemId
    ) {
      return;
    }
    let cancelled = false;
    void prefetchMediaItemOverview(bandId, "video", mediaItemId)
      .then(async (ov) => {
        if (cancelled || !ov?.folder_path) return;
        const leaf = await moviesLeafFromFolderPath(ov.folder_path);
        if (cancelled || !leaf) return;
        saveSeriesEntryReferrer({
          kind: "music",
          bandId,
          artistSection: "video",
          title: ov.artist_name,
        });
        onOpenMoviesLeaf(leaf.franchiseId, leaf.filmId, {
          franchiseName: leaf.franchiseName,
          filmTitle: leaf.filmTitle,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onOpenMoviesLeaf, bandId, artistSection, mediaItemId]);

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
      return slug ? `/api/assets/continent-${slug}` : null;
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
      return slug ? `/api/assets/genre-${slug}` : null;
    }
    if (filterMode === "start" && startDecade !== "") {
      return `/api/assets/decade-${startDecade}s`;
    }
    if (filterMode === "end" && endDecade !== "") {
      return `/api/assets/decade-${endDecade}s`;
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
      orientation:
        cardOrientation === "badge" ? "icons" : cardOrientation,
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

  const loadAlbums = useCallback(async () => {
    const generation = ++loadAlbumsGeneration.current;
    setError(null);
    if (albums.length === 0) setAlbumsLoading(true);
    const params = new URLSearchParams({
      page: String(albumPage),
      page_size: "24",
      layout: albumCardLayout,
      filter_mode: filterMode,
    });
    if (search.trim()) params.set("search", search.trim());
    if (letter) params.set("letter", letter);
    if (albumArtistId !== "") params.set("artist_id", String(albumArtistId));
    if (continentId !== "") params.set("continent_id", String(continentId));
    if (countryId !== "") params.set("country_id", String(countryId));
    if (startDecade !== "") params.set("start_decade", String(startDecade));
    if (subgenreId !== "") params.set("subgenre_id", String(subgenreId));
    if (label.trim()) params.set("label", label.trim());
    if (producer.trim()) params.set("producer", producer.trim());
    if (albumCategory) params.set("category", albumCategory);

    try {
      const data = await fetchAlbumCards(params);
      if (generation !== loadAlbumsGeneration.current) return;
      setAlbums(data.items);
      setAlbumTotal(data.total);
      setAlbumLetters(data.letters ?? []);
      setAlbumCategories(data.categories ?? []);
      if (
        data.categories?.length &&
        albumCategory &&
        !data.categories.includes(albumCategory)
      ) {
        setAlbumCategory(data.categories[0] ?? "");
      } else if (
        filterMode === "artists" &&
        albumArtistId !== "" &&
        data.categories?.length &&
        !albumCategory
      ) {
        setAlbumCategory(data.categories[0] ?? "");
      }
    } catch (e) {
      if (generation !== loadAlbumsGeneration.current) return;
      setAlbums([]);
      setAlbumTotal(0);
      setAlbumLetters([]);
      setAlbumCategories([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === loadAlbumsGeneration.current) {
        setAlbumsLoading(false);
      }
    }
  }, [
    albumPage,
    albumCardLayout,
    filterMode,
    search,
    letter,
    albumArtistId,
    continentId,
    countryId,
    startDecade,
    subgenreId,
    label,
    producer,
    albumCategory,
  ]);

  useEffect(() => {
    if (tab !== "artists" || bandId) return;
    if (!filterReady || homeFilterPending) {
      if (catalogScope !== "albums") {
        setArtists([]);
        setArtistTotal(0);
      }
      setError(null);
      return;
    }
    if (catalogScope === "albums") {
      loadAlbums();
    } else {
      loadArtists();
    }
  }, [
    tab,
    bandId,
    catalogScope,
    loadArtists,
    loadAlbums,
    filterReady,
    homeFilterPending,
  ]);

  useEffect(() => {
    setArtistPage(1);
    setAlbumPage(1);
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
    catalogScope,
    albumArtistId,
    albumCategory,
    albumCardLayout,
  ]);

  useEffect(() => {
    // Prefetch playlist grid so the first Playlists tab open is snappy.
    fetchUserPlaylists()
      .then((d) => setPlaylists(d.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "playlists" && playlists.length === 0) {
      fetchUserPlaylists().then((d) => setPlaylists(d.items)).catch(() => {});
    }
  }, [tab, playlists.length]);

  useEffect(() => {
    if (!playlistToast) return;
    const t = window.setTimeout(() => setPlaylistToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [playlistToast]);

  useEffect(() => {
    if (tab !== "playlists") return;

    const params = new URLSearchParams(window.location.search);
    const spotifyParam = params.get("spotify");
    if (spotifyParam === "ready" || spotifyParam === "error") {
      params.delete("spotify");
      const detail = params.get("detail");
      params.delete("detail");
      const qs = params.toString();
      const clean = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(null, "", clean);
      if (spotifyParam === "error") {
        markSpotifyCredentialsRepair(detail || "Spotify connection failed");
        setAddPlaylistInitialMode("spotify");
        setShowAddPlaylist(true);
        return;
      }
      setSpotifyOAuthReturn(true);
      setAddPlaylistInitialMode("spotify");
      setShowAddPlaylist(true);
      return;
    }

    const spotifyError = readSpotifyOAuthError();
    if (spotifyError) {
      markSpotifyCredentialsRepair(spotifyError);
      setAddPlaylistInitialMode("spotify");
      setShowAddPlaylist(true);
      clearSpotifyOAuthErrorHash();
      return;
    }

    if (consumeSpotifyOAuthAwaiting()) {
      setAddPlaylistInitialMode("spotify");
      setShowAddPlaylist(true);
    }
  }, [tab]);

  const reloadPlaylists = useCallback(() => {
    fetchUserPlaylists()
      .then((d) => setPlaylists(d.items))
      .catch(() => {});
  }, []);

  const userPlaylistOpen = tab === "playlists" && playlistId != null;
  const showModuleChrome = !bandId && !userPlaylistOpen;


  const homeTracks = dashboard.top_tracks;

  const resolveHomeTrackCover = useCallback(
    (path: string) => {
      return homeTracks.find((t) => t.path === path)?.cover_url ?? null;
    },
    [homeTracks]
  );

  const stepHomeTrack = useCallback(
    (dir: -1 | 1) => {
      if (!homeTracks.length) return;
      const idx = homeTracks.findIndex((t) => t.path === homePlayingPath);
      const base = idx >= 0 ? idx : dir === 1 ? -1 : homeTracks.length;
      const next = (base + dir + homeTracks.length) % homeTracks.length;
      const track = homeTracks[next];
      if (track.path) {
        void handlePlay(track.path, track.artist_id, track.title);
      }
    },
    [homeTracks, homePlayingPath]
  );

  async function handlePlay(
    path: string,
    artistId: number | null,
    title: string | null
  ) {
    try {
      if (tab === "home" && homePlayingPath === path && homeAudio.src) {
        if (!homeAudio.playing) {
          homeAudio.toggle();
          onPlaybackResumed(
            resolveHomeTrackCover(path) ?? null,
            userId
          );
          return;
        }
        homeAudio.toggle();
        return;
      }
      const res = await playTrack({
        path,
        artist_id: artistId ?? undefined,
        title: title ?? undefined,
      });
      if (!res.stream_url) return;
      setHomePlayingPath(path);
      setHomePlayerBarHidden(false);
      homeAudio.loadSrc(res.stream_url, true);
      setPlaybackPlaying(true);
      if (!bandId) {
        applyPlaybackThemeFromCover(
          resolveHomeTrackCover(path) ?? res.cover_url ?? null,
          userId
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    const el = homeAudio.audioRef.current;
    if (!el || bandId) return;
    const onPause = () => onPlaybackPaused(userId);
    const onPlay = () => {
      setPlaybackPlaying(true);
      if (homePlayingPath) {
        onPlaybackResumed(resolveHomeTrackCover(homePlayingPath), userId);
      }
    };
    const onEnded = () => {
      if (homeRepeatOne && homePlayingPath) {
        el.currentTime = 0;
        void el.play().catch(() => {});
        return;
      }
      setPlaybackPlaying(false);
      endPlaybackThemeSession(userId);
      setHomePlayingPath(null);
    };
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("ended", onEnded);
    };
  }, [bandId, homeAudio.audioRef, homeAudio.src, homePlayingPath, homeRepeatOne, userId, resolveHomeTrackCover]);

  const showArtistTools = tab === "artists" && !bandId;

  const moduleBackdrop =
    tab === "artists" && !bandId && Boolean(backgroundUrl || backgroundIso);

  return (
    <div
      className={`music-module${
        moduleBackdrop ? " music-module--backdrop" : ""
      }${homeBeatActive ? " music-module--beat-ready" : ""}${
        homeBeatPlaying ? " music-module--playing" : ""
      }`}
    >
      {!showModuleChrome && homeBeatActive && <MediaBeatFx />}
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
      {showModuleChrome && (
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
              {showArtistTools && !portraitMenuChrome ? (
                <MusicCatalogScopeToggle
                  value={catalogScope}
                  onChange={handleCatalogScopeChange}
                />
              ) : null}
              {showArtistTools &&
                (catalogScope === "albums" ? (
                  <ReleaseCardLayoutPicker
                    value={albumCardLayout}
                    onChange={setAlbumCardLayoutPersisted}
                  />
                ) : (
                  <CardOrientationPicker
                    value={cardOrientation}
                    onChange={onSetOrientation}
                  />
                ))}
              {showHomePlayerRestore && (
                <button
                  type="button"
                  className={`artist-page__player-restore${
                    homeAudio.playing ? " artist-page__player-restore--live" : ""
                  }`}
                  onClick={() => setHomePlayerBarHidden(false)}
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
                onSwitchProfile={onSwitchProfile}
                onEditProfile={onEditProfile}
                showAddArtist={showArtistTools && isAdmin}
                onAddArtist={() => setShowAddArtist(true)}
                showAddPlaylist={tab === "playlists" && !userPlaylistOpen}
                onAddPlaylist={() => {
                  setAddPlaylistInitialMode("local");
                  setShowAddPlaylist(true);
                }}
                menuChrome={
                  portraitMenuChrome && showArtistTools ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleCatalogScopeChange(
                          catalogScope === "artists" ? "albums" : "artists"
                        )
                      }
                    >
                      {catalogScope === "artists" ? (
                        <IconAddArtist className="menu-item-icon" />
                      ) : (
                        <IconDisc className="menu-item-icon" />
                      )}
                      {catalogScope === "artists" ? "Artists" : "Albums"}
                    </button>
                  ) : undefined
                }
              />
            </>
          }
        />
      )}

      {error && showModuleChrome && <div className="error">{error}</div>}

      {showHomePlayer && (
        <div className="artist-page__player-bar artist-page__player-bar--visible music-module__player-bar">
          <div className="artist-page__player-bar-inner">
            <MiniAudioPlayerControls
              playing={homeAudio.playing}
              progress={homeAudio.progress}
              duration={homeAudio.duration}
              toggle={homeAudio.toggle}
              seek={homeAudio.seek}
              onPrev={tab === "home" ? () => stepHomeTrack(-1) : undefined}
              onNext={tab === "home" ? () => stepHomeTrack(1) : undefined}
              repeatOne={homeRepeatOne}
              onRepeatToggle={
                tab === "home" ? () => setHomeRepeatOne((r) => !r) : undefined
              }
            />
            <button
              type="button"
              className="artist-page__player-bar-dismiss"
              onClick={() => setHomePlayerBarHidden(true)}
              aria-label="Hide player"
              title="Hide player"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {showModuleChrome && (tab === "home" || tab === "artists" || tab === "playlists") && (
        <audio
          ref={homeAudio.audioRef}
          src={homeAudio.src ?? undefined}
          preload="auto"
        />
      )}

      {userPlaylistOpen ? (
        <SystemPlaylistPage
          userPlaylistId={playlistId!}
          userId={userId}
          isAdmin={isAdmin}
          onBack={() => onPlaylist(undefined)}
          onPlaylistDeleted={reloadPlaylists}
          onOpenPlaylist={(key) => {
            const nextId = Number(key);
            if (Number.isFinite(nextId)) {
              pushUserPlaylistRoute(nextId);
              onPlaylist(nextId);
            }
          }}
          onOpenRelease={(bid, rid) => {
            void prefetchReleaseOverview(bid, rid);
            onPlaylist(undefined);
            onBand(bid, "audio");
            onReleaseNavigate?.(rid, "overview", bid);
          }}
          onOpenArtist={(id) => {
            onPlaylist(undefined);
            openArtist(id);
          }}
          onOpenCatalogSubgenre={(id, subgenreName) => {
            clearMediaTheme(userId);
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onPlaylist(undefined);
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
          onImport={onImport}
          onSync={onSync}
          onChooseSource={() => onChooseSource?.()}
          onSwitchProfile={() => onSwitchProfile?.()}
          onEditProfile={() => onEditProfile?.()}
        />
      ) : bandId &&
      mediaItemId &&
      (artistSection === "library" ||
        (artistSection === "video" && !onOpenMoviesLeaf)) ? (
        <MediaItemPage
          bandId={bandId}
          kind={artistSection}
          itemId={mediaItemId}
          isAdmin={isAdmin}
          userId={userId}
          onBack={() => onMediaItemNavigate?.(undefined, artistSection)}
          onOpenItem={(id) => onMediaItemNavigate?.(id, artistSection)}
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
      ) : bandId && playlistSlug ? (
        <SystemPlaylistPage
          bandId={bandId}
          slug={playlistSlug}
          userId={userId}
          isAdmin={isAdmin}
          onBack={() => {
            savePendingAudioCategory(bandId, "playlists");
            pushArtistRoute({
              bandId,
              section: "audio",
              overviewTab: artistOverviewTab,
            });
            onPlaylistNavigate?.(undefined);
          }}
          onOpenPlaylist={(nextSlug) => {
            savePendingAudioCategory(bandId, "playlists");
            pushArtistRoute({
              bandId,
              section: "audio",
              overviewTab: artistOverviewTab,
              playlistSlug: nextSlug,
            });
            onPlaylistNavigate?.(nextSlug);
          }}
          onOpenRelease={(bid, rid) => {
            void prefetchReleaseOverview(bid, rid);
            pushArtistRoute({
              bandId: bid,
              section: "audio",
              overviewTab: artistOverviewTab,
              releaseId: rid,
              releaseTab: "overview",
            });
            onReleaseNavigate?.(rid, "overview", bid !== bandId ? bid : undefined);
          }}
          onOpenArtist={(id) => {
            onPlaylistNavigate?.(undefined);
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
          onBrowseArtistAudio={(id, category, options) => {
            openArtistAudio(id, category, options);
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
          onBackToSeries={onBackToSeries}
          onBackToMovies={onBackToMovies}
          onBackToHome={() => {
            clearArtistEntryReferrer();
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onTab("home");
          }}
          onBackToCatalog={() => {
            clearArtistEntryReferrer();
            clearMediaTheme(userId);
            window.history.pushState(null, "", "/");
            onReleaseNavigate?.(undefined, undefined);
            onBand(undefined);
            onTab("artists");
          }}
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
          onOpenPlaylist={(slug) => {
            savePendingAudioCategory(bandId, "playlists");
            pushArtistRoute({
              bandId,
              section: "audio",
              overviewTab: artistOverviewTab,
              playlistSlug: slug,
            });
            onPlaylistNavigate?.(slug);
          }}
          onOpenMediaItem={(kind, itemId) =>
            onMediaItemNavigate?.(itemId, kind)
          }
          onOpenMoviesLeaf={onOpenMoviesLeaf}
          onOpenSeriesFolder={onOpenSeriesFolder}
          onBack={() => {
            clearMediaTheme(userId);
            const ref = getArtistEntryReferrer();
            const restore: ArtistBackRestore = {
              tab: ref?.fromTab || "catalog",
              letter: ref?.catalogLetter,
            };
            if (ref?.source === "series") {
              clearArtistEntryReferrer();
              onBackToSeries?.("", undefined, restore);
              return;
            }
            if (ref?.source === "movies") {
              clearArtistEntryReferrer();
              onBackToMovies?.(
                ref.franchiseId || "",
                restore,
                ref.filmId,
                ref.backLabel
              );
              return;
            }
            if (ref?.source === "books") {
              clearArtistEntryReferrer();
              onBackToBooks?.(ref.franchiseId || "", restore, ref.bookId);
              return;
            }
            clearArtistEntryReferrer();
            window.history.pushState(null, "", "/");
            onBand(undefined);
            onTab(entrySource === "home" ? "home" : "artists");
          }}
          backLabel={
            getArtistEntryReferrer()?.backLabel ||
            (getArtistEntryReferrer()?.source === "series"
              ? "SERIES"
              : getArtistEntryReferrer()?.source === "movies"
                ? "MOVIES"
                : getArtistEntryReferrer()?.source === "books"
                  ? "BOOKS"
                  : entrySource === "home"
                    ? "HOME"
                    : "CATALOG")
          }
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
          onSetOrientation={onSetOrientation}
        />
      ) : pendingDeepMusicRoute ? (
        <div className="module-route-shell" aria-busy="true" />
      ) : tab === "home" ? (
        <div className="music-module__body music-module__body--home">
          <MusicHome
            data={dashboard}
            loading={dashLoading}
            playingPath={homePlayingPath}
            playerBarVisible={Boolean(homePlayingPath) && !homePlayerBarHidden}
            onPlayTrack={handlePlay}
            onArtist={(id) => {
              const card = dashboard.top_artists?.find((a) => a.id === id) ?? null;
              openArtist(id, card, "home");
            }}
            onRelease={(artistId, releaseId, meta) => {
              setEntrySource("home");
              saveArtistEntryReferrer({
                source: "music",
                section: "audio",
                backLabel: "HOME",
              });
              saveReleaseReferrer({
                bandId: artistId,
                section: "audio",
                source: "home",
                artistName: meta?.artistName ?? undefined,
              });
              void prefetchReleaseOverview(artistId, releaseId);
              onBand(artistId, "audio");
              onReleaseNavigate?.(releaseId, "overview", artistId);
              pushArtistRoute({
                bandId: artistId,
                artistName: meta?.artistName || undefined,
                section: "audio",
                overviewTab: "about",
                releaseId,
                releaseTitle: meta?.title || undefined,
                releaseTab: "overview",
              });
            }}
            onGenre={(id) => onGenreFilter(id)}
            onCountry={(country) => {
              setFilterMode("country");
              setCountryId(country.id ?? "");
              setContinentId("");
              setSubgenreId("");
              setSearch("");
              onCountryFilter(country.id, country.name);
            }}
          />
        </div>
      ) : tab === "artists" ? (
        <ArtistBrowse
          catalogScope={catalogScope}
          artists={artists}
          albums={albums}
          albumCardLayout={albumCardLayout}
          albumLetters={albumLetters}
          albumCategories={albumCategories}
          albumCategory={albumCategory}
          albumArtistId={albumArtistId}
          total={catalogScope === "albums" ? albumTotal : artistTotal}
          page={catalogScope === "albums" ? albumPage : artistPage}
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
          onFilterModeChange={(m) => {
            setFilterMode(m);
            if (m !== "artists") {
              setAlbumArtistId("");
              setAlbumCategory("");
            }
            if (m !== "name") setLetter("");
            else if (!letter) setLetter("A");
          }}
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
          onPageChange={
            catalogScope === "albums" ? setAlbumPage : setArtistPage
          }
          onArtist={openArtist}
          onAlbum={openAlbum}
          onAlbumCategoryChange={setAlbumCategory}
          onAlbumArtistIdChange={(id) => {
            setAlbumArtistId(id);
            setAlbumCategory("");
          }}
          onClearFilter={() => {
            onGenreFilter();
            onCountryFilter();
            setFilterMode("name");
            setCountryId("");
            setSubgenreId("");
          }}
          loading={
            catalogScope === "albums" ? albumsLoading : artistsLoading
          }
        />
      ) : (
        <>
          {playlistToast && (
            <p className="status-bar module-top-bar__status playlist-toast">{playlistToast}</p>
          )}
          <PlaylistsView
            playlists={playlists}
            onOpen={(id) => {
              pushUserPlaylistRoute(id);
              onPlaylist(id);
            }}
          />
        </>
      )}

      {showAddPlaylist && (
        <AddPlaylistModal
          initialMode={addPlaylistInitialMode}
          showSpotifyImport={addPlaylistInitialMode === "spotify" || spotifyOAuthReturn}
          spotifyOAuthReturn={spotifyOAuthReturn}
          onSpotifyOAuthHandled={() => setSpotifyOAuthReturn(false)}
          onClose={() => {
            setShowAddPlaylist(false);
            setSpotifyOAuthReturn(false);
          }}
          onCreated={(message) => {
            setShowAddPlaylist(false);
            setSpotifyOAuthReturn(false);
            setPlaylistToast(message);
            reloadPlaylists();
          }}
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
