import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  /** Existing image URL (already media-access wrapped if needed). */
  previewUrl?: string | null;
  file?: File | null;
  disabled?: boolean;
  onPick: (file: File | null) => void;
};

/** Small square image picker (+ Add / Change overlay) used in create/edit modals. */
export default function ArtPickSquare({
  label,
  previewUrl = null,
  file = null,
  disabled = false,
  onPick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = objectUrl || previewUrl;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className={`art-pick-square${shown ? " art-pick-square--filled" : ""}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label={shown ? `Change ${label}` : `Add ${label}`}
      >
        {shown ? (
          <>
            <img src={shown} alt="" />
            <span className="art-pick-square__overlay" aria-hidden>
              Change
            </span>
          </>
        ) : (
          <>
            <span className="art-pick-square__plus" aria-hidden>
              +
            </span>
            <span className="art-pick-square__caption">Add {label}</span>
          </>
        )}
      </button>
    </>
  );
}
