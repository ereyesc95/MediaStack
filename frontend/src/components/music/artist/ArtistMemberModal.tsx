import { useEffect, useRef, useState } from "react";
import { fetchArtistDetails, uploadArtistPhoto } from "../../../api";
import type { ArtistDetails } from "../../../types";
import { IconEditProfile } from "../../MenuIcons";
import ModalPortal from "../../ModalPortal";
import MemberFormModal from "./MemberFormModal";
import NotInLibraryDialog from "./NotInLibraryDialog";

type Props = {
  artistId: number;
  bandId: number;
  bandName: string;
  isAdmin?: boolean;
  onClose: () => void;
  onOpenArtist: (bandId: number) => void;
  onDataChanged: () => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatYears(start: string | null, end: string | null): string | null {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (!s && !e) return null;
  const sy = s.length >= 4 ? s.slice(0, 4) : s || "?";
  const ey = e.length >= 4 ? e.slice(0, 4) : e ? e : "present";
  return `${sy}–${ey}`;
}

const LINK_LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  musicbrainz: "MusicBrainz",
  wikidata: "Wikidata",
};

export default function ArtistMemberModal({
  artistId,
  bandId,
  bandName,
  isAdmin = false,
  onClose,
  onOpenArtist,
  onDataChanged,
}: Props) {
  const [data, setData] = useState<ArtistDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [external, setExternal] = useState<{
    name: string;
    urls: Record<string, string>;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchArtistDetails(artistId, bandId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [artistId, bandId]);

  useEffect(() => {
    setPhotoFailed(false);
  }, [data?.photo_url]);

  const handlePhotoPick = async (file: File | undefined) => {
    if (!file || !isAdmin) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadArtistPhoto(artistId, file);
      setPhotoFailed(false);
      setData((d) => (d ? { ...d, photo_url: result.photo_url } : d));
      onDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const originText = [
    data?.origin.city,
    data?.origin.country?.name,
  ]
    .filter(Boolean)
    .join(", ");

  const linkEntries = data
    ? (["wikipedia", "musicbrainz", "wikidata"] as const).filter(
        (k) => data.urls[k]
      )
    : [];

  return (
    <>
      <ModalPortal onClose={onClose}>
        <div
          className="modal-panel artist-member-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="modal-panel-header artist-member-modal__header">
            <div className="artist-member-modal__header-actions">
              {isAdmin && data && (
                <button
                  type="button"
                  className="artist-member-modal__edit-icon"
                  aria-label="Edit member"
                  onClick={() => setEditing(true)}
                >
                  <IconEditProfile />
                </button>
              )}
              <button
                type="button"
                className="modal-close-x"
                aria-label="Close"
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </div>

          {loading && <p className="muted">Loading…</p>}
          {error && <p className="error">{error}</p>}

          {data && !loading && (
            <div className="artist-member-modal__body">
              <div className="artist-member-modal__hero">
                <button
                  type="button"
                  className={`artist-member-modal__photo-btn${
                    isAdmin ? " artist-member-modal__photo-btn--admin" : ""
                  }`}
                  onClick={() => isAdmin && fileRef.current?.click()}
                  title={isAdmin ? "Choose photo" : undefined}
                  disabled={uploading}
                >
                  {data.photo_url && !photoFailed ? (
                    <img
                      src={data.photo_url}
                      alt=""
                      className={
                        data.is_deceased
                          ? "artist-member-modal__photo--deceased"
                          : ""
                      }
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <span className="artist-member-modal__ph">
                      {initials(data.name)}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="artist-member-modal__photo-hint">
                      {uploading ? "…" : "📷"}
                    </span>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => void handlePhotoPick(e.target.files?.[0])}
                />

                <div className="artist-member-modal__info">
                  <p className="artist-member-modal__title">
                    {data.name}
                    {data.is_deceased && (
                      <span
                        className="artist-member-modal__deceased"
                        title="Deceased"
                      >
                        †
                      </span>
                    )}
                  </p>

                  {data.birth_name && data.birth_name !== data.name && (
                    <p className="artist-member-modal__row">
                      <span className="artist-member-modal__label">
                        Birth name:
                      </span>
                      <span className="artist-member-modal__value">
                        {data.birth_name}
                      </span>
                    </p>
                  )}

                  {data.aliases.length > 0 && (
                    <p className="artist-member-modal__row">
                      <span className="artist-member-modal__label">
                        Other names:
                      </span>
                      <span className="artist-member-modal__value">
                        {data.aliases.join(" • ")}
                      </span>
                    </p>
                  )}

                  {originText && (
                    <p className="artist-member-modal__row">
                      <span className="artist-member-modal__label">Origin:</span>
                      <span className="artist-member-modal__value artist-member-modal__origin">
                        {data.origin.country?.iso && (
                          <span
                            className={`fi fi-${data.origin.country.iso} artist-member-modal__flag`}
                            aria-hidden
                          />
                        )}
                        {originText}
                      </span>
                    </p>
                  )}

                  {data.age_text && (
                    <p className="artist-member-modal__row">
                      <span className="artist-member-modal__label">Age:</span>
                      <span className="artist-member-modal__value">
                        {data.age_text}
                      </span>
                    </p>
                  )}

                  {data.death_date && (
                    <p className="artist-member-modal__row">
                      <span className="artist-member-modal__label">Died:</span>
                      <span className="artist-member-modal__value">
                        {data.death_date.slice(0, 10)}
                      </span>
                    </p>
                  )}

                  {data.participations.length > 0 && (
                    <div className="artist-member-modal__row artist-member-modal__row--projects">
                      <span className="artist-member-modal__label">
                        Related Projects:
                      </span>
                      <ul className="artist-member-modal__projects">
                        {data.participations.map((p) => {
                          const years = formatYears(p.start, p.end);
                          return (
                            <li key={`arp-${p.participation_id}`}>
                              {p.in_library && p.band_id ? (
                                <button
                                  type="button"
                                  className="artist-member-modal__project-name"
                                  onClick={() => {
                                    onClose();
                                    onOpenArtist(p.band_id!);
                                  }}
                                >
                                  {p.name}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="artist-member-modal__project-name"
                                  onClick={() =>
                                    setExternal({ name: p.name, urls: p.urls })
                                  }
                                >
                                  {p.name}
                                </button>
                              )}
                              {years && (
                                <span className="artist-member-modal__years">
                                  ({years})
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {linkEntries.length > 0 && (
                    <p className="artist-member-modal__row artist-member-modal__row--links">
                      <span className="artist-member-modal__label">Links:</span>
                      <span className="artist-member-modal__links-inline">
                        {linkEntries.map((key, i) => (
                          <span key={key}>
                            {i > 0 && (
                              <span className="artist-member-modal__sep">
                                {" "}
                                •{" "}
                              </span>
                            )}
                            <a
                              href={data.urls[key]}
                              target="_blank"
                              rel="noreferrer"
                              className="artist-member-modal__link-name"
                            >
                              {LINK_LABELS[key]}
                            </a>
                          </span>
                        ))}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalPortal>

      {editing && (
        <MemberFormModal
          mode="edit"
          bandId={bandId}
          bandName={bandName}
          artistId={artistId}
          stackLayer={2}
          onClose={() => setEditing(false)}
          onSaved={() => {
            reload();
            onDataChanged();
          }}
        />
      )}

      {external && (
        <NotInLibraryDialog
          name={external.name}
          urls={external.urls}
          onClose={() => setExternal(null)}
        />
      )}
    </>
  );
}
