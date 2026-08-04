import type { ComponentType } from "react";
import MyStackIcon from "./MyStackIcon";
import {
  IconAdmin,
  IconDisc,
  IconHeadphones,
  IconHeart,
  IconMediaBooks,
  IconMediaGames,
  IconMediaMovies,
  IconMediaMusic,
  IconMediaSeries,
  IconStar,
  IconUniverse,
} from "./MenuIcons";

const PHOTO_MARKER = "photo";

type IconComp = ComponentType<{ className?: string }>;

function IconMyStackMark({ className }: { className?: string }) {
  return <MyStackIcon className={className} size={18} />;
}

const AVATAR_ICONS: Record<string, IconComp> = {
  admin: IconAdmin,
  mystack: IconMyStackMark,
  music: IconMediaMusic,
  games: IconMediaGames,
  books: IconMediaBooks,
  disc: IconDisc,
  universe: IconUniverse,
  star: IconStar,
  headphones: IconHeadphones,
  heart: IconHeart,
  // Legacy tokens still render if already saved
  movies: IconMediaMovies,
  series: IconMediaSeries,
};

export function avatarIconId(avatar: string | null | undefined): string | null {
  if (!avatar?.startsWith("icon:")) return null;
  const id = avatar.slice(5);
  return id in AVATAR_ICONS ? id : null;
}

type Props = {
  userId: number;
  name: string;
  avatar?: string | null;
  /** When true and avatar is empty/color, show the admin shield instead of a letter. */
  isAdmin?: boolean;
  className?: string;
};

function AvatarIconMark({
  Icon,
  className = "",
}: {
  Icon: IconComp;
  className?: string;
}) {
  return (
    <span className={`profile-avatar profile-avatar--icon ${className}`} aria-hidden>
      <Icon className="profile-avatar__glyph" />
    </span>
  );
}

export default function ProfileAvatar({
  userId,
  name,
  avatar,
  isAdmin = false,
  className = "",
}: Props) {
  if (avatar === PHOTO_MARKER) {
    return (
      <span className={`profile-avatar profile-avatar--photo ${className}`} aria-hidden>
        <img
          src={`/api/auth/avatars/${userId}?t=${userId}`}
          alt=""
          className="profile-avatar__img"
        />
      </span>
    );
  }

  const iconId = avatarIconId(avatar);
  if (iconId) {
    const Icon = AVATAR_ICONS[iconId];
    return <AvatarIconMark Icon={Icon} className={className} />;
  }

  if (avatar?.startsWith("#")) {
    if (isAdmin) {
      return (
        <span
          className={`profile-avatar profile-avatar--color profile-avatar--icon ${className}`}
          style={{ background: avatar }}
          aria-hidden
        >
          <IconAdmin className="profile-avatar__glyph" />
        </span>
      );
    }
    const initial = (name || "?").charAt(0).toUpperCase();
    return (
      <span
        className={`profile-avatar profile-avatar--color ${className}`}
        style={{ background: avatar }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  if (avatar && avatar.length <= 4) {
    return (
      <span className={`profile-avatar profile-avatar--emoji ${className}`} aria-hidden>
        {avatar}
      </span>
    );
  }

  if (isAdmin) {
    return (
      <AvatarIconMark
        Icon={IconAdmin}
        className={`profile-avatar--admin ${className}`.trim()}
      />
    );
  }

  return (
    <span className={`profile-avatar profile-avatar--letter ${className}`} aria-hidden>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/** App mark for welcome chrome (not used as the admin profile tile). */
export function ProfileWelcomeLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`profile-picker-welcome__logo ${className}`} aria-hidden>
      <MyStackIcon size={28} className="profile-picker-welcome__mark" />
    </span>
  );
}

export const PROFILE_ICON_OPTIONS: {
  id: string;
  label: string;
  Icon: IconComp;
}[] = [
  { id: "icon:mystack", label: "MyStack", Icon: IconMyStackMark },
  { id: "icon:star", label: "Star", Icon: IconStar },
  { id: "icon:music", label: "Music", Icon: IconMediaMusic },
  { id: "icon:games", label: "Games", Icon: IconMediaGames },
  { id: "icon:disc", label: "Disc", Icon: IconDisc },
  { id: "icon:headphones", label: "Headphones", Icon: IconHeadphones },
  { id: "icon:universe", label: "Universe", Icon: IconUniverse },
  { id: "icon:heart", label: "Heart", Icon: IconHeart },
];
