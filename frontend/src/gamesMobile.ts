import { downloadGameRom, launchGame } from "./api";
import type { DeviceLayout } from "./usePhoneLayout";
import { resolveDeviceLayout } from "./usePhoneLayout";

/**
 * Platforms playable on phone / small-tablet (RetroArch + Browser/Flash).
 * Names match GAME_PLATFORMS where possible; aliases cover short disk folders (NES, N64…).
 */
export const MOBILE_GAMES_ALLOWLIST: readonly string[] = [
  "Nintendo Entertainment System",
  "Super Nintendo",
  "Nintendo 64",
  "Game Boy",
  "Game Boy Color",
  "Game Boy Advance",
  "Sega Genesis",
  "Sega Master System",
  "Arcade",
  "Commodore 64",
  "Browser",
  "Flash",
] as const;

/** Short / alternate folder names → canonical allowlist entry. */
const PLATFORM_ALIASES: Record<string, string> = {
  nes: "Nintendo Entertainment System",
  "nintendo entertainment system": "Nintendo Entertainment System",
  snes: "Super Nintendo",
  "super nintendo": "Super Nintendo",
  "super nintendo entertainment system": "Super Nintendo",
  n64: "Nintendo 64",
  "nintendo 64": "Nintendo 64",
  gb: "Game Boy",
  "game boy": "Game Boy",
  gbc: "Game Boy Color",
  "game boy color": "Game Boy Color",
  gba: "Game Boy Advance",
  "game boy advance": "Game Boy Advance",
  genesis: "Sega Genesis",
  "sega genesis": "Sega Genesis",
  megadrive: "Sega Genesis",
  "mega drive": "Sega Genesis",
  "sega mega drive": "Sega Genesis",
  "master system": "Sega Master System",
  "sega master system": "Sega Master System",
  arcade: "Arcade",
  mame: "Arcade",
  c64: "Commodore 64",
  "commodore 64": "Commodore 64",
  browser: "Browser",
  web: "Browser",
  "web browser": "Browser",
  html5: "Browser",
  flash: "Flash",
  "adobe flash": "Flash",
  // Future expands the user mentioned — ready when folders appear:
  atari: "Atari",
  "atari 2600": "Atari 2600",
  "neo geo": "Neo Geo",
  neogeo: "Neo Geo",
};

const ALLOWLIST_KEYS = new Set(
  MOBILE_GAMES_ALLOWLIST.map((p) => p.toLowerCase())
);

/** Warn before downloading ROMs larger than this (bytes). */
export const MOBILE_ROM_SIZE_WARN_BYTES = 32 * 1024 * 1024;

/** Phone + tablet-portrait: gated catalog. Desktop + tablet-landscape: full. */
export function isGamesMobileGated(layout?: DeviceLayout): boolean {
  const l = layout ?? resolveDeviceLayout();
  return (
    l === "mobile-portrait" ||
    l === "mobile-landscape" ||
    l === "tablet-portrait"
  );
}

export function normalizeMobilePlatformKey(name: string | null | undefined): string {
  const raw = (name || "").trim();
  if (!raw) return "";
  const aliased = PLATFORM_ALIASES[raw.toLowerCase()];
  return (aliased || raw).toLowerCase();
}

export function isMobileAllowedPlatform(
  name: string | null | undefined
): boolean {
  const key = normalizeMobilePlatformKey(name);
  if (!key) return false;
  if (ALLOWLIST_KEYS.has(key)) return true;
  // Alias may point at a future platform not yet in the static allowlist
  const aliased = PLATFORM_ALIASES[(name || "").trim().toLowerCase()];
  if (aliased && ALLOWLIST_KEYS.has(aliased.toLowerCase())) return true;
  // Prefix match for future Atari / Neo Geo family folders
  if (key.startsWith("atari") || key.startsWith("neo geo") || key === "neogeo") {
    return true;
  }
  return false;
}

export function filterMobileAllowedPlatforms<T extends { name?: string | null }>(
  platforms: T[]
): T[] {
  return platforms.filter((p) => isMobileAllowedPlatform(p.name));
}

export function gameHasMobileAllowedPlatform(game: {
  platform?: string | null;
  platforms?: string[] | null;
}): boolean {
  if (game.platform && isMobileAllowedPlatform(game.platform)) return true;
  for (const p of game.platforms || []) {
    if (isMobileAllowedPlatform(p)) return true;
  }
  return false;
}

export function formatRomSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type MobilePlayResult =
  | "web"
  | "shared"
  | "downloaded"
  | "cancelled"
  | "unavailable";

function tryOpenRetroArchApp(): void {
  if (typeof window === "undefined") return;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return;
  // Best-effort: open RetroArch so the user can load the downloaded ROM.
  // Prefer 64-bit package; Chrome falls through if missing.
  const packages = ["com.retroarch.aarch64", "com.retroarch", "com.retroarch.ra32"];
  const pkg = packages[0];
  window.location.href = `intent:#Intent;package=${pkg};end`;
}

/**
 * Download ROM (auth) and hand off to RetroArch via share sheet when possible;
 * otherwise save to Downloads and try opening RetroArch.
 */
export async function openRomOnDevice(opts: {
  download: () => Promise<{ blob: Blob; filename: string }>;
  romBytes?: number | null;
  title?: string;
}): Promise<MobilePlayResult> {
  const size = opts.romBytes ?? 0;
  if (size > MOBILE_ROM_SIZE_WARN_BYTES) {
    const ok = window.confirm(
      `This ROM is ${formatRomSize(size)}. Download to this device anyway?`
    );
    if (!ok) return "cancelled";
  }

  const { blob, filename } = await opts.download();
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.canShare && nav.share) {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: opts.title || filename,
        });
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  tryOpenRetroArchApp();
  return "downloaded";
}

export type PlayGameClientResult =
  | MobilePlayResult
  | "pc-launched"
  | "local-launched";

/**
 * Device-aware play: web opens in tab; mobile downloads/shares ROM;
 * desktop/tablet-landscape uses server open-local (RetroArch on PC).
 */
export async function playGameClient(opts: {
  gameId: string;
  openMode?: string | null;
  openUrl?: string | null;
  romBytes?: number | null;
  romFilename?: string | null;
  title?: string | null;
  /** Force server-side open-local (Launch on PC from phone). */
  launchOnPc?: boolean;
}): Promise<PlayGameClientResult> {
  const url = (opts.openUrl || "").trim();
  if (opts.openMode === "web" || /^https?:\/\//i.test(url)) {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return "web";
    }
  }

  if (opts.launchOnPc || !isGamesMobileGated(resolveDeviceLayout())) {
    const res = await launchGame(opts.gameId);
    if (res?.open_mode === "web" && res.url) {
      window.open(res.url, "_blank", "noopener,noreferrer");
      return "web";
    }
    return opts.launchOnPc ? "pc-launched" : "local-launched";
  }

  return openRomOnDevice({
    romBytes: opts.romBytes,
    title: opts.title || undefined,
    download: async () => {
      const got = await downloadGameRom(opts.gameId);
      return {
        blob: got.blob,
        filename: opts.romFilename || got.filename,
      };
    },
  });
}
