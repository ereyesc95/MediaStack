import { useState } from "react";
import type { ReleaseTab } from "../../musicRoute";
import ReleasePage from "../music/release/ReleasePage";

type Props = {
  bandId: number;
  releaseId: string;
  isAdmin?: boolean;
  userId?: number;
  onImport: () => void;
  onSync: () => void;
  onChooseSource?: () => void;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onOpenArtist?: (bandId: number) => void;
  onGoToReleasePage: (bandId: number, releaseId: string) => void;
};

/**
 * Single-soundtrack embed for leaf/franchise Audio tabs.
 * Tab order: Tracklist → Overview → Gallery. Escape hatch on Overview.
 */
export default function EmbeddedLeafRelease({
  bandId,
  releaseId,
  isAdmin,
  userId,
  onImport,
  onSync,
  onChooseSource,
  onSwitchProfile,
  onEditProfile,
  onOpenArtist,
  onGoToReleasePage,
}: Props) {
  const [tab, setTab] = useState<ReleaseTab>("tracklist");

  return (
    <ReleasePage
      bandId={bandId}
      releaseId={releaseId}
      tab={tab}
      embedded
      userId={userId}
      isAdmin={isAdmin}
      onBack={() => {
        /* Parent leaf chrome owns navigation while embedded. */
      }}
      onOpenArtist={(id) => onOpenArtist?.(id)}
      onBrowseArtistAudio={(id) => onOpenArtist?.(id)}
      onOpenRelease={(bid, rid) => onGoToReleasePage(bid, rid)}
      onTab={setTab}
      onImport={onImport}
      onSync={onSync}
      onChooseSource={onChooseSource}
      onSwitchProfile={onSwitchProfile}
      onEditProfile={onEditProfile}
      onGoToReleasePage={() => onGoToReleasePage(bandId, releaseId)}
    />
  );
}
