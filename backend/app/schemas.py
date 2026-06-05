from __future__ import annotations

from pydantic import BaseModel, Field


class ContentTypeOut(BaseModel):
    id: int
    name: str | None
    sort_id: str | None = None

    model_config = {"from_attributes": True}


class MenuItemOut(BaseModel):
    id: int
    name: str | None
    content_type: str | None
    order: int | None

    model_config = {"from_attributes": True}


class FilterOut(BaseModel):
    id: int
    name: str | None
    data_type: str | None
    content_type_id: int | None
    menu_item_id: int | None
    parent_table: str | None
    parent_field: str | None
    order: int | None


class ModuleNavOut(BaseModel):
    content_type: ContentTypeOut
    menu_items: list[MenuItemOut]
    filters: list[FilterOut]


class BandOut(BaseModel):
    id: int
    name: str | None
    code: str | None = None
    origin_place: str | None = None
    starting_dates: str | None = None
    genres: str | None = None
    bio_excerpt: str | None = None

    model_config = {"from_attributes": True}


class BandListOut(BaseModel):
    items: list[BandOut]
    total: int
    page: int
    page_size: int


class ReleaseOut(BaseModel):
    id: int
    title: str | None
    band_ids: str | None = None
    date: str | None = None
    release_code: str | None = None

    model_config = {"from_attributes": True}


class ReleaseListOut(BaseModel):
    items: list[ReleaseOut]
    total: int


class TrackOut(BaseModel):
    id: int
    name: str | None
    duration: str | None = None
    band_id: str | None = None

    model_config = {"from_attributes": True}


class PlaylistOut(BaseModel):
    id: int
    name: str | None
    type_id: int
    description: str | None = None

    model_config = {"from_attributes": True}


class SeriesOut(BaseModel):
    id: int
    name: str | None
    code: str | None = None
    starting_date: str | None = None
    ending_date: str | None = None
    studio: str | None = None

    model_config = {"from_attributes": True}


class SeriesListOut(BaseModel):
    items: list[SeriesOut]
    total: int
    page: int
    page_size: int


class SeasonOut(BaseModel):
    id: int
    series_id: int | None
    name: str | None
    number: int | None = None

    model_config = {"from_attributes": True}


class EpisodeOut(BaseModel):
    id: int
    season_id: int | None
    number: str | None
    name: str | None

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    user_id: int
    username: str
    role_id: int | None = None
    is_admin: bool = False
    avatar: str | None = None
    token: str | None = None


class ProfileOut(BaseModel):
    user_id: int
    username: str
    role_id: int | None = None
    is_admin: bool = False
    avatar: str | None = None


class SelectProfileRequest(BaseModel):
    user_id: int
    password: str | None = None


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    avatar: str | None = None


class SessionOut(BaseModel):
    device_id: str | None
    user: LoginResponse | None = None
    current_module: str | None = None
    media_server_url: str
    token: str | None = None


class HealthOut(BaseModel):
    status: str
    database_path: str
    frontend: bool
    counts: dict[str, int] = Field(default_factory=dict)


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class PlayRequest(BaseModel):
    path: str
    artist_id: int | None = None
    title: str | None = None
    release: str | None = None
    media_type: int = 200


class PlayResponse(BaseModel):
    stream_url: str
    local_file: str | None = None
    title: str | None = None


class LyricsOut(BaseModel):
    artist: str
    title: str
    lyrics: str | None
    source: str = "lyrics.ovh"


class ReproductionOut(BaseModel):
    id: int
    title: str | None
    artist_id: int | None
    play_count: int
    path: str | None


class ImportResultOut(BaseModel):
    tables: dict[str, int] = Field(default_factory=dict)
    skipped_statements: int = 0
    errors: list[str] = Field(default_factory=list)


class SyncRequest(BaseModel):
    module: str = "all"
    media_root: str | None = None


class MovieOut(BaseModel):
    id: int
    title: str | None
    release_date: str | None = None
    genre_id: str | None = None

    model_config = {"from_attributes": True}


class MovieListOut(BaseModel):
    items: list[MovieOut]
    total: int
    page: int
    page_size: int


class BookOut(BaseModel):
    id: int
    title: str | None
    author_id: str | None = None
    release_date: str | None = None
    series_id: int | None = None
    number: int | None = None

    model_config = {"from_attributes": True}


class BookListOut(BaseModel):
    items: list[BookOut]
    total: int
    page: int
    page_size: int


class GameOut(BaseModel):
    id: int
    name: str | None
    code: str | None = None
    release_date: str | None = None
    studio: str | None = None

    model_config = {"from_attributes": True}


class GameListOut(BaseModel):
    items: list[GameOut]
    total: int
    page: int
    page_size: int
