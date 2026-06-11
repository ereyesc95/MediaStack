import { useEffect, useMemo, useState } from "react";
import type { BandOverview, LineupMember } from "../../../types";
import ArtistMemberModal from "./ArtistMemberModal";

export type LineupTab = "official" | "original" | "former";

type Props = {
  bandId: number;
  bandName: string;
  lineup: BandOverview["lineup"];
  tab: LineupTab;
  hidden?: boolean;
  isAdmin?: boolean;
  loading?: boolean;
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

function splitRows<T>(items: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.ceil(items.length / 2);
  return { top: items.slice(0, topCount), bottom: items.slice(topCount) };
}

function memberKey(member: LineupMember): string {
  return member.participation_id != null
    ? `arp-${member.participation_id}`
    : `art-${member.id}`;
}

function MemberCard({
  member,
  onSelect,
}: {
  member: LineupMember;
  onSelect: (id: number) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const roles = member.roles?.filter(Boolean).join(" · ");
  const showPhoto = member.photo_url && !photoFailed;

  useEffect(() => {
    setPhotoFailed(false);
  }, [member.photo_url]);

  return (
    <button
      type="button"
      className={`artist-lineup-card${member.is_deceased ? " artist-lineup-card--deceased" : ""}`}
      onClick={() => onSelect(member.id)}
    >
      <span className="artist-lineup-card__photo">
        {showPhoto ? (
          <img
            src={member.photo_url!}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="artist-lineup-card__ph">{initials(member.name)}</span>
        )}
      </span>
      <span className="artist-lineup-card__name">
        {member.name}
        {member.is_deceased && (
          <span className="artist-lineup-card__deceased" title="Deceased">
            †
          </span>
        )}
      </span>
      {roles && <span className="artist-lineup-card__roles">{roles}</span>}
      {member.years && (
        <span className="artist-lineup-card__years">{member.years}</span>
      )}
    </button>
  );
}

export default function ArtistLineup({
  bandId,
  bandName,
  lineup,
  tab,
  hidden,
  isAdmin,
  loading,
  onOpenArtist,
  onDataChanged,
}: Props) {
  const [modalId, setModalId] = useState<number | null>(null);

  const members = useMemo(() => {
    if (tab === "official") return lineup.current;
    if (tab === "original") return lineup.founding;
    return lineup.former;
  }, [lineup, tab]);

  const rows = useMemo(() => splitRows(members), [members]);

  if (loading) {
    return (
      <div className="artist-lineup">
        <p className="muted">Importing from MusicBrainz…</p>
      </div>
    );
  }

  if (!lineup.all.length) {
    return (
      <div className="artist-lineup">
        <p className="muted">No lineup data available.</p>
      </div>
    );
  }

  return (
    <div className={`artist-lineup${hidden ? " artist-panel--hidden" : ""}`}>
      {members.length === 0 ? (
        <p className="muted artist-lineup__empty">No members in this group.</p>
      ) : (
        <div
          className="artist-lineup-grid"
          data-count={Math.min(Math.max(members.length, 1), 8)}
        >
          <div className="artist-lineup-row">
            {rows.top.map((m) => (
              <MemberCard
                key={memberKey(m)}
                member={m}
                onSelect={setModalId}
              />
            ))}
          </div>
          {rows.bottom.length > 0 && (
            <div className="artist-lineup-row">
              {rows.bottom.map((m) => (
                <MemberCard
                  key={memberKey(m)}
                  member={m}
                  onSelect={setModalId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {modalId !== null && (
        <ArtistMemberModal
          artistId={modalId}
          bandId={bandId}
          bandName={bandName}
          isAdmin={isAdmin}
          onClose={() => setModalId(null)}
          onOpenArtist={onOpenArtist}
          onDataChanged={onDataChanged}
        />
      )}
    </div>
  );
}
