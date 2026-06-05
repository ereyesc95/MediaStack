import MediaStackIcon from "./MediaStackIcon";

const PHOTO_MARKER = "photo";

type Props = {
  userId: number;
  name: string;
  avatar?: string | null;
  isAdmin?: boolean;
  className?: string;
};

export default function ProfileAvatar({
  userId,
  name,
  avatar,
  isAdmin = false,
  className = "",
}: Props) {
  if (isAdmin) {
    return (
      <span className={`profile-avatar profile-avatar--admin ${className}`} aria-hidden>
        <MediaStackIcon size={36} className="profile-avatar__mark" />
      </span>
    );
  }

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

  if (avatar?.startsWith("#")) {
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

  return (
    <span className={`profile-avatar profile-avatar--letter ${className}`} aria-hidden>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
